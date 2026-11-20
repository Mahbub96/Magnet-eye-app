import type { RawRecording } from '../../../modules/magnet-capture/src/MagnetCapture.types';
import type { Quat, Vec3 } from '../../utils/quaternion';
import { aboutZ, headingOfTop, mean as meanQuat, multiply } from '../../utils/quaternion';
import { apply, type Mat3 } from './ironFit';
import { tiltRad } from './quality';
import { meanVec, rateHz, rows, stdVec, toWorld } from './stats';

export type BaselineResult = {
  /** Rotation about z that makes the phone's top point along world +y (paper +y). */
  yawAlignment: number;
  /** Mean world-frame field after hard-iron removal (magnet away). */
  fieldWorld: Vec3;
  /** Per-axis standard deviation of the raw reading (phone still). */
  noise: Vec3;
  /** Android's hard-iron estimate, frozen for the session (it can jump mid-scan otherwise). */
  androidBias: Vec3;
  rateHz: number;
  samples: number;
  /** Largest angle the phone turned during the measurement; it should be still. */
  maxTiltChangeRad: number;
  /** Mean tilt from flat (screen up), radians; ruler mode needs it near 0. */
  tiltRad: number;
};

/** Baseline from a short recording with the phone still, flat, top along paper +y, and the
 * magnet away. At session end pass the session's alignment and bias so both baselines are in
 * the same frame with the same hard-iron removal. */
export function measureBaseline(
  raw: RawRecording,
  fixed?: { yawAlignment: number; androidBias: Vec3 },
  /** The phone's own calibration (profile); without it, Android's bias estimate is removed. */
  iron?: { hardIron: Vec3; softIron: Mat3 },
): BaselineResult {
  const mag = rows(raw.mag, 7);
  const rot = rows(raw.rot, 5);
  if (mag.length < 10 || rot.length < 5) throw new Error('The sensors sent too few readings. Keep the app open and try again.');
  const bias = fixed?.androidBias ?? meanVec(mag.map((r) => [r[4], r[5], r[6]] as Vec3));
  const qs = rot.map((r) => [r[1], r[2], r[3], r[4]] as Quat);
  const qMean = meanQuat(qs);
  const align = fixed?.yawAlignment ?? -headingOfTop(qMean);
  const a = aboutZ(align);
  const aligned = qs.map((q) => multiply(a, q));
  const world = toWorld(
    mag.map((r) => r[0]),
    mag.map((r) =>
      iron ? apply(iron.softIron, iron.hardIron, [r[1], r[2], r[3]]) : ([r[1] - bias[0], r[2] - bias[1], r[3] - bias[2]] as Vec3),
    ),
    rot.map((r) => r[0]),
    aligned,
  );
  const q0 = qs[0];
  const maxTilt = Math.max(
    ...qs.map((q) => {
      const d = Math.abs(q[0] * q0[0] + q[1] * q0[1] + q[2] * q0[2] + q[3] * q0[3]);
      return 2 * Math.acos(Math.min(1, d));
    }),
  );
  return {
    yawAlignment: align,
    fieldWorld: meanVec(world),
    noise: stdVec(mag.map((r) => [r[1], r[2], r[3]] as Vec3)),
    androidBias: bias,
    rateHz: rateHz(mag.map((r) => r[0])),
    samples: mag.length,
    maxTiltChangeRad: maxTilt,
    tiltRad: tiltRad(qMean),
  };
}
