import type { Quat, Vec3 } from '../../utils/quaternion';
import { rotate } from '../../utils/quaternion';

/** Rows of a flat row-major array. */
export function rows(flat: number[], stride: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i + stride <= flat.length; i += stride) out.push(flat.slice(i, i + stride));
  return out;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Sampling rate from timestamps (ns), using the median interval so gaps do not skew it. */
export function rateHz(times: number[]): number {
  if (times.length < 2) return 0;
  const dt: number[] = [];
  for (let i = 1; i < times.length; i++) dt.push(times[i] - times[i - 1]);
  const m = median(dt.filter((d) => d > 0));
  return m > 0 ? 1e9 / m : 0;
}

export function meanVec(vs: Vec3[]): Vec3 {
  const n = vs.length || 1;
  const s: Vec3 = [0, 0, 0];
  for (const v of vs) for (let i = 0; i < 3; i++) s[i] += v[i];
  return [s[0] / n, s[1] / n, s[2] / n];
}

export function stdVec(vs: Vec3[]): Vec3 {
  const m = meanVec(vs);
  const n = Math.max(vs.length - 1, 1);
  const s: Vec3 = [0, 0, 0];
  for (const v of vs) for (let i = 0; i < 3; i++) s[i] += (v[i] - m[i]) ** 2;
  return [Math.sqrt(s[0] / n), Math.sqrt(s[1] / n), Math.sqrt(s[2] / n)];
}

/** Index of the orientation sample nearest in time to each query time (both ascending). */
export function nearestIndex(sorted: number[], queries: number[]): number[] {
  const out: number[] = [];
  let j = 0;
  for (const t of queries) {
    while (j + 1 < sorted.length && Math.abs(sorted[j + 1] - t) <= Math.abs(sorted[j] - t)) j++;
    out.push(j);
  }
  return out;
}

/** World-frame field for each magnetometer reading, pairing it with the nearest orientation.
 * Approximate (no interpolation): used for live checks and the baseline only — the backend
 * does the exact alignment (Architecture 3.3). */
export function toWorld(
  magT: number[],
  magB: Vec3[],
  rotT: number[],
  rotQ: Quat[],
): Vec3[] {
  if (rotQ.length === 0) return [];
  const idx = nearestIndex(rotT, magT);
  return magB.map((b, i) => rotate(rotQ[idx[i]], b));
}
