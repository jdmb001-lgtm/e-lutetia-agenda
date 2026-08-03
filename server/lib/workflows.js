const { DateTime } = require('luxon');
const db = require('../db');
const { sendMail } = require('./mailer');

// Workflow de rappel : envoie un email de rappel aux participants et à l'hôte
// pour les rendez-vous à venir. Configurable via REMINDER_HOURS_BEFORE (défaut 24).
const REMINDER_HOURS = Number(process.env.REMINDER_HOURS_BEFORE || 24);

// Rend le champ reminder_sent disponible sur les anciennes bases
function ensureSchema() {
  const cols = db.prepare(`PRAGMA table_info(bookings)`).all();
  if (!cols.some((c) => c.name === 'reminder_sent')) {
    db.exec(`ALTER TABLE bookings ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0`);
  }
}

function runReminders() {
  ensureSchema();
  const windowStart = new Date(Date.now()).toISOString();
  const windowEnd = new Date(Date.now() + REMINDER_HOURS * 3600000).toISOString();

  const rows = db
    .prepare(
      `SELECT b.*, e.name AS event_name, e.duration, e.location_detail, e.location_type,
              u.name AS host_name, u.email AS host_email, u.timezone AS host_timezone
       FROM bookings b
       JOIN event_types e ON e.id = b.event_type_id
       JOIN users u ON u.id = b.user_id
       WHERE b.status='confirmed' AND b.reminder_sent=0
         AND b.start_time > ? AND b.start_time <= ?`
    )
    .all(windowStart, windowEnd);

  for (const b of rows) {
    const startLocal = DateTime.fromISO(b.start_time, { zone: b.host_timezone || 'UTC' });
    const fmt = startLocal.toFormat('cccc d MMMM yyyy, HH:mm (z)');
    sendMail({
      to: b.invitee_email,
      subject: `Rappel : ${b.event_name} dans ${REMINDER_HOURS}h avec ${b.host_name}`,
      text: `Bonjour ${b.invitee_name},\n\nPetit rappel : votre rendez-vous "${b.event_name}" avec ${b.host_name} aura lieu ${fmt}.\n📍 ${b.location_detail || b.location_type}\n\nÀ bientôt !`,
    }).then(() => {
      db.prepare('UPDATE bookings SET reminder_sent=1 WHERE id=?').run(b.id);
      console.log(`[workflows] Rappel envoyé pour la réservation #${b.id}`);
    }).catch((e) => console.error('[workflows] erreur', e.message));
  }
  return rows.length;
}

function startScheduler() {
  ensureSchema();
  console.log(`[workflows] Planificateur de rappels actif (toutes les 60s, ${REMINDER_HOURS}h avant rendez-vous)`);
  runReminders();
  return setInterval(runReminders, 60 * 1000);
}

module.exports = { startScheduler, runReminders, ensureSchema };
