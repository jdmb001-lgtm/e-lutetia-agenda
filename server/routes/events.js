const express = require('express');
const db = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

function parseAvailability(avail) {
  // attendu: {"mon":[{"start":"09:00","end":"17:00"}], ...} -> stocké comme {"mon":["09:00-17:00"], ...}
  const out = {};
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  for (const d of days) {
    const windows = avail && avail[d];
    if (Array.isArray(windows) && windows.length) {
      out[d] = windows
        .filter((w) => w && w.start && w.end)
        .map((w) => `${w.start}-${w.end}`);
    }
  }
  return JSON.stringify(out);
}

function serializeEvent(e) {
  let avail = {};
  try { avail = JSON.parse(e.availability); } catch (_) {}
  const windows = {};
  for (const [day, list] of Object.entries(avail)) {
    windows[day] = list.map((str) => {
      const [start, end] = String(str).split('-');
      return { start, end };
    });
  }
  return {
    id: e.id,
    name: e.name,
    slug: e.slug,
    description: e.description,
    duration: e.duration,
    slot_interval: e.slot_interval,
    location_type: e.location_type,
    location_detail: e.location_detail,
    address: e.address || '',
    organizer: e.organizer || '',
    custom_fields: (() => { try { return JSON.parse(e.custom_fields || '[]'); } catch (_) { return []; } })(),
    color: e.color,
    buffer_before: e.buffer_before,
    buffer_after: e.buffer_after,
    daily_limit: e.daily_limit,
    min_notice_minutes: e.min_notice_minutes,
    is_active: !!e.is_active,
    availability: windows,
    booking_url: `/${e.username}/${e.slug}`,
  };
}

// Liste des événements de l'utilisateur
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT e.*, u.username FROM event_types e JOIN users u ON u.id = e.user_id
       WHERE e.user_id = ? ORDER BY e.created_at ASC`
    )
    .all(req.user.id);
  res.json(rows.map(serializeEvent));
});

// Liste des organisateurs possibles (moi + collègues de ma même agence)
router.get('/organizers', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, username, agency_id FROM users
    WHERE id=? OR (agency_id IS NOT NULL AND agency_id=(SELECT agency_id FROM users WHERE id=?))
    ORDER BY name ASC
  `).all(req.user.id, req.user.id);
  res.json(rows.map((u) => ({ id: u.id, name: u.name, username: u.username, agency_id: u.agency_id })));
});

// Détail
router.get('/:id', (req, res) => {
  const e = db
    .prepare(
      `SELECT e.*, u.username FROM event_types e JOIN users u ON u.id = e.user_id
       WHERE e.id = ? AND e.user_id = ?`
    )
    .get(req.params.id, req.user.id);
  if (!e) return res.status(404).json({ error: 'Introuvable' });
  res.json(serializeEvent(e));
});

// Création
router.post('/', (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nom requis' });

  let slug = (b.slug || '').toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) slug = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) slug = 'event-' + Date.now();
  const base = slug;
  let counter = 2;
  while (db.prepare('SELECT id FROM event_types WHERE user_id = ? AND slug = ?').get(req.user.id, slug)) {
    slug = `${base}-${counter++}`;
  }

  const duration = Math.max(5, parseInt(b.duration, 10) || 30);
  const color = b.color || req.user.brand_color || '#0069ff';

  const info = db
    .prepare(
      `INSERT INTO event_types
        (user_id, name, slug, description, duration, slot_interval, location_type, location_detail,
         address, organizer, custom_fields, color, buffer_before, buffer_after, daily_limit, min_notice_minutes, is_active, availability, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      req.user.id, name, slug, b.description || '', duration,
      parseInt(b.slot_interval, 10) || 0,
      b.location_type || 'video', b.location_detail || '',
      b.address || '', b.organizer || '',
      JSON.stringify(b.custom_fields || []),
      color,
      parseInt(b.buffer_before, 10) || 0, parseInt(b.buffer_after, 10) || 0,
      parseInt(b.daily_limit, 10) || 0, parseInt(b.min_notice_minutes, 10) || 0,
      b.is_active === false ? 0 : 1,
      parseAvailability(b.availability),
      new Date().toISOString()
    );

  const e = db.prepare('SELECT * FROM event_types WHERE id = ?').get(info.lastInsertRowid);
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  res.status(201).json(serializeEvent({ ...e, ...u }));
});

// Mise à jour
router.put('/:id', (req, res) => {
  const existing = db
    .prepare('SELECT * FROM event_types WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Introuvable' });

  const b = req.body || {};
  const name = b.name !== undefined ? (b.name || '').trim() : existing.name;
  if (!name) return res.status(400).json({ error: 'Nom requis' });

  db.prepare(
    `UPDATE event_types SET
       name=?, description=?, duration=?, slot_interval=?, location_type=?, location_detail=?,
       address=?, organizer=?, custom_fields=?, color=?, buffer_before=?, buffer_after=?, daily_limit=?, min_notice_minutes=?,
       is_active=?, availability=?
     WHERE id=?`
  ).run(
    name,
    b.description !== undefined ? b.description : existing.description,
    b.duration !== undefined ? Math.max(5, parseInt(b.duration, 10) || 30) : existing.duration,
    b.slot_interval !== undefined ? (parseInt(b.slot_interval, 10) || 0) : existing.slot_interval,
    b.location_type !== undefined ? b.location_type : existing.location_type,
    b.location_detail !== undefined ? b.location_detail : existing.location_detail,
    b.address !== undefined ? b.address : existing.address,
    b.organizer !== undefined ? b.organizer : existing.organizer,
    b.custom_fields !== undefined ? JSON.stringify(b.custom_fields || []) : existing.custom_fields,
    b.color !== undefined ? b.color : existing.color,
    b.buffer_before !== undefined ? (parseInt(b.buffer_before, 10) || 0) : existing.buffer_before,
    b.buffer_after !== undefined ? (parseInt(b.buffer_after, 10) || 0) : existing.buffer_after,
    b.daily_limit !== undefined ? (parseInt(b.daily_limit, 10) || 0) : existing.daily_limit,
    b.min_notice_minutes !== undefined ? (parseInt(b.min_notice_minutes, 10) || 0) : existing.min_notice_minutes,
    b.is_active !== undefined ? (b.is_active ? 1 : 0) : existing.is_active,
    b.availability !== undefined ? parseAvailability(b.availability) : existing.availability,
    existing.id
  );

  const e = db.prepare('SELECT * FROM event_types WHERE id = ?').get(existing.id);
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  res.json(serializeEvent({ ...e, ...u }));
});

// Suppression
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM event_types WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Introuvable' });
  res.json({ ok: true });
});

module.exports = router;
