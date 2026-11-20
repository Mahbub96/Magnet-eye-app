import type { Capabilities, RawRecording } from '../../../modules/magnet-capture/src/MagnetCapture.types';
import type { Vec3 } from '../../utils/quaternion';
import { rateHz, rows, stdVec } from './stats';

/** What a short still recording says about this phone (Figma "03 Your phone can scan").
 * Units: Hz, µT, cm/s, mm. */
export type PhoneProfile = {
  rateHz: number;
  noiseUt: number; // RMS over the three axes of the raw reading's standard deviation
  rangeUt: number;
  speedMinCmS: number;
  speedMaxCmS: number;
  readingEveryMm: number; // at the fastest suggested speed
  measuredAt: string;
};

export type Grade = 'good' | 'limited' | 'poor';

/** One reading per millimetre at most keeps detail well below the finest the solver resolves
 * (a third of the scan height, centimetres), so the fastest speed follows from the rate. The
 * slowest is where the accelerometer still sees a slide start and end clearly. */
const MM_PER_READING_AT_MAX = 1;
const SPEED_MIN_CM_S = 2;

export function measureProfile(raw: RawRecording, caps: Capabilities): PhoneProfile {
  const mag = rows(raw.mag, 7);
  if (mag.length < 20) throw new Error('Too few readings. Keep the app open and try again.');
  const rate = rateHz(mag.map((r) => r[0]));
  const sd = stdVec(mag.map((r) => [r[1], r[2], r[3]] as Vec3));
  const s = caps.sensors.magnetometerUncalibrated ?? caps.sensors.magnetometer;
  const speedMax = Math.max(SPEED_MIN_CM_S + 1, (rate * MM_PER_READING_AT_MAX) / 10);
  return {
    rateHz: rate,
    noiseUt: Math.sqrt((sd[0] ** 2 + sd[1] ** 2 + sd[2] ** 2) / 3),
    rangeUt: s?.maxRange ?? 0,
    speedMinCmS: SPEED_MIN_CM_S,
    speedMaxCmS: Math.round(speedMax),
    readingEveryMm: (Math.round(speedMax) * 10) / rate,
    measuredAt: new Date().toISOString(),
  };
}

export function gradeRate(hz: number): Grade {
  return hz >= 80 ? 'good' : hz >= 40 ? 'limited' : 'poor';
}
export function gradeNoise(ut: number): Grade {
  return ut <= 1 ? 'good' : ut <= 3 ? 'limited' : 'poor';
}
export function gradeRange(ut: number): Grade {
  return ut >= 2000 ? 'good' : ut >= 1000 ? 'limited' : 'poor';
}

/** Directions on the sphere for the figure-eight coverage: the 26 neighbours of a cube
 * (faces, edges, corners), normalised. A direction counts as covered when the field has
 * pointed within its cell. */
export const SPHERE_BINS: Vec3[] = (() => {
  const out: Vec3[] = [];
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1])
      for (const z of [-1, 0, 1]) {
        if (!x && !y && !z) continue;
        const n = Math.hypot(x, y, z);
        out.push([x / n, y / n, z / n]);
      }
  return out;
})();

export function nearestBin(v: Vec3): number {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  let best = 0;
  let dot = -2;
  SPHERE_BINS.forEach((b, i) => {
    const d = (b[0] * v[0] + b[1] * v[1] + b[2] * v[2]) / n;
    if (d > dot) {
      dot = d;
      best = i;
    }
  });
  return best;
}
