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
              u.brand_color AS host_brand_color,
              u.holidays, u.max_daily_meetings
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
    address: e.address || '',
    organizer: e.organizer || '',
    custom_fields: (() => { try { return JSON.parse(e.custom_fields || '[]'); } catch (_) { return []; } })(),
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

function getSingleLink(token) {
  return db.prepare(`
    SELECT s.*, e.*, u.username, u.name AS host_name, u.email AS host_email,
           u.timezone AS host_timezone, u.about AS host_about, u.brand_color AS host_brand_color,
           u.holidays, u.max_daily_meetings
    FROM single_use_links s
    JOIN event_types e ON e.id = s.event_type_id
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);
}

// ===========================================================================
// Page publique d'une agence : infos + événements des membres
// ===========================================================================
router.get('/agency/:slug', (req, res) => {
  const agency = db.prepare('SELECT * FROM agencies WHERE slug=?').get(req.params.slug);
  if (!agency) return res.status(404).json({ error: 'Agence introuvable' });
  const members = db.prepare('SELECT id, name, username, brand_color FROM users WHERE agency_id=? ORDER BY name ASC').all(agency.id);
  const events = db.prepare(`
    SELECT e.id, e.name, e.slug, e.duration, e.description, e.location_type, e.location_detail, e.color,
           u.name AS host_name, u.username, u.brand_color AS host_brand_color
    FROM event_types e JOIN users u ON u.id=e.user_id
    WHERE u.agency_id=? AND e.is_active=1 ORDER BY e.name ASC
  `).all(agency.id);
  res.json({
    id: agency.id, name: agency.name, slug: agency.slug,
    description: agency.description || '', address: agency.address || '',
    phone: agency.phone || '', email: agency.email || '',
    brand_color: agency.brand_color || '#0069ff',
    members: members.map((m) => ({ name: m.name, username: m.username })),
    events: events.map((e) => ({
      id: e.id, name: e.name, slug: e.slug, duration: e.duration, description: e.description,
      location_type: e.location_type, location_detail: e.location_detail, color: e.color,
      host_name: e.host_name,
      url: `/${e.username}/${e.slug}`,
    })),
  });
});

router.get('/single/:token', (req, res) => {
  const link = getSingleLink(req.params.token);
  if (!link) return res.status(404).json({ error: 'Lien invalide' });
  if (link.used) return res.status(410).json({ error: 'Ce lien a déjà été utilisé' });
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Ce lien a expiré' });
  }
  res.json({ ...publicEvent(link), single_use: true, token: link.token });
});

router.get('/single/:token/month', (req, res) => {
  const link = getSingleLink(req.params.token);
  if (!link || link.used) return res.status(404).json({ error: 'Lien invalide' });
  const year = parseInt(req.query.year, 10), month = parseInt(req.query.month, 10);
  if (!year || !month || month < 1 || month > 12) return res.status(400).json({ error: 'Date invalide' });
  res.json(monthOverview(link, link, year, month, new Date().toISOString()));
});

router.get('/single/:token/day', (req, res) => {
  const link = getSingleLink(req.params.token);
  if (!link || link.used) return res.status(404).json({ error: 'Lien invalide' });
  const date = req.query.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'Date invalide' });
  const slots = computeSlotsForDay(link, link, date, new Date().toISOString());
  res.json({ slots: slots.map((s) => ({ start: s.start.toISO(), end: s.end.toISO() })) });
});

router.post('/single/:token/book', async (req, res) => {
  const link = getSingleLink(req.params.token);
  if (!link) return res.status(404).json({ error: 'Lien invalide' });
  if (link.used) return res.status(410).json({ error: 'Ce lien a déjà été utilisé' });
  const { name, email, notes, start, timezone } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Nom et email requis' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });
  const check = isSlotAvailable(link, link, start, link.duration);
  if (!check.ok) return res.status(409).json({ error: "Ce créneau n'est plus disponible." });
  const endIso = new Date(new Date(start).getTime() + link.duration * 60000).toISOString();
  const info = db.prepare(
    'INSERT INTO bookings (event_type_id, user_id, invitee_name, invitee_email, invitee_notes, invitee_timezone, start_time, end_time, status, created_at) VALUES (?,?,?,?,?,?,?,?,\'confirmed\',?)'
  ).run(link.event_type_id, link.user_id, name.trim(), email.trim(), (notes||'').trim(), timezone||'UTC', new Date(start).toISOString(), endIso, new Date().toISOString());
  db.prepare('UPDATE single_use_links SET used=1 WHERE token=?').run(req.params.token);
  res.status(201).json({ booking: { id: info.lastInsertRowid } });
});

// ===========================================================================
// Sondages de réunion (polls)
// ===========================================================================
router.get('/poll/:slug', (req, res) => {
  const p = db.prepare(`
    SELECT p.*, e.name AS event_name, e.duration, e.location_detail, e.location_type,
           u.username, u.name AS host_name, u.brand_color AS host_brand_color,
           u.timezone AS host_timezone
    FROM polls p
    JOIN event_types e ON e.id = p.event_type_id
    JOIN users u ON u.id = p.user_id
    WHERE p.slug = ?
  `).get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Sondage introuvable' });
  const slots = db.prepare('SELECT * FROM poll_slots WHERE poll_id=? ORDER BY start_time ASC').all(p.id);
  res.json({
    id: p.id,
    title: p.title,
    host_name: p.host_name,
    username: p.username,
    brand_color: p.brand_color,
    event_name: p.event_name,
    duration: p.duration,
    location_detail: p.location_detail,
    location_type: p.location_type,
    host_timezone: p.host_timezone,
    slots: slots.map((s) => ({ id: s.id, start_time: s.start_time, end_time: s.end_time })),
  });
});

router.post('/poll/:slug/vote', (req, res) => {
  const p = db.prepare('SELECT * FROM polls WHERE slug=?').get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Sondage introuvable' });
  const { slot_id, name, email } = req.body || {};
  if (!slot_id || !name || !email) return res.status(400).json({ error: 'Champs requis' });
  const slot = db.prepare('SELECT * FROM poll_slots WHERE id=? AND poll_id=?').get(slot_id, p.id);
  if (!slot) return res.status(400).json({ error: 'Créneau invalide' });
  // Vérifier le doublon par email
  const dup = db.prepare('SELECT id FROM poll_votes WHERE poll_id=? AND LOWER(invitee_email)=?').get(p.id, email.toLowerCase().trim());
  if (dup) return res.status(400).json({ error: 'Vous avez déjà voté pour ce sondage' });
  db.prepare('INSERT INTO poll_votes (poll_slot_id, poll_id, invitee_name, invitee_email, created_at) VALUES (?,?,?,?,?)')
    .run(slot.id, p.id, name.trim(), email.trim(), new Date().toISOString());
  // Compter les votes
  const counts = db.prepare(`
    SELECT poll_slot_id, COUNT(*) AS n FROM poll_votes WHERE poll_id=? GROUP BY poll_slot_id
  `).all(p.id);
  res.status(201).json({ ok: true, message: 'Vote enregistré', counts });
});



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

  const { name, email, notes, start, timezone, custom_answers } = req.body || {};
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

  const answers = {};
  try { Object.assign(answers, custom_answers || {}); } catch (_) {}

  const info = db
    .prepare(
      `INSERT INTO bookings (event_type_id, user_id, invitee_name, invitee_email, invitee_notes,
         invitee_timezone, start_time, end_time, status, created_at, custom_answers)
       VALUES (?,?,?,?,?,?,?,?,'confirmed',?,?)`
    )
    .run(
      event.id, event.user_id, name.trim(), email.trim(), (notes || '').trim(),
      timezone || 'UTC', new Date(start).toISOString(), endIso, new Date().toISOString(),
      JSON.stringify(answers)
    );

  const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(info.lastInsertRowid);

  // Notifications par email
  const tz = event.host_timezone || 'UTC';
  const { DateTime } = require('luxon');
  const startLocal = DateTime.fromISO(start, { zone: 'utc' }).setZone(tz);
  const fmt = startLocal.toFormat('cccc d MMMM yyyy, HH:mm (z)');

  // Récapitulatif des réponses personnalisées
  let customText = '';
  if (Object.keys(answers).length) {
    customText = '\n' + Object.entries(answers).map(([k, v]) => `${k} : ${v || '-'}`).join('\n') + '\n';
  }

  await sendMail({
    to: event.host_email,
    subject: `Nouvelle réservation : ${event.name} avec ${name.trim()}`,
    text: `Bonjour ${event.host_name},\n\n${name.trim()} (${email.trim()}) a réservé un rendez-vous "${event.name}".\n\n📅 ${fmt}\n⏱ ${event.duration} min\n📝 ${notes ? notes.trim() : '-'}${customText}\n\nMerci d'utiliser votre application de planification.`,
  });
  await sendMail({
    to: email.trim(),
    subject: `Confirmation : ${event.name} avec ${event.organizer || event.host_name}`,
    text: `Bonjour ${name.trim()},\n\nVotre rendez-vous "${event.name}" avec ${event.organizer || event.host_name} est confirmé.\n\n📅 ${fmt}\n⏱ ${event.duration} min\n📍 ${event.address || event.location_detail || event.location_type}\n\nAjoutez-le à votre agenda. À bientôt !`,
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
      address: event.address,
    },
  });
});

// ===========================================================================
// Liens à usage unique : infos de l'événement via le token
// ===========================================================================
module.exports = router;
