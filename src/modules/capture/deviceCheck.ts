import type { Capabilities } from '../../../modules/magnet-capture/src/MagnetCapture.types';

/** ready: works as needed · limited: works with a known drawback · missing: not on this phone ·
 * later: checked in a later version of the app. */
export type CheckStatus = 'ready' | 'limited' | 'missing' | 'later';

export type DeviceCheck = { key: string; title: string; detail: string; status: CheckStatus };

const hz = (minDelayUs: number) => (minDelayUs > 0 ? `up to ${Math.round(1e6 / minDelayUs)} Hz` : 'on change');

/** The phone check shown on first run, from the capability report of the capture module. */
export function deviceChecks(caps: Capabilities): DeviceCheck[] {
  const s = caps.sensors;
  const mag = s.magnetometerUncalibrated ?? s.magnetometer;
  return [
    {
      key: 'magnetometer',
      title: 'Magnetometer',
      status: s.magnetometerUncalibrated ? 'ready' : s.magnetometer ? 'limited' : 'missing',
      detail: s.magnetometerUncalibrated
        ? `Found · raw stream · ±${Math.round(mag!.maxRange)} µT · ${hz(mag!.minDelayUs)}`
        : s.magnetometer
          ? 'Found · calibrated only: readings can jump when Android recalibrates'
          : 'Not found',
    },
    {
      key: 'gyroscope',
      title: 'Gyroscope',
      status: s.gyroscope ? 'ready' : 'missing',
      detail: s.gyroscope ? 'Found' : 'Not found',
    },
    {
      key: 'accelerometer',
      title: 'Accelerometer',
      status: s.accelerometer ? 'ready' : 'missing',
      detail: s.accelerometer ? 'Found · detects each swipe' : 'Not found',
    },
    {
      key: 'gameRotationVector',
      title: 'Game rotation vector',
      status: s.gameRotationVector ? 'ready' : 'missing',
      detail: s.gameRotationVector ? 'Found · used for tilt' : 'Not found: orientation cannot be recorded',
    },
    {
      key: 'highSamplingRate',
      title: 'High sampling rate',
      status: caps.highSamplingRateGranted ? 'ready' : 'limited',
      detail: caps.highSamplingRateGranted ? 'Permission granted' : 'Not granted: limited to 200 Hz',
    },
    {
      key: 'arcore',
      title: 'Camera tracking (ARCore)',
      status: 'later',
      detail: 'Checked in a later version · ruler mode for now',
    },
  ];
}

/** Scanning needs a magnetometer of either kind; everything else only limits it. */
export function canScan(caps: Capabilities): boolean {
  return !!(caps.sensors.magnetometerUncalibrated ?? caps.sensors.magnetometer);
}
