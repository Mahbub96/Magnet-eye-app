import { expect, test } from '@jest/globals';

import { apply, eigSym3, fitIron, type Mat3 } from '../modules/capture/ironFit';
import type { Vec3 } from '../utils/quaternion';

import type { CalibrationProfile } from '../db/profiles';
import { recalibrationReason } from '../modules/capture/recalibrate';

let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;

/** Readings of a 45 µT field turned through every direction, distorted by D and offset by b. */
function figureEight(d: Mat3, b: Vec3, n = 600, noise = 0.3): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const z = rnd();
    const t = Math.PI * rnd();
    const u = [Math.sqrt(1 - z * z) * Math.cos(t), Math.sqrt(1 - z * z) * Math.sin(t), z].map((v) => 45 * v);
    out.push([0, 1, 2].map((k) => d[k][0] * u[0] + d[k][1] * u[1] + d[k][2] * u[2] + b[k] + noise * rnd()) as Vec3);
  }
  return out;
}

const B: Vec3 = [-70, -25, -140];

test('eigen-decomposition of a symmetric 3x3', () => {
  const s: Mat3 = [
    [4, 1, 0.5],
    [1, 3, 0.2],
    [0.5, 0.2, 2],
  ];
  const { values, vectors: v } = eigSym3(s);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      const r = [0, 1, 2].reduce((acc, m) => acc + v[i][m] * values[m] * v[j][m], 0);
      expect(r).toBeCloseTo(s[i][j], 9);
    }
});

test('a soft-iron distorted phone: offset and shape are recovered', () => {
  const d: Mat3 = [
    [1.12, 0.06, 0.0],
    [0.06, 0.93, 0.04],
    [0.0, 0.04, 1.0],
  ];
  const raw = figureEight(d, B);
  const fit = fitIron(raw)!;
  expect(fit.model).toBe('ellipsoid');
  fit.hardIronUt.forEach((v, i) => expect(Math.abs(v - B[i])).toBeLessThan(0.5));
  // Corrected readings lie on a sphere: spread comparable to the sensor noise.
  expect(fit.residualUt).toBeLessThan(0.5);
  expect(fit.fieldUt).toBeGreaterThan(40);
  expect(fit.fieldUt).toBeLessThan(50);
  const mags = raw.map((x) => Math.hypot(...apply(fit.softIron, fit.hardIronUt, x)));
  expect(Math.max(...mags) - Math.min(...mags)).toBeLessThan(3);
});

test('an undistorted phone gets the simpler sphere model', () => {
  const fit = fitIron(figureEight([[1, 0, 0], [0, 1, 0], [0, 0, 1]], B))!;
  expect(fit.model).toBe('sphere');
  fit.hardIronUt.forEach((v, i) => expect(Math.abs(v - B[i])).toBeLessThan(0.5));
  expect(fit.fieldUt).toBeCloseTo(45, 0);
});

test('too few readings give no fit', () => {
  expect(fitIron(figureEight([[1, 0, 0], [0, 1, 0], [0, 0, 1]], B, 10))).toBeNull();
});

test('recalibration prompts', () => {
  const p = { model: 'Redmi', android_sdk: 31, app_version: '0.1.0', created_at: '2026-11-01T00:00:00Z' } as CalibrationProfile;
  const now = { model: 'Redmi', android_sdk: 31, app_version: '0.2.0', date: new Date('2026-11-20T00:00:00Z') };
  expect(recalibrationReason(p, now)).toBeNull();
  expect(recalibrationReason(null, now)).toMatch(/Not calibrated/);
  expect(recalibrationReason(p, { ...now, android_sdk: 33 })).toMatch(/Android was updated/);
  expect(recalibrationReason(p, { ...now, model: 'Pixel' })).toMatch(/another phone/);
  expect(recalibrationReason(p, { ...now, date: new Date('2027-01-01T00:00:00Z') })).toMatch(/days old/);
});
