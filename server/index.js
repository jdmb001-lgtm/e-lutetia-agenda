const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const db = require('./db');

const { router: authRouter } = require('./routes/auth');
const eventsRouter = require('./routes/events');
const bookingsRouter = require('./routes/bookings');
const settingsRouter = require('./routes/settings');
const adminRouter = require('./routes/admin');
const schedulingRouter = require('./routes/scheduling');
const publicRouter = require('./routes/public');
const { startScheduler } = require('./lib/workflows');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.disable('x-powered-by');

// ===== API =====
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/scheduling', schedulingRouter);
app.use('/api/public', publicRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ===== Fichiers statiques =====
app.use(express.static(PUBLIC_DIR));

// ===== Pages =====
const pages = {
  '/': 'index.html',
  '/login': 'login.html',
  '/signup': 'signup.html',
  '/dashboard': 'dashboard.html',
  '/dashboard/events': 'dashboard.html',
  '/dashboard/bookings': 'dashboard.html',
  '/dashboard/settings': 'dashboard.html',
};
for (const [route, file] of Object.entries(pages)) {
  app.get(route, (req, res) => res.sendFile(path.join(PUBLIC_DIR, file)));
}

// ===== Page d'agence : /:slug (page d'accueil d'une agence) =====
app.get('/agency/:slug', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'agency.html'));
});

// ===== Lien à usage unique : /single/:token =====
app.get('/single/:token', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'booking-single.html'));
});

// ===== Sondage de réunion : /p/:slug =====
app.get('/p/:slug', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'poll.html'));
});

// ===== Page d'accueil d'une agence : /:slug =====
app.get('/:slug', (req, res, next) => {
  const agency = db.prepare('SELECT id FROM agencies WHERE slug=?').get(req.params.slug);
  if (!agency) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'agency.html'));
});

// ===== Page de réservation publique : /:username/:slug =====
app.get('/:username/:slug', (req, res, next) => {
  const { username, slug } = req.params;
  const event = db
    .prepare('SELECT e.id FROM event_types e JOIN users u ON u.id=e.user_id WHERE u.username=? AND e.slug=?')
    .get(username, slug);
  if (!event) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'booking.html'));
});

// 404
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html')));

// ===== Démarrage =====
const server = app.listen(PORT, () => {
  console.log(`🚀 E-Lutetia Agenda lancé sur http://localhost:${PORT}`);
  console.log(`   Interface : http://localhost:${PORT}/`);
  console.log(`   Démo (après seed) : http://localhost:${PORT}/demo/decouverte-30min`);
  startScheduler();
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
