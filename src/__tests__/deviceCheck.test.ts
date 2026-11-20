import { expect, test } from '@jest/globals';

import type { Capabilities, SensorInfo } from '../../modules/magnet-capture/src/MagnetCapture.types';
import { canScan, deviceChecks } from '../modules/capture/deviceCheck';

import { gradeNoise, gradeRate, measureProfile, nearestBin, SPHERE_BINS } from '../modules/capture/profile';

const sensor = (over: Partial<SensorInfo> = {}): SensorInfo => ({
  name: 's',
  vendor: 'v',
  version: 1,
  maxRange: 4912,
  resolution: 0.15,
  minDelayUs: 10000,
  maxDelayUs: 0,
  fifoMaxEvents: 0,
  powerMa: 1,
  ...over,
});

function caps(over: Partial<Capabilities['sensors']> = {}, granted = true): Capabilities {
  return {
    sensors: {
      magnetometerUncalibrated: sensor(),
      magnetometer: sensor(),
      gameRotationVector: sensor(),
      accelerometer: sensor(),
      gyroscope: sensor(),
      ...over,
    },
    highSamplingRateGranted: granted,
    manufacturer: 'Xiaomi',
    model: 'Redmi Note 9S',
    sdkInt: 31,
    clockOriginNs: '0',
  };
}

const byKey = (c: Capabilities) => Object.fromEntries(deviceChecks(c).map((x) => [x.key, x]));

test('a full phone is ready, with the measured range and rate', () => {
  const k = byKey(caps());
  expect(k.magnetometer.status).toBe('ready');
  expect(k.magnetometer.detail).toContain('±4912 µT');
  expect(k.magnetometer.detail).toContain('up to 100 Hz');
  expect(k.arcore.status).toBe('later');
  expect(canScan(caps())).toBe(true);
});

test('only the calibrated magnetometer is limited, not missing', () => {
  const c = caps({ magnetometerUncalibrated: null });
  expect(byKey(c).magnetometer.status).toBe('limited');
  expect(canScan(c)).toBe(true);
});

test('no magnetometer at all cannot scan', () => {
  const c = caps({ magnetometerUncalibrated: null, magnetometer: null });
  expect(byKey(c).magnetometer.status).toBe('missing');
  expect(canScan(c)).toBe(false);
});

test('high sampling rate not granted is limited', () => {
  expect(byKey(caps({}, false)).highSamplingRate.status).toBe('limited');
});

test('profile from a still recording: rate, noise and the swipe speed range', () => {
  const mag: number[] = [];
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let i = 0; i < 200; i++) mag.push(1e9 + i * 1e7, 10 + rnd(), 20 + rnd(), -40 + rnd(), 0, 0, 0);
  const p = measureProfile({ startNs: 0, stopNs: 0, magSensor: 'uncalibrated', mag, rot: [], acc: [], gyr: [], overflow: false }, caps());
  expect(p.rateHz).toBeCloseTo(100, 6);
  expect(p.noiseUt).toBeGreaterThan(0.4);
  expect(p.noiseUt).toBeLessThan(0.7); // uniform in ±1 has sd 0.577
  expect(p.speedMaxCmS).toBe(10);
  expect(p.readingEveryMm).toBeCloseTo(1, 6);
  expect(gradeRate(p.rateHz)).toBe('good');
  expect(gradeNoise(3.5)).toBe('poor');
});

test('coverage bins: 26 directions, each its own nearest', () => {
  expect(SPHERE_BINS).toHaveLength(26);
  SPHERE_BINS.forEach((b, i) => expect(nearestBin([b[0] * 50, b[1] * 50, b[2] * 50])).toBe(i));
});
