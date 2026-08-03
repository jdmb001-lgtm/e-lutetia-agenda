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

// Le tout premier utilisateur créé devient automatiquement administrateur
const firstUser = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
if (firstUser) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (count.n === 1) {
    db.prepare('UPDATE users SET role=? WHERE id=?').run('admin', firstUser.id);
  }
}

module.exports = db;
