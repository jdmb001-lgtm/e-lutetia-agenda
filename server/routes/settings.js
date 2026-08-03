const express = require('express');
const db = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

router.put('/', (req, res) => {
  const b = req.body || {};
  const u = req.user;

  let username = (b.username || u.username).toLowerCase().replace(/[^a-z0-9-_]/g, '').replace(/^-+|-+$/g, '');
  if (username.length < 3) return res.status(400).json({ error: 'Nom utilisateur invalide' });
  const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, u.id);
  if (taken) return res.status(400).json({ error: 'Ce nom est déjà pris' });

  db.prepare('UPDATE users SET username=?, name=?, timezone=?, brand_color=?, about=? WHERE id=?').run(
    username,
    (b.name || u.name).trim(),
    b.timezone || u.timezone,
    b.brand_color || u.brand_color,
    b.about !== undefined ? b.about : u.about,
    u.id
  );
  const updated = db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
  res.json({
    id: updated.id, email: updated.email, name: updated.name, username: updated.username,
    timezone: updated.timezone, brand_color: updated.brand_color, about: updated.about,
  });
});

// Changer de mot de passe
router.put('/password', (req, res) => {
  const { current_password, new_password } = req.body || {};
  const bcrypt = require('bcryptjs');
  if (!new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (current_password && !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.user.id);
  // Invalider les autres sessions
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token != ?').run(req.user.id, req.sessionToken);
  res.json({ ok: true });
});

module.exports = router;
