const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Liens à usage unique
// ---------------------------------------------------------------------------
router.get('/single-use-links', (req, res) => {
  const rows = db.prepare(`
    SELECT s.*, e.name AS event_name, u.username
    FROM single_use_links s
    JOIN event_types e ON e.id = s.event_type_id
    JOIN users u ON u.id = s.user_id
    WHERE s.user_id = ? ORDER BY s.created_at DESC
  `).all(req.user.id);
  res.json(rows.map((r) => ({
    id: r.id, token: r.token, used: !!r.used, expires_at: r.expires_at,
    event_name: r.event_name, event_id: r.event_type_id,
    url: `/single/${r.token}`,
    created_at: r.created_at,
  })));
});

router.post('/single-use-links', (req, res) => {
  const { event_type_id, expires_at } = req.body || {};
  const ev = db.prepare('SELECT id FROM event_types WHERE id=? AND user_id=?').get(event_type_id, req.user.id);
  if (!ev) return res.status(400).json({ error: 'Événement introuvable' });
  const token = crypto.randomBytes(8).toString('hex');
  const info = db.prepare(
    'INSERT INTO single_use_links (event_type_id, user_id, token, expires_at, created_at) VALUES (?,?,?,?,?)'
  ).run(ev.id, req.user.id, token, expires_at || null, new Date().toISOString());
  res.status(201).json({ id: info.lastInsertRowid, token, url: `/single/${token}` });
});

router.delete('/single-use-links/:id', (req, res) => {
  db.prepare('DELETE FROM single_use_links WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Sondages de réunion (polls)
// ---------------------------------------------------------------------------
function serializePoll(p) {
  const slots = db.prepare('SELECT * FROM poll_slots WHERE poll_id=? ORDER BY start_time ASC').all(p.id);
  return {
    id: p.id, title: p.title, slug: p.slug, event_type_id: p.event_type_id,
    event_name: p.event_name,
    url: `/p/${p.slug}`,
    slots: slots.map((s) => ({ id: s.id, start_time: s.start_time, end_time: s.end_time })),
    created_at: p.created_at,
  };
}

router.get('/polls', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, e.name AS event_name FROM polls p
    JOIN event_types e ON e.id = p.event_type_id
    WHERE p.user_id=? ORDER BY p.created_at DESC
  `).all(req.user.id);
  res.json(rows.map(serializePoll));
});

router.post('/polls', (req, res) => {
  const { title, event_type_id, slots } = req.body || {};
  if (!title || !event_type_id || !Array.isArray(slots) || !slots.length) {
    return res.status(400).json({ error: 'Titre, événement et au moins un créneau requis' });
  }
  const ev = db.prepare('SELECT id FROM event_types WHERE id=? AND user_id=?').get(event_type_id, req.user.id);
  if (!ev) return res.status(400).json({ error: 'Événement introuvable' });
  let slug = (title + '-' + Math.random().toString(36).slice(2, 6)).toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  const info = db.prepare('INSERT INTO polls (user_id, event_type_id, title, slug, created_at) VALUES (?,?,?,?,?)')
    .run(req.user.id, ev.id, title.trim(), slug, new Date().toISOString());
  const pollId = info.lastInsertRowid;
  const ins = db.prepare('INSERT INTO poll_slots (poll_id, start_time, end_time) VALUES (?,?,?)');
  for (const s of slots) {
    if (s.start && s.end) ins.run(pollId, new Date(s.start).toISOString(), new Date(s.end).toISOString());
  }
  const p = db.prepare('SELECT p.*, e.name AS event_name FROM polls p JOIN event_types e ON e.id=p.event_type_id WHERE p.id=?').get(pollId);
  res.status(201).json(serializePoll(p));
});

router.delete('/polls/:id', (req, res) => {
  db.prepare('DELETE FROM polls WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
