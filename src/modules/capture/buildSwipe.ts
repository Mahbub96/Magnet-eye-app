import type { RawRecording } from '../../../modules/magnet-capture/src/MagnetCapture.types';
import type { Quat, Vec3 } from '../../utils/quaternion';
import { aboutZ, multiply, normalize } from '../../utils/quaternion';
import { maxTiltRad } from './quality';
import { median, rateHz, rows, toWorld } from './stats';
import {
  API_VERSION,
  CALIBRATION_SCHEMA_VERSION,
  type CalibrationBlock,
  FORMAT_NAME,
  FORMAT_VERSION,
  MAG_COLUMNS,
  ORIENTATION_COLUMNS,
  POSITION_COLUMNS,
  type PositionRow,
  type SwipeV1,
  type TrackingMode,
  VECTOR_COLUMNS,
} from './swipeFormat';

/** Expected error sizes per tracking mode until tracking confidence is measured (Phase 6).
 * Ruler: positions between the endpoints assume constant speed, hence the larger jitter. */
export const MODE_ERRORS: Record<TrackingMode, SwipeV1['error_sizes']> = {
  ruler: {
    position_jitter_m: 0.003,
    position_offset_m: 0.002,
    orientation_jitter_rad: 0.005,
    orientation_offset_rad: 0.02,
    source: 'mode_default',
  },
  grid: {
    position_jitter_m: 0.004,
    position_offset_m: 0.002,
    orientation_jitter_rad: 0.005,
    orientation_offset_rad: 0.02,
    source: 'mode_default',
  },
  arcore: {
    position_jitter_m: 0.002,
    position_offset_m: 0.003,
    orientation_jitter_rad: 0.003,
    orientation_offset_rad: 0.01,
    source: 'mode_default',
  },
};

export type SessionContext = {
  sessionId: string;
  swipeIndex: number;
  appVersion: string;
  device: SwipeV1['device'];
  clockOriginNs: string;
  trackingMode: TrackingMode;
  tableZ: number;
  /** Rotation about z applied to the game rotation vector (see session_geometry). */
  yawAlignment: number;
  baselineStart: Vec3 | null;
  calibration: Omit<CalibrationBlock, 'sampling_rate_hz'>;
  plannedLine: { start: Vec3; end: Vec3 } | null;
  recordedAt?: Date;
};

/** Start and end of the movement inside a recording, from the accelerometer rows
 * [t_ns, x, y, z] in m/s², already rotated into the world frame (buildSwipe does this, so a
 * phone that tilts does not look like a phone that slides: gravity stays on world z).
 * The phone rests on the start mark when recording begins and on the end mark when it stops.
 * Sliding changes the horizontal components, not |a|, so this looks at how far the
 * acceleration vector moves from its median (the median holds gravity). The first and last 150 ms are skipped (the tap on
 * the record button shakes the phone). The threshold comes from the quietest part of the
 * recording itself, with a small floor. */
export function detectMotion(acc: number[][]): { start: number; end: number } | null {
  if (acc.length < 20) return null;
  const med = [1, 2, 3].map((k) => median(acc.map((r) => r[k])));
  const dev = acc.map((r) => Math.hypot(r[1] - med[0], r[2] - med[1], r[3] - med[2]));
  const t0 = acc[0][0];
  const t1 = acc[acc.length - 1][0];
  const dtNs = (t1 - t0) / (acc.length - 1);
  const w = Math.max(1, Math.round(25e6 / Math.max(dtNs, 1))); // ±25 ms window
  const smooth = dev.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - w); k <= Math.min(dev.length - 1, i + w); k++) {
      sum += dev[k];
      n++;
    }
    return sum / n;
  });
  const sorted = [...smooth].sort((x, y) => x - y);
  const quiet = sorted[Math.floor(0.2 * (sorted.length - 1))];
  const threshold = Math.max(0.08, 5 * quiet);
  const guard = 150e6;
  const inside = (i: number) => acc[i][0] - t0 >= guard && t1 - acc[i][0] >= guard;
  let first = -1;
  let last = -1;
  for (let i = 0; i < smooth.length; i++) {
    if (!inside(i) || smooth[i] <= threshold) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0 || last - first < 3) return null;
  return { start: acc[first][0], end: acc[last][0] };
}

export function buildSwipe(raw: RawRecording, ctx: SessionContext): SwipeV1 {
  const cal = ctx.calibration;
  const [h0, h1, h2] = cal.hard_iron_ut;
  const S = cal.soft_iron;
  const thr = cal.saturation_threshold_ut;

  const mag = rows(raw.mag, 7).map((r) => {
    const d = [r[1] - h0, r[2] - h1, r[3] - h2];
    const c = S.map((row) => row[0] * d[0] + row[1] * d[1] + row[2] * d[2]);
    const sat = Math.abs(r[1]) >= thr || Math.abs(r[2]) >= thr || Math.abs(r[3]) >= thr;
    return [r[0], r[1], r[2], r[3], c[0], c[1], c[2], sat ? 1 : 0];
  });

  let orientation: number[][];
  let orientationSource: 'game_rotation_vector' | 'arcore' = 'game_rotation_vector';

  if (ctx.trackingMode === 'arcore' && raw.arcoreRot && raw.arcoreRot.length > 0) {
    orientation = rows(raw.arcoreRot, 5);
    orientationSource = 'arcore';
  } else {
    const align = aboutZ(ctx.yawAlignment);
    orientation = rows(raw.rot, 5).map((r) => {
      const q = normalize(multiply(align, [r[1], r[2], r[3], r[4]] as Quat));
      return [r[0], ...q];
    });
  }

  const acc = rows(raw.acc, 4);
  const gyr = rows(raw.gyr, 4);
  // Motion detection works in the world frame; the stored accel stream stays in the phone frame.
  const rotT = orientation.map((r) => r[0]);
  const rotQ = orientation.map((r) => [r[1], r[2], r[3], r[4]] as Quat);
  const accWorld = toWorld(
    acc.map((r) => r[0]),
    acc.map((r) => [r[1], r[2], r[3]] as Vec3),
    rotT,
    rotQ,
  ).map((v, i) => [acc[i][0], ...v]);
  const tilt = maxTiltRad(rotQ);
  const tFirst = mag.length ? mag[0][0] : raw.startNs;
  const tLast = mag.length ? mag[mag.length - 1][0] : raw.stopNs;

  const position: PositionRow[] = [];
  let meanSpeed: number | null = null;
  let motionFound = false;

  if (ctx.trackingMode === 'arcore' && raw.arcorePos && raw.arcorePos.length > 0) {
    const stateMap: Record<number, 'tracking' | 'limited' | 'lost'> = {
      1: 'tracking',
      2: 'limited',
      3: 'lost',
    };
    const pRows = rows(raw.arcorePos, 6);
    for (const r of pRows) {
      position.push([
        r[0],
        r[1],
        r[2],
        r[3],
        stateMap[Math.round(r[4])] ?? 'tracking',
        r[5],
      ]);
    }
    if (position.length >= 2) {
      let pathLen = 0;
      for (let i = 1; i < position.length; i++) {
        pathLen += Math.hypot(
          (position[i][1] as number) - (position[i - 1][1] as number),
          (position[i][2] as number) - (position[i - 1][2] as number),
          (position[i][3] as number) - (position[i - 1][3] as number),
        );
      }
      const durNs = (position[position.length - 1][0] as number) - (position[0][0] as number);
      meanSpeed = durNs > 0 ? pathLen / (durNs / 1e9) : null;
      motionFound = pathLen > 0.02;
    }
  } else if (ctx.plannedLine && (ctx.trackingMode === 'ruler' || ctx.trackingMode === 'grid')) {
    const { start, end } = ctx.plannedLine;
    const state = ctx.trackingMode === 'ruler' ? 'ruler_endpoint' : 'grid_mark';
    const motion = accWorld.length ? detectMotion(accWorld) : null;
    const at = (t: number, p: Vec3): PositionRow => [t, p[0], p[1], p[2], state, 1];
    position.push(at(tFirst, start));
    if (motion && motion.start > tFirst && motion.end < tLast) {
      position.push(at(motion.start, start), at(motion.end, end));
      motionFound = true;
    }
    position.push(at(tLast, end));
    const len = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
    const moveNs = motion ? motion.end - motion.start : tLast - tFirst;
    meanSpeed = moveNs > 0 ? len / (moveNs / 1e9) : null;
  }

  return {
    format: FORMAT_NAME,
    format_version: FORMAT_VERSION,
    app_version: ctx.appVersion,
    api_version: API_VERSION,
    calibration_schema_version: CALIBRATION_SCHEMA_VERSION,
    session_id: ctx.sessionId,
    swipe_index: ctx.swipeIndex,
    recorded_at: (ctx.recordedAt ?? new Date()).toISOString(),
    device: ctx.device,
    tracking_mode: ctx.trackingMode,
    reference_point: ctx.trackingMode === 'arcore' ? 'arcore_camera' : 'top_edge_centre_back',
    clock: { source: 'elapsedRealtimeNanos', origin_ns: ctx.clockOriginNs },
    calibration: { ...cal, sampling_rate_hz: rateHz(mag.map((r) => r[0])) },
    session_geometry: {
      table_z_m: ctx.trackingMode === 'arcore' && raw.tableZ != null && raw.tableZ !== 0 ? raw.tableZ : ctx.tableZ,
      baseline_start_ut: ctx.baselineStart,
      baseline_end_ut: null,
      yaw_alignment_rad: ctx.yawAlignment,
    },
    error_sizes: MODE_ERRORS[ctx.trackingMode],
    planned_line: ctx.plannedLine
      ? { start_m: ctx.plannedLine.start, end_m: ctx.plannedLine.end }
      : null,
    streams: {
      mag: { sensor: raw.magSensor, columns: MAG_COLUMNS, rows: mag },
      orientation: {
        source: orientationSource,
        columns: ORIENTATION_COLUMNS,
        rows: orientation,
      },
      position: { columns: POSITION_COLUMNS, rows: position },
      accel: { unit: 'm/s2', columns: VECTOR_COLUMNS, rows: acc },
      gyro: { unit: 'rad/s', columns: VECTOR_COLUMNS, rows: gyr },
    },
    stats: {
      duration_s: (tLast - tFirst) / 1e9,
      mag_rate_hz: rateHz(mag.map((r) => r[0])),
      orientation_rate_hz: rateHz(orientation.map((r) => r[0])),
      mag_samples: mag.length,
      saturated_samples: mag.reduce((s, r) => s + r[7], 0),
      mean_speed_m_s: meanSpeed,
      buffer_overflow: raw.overflow,
      max_tilt_rad: tilt,
      motion_detected: motionFound,
    },
  };
}

/** Checks a swipe carries every field the backend expects (Phase 2 "done when"). Returns a
 * list of problems; empty means valid. */
export function validateSwipe(s: SwipeV1): string[] {
  const p: string[] = [];
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const vec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(finite);
  if (s.format !== FORMAT_NAME || s.format_version !== FORMAT_VERSION) p.push('format/version');
  if (!s.session_id) p.push('session_id');
  if (!Number.isInteger(s.swipe_index) || s.swipe_index < 0) p.push('swipe_index');
  if (!/^\d+$/.test(s.clock.origin_ns)) p.push('clock.origin_ns');
  if (!vec(s.calibration.hard_iron_ut)) p.push('calibration.hard_iron_ut');
  if (!(s.calibration.soft_iron.length === 3 && s.calibration.soft_iron.every(vec)))
    p.push('calibration.soft_iron');
  if (!vec(s.calibration.noise_ut)) p.push('calibration.noise_ut');
  if (!vec(s.calibration.sensor_offset_m)) p.push('calibration.sensor_offset_m');
  if (!(s.calibration.range_ut > 0)) p.push('calibration.range_ut');
  if (!(s.calibration.sampling_rate_hz > 0)) p.push('calibration.sampling_rate_hz');
  if (!finite(s.session_geometry.table_z_m)) p.push('session_geometry.table_z_m');
  if (s.swipe_index === 0 && !vec(s.session_geometry.baseline_start_ut))
    p.push('session_geometry.baseline_start_ut');
  const { mag, orientation, position } = s.streams;
  const ordered = (r: number[][] | PositionRow[]) =>
    r.every((row, i) => i === 0 || (row[0] as number) >= (r[i - 1][0] as number));
  if (mag.rows.length < 2 || !mag.rows.every((r) => r.length === MAG_COLUMNS.length && r.every(finite)))
    p.push('streams.mag');
  else if (!ordered(mag.rows)) p.push('streams.mag order');
  if (orientation.rows.length < 2 || !orientation.rows.every((r) => r.length === 5 && r.every(finite)))
    p.push('streams.orientation');
  else if (!ordered(orientation.rows)) p.push('streams.orientation order');
  if (position.rows.length < 2 || !position.rows.every((r) => r.length === 6))
    p.push('streams.position');
  else if (!ordered(position.rows)) p.push('streams.position order');
  return p;
}
