import { getDb } from './index';

/** Small app settings (first-run done, later the server address), stored as text. */
export function getSetting(key: string): string | null {
  const row = getDb().getFirstSync<{ value: string }>('SELECT value FROM setting WHERE key = ?', key);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb().runSync(
    'INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export const ONBOARDED = 'onboarded';
export const PROFILE = 'phone_profile'; // JSON PhoneProfile (modules/capture/profile.ts)
export const CALIBRATION = 'calibration'; // JSON result of the Calibrate screen
