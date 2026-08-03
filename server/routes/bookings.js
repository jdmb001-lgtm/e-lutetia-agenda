const express = require('express');
const db = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

function serializeBooking(b) {
  return {
    id: b.id,
    invitee_name: b.invitee_name,
    invitee_email: b.invitee_email,
    invitee_notes: b.invitee_notes,
    custom_answers: (() => { try { return JSON.parse(b.custom_answers || '{}'); } catch (_) { return {}; } })(),
    invitee_timezone: b.invitee_timezone,
    start_time: b.start_time,
    end_time: b.end_time,
    status: b.status,
    created_at: b.created_at,
    event: {
      id: b.event_type_id,
      name: b.name,
      slug: b.slug,
      duration: b.duration,
      location_type: b.location_type,
      location_detail: b.location_detail,
      color: b.color,
    },
  };
}

// Liste des réservations de l'utilisateur
router.get('/', (req, res) => {
  const status = req.query.status; // 'upcoming' | 'past' | 'all' | 'cancelled'
  const now = new Date().toISOString();

  let rows;
  const base = `
    SELECT b.*, e.name, e.slug, e.duration, e.location_type, e.location_detail, e.color
    FROM bookings b JOIN event_types e ON e.id = b.event_type_id
    WHERE b.user_id = ?
  `;

  if (status === 'upcoming') {
    rows = db.prepare(base + ` AND b.status='confirmed' AND b.start_time > ? ORDER BY b.start_time ASC`).all(req.user.id, now);
  } else if (status === 'past') {
    rows = db.prepare(base + ` AND b.status='confirmed' AND b.start_time <= ? ORDER BY b.start_time DESC`).all(req.user.id, now);
  } else if (status === 'cancelled') {
    rows = db.prepare(base + ` AND b.status='cancelled' ORDER BY b.start_time DESC`).all(req.user.id);
  } else {
    rows = db.prepare(base + ` ORDER BY b.start_time DESC`).all(req.user.id);
  }
  res.json(rows.map(serializeBooking));
});

// Annulation par l'hôte
router.post('/:id/cancel', (req, res) => {
  const b = db
    .prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!b) return res.status(404).json({ error: 'Introuvable' });
  db.prepare('UPDATE bookings SET status=? WHERE id=?').run('cancelled', b.id);
  res.json(serializeBooking(db.prepare(`
    SELECT b.*, e.name, e.slug, e.duration, e.location_type, e.location_detail, e.color
    FROM bookings b JOIN event_types e ON e.id = b.event_type_id WHERE b.id = ?`).get(b.id)));
});

module.exports = router;
