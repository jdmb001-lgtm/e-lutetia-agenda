const { DateTime, IANAZone } = require('luxon');
const db = require('../db');

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Conversion weekday Luxon (1=lundi .. 7=dimanche) -> clé
function weekdayKeyFromNumber(n) {
  return WEEKDAY_KEYS[n - 1];
}

function parseAvailability(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

// Renvoie [{start, end}] ISO UTC pour une journée donnée (date YYYY-MM-DD dans le fuseau de l'hôte)
function computeSlotsForDay(eventType, user, localDateStr, nowIso) {
  const tz = user.timezone || user.host_timezone || "UTC";
  const avail = parseAvailability(eventType.availability);
  const dayStart = DateTime.fromISO(localDateStr, { zone: tz });
  if (!dayStart.isValid) return [];

  const dow = dayStart.weekday; // 1..7
  const windows = avail[weekdayKeyFromNumber(dow)] || [];
  if (!windows.length) return [];

  const duration = eventType.duration || 30;
  const step = eventType.slot_interval > 0 ? eventType.slot_interval : duration;
  const now = new Date(nowIso).getTime();

  // Créneaux candidats
  const candidates = [];
  for (const win of windows) {
    const parts = String(win).split('-');
    if (parts.length !== 2) continue;
    const [sh, sm] = parts[0].split(':').map(Number);
    const [eh, em] = parts[1].split(':').map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) continue;
    let cursor = dayStart.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
    const end = dayStart.set({ hour: eh, minute: em, second: 0, millisecond: 0 });
    while (cursor.plus({ minutes: duration }) <= end) {
      const startUTC = cursor.toUTC();
      // Enlever les créneaux déjà passés (compte tenu du délai minimum)
      if (startUTC.toMillis() >= now + (eventType.min_notice_minutes || 0) * 60000) {
        candidates.push({ start: startUTC, end: startUTC.plus({ minutes: duration }) });
      }
      cursor = cursor.plus({ minutes: step });
    }
  }

  // Plages occupées par les réservations confirmées de l'utilisateur (buffers inclus)
  const occupied = [];
  const takenRows = db.prepare(`
    SELECT b.start_time, b.end_time, b.event_type_id, e.buffer_before, e.buffer_after
    FROM bookings b JOIN event_types e ON e.id = b.event_type_id
    WHERE b.user_id = ? AND b.status = 'confirmed'
      AND b.start_time < ? AND b.end_time > ?
  `).all(
    user.id,
    dayStart.plus({ days: 1 }).toUTC().toISO(),
    dayStart.toUTC().toISO()
  );

  for (const t of takenRows) {
    occupied.push({
      start: new Date(new Date(t.start_time).getTime() - (t.buffer_before || 0) * 60000),
      end: new Date(new Date(t.end_time).getTime() + (t.buffer_after || 0) * 60000),
    });
  }

  const overlaps = (s, e, range) => s < range.end && e > range.start;

  const slots = candidates.filter((c) => {
    const s = c.start.toJSDate();
    const e = c.end.toJSDate();
    return !occupied.some((r) => overlaps(s, e, r));
  });

  return slots;
}

// Résumé d'un mois pour le calendrier public : jours où il y a de la dispo
function monthOverview(eventType, user, year, month /* 1-12 */, nowIso) {
  const tz = user.timezone || user.host_timezone || "UTC";
  const first = DateTime.fromObject({ year, month, day: 1 }, { zone: tz });
  const daysInMonth = first.daysInMonth;
  const overview = {};

  for (let d = 1; d <= daysInMonth; d++) {
    const localDateStr = DateTime.fromObject({ year, month, day: d }, { zone: tz }).toISODate();
    const slots = computeSlotsForDay(eventType, user, localDateStr, nowIso);
    overview[localDateStr] = { count: slots.length };
  }
  return overview;
}

// Vérifie qu'un créneau (start ISO UTC) est encore disponible, pour la réservation
function isSlotAvailable(eventType, user, startIso, duration) {
  const tz = user.timezone || user.host_timezone || "UTC";
  const start = DateTime.fromISO(startIso, { zone: 'utc' }).toUTC();
  if (!start.isValid) return { ok: false, reason: 'invalid' };
  const localDateStr = start.setZone(tz).toISODate();
  const slots = computeSlotsForDay(eventType, user, localDateStr, new Date().toISOString());
  const match = slots.find((s) => Math.abs(s.start.toMillis() - start.toMillis()) < 60000);
  if (!match) return { ok: false, reason: 'unavailable' };
  return { ok: true, slot: match };
}

module.exports = {
  WEEKDAY_KEYS,
  weekdayKeyFromNumber,
  parseAvailability,
  computeSlotsForDay,
  monthOverview,
  isSlotAvailable,
};
