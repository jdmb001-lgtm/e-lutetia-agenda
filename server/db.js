const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'elutetia.sqlite');

require('fs').mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Schéma
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  username      TEXT UNIQUE NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'Europe/Paris',
  brand_color   TEXT NOT NULL DEFAULT '#0069ff',
  about         TEXT DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_types (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  duration      INTEGER NOT NULL DEFAULT 30,
  slot_interval INTEGER DEFAULT 0,
  location_type TEXT NOT NULL DEFAULT 'video',   -- video | in_person | phone | custom
  location_detail TEXT DEFAULT '',
  color         TEXT NOT NULL DEFAULT '#0069ff',
  buffer_before INTEGER NOT NULL DEFAULT 0,
  buffer_after  INTEGER NOT NULL DEFAULT 0,
  daily_limit   INTEGER DEFAULT 0,               -- 0 = illimité
  min_notice_minutes INTEGER DEFAULT 0,          -- délai minimum avant le rendez-vous
  is_active     INTEGER NOT NULL DEFAULT 1,
  availability  TEXT NOT NULL DEFAULT '{}',      -- JSON: {"mon":["09:00-17:00"], ...}
  created_at    TEXT NOT NULL,
  UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS bookings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type_id INTEGER NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_name  TEXT NOT NULL,
  invitee_email TEXT NOT NULL,
  invitee_notes TEXT DEFAULT '',
  invitee_timezone TEXT NOT NULL,
  start_time    TEXT NOT NULL,   -- ISO UTC
  end_time      TEXT NOT NULL,   -- ISO UTC
  status        TEXT NOT NULL DEFAULT 'confirmed',  -- confirmed | cancelled
  reminder_sent INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_user ON event_types(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event ON bookings(event_type_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_time ON bookings(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS agencies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS single_use_links (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type_id INTEGER NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token         TEXT UNIQUE NOT NULL,
  used          INTEGER NOT NULL DEFAULT 0,
  expires_at    TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS polls (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type_id INTEGER NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id    INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  start_time TEXT NOT NULL,
  end_time   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_slot_id INTEGER NOT NULL REFERENCES poll_slots(id) ON DELETE CASCADE,
  poll_id    INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  invitee_name  TEXT NOT NULL,
  invitee_email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_sul_token ON single_use_links(token);
CREATE INDEX IF NOT EXISTS idx_poll_slug ON polls(slug);
`);

// ---------------------------------------------------------------------------
// Migrations : ajoute les colonnes si elles n'existent pas encore
// ---------------------------------------------------------------------------
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('users', 'role', `role TEXT NOT NULL DEFAULT 'user'`);
ensureColumn('users', 'agency_id', `agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL`);
ensureColumn('users', 'holidays', `holidays TEXT NOT NULL DEFAULT '[]'`);
ensureColumn('users', 'max_daily_meetings', `max_daily_meetings INTEGER NOT NULL DEFAULT 0`);
ensureColumn('users', 'welcome_message', `welcome_message TEXT NOT NULL DEFAULT ''`);
ensureColumn('users', 'language', `language TEXT NOT NULL DEFAULT 'fr'`);
ensureColumn('users', 'date_format', `date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY'`);
ensureColumn('users', 'time_format', `time_format TEXT NOT NULL DEFAULT '24h'`);
ensureColumn('users', 'country', `country TEXT NOT NULL DEFAULT 'France'`);

ensureColumn('event_types', 'address', `address TEXT NOT NULL DEFAULT ''`);
ensureColumn('event_types', 'organizer', `organizer TEXT NOT NULL DEFAULT ''`);
ensureColumn('event_types', 'custom_fields', `custom_fields TEXT NOT NULL DEFAULT '[]'`);
ensureColumn('bookings', 'custom_answers', `custom_answers TEXT NOT NULL DEFAULT '{}'`);

ensureColumn('agencies', 'description', `description TEXT NOT NULL DEFAULT ''`);
ensureColumn('agencies', 'address', `address TEXT NOT NULL DEFAULT ''`);
ensureColumn('agencies', 'phone', `phone TEXT NOT NULL DEFAULT ''`);
ensureColumn('agencies', 'email', `email TEXT NOT NULL DEFAULT ''`);
ensureColumn('agencies', 'brand_color', `brand_color TEXT NOT NULL DEFAULT '#0069ff'`);

// Le tout premier utilisateur créé devient automatiquement administrateur
const firstUser = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
if (firstUser) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (count.n === 1) {
    db.prepare('UPDATE users SET role=? WHERE id=?').run('admin', firstUser.id);
  }
}

module.exports = db;
