const express = require('express');
const db = require('../db');
const { requireAuth } = require('./auth');
const { getFrenchHolidays } = require('../lib/frenchHolidays');

const router = express.Router();
router.use(requireAuth);

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Liste des jours fériés français (dates prochaines) pour le réglage
router.get('/holidays-list', (req, res) => {
  const tz = req.user.timezone || 'Europe/Paris';
  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() + 1];
  const list = [];
  for (const y of years) {
    for (const d of getFrenchHolidays(y)) {
      const dt = new Date(d + 'T00:00:00Z');
      if (dt >= now) list.push(d);
    }
  }
  // Trier par date
  list.sort();
  res.json(list);
});

router.put('/', (req, res) => {
  const b = req.body || {};
  const u = req.user;

  let username = (b.username || u.username).toLowerCase().replace(/[^a-z0-9-_]/g, '').replace(/^-+|-+$/g, '');
  if (username.length < 3) return res.status(400).json({ error: 'Nom utilisateur invalide' });
  const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, u.id);
  if (taken) return res.status(400).json({ error: 'Ce nom est déjà pris' });

  db.prepare('UPDATE users SET username=?, name=?, timezone=?, brand_color=?, about=?, holidays=?, max_daily_meetings=? WHERE id=?').run(
    username,
    (b.name || u.name).trim(),
    b.timezone || u.timezone,
    b.brand_color || u.brand_color,
    b.about !== undefined ? b.about : u.about,
    JSON.stringify(b.holidays || JSON.parse(u.holidays || '[]')),
    b.max_daily_meetings !== undefined ? (Number(b.max_daily_meetings) || 0) : (Number(u.max_daily_meetings) || 0),
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
  // Si un mot de passe actuel est fourni, on le vérifie (mais ce n'est pas obligatoire
  // pour un utilisateur déjà connecté). Erreur en 400 (et non 401) pour ne pas
  // déconnecter l'utilisateur.
  if (current_password && !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.user.id);
  // Garder la session courante, invalider les autres
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token != ?').run(req.user.id, req.sessionToken);
  res.json({ ok: true, message: 'Mot de passe modifié avec succès' });
});

module.exports = router;
