import type { Quat, Vec3 } from '../../utils/quaternion';
import { rotate } from '../../utils/quaternion';

/** Capture checks for ruler mode. Units: angles in radians (shown in degrees), fields in µT.
 *
 * Ruler mode assumes the phone lies flat on the paper, so the tracked point stays on the table
 * plane and the swipe's start and end marks are where the phone really was. The baseline must
 * measure the background only (Earth plus room), never the magnet. */

/** Largest tilt from flat that still counts as lying on the paper (10°). */
export const FLAT_MAX_RAD = (10 * Math.PI) / 180;
/** The Earth's field is about 25–65 µT anywhere on the surface; allow some room for the
 * building. Outside this range the baseline is measuring something else (usually the magnet). */
export const BACKGROUND_MIN_UT = 20;
export const BACKGROUND_MAX_UT = 80;

export const deg = (rad: number) => (rad * 180) / Math.PI;

/** Angle between the phone's screen normal (+z) and world up, radians. 0 = lying flat face up.
 * Does not depend on yaw, so it works on the unaligned game rotation vector too. */
export function tiltRad(q: Quat): number {
  const z = rotate(q, [0, 0, 1])[2];
  return Math.acos(Math.max(-1, Math.min(1, z)));
}

export function maxTiltRad(qs: Quat[]): number {
  let m = 0;
  for (const q of qs) m = Math.max(m, tiltRad(q));
  return m;
}

/** Why a baseline cannot be used, or null if it can. */
export function baselineProblem(b: { tiltRad: number; fieldWorld: Vec3 }): string | null {
  if (b.tiltRad > FLAT_MAX_RAD)
    return `Lay the phone flat (it is tilted ${deg(b.tiltRad).toFixed(0)}°) and try again.`;
  const f = Math.hypot(...b.fieldWorld);
  if (f > BACKGROUND_MAX_UT)
    return (
      `The background reads ${f.toFixed(0)} µT, but the Earth alone is about 25–65 µT. ` +
      'Move the magnet, and any laptop, speaker or steel, at least 50 cm away and try again. ' +
      'If it stays high, wave the phone in a figure-8 so Android recalibrates.'
    );
  if (f < BACKGROUND_MIN_UT)
    return (
      `The background reads only ${f.toFixed(0)} µT; the Earth alone is about 25–65 µT. ` +
      'Wave the phone in a figure-8 so Android recalibrates, then try again.'
    );
  return null;
}

/** Problems with a recorded ruler swipe that make its positions untrustworthy. */
export function swipeProblems(s: {
  maxTiltRad: number;
  motionFound: boolean;
  /** Mean speed along the line (cm/s) and this phone's good range, when known. */
  speedCmS?: number;
  speedRange?: [number, number];
}): string[] {
  const p: string[] = [];
  // Ruler mode assumes a steady slide from start to end mark: a slide far outside the range
  // (pauses, going back, recording long after the end) puts every reading in the wrong place.
  if (s.speedCmS !== undefined && s.speedRange && s.motionFound) {
    const [lo, hi] = s.speedRange;
    if (s.speedCmS < lo / 2)
      p.push(`Slide took too long (${s.speedCmS.toFixed(1)} cm/s): slide steadily at ${lo}–${hi} cm/s and stop right at the end mark.`);
    else if (s.speedCmS > hi * 1.5)
      p.push(`Slide too fast (${s.speedCmS.toFixed(1)} cm/s): aim for ${lo}–${hi} cm/s.`);
  }
  if (s.maxTiltRad > FLAT_MAX_RAD)
    p.push(`Phone tilted ${deg(s.maxTiltRad).toFixed(0)}° during the swipe: keep it flat on the paper.`);
  if (!s.motionFound) p.push('No slide detected: slide the phone along the ruler between record and stop.');
  return p;
}

/** Box heights outside this range (mm) are probably a typing slip. */
export const BOX_HEIGHT_MM: [number, number] = [5, 100];
