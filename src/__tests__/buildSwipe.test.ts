/// <reference types="node" />
import { writeFileSync } from "node:fs";

import { expect, test } from "@jest/globals";
import type { RawRecording } from '../../modules/magnet-capture/src/MagnetCapture.types';
import { measureBaseline } from '../modules/capture/baseline';
import { buildSwipe, detectMotion, type SessionContext, validateSwipe } from '../modules/capture/buildSwipe';
import { MAG_COLUMNS } from '../modules/capture/swipeFormat';
import { aboutZ, rotate, type Vec3 } from '../utils/quaternion';

/** Synthetic recording: phone flat, yawed by `yaw` in the game-rotation-vector frame, sliding
 * between 0.5 s and 2.5 s of a 3 s recording. Field in the world frame is `bWorld`. */
function synth(opts: { yaw: number; bWorld: Vec3; bias: Vec3; seconds?: number; moving?: boolean }) {
  const { yaw, bWorld, bias, seconds = 3, moving = true } = opts;
  const q = aboutZ(yaw);
  const qInv: [number, number, number, number] = [q[0], -q[1], -q[2], -q[3]];
  const bPhone = rotate(qInv, bWorld);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const mag: number[] = [];
  const rot: number[] = [];
  const acc: number[] = [];
  const t0 = 5e9;
  for (let i = 0; i < seconds * 100; i++) {
    const t = t0 + i * 1e7; // 100 Hz
    mag.push(t, bPhone[0] + bias[0] + 0.3 * rnd(), bPhone[1] + bias[1] + 0.3 * rnd(), bPhone[2] + bias[2] + 0.3 * rnd(), ...bias);
    rot.push(t + 2e6, ...q);
    const inMotion = moving && i >= 50 && i < 250;
    const tap = i < 5 || i >= seconds * 100 - 5; // pressing record / stop
    const a = inMotion ? 1.0 : tap ? 2.0 : 0.01;
    acc.push(t + 1e6, a * rnd(), a * rnd(), 9.81 + 0.01 * rnd());
  }
  const raw: RawRecording = {
    startNs: t0,
    stopNs: t0 + seconds * 1e9,
    magSensor: 'uncalibrated',
    mag,
    rot,
    acc,
    gyr: [t0, 0, 0, 0, t0 + 1e7, 0, 0, 0],
    overflow: false,
  };
  return raw;
}

const bias: Vec3 = [40, -25, 10];
const earth: Vec3 = [0, 22, -40];

function ctx(over: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: 's1',
    swipeIndex: 0,
    appVersion: '0.1.0',
    device: { manufacturer: 'Test', model: 'Phone', android_sdk: 35 },
    clockOriginNs: '123456789',
    trackingMode: 'ruler',
    tableZ: 0,
    yawAlignment: 0,
    baselineStart: [0, 0, 0],
    calibration: {
      source: 'android_estimate',
      profile_id: null,
      hard_iron_ut: bias,
      soft_iron: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      noise_ut: [0.3, 0.3, 0.3],
      range_ut: 4900,
      saturation_threshold_ut: 0.98 * 4900,
      sensor_offset_m: [0, 0, 0],
      sensor_offset_source: 'unknown',
    },
    plannedLine: { start: [-0.1, 0, 0], end: [0.1, 0, 0] },
    ...over,
  };
}

test('baseline recovers the yaw alignment, world field, noise and rate', () => {
  const b = measureBaseline(synth({ yaw: 0.8, bWorld: earth, bias, moving: false }));
  expect(b.yawAlignment).toBeCloseTo(-0.8, 6);
  // World frame = paper frame: the GRV frame turned by the alignment.
  const paper = rotate(aboutZ(-0.8), earth);
  b.fieldWorld.forEach((v, i) => expect(v).toBeCloseTo(paper[i], 0));
  b.noise.forEach((v) => expect(v).toBeGreaterThan(0.1));
  b.noise.forEach((v) => expect(v).toBeLessThan(0.3));
  expect(b.rateHz).toBeCloseTo(100, 6);
  b.androidBias.forEach((v, i) => expect(v).toBeCloseTo(bias[i], 9));
});

test('motion is found from the accelerometer, ignoring the button taps', () => {
  const raw = synth({ yaw: 0, bWorld: earth, bias });
  const acc: number[][] = [];
  for (let i = 0; i < raw.acc.length; i += 4) acc.push(raw.acc.slice(i, i + 4));
  const m = detectMotion(acc)!;
  expect(m).not.toBeNull();
  expect((m.start - 5e9) / 1e9).toBeGreaterThan(0.4);
  expect((m.start - 5e9) / 1e9).toBeLessThan(0.6);
  expect((m.end - 5e9) / 1e9).toBeGreaterThan(2.4);
  expect((m.end - 5e9) / 1e9).toBeLessThan(2.6);
});

test('a built swipe is valid swipe format v1 and in the paper frame', () => {
  const raw = synth({ yaw: 0.8, bWorld: earth, bias });
  // One reading over the saturation threshold.
  raw.mag[7 * 10 + 1] = 4950;
  const s = buildSwipe(raw, ctx({ yawAlignment: -0.8 }));
  expect(validateSwipe(s)).toEqual([]);
  expect(s.streams.mag.columns).toEqual(MAG_COLUMNS);
  expect(s.stats.saturated_samples).toBe(1);
  expect(s.stats.mag_rate_hz).toBeCloseTo(100, 6);
  // Calibrated = raw - hard iron.
  const r = s.streams.mag.rows[5];
  expect(r[4]).toBeCloseTo(r[1] - bias[0], 9);
  // Orientation is aligned to the paper: rotating a calibrated reading gives the world field.
  const q = s.streams.orientation.rows[5].slice(1) as [number, number, number, number];
  const paper = rotate(aboutZ(-0.8), earth);
  rotate(q, [r[4], r[5], r[6]]).forEach((v, i) => expect(v).toBeCloseTo(paper[i], 0));
  // Ruler positions: start, motion start, motion end, end.
  const pos = s.streams.position.rows;
  expect(pos).toHaveLength(4);
  expect(pos[0].slice(1, 4)).toEqual([-0.1, 0, 0]);
  expect(pos[3].slice(1, 4)).toEqual([0.1, 0, 0]);
  expect(pos[1][4]).toBe('ruler_endpoint');
  // 0.2 m in ~2 s.
  expect(s.stats.mean_speed_m_s!).toBeGreaterThan(0.09);
  expect(s.stats.mean_speed_m_s!).toBeLessThan(0.11);
  // Round-trips through JSON unchanged (what is written to disk and uploaded).
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
});

test('validation flags a first swipe without a start baseline', () => {
  const s = buildSwipe(synth({ yaw: 0, bWorld: earth, bias }), ctx({ baselineStart: null }));
  expect(validateSwipe(s)).toContain('session_geometry.baseline_start_ut');
});

/** Shared contract with the backend: `WRITE_FIXTURE=<path> npx jest buildSwipe` writes the
 * synthetic swipe the backend's loader test reads (magnet-eye-backend/tests/fixtures). */
test('example swipe fixture for the backend', () => {
  const raw = synth({ yaw: 0.8, bWorld: earth, bias });
  const s = buildSwipe(raw, ctx({ yawAlignment: -0.8, recordedAt: new Date('2026-11-20T12:00:00Z') }));
  expect(validateSwipe(s)).toEqual([]);
  if (process.env.WRITE_FIXTURE) writeFileSync(process.env.WRITE_FIXTURE, JSON.stringify(s, null, 1));
});
