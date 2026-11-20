import { expect, test } from '@jest/globals';

import type { Capabilities, SensorInfo } from '../../modules/magnet-capture/src/MagnetCapture.types';
import { canScan, deviceChecks } from '../modules/capture/deviceCheck';

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
