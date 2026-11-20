import type { Mat3 } from '../modules/capture/ironFit';
import type { Vec3 } from '../utils/quaternion';
import { getDb } from './index';
import { newId } from './scans';

export const CALIBRATION_SCHEMA = 1;

/** One calibration (SRS CL): the phone's own magnetism and what was measured with it.
 * Units: µT, Hz; dates ISO 8601. */
export type CalibrationProfile = {
  id: string;
  created_at: string;
  app_version: string;
  schema_version: number;
  model: string;
  android_sdk: number;
  hard_iron_ut: Vec3;
  soft_iron: Mat3;
  field_ut: number;
  residual_ut: number;
  fit_model: 'ellipsoid' | 'sphere';
  coverage: number; // share of directions the figure eight covered
  noise_ut: number;
  background_ut: number;
};

export function saveProfile(p: Omit<CalibrationProfile, 'id' | 'created_at' | 'schema_version'>): CalibrationProfile {
  const full: CalibrationProfile = { ...p, id: newId(), created_at: new Date().toISOString(), schema_version: CALIBRATION_SCHEMA };
  const db = getDb();
  db.withTransactionSync(() => {
    db.runSync('UPDATE profile SET active = 0');
    db.runSync(
      `INSERT INTO profile (id, created_at, app_version, schema_version, model, android_sdk, data, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [full.id, full.created_at, full.app_version, full.schema_version, full.model, full.android_sdk, JSON.stringify(full)],
    );
  });
  return full;
}

export function activeProfile(): CalibrationProfile | null {
  const row = getDb().getFirstSync<{ data: string }>(
    'SELECT data FROM profile WHERE active = 1 ORDER BY created_at DESC LIMIT 1',
  );
  return row ? (JSON.parse(row.data) as CalibrationProfile) : null;
}

/** Settings > Reset profile: scanning goes back to Android's own estimate. */
export function resetProfiles(): void {
  getDb().runSync('UPDATE profile SET active = 0');
}
