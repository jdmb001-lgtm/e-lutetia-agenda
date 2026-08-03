const bcrypt = require('bcryptjs');
const db = require('./db');

function ensureUser(email, name, username, timezone, color) {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) return existing;
  const info = db
    .prepare(
      'INSERT INTO users (email, password_hash, name, username, timezone, brand_color, about, created_at) VALUES (?,?,?,?,?,?,?,?)'
    )
    .run(
      email,
      bcrypt.hashSync('demo1234', 10),
      name,
      username,
      timezone,
      color,
      'Disponible pour vos rendez-vous de démonstration.',
      new Date().toISOString()
    );
  return db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
}

function ensureEvent(user, name, slug, duration, availability, opts = {}) {
  const existing = db.prepare('SELECT id FROM event_types WHERE user_id=? AND slug=?').get(user.id, slug);
  if (existing) return;
  db.prepare(
    `INSERT INTO event_types
       (user_id, name, slug, description, duration, slot_interval, location_type, location_detail,
        color, buffer_before, buffer_after, daily_limit, min_notice_minutes, is_active, availability, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    user.id, name, slug,
    opts.description || 'Rencontre de démonstration.',
    duration, opts.slot_interval || 0,
    opts.location_type || 'video', opts.location_detail || 'Lien de visio fourni par email',
    opts.color || user.brand_color,
    opts.buffer_before || 0, opts.buffer_after || 0,
    opts.daily_limit || 0, opts.min_notice_minutes || 0,
    1, JSON.stringify(availability), new Date().toISOString()
  );
}

function defaultAvailability(start = '09:00', end = '17:00') {
  return {
    mon: [`${start}-${end}`],
    tue: [`${start}-${end}`],
    wed: [`${start}-${end}`],
    thu: [`${start}-${end}`],
    fri: [`${start}-${end}`],
    sat: [],
    sun: [],
  };
}

function run() {
  const demo = ensureUser('demo@example.com', 'Démo Dupont', 'demo', 'Europe/Paris', '#0069ff');
  ensureEvent(demo, 'Découverte 30 min', 'decouverte-30min', 30, defaultAvailability('09:00', '18:00'), {
    description: 'Un premier échange pour découvrir nos services.',
    location_type: 'video',
    location_detail: 'Lien Google Meet fourni par email',
  });
  ensureEvent(demo, 'Appel de suivi', 'suivi', 45, defaultAvailability(), {
    description: 'Point de suivi de votre projet.',
    location_type: 'phone',
    location_detail: 'Appel téléphonique',
    slot_interval: 45,
    buffer_before: 15,
    buffer_after: 15,
  });
  ensureEvent(demo, 'Consultation 60 min', 'consultation', 60, defaultAvailability(), {
    description: 'Consultation approfondie.',
    location_type: 'in_person',
    location_detail: 'Paris, bureau principal',
    daily_limit: 3,
  });

  console.log('✅ Base de données prête.');
  console.log('   Compte démo :');
  console.log('   Email   : demo@example.com');
  console.log('   Mot de passe : demo1234');
  console.log('   Page de réservation : /demo/decouverte-30min');
}

run();
