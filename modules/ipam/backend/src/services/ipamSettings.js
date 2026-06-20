import db from '../db/index.js';

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM ip_settings WHERE key = ?').get(key);
  return row?.value ?? fallback;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO ip_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, String(value));
}

export function getUtilizationAlertPercent() {
  const raw = Number(getSetting('utilization_alert_percent', '80'));
  if (!Number.isFinite(raw)) return 80;
  return Math.min(100, Math.max(1, Math.round(raw)));
}

export function listSettings() {
  return db.prepare('SELECT key, value FROM ip_settings ORDER BY key').all();
}
