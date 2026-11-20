/** Live reading sent ~15 times a second while streaming (phone frame, µT). */
export type LiveSample = {
  mag: [number, number, number];
  /** Android's own hard-iron estimate (zero when only the calibrated sensor exists). */
  bias: [number, number, number];
  /** Game rotation vector, phone -> world, w x y z. */
  quat: [number, number, number, number];
  rateHz: number;
  recording: boolean;
  recordedSamples: number;
};

export type MagnetCaptureModuleEvents = {
  onSample: (sample: LiveSample) => void;
};

export type SensorInfo = {
  name: string;
  vendor: string;
  version: number;
  maxRange: number;
  resolution: number;
  minDelayUs: number;
  maxDelayUs: number;
  fifoMaxEvents: number;
  powerMa: number;
};

export type SensorKey =
  | 'magnetometerUncalibrated'
  | 'magnetometer'
  | 'gameRotationVector'
  | 'accelerometer'
  | 'gyroscope';

export type Capabilities = {
  sensors: Record<SensorKey, SensorInfo | null>;
  highSamplingRateGranted: boolean;
  manufacturer: string;
  model: string;
  sdkInt: number;
  clockOriginNs: string;
};

/**
 * One recording, as flat row-major arrays. Times are ns relative to the module's clock origin
 * (elapsedRealtimeNanos at module load).
 * mag: t, uncal x y z, bias x y z (stride 7) · rot: t, qw qx qy qz (stride 5)
 * acc, gyr: t, x y z (stride 4)
 */
export type RawRecording = {
  startNs: number;
  stopNs: number;
  magSensor: 'uncalibrated' | 'calibrated';
  mag: number[];
  rot: number[];
  acc: number[];
  gyr: number[];
  overflow: boolean;
};
