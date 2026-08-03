const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

const SESSION_TTL_DAYS = 30;
const COOKIE_NAME = 'cl_session';

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function publicUser(u) {
  let holidays = [];
  try { holidays = JSON.parse(u.holidays || '[]'); } catch (_) {}
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    username: u.username,
    timezone: u.timezone,
    brand_color: u.brand_color,
    about: u.about,
    role: u.role || 'user',
    agency_id: u.agency_id || null,
    holidays,
    max_daily_meetings: Number(u.max_daily_meetings) || 0,
  };
}

// Middleware de protection : exige une session valide
function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'authentification requise' });
  const row = db
    .prepare(
      `SELECT s.token, s.expires_at, u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token);
  if (!row) return res.status(401).json({ error: 'session invalide' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ error: 'session expirée' });
  }
  req.user = row;
  req.sessionToken = token;
  next();
}

function startSession(res, userId) {
  const token = generateToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_DAYS * 86400000);
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)').run(
    token, userId, now.toISOString(), expires.toISOString()
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: SESSION_TTL_DAYS * 86400000,
    path: '/',
  });
}

// Inscription
router.post('/signup', (req, res) => {
  const { email, password, name, username, timezone } = req.body || {};
  if (!email || !password || !name || !username) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
  }
  const slug = username.toLowerCase().replace(/[^a-z0-9-_]/g, '').replace(/^-+|-+$/g, '');
  if (slug.length < 3) {
    return res.status(400).json({ error: "Nom d'utilisateur invalide (3 caractères minimum)" });
  }
  const emailNorm = email.toLowerCase().trim();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm);
  if (exists) return res.status(400).json({ error: 'Cet email est déjà utilisé' });
  const usernameTaken = db.prepare('SELECT id FROM users WHERE username = ?').get(slug);
  if (usernameTaken) return res.status(400).json({ error: "Ce nom d'utilisateur est déjà pris" });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      'INSERT INTO users (email, password_hash, name, username, timezone, created_at) VALUES (?,?,?,?,?,?)'
    )
    .run(emailNorm, hash, name.trim(), slug, timezone || 'Europe/Paris', new Date().toISOString());

  startSession(res, info.lastInsertRowid);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user: publicUser(user) });
});

// Connexion
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }
  startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

// Déconnexion
router.post('/logout', (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// Session courante
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = { router, requireAuth, publicUser, COOKIE_NAME };
