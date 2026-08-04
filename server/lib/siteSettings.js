const db = require('../db');

function getSetting(key, def) {
  const row = db.prepare('SELECT value FROM site_settings WHERE key=?').get(key);
  return row ? row.value : (def === undefined ? '' : def);
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO site_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(key, value);
}

// Réglages globaux exposés publiquement (sauf les secrets)
function publicSettings() {
  return {
    registration_enabled: getSetting('registration_enabled', 'true') !== 'false',
    logo: getSetting('logo', ''),
    site_name: getSetting('site_name', 'E-Lutetia Agenda'),
  };
}

module.exports = { getSetting, setSetting, publicSettings };
