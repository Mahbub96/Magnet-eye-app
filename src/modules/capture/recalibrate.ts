import type { CalibrationProfile } from '../../db/profiles';

/** Why the app should ask for a new calibration (SRS CL, recalibration prompts), or null.
 * A phone's magnetism changes with a new case, a dropped phone or an OS update; a profile from
 * another phone (restored backup) does not apply at all. */
export const PROFILE_MAX_AGE_DAYS = 30;

export function recalibrationReason(
  p: CalibrationProfile | null,
  now: { model: string; android_sdk: number; app_version: string; date?: Date },
): string | null {
  if (!p) return 'Not calibrated yet: Android’s own estimate is used. Calibrate for better results.';
  if (p.model !== now.model) return 'This calibration is from another phone. Calibrate this one.';
  if (p.android_sdk !== now.android_sdk) return 'Android was updated since the last calibration. Calibrate again.';
  const days = ((now.date ?? new Date()).getTime() - new Date(p.created_at).getTime()) / 86_400_000;
  if (days > PROFILE_MAX_AGE_DAYS) return `The calibration is ${Math.floor(days)} days old. Calibrate again.`;
  if (p.app_version.split('.')[0] !== now.app_version.split('.')[0])
    return 'The app changed a lot since the last calibration. Calibrate again.';
  return null;
}
