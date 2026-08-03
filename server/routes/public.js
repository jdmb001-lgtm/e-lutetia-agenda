const express = require('express');
const db = require('../db');
const { parseAvailability, computeSlotsForDay, monthOverview, isSlotAvailable } = require('../lib/scheduling');
const { sendMail } = require('../lib/mailer');

const router = express.Router();

function getEventBySlug(username, slug) {
  return db
    .prepare(
      `SELECT e.*, u.username, u.name AS host_name, u.email AS host_email,
              u.timezone AS host_timezone, u.about AS host_about,
              u.brand_color AS host_brand_color
       FROM event_types e JOIN users u ON u.id = e.user_id
       WHERE u.username = ? AND e.slug = ?`
    )
    .get(username, slug);
}

function publicEvent(e) {
  let avail = {};
  try { avail = JSON.parse(e.availability); } catch (_) {}
  const windows = {};
  for (const [day, list] of Object.entries(avail)) {
    windows[day] = list.map((str) => { const [start, end] = String(str).split('-'); return { start, end }; });
  }
  return {
    name: e.name,
    slug: e.slug,
    description: e.description,
    duration: e.duration,
    location_type: e.location_type,
    location_detail: e.location_detail,
    color: e.color || e.host_brand_color,
    booking_url: `/${e.username}/${e.slug}`,
    host: {
      name: e.host_name,
      username: e.username,
      about: e.host_about,
      brand_color: e.host_brand_color,
      timezone: e.host_timezone,
    },
    availability: windows,
  };
}

// Infos de la page de réservation publique
router.get('/:username/:slug', (req, res) => {
  const e = getEventBySlug(req.params.username, req.params.slug);
  if (!e || !e.is_active) return res.status(404).json({ error: 'Événement introuvable' });
  res.json(publicEvent(e));
});

// Vue d'ensemble d'un mois : jours avec disponibilité
router.get('/:username/:slug/month', (req, res) => {
  const e = getEventBySlug(req.params.username, req.params.slug);
  if (!e || !e.is_active) return res.status(404).json({ error: 'Événement introuvable' });
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'Date invalide' });
  const overview = monthOverview(e, e, year, month, new Date().toISOString());
  res.json(overview);
});

// Créneaux d'une journée précise
router.get('/:username/:slug/day', (req, res) => {
  const e = getEventBySlug(req.params.username, req.params.slug);
  if (!e || !e.is_active) return res.status(404).json({ error: 'Événement introuvable' });
  const date = req.query.date; // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'Date invalide' });
  const slots = computeSlotsForDay(e, e, date, new Date().toISOString());
  res.json({
    slots: slots.map((s) => ({
      start: s.start.toISO(),
      end: s.end.toISO(),
      duration: e.duration,
    })),
  });
});

// Création d'une réservation
router.post('/:username/:slug/book', async (req, res) => {
  const e = getEventBySlug(req.params.username, req.params.slug);
  if (!e || !e.is_active) return res.status(404).json({ error: 'Événement introuvable' });

  const { name, email, notes, start, timezone } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Nom et email requis' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });
  if (!start) return res.status(400).json({ error: 'Créneau requis' });

  // Revalidation côté serveur (anti double-réservation / anti-tampering)
  const check = isSlotAvailable(e, e, start, e.duration);
  if (!check.ok) {
    return res.status(409).json({ error: "Ce créneau n'est plus disponible, choisissez-en un autre." });
  }

  const event = e; // event_type row + host fields
  const endIso = new Date(new Date(start).getTime() + event.duration * 60000).toISOString();

  const info = db
    .prepare(
      `INSERT INTO bookings (event_type_id, user_id, invitee_name, invitee_email, invitee_notes,
         invitee_timezone, start_time, end_time, status, created_at)
       VALUES (?,?,?,?,?,?,?,?,'confirmed',?)`
    )
    .run(
      event.id, event.user_id, name.trim(), email.trim(), (notes || '').trim(),
      timezone || 'UTC', new Date(start).toISOString(), endIso, new Date().toISOString()
    );

  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(info.lastInsertRowid);

  // Notifications par email
  const tz = event.host_timezone || 'UTC';
  const { DateTime } = require('luxon');
  const startLocal = DateTime.fromISO(start, { zone: 'utc' }).setZone(tz);
  const fmt = startLocal.toFormat('cccc d MMMM yyyy, HH:mm (z)');

  await sendMail({
    to: event.host_email,
    subject: `Nouvelle réservation : ${event.name} avec ${name.trim()}`,
    text: `Bonjour ${event.host_name},\n\n${name.trim()} (${email.trim()}) a réservé un rendez-vous "${event.name}".\n\n📅 ${fmt}\n⏱ ${event.duration} min\n📝 ${notes ? notes.trim() : '-'}\n\nMerci d'utiliser votre application de planification.`,
  });
  await sendMail({
    to: email.trim(),
    subject: `Confirmation : ${event.name} avec ${event.host_name}`,
    text: `Bonjour ${name.trim()},\n\nVotre rendez-vous "${event.name}" avec ${event.host_name} est confirmé.\n\n📅 ${fmt}\n⏱ ${event.duration} min\n📍 ${event.location_detail || event.location_type}\n\nAjoutez-le à votre agenda. À bientôt !`,
  });

  res.status(201).json({
    booking: {
      id: booking.id,
      start: booking.start_time,
      end: booking.end_time,
      event_name: event.name,
      host_name: event.host_name,
      invitee_name: booking.invitee_name,
      location_detail: event.location_detail,
      location_type: event.location_type,
    },
  });
});

module.exports = router;
