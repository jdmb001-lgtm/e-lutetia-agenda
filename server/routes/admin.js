const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Middleware : réserver aux administrateurs
// ---------------------------------------------------------------------------
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

function serializeUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    username: u.username,
    role: u.role,
    agency_id: u.agency_id,
    agency_name: u.agency_name || null,
    timezone: u.timezone,
    brand_color: u.brand_color,
    about: u.about,
    created_at: u.created_at,
    events_count: u.events_count || 0,
    bookings_count: u.bookings_count || 0,
  };
}

// ---------------------------------------------------------------------------
// Agences
// ---------------------------------------------------------------------------
router.get('/agencies', requireAdmin, (req, res) => {
  const rows = db
    .prepare(`SELECT a.*, (SELECT COUNT(*) FROM users u WHERE u.agency_id = a.id) AS members
              FROM agencies a ORDER BY a.name ASC`)
    .all();
  res.json(rows.map((a) => ({
    id: a.id, name: a.name, slug: a.slug, members: a.members,
    description: a.description || '', address: a.address || '', phone: a.phone || '',
    email: a.email || '', brand_color: a.brand_color || '#0069ff',
    landing_url: `/${a.slug}`,
  })));
});

router.post('/agencies', requireAdmin, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nom d\'agence requis' });
  let slug = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) slug = 'agence-' + Date.now();
  let base = slug, n = 2;
  while (db.prepare('SELECT id FROM agencies WHERE slug=?').get(slug)) slug = `${base}-${n++}`;
  const info = db.prepare('INSERT INTO agencies (name, slug, created_at) VALUES (?,?,?)').run(name, slug, new Date().toISOString());
  res.status(201).json({ id: info.lastInsertRowid, name, slug, members: 0, landing_url: `/${slug}` });
});

router.put('/agencies/:id', requireAdmin, (req, res) => {
  const a = db.prepare('SELECT * FROM agencies WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Agence introuvable' });
  const b = req.body || {};
  const name = (b.name || a.name).trim();
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  db.prepare('UPDATE agencies SET name=?, description=?, address=?, phone=?, email=?, brand_color=? WHERE id=?').run(
    name,
    b.description !== undefined ? b.description : a.description,
    b.address !== undefined ? b.address : a.address,
    b.phone !== undefined ? b.phone : a.phone,
    b.email !== undefined ? b.email : a.email,
    b.brand_color !== undefined ? b.brand_color : a.brand_color,
    a.id
  );
  res.json({ ok: true });
});

router.delete('/agencies/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET agency_id=NULL WHERE agency_id=?').run(req.params.id);
  db.prepare('DELETE FROM agencies WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Utilisateurs (gérés par l'admin)
// ---------------------------------------------------------------------------
router.get('/users', requireAdmin, (req, res) => {
  const rows = db
    .prepare(`SELECT u.*, a.name AS agency_name,
                (SELECT COUNT(*) FROM event_types e WHERE e.user_id = u.id) AS events_count,
                (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id) AS bookings_count
              FROM users u LEFT JOIN agencies a ON a.id = u.agency_id
              ORDER BY u.created_at ASC`)
    .all();
  res.json(rows.map(serializeUser));
});

// Créer un compte collègue (avec mot de passe)
router.post('/users', requireAdmin, (req, res) => {
  const { name, email, password, agency_id, username } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
  const emailNorm = email.toLowerCase().trim();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(emailNorm)) {
    return res.status(400).json({ error: 'Cet email est déjà utilisé' });
  }
  let uname = (username || '').toLowerCase().replace(/[^a-z0-9-_]/g, '').replace(/^-+|-+$/g, '');
  if (!uname) uname = (name + '-' + Math.random().toString(36).slice(2, 6)).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  let base = uname, n = 2;
  while (db.prepare('SELECT id FROM users WHERE username=?').get(uname)) uname = `${base}-${n++}`;

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (email, password_hash, name, username, role, agency_id, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(emailNorm, hash, name.trim(), uname, 'user', agency_id || null, new Date().toISOString());
  res.status(201).json({ id: info.lastInsertRowid, email: emailNorm, name: name.trim(), username: uname, role: 'user', agency_id: agency_id || null });
});

// Modifier un utilisateur (agence, rôle) ou réinitialiser son mot de passe
router.put('/users/:id', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const b = req.body || {};

  const name = (b.name || u.name).trim();
  const agency_id = b.agency_id !== undefined ? (b.agency_id || null) : u.agency_id;
  const role = b.role || u.role;

  db.prepare('UPDATE users SET name=?, agency_id=?, role=? WHERE id=?').run(name, agency_id, role, u.id);

  // Réinitialisation du mot de passe si demandée
  if (b.password && b.password.length >= 8) {
    const hash = bcrypt.hashSync(b.password, 10);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, u.id);
    // Invalide les autres sessions du collègue
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
  } else if (b.password && b.password.length < 8) {
    return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
  }
  res.json({ ok: true });
});

// Supprimer un utilisateur
router.delete('/users/:id', requireAdmin, (req, res) => {
  if (req.params.id == req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Promotion du premier utilisateur en admin (aide de secours si besoin)
// ---------------------------------------------------------------------------
router.post('/make-admin', requireAuth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (total.n === 1 || req.user.id === 1) {
    db.prepare('UPDATE users SET role=? WHERE id=?').run('admin', req.user.id);
    return res.json({ ok: true, role: 'admin' });
  }
  return res.status(403).json({ error: 'Action non autorisée' });
});

module.exports = router;
