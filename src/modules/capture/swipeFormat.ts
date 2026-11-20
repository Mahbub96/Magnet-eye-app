/**
 * Swipe format v1 (SRS 4.4). One JSON object per swipe; frozen at the end of Phase 2.
 * Any change after that bumps FORMAT_VERSION (SRS PR-21). Field-by-field description:
 * docs/swipe-format-v1.md.
 *
 * Units: µT, metres, nanoseconds, radians. World frame: right-handed, z up. In ruler mode the
 * world frame is the paper: x and y as drawn on the sheet, z = 0 on the table surface.
 */
import type { Vec3 } from '../../utils/quaternion';

export const FORMAT_NAME = 'magnet-eye-swipe';
export const FORMAT_VERSION = 1;
export const API_VERSION = 'v1';
export const CALIBRATION_SCHEMA_VERSION = 1;

export type TrackingMode = 'arcore' | 'ruler' | 'grid';
export type OrientationSource = 'arcore' | 'game_rotation_vector';

/** Columnar-by-name, row-major table: `rows[i][j]` is column `columns[j]` of sample i. */
export type Stream<C extends readonly string[], R extends unknown[] = number[]> = {
  columns: C;
  rows: R[];
};

export const MAG_COLUMNS = [
  't_ns',
  'raw_x_ut',
  'raw_y_ut',
  'raw_z_ut',
  'cal_x_ut',
  'cal_y_ut',
  'cal_z_ut',
  'saturated',
] as const;
export const ORIENTATION_COLUMNS = ['t_ns', 'qw', 'qx', 'qy', 'qz'] as const;
export const POSITION_COLUMNS = ['t_ns', 'px_m', 'py_m', 'pz_m', 'state', 'confidence'] as const;
export const VECTOR_COLUMNS = ['t_ns', 'x', 'y', 'z'] as const;

/** ruler_endpoint: the phone's reference point was on the marked start or end of the line;
 * positions in between are not measured (Phase 6 adds tracked positions). */
export type PositionState = 'tracking' | 'limited' | 'lost' | 'ruler_endpoint' | 'grid_mark';
export type PositionRow = [number, number, number, number, PositionState, number];

export type CalibrationBlock = {
  /** 'profile' once Phase 5 calibration exists; until then Android's own estimate. */
  source: 'profile' | 'android_estimate' | 'none';
  profile_id: string | null;
  hard_iron_ut: Vec3;
  soft_iron: [Vec3, Vec3, Vec3];
  /** Per-axis standard deviation of the raw reading with the phone still. */
  noise_ut: Vec3;
  /** Sensor full-scale range as reported by Android (per axis, ±). */
  range_ut: number;
  saturation_threshold_ut: number;
  sampling_rate_hz: number;
  /** Sensor position relative to the tracked reference point, phone frame (CL-10). */
  sensor_offset_m: Vec3;
  sensor_offset_source: 'measured' | 'unknown';
};

export type SwipeV1 = {
  format: typeof FORMAT_NAME;
  format_version: typeof FORMAT_VERSION;
  app_version: string;
  api_version: typeof API_VERSION;
  calibration_schema_version: typeof CALIBRATION_SCHEMA_VERSION;
  session_id: string;
  swipe_index: number;
  recorded_at: string;
  device: { manufacturer: string; model: string; android_sdk: number };
  tracking_mode: TrackingMode;
  /** The point whose position the position stream reports. */
  reference_point: 'top_edge_centre_back' | 'arcore_camera';
  clock: { source: 'elapsedRealtimeNanos'; origin_ns: string };
  calibration: CalibrationBlock;
  session_geometry: {
    table_z_m: number;
    /** World-frame field with the magnet away, at session start (and end, on the last swipe). */
    baseline_start_ut: Vec3 | null;
    baseline_end_ut: Vec3 | null;
    /** Rotation about z applied to the game rotation vector so world axes match the paper. */
    yaw_alignment_rad: number;
  };
  error_sizes: {
    position_jitter_m: number;
    position_offset_m: number;
    orientation_jitter_rad: number;
    orientation_offset_rad: number;
    source: 'tracking_confidence' | 'mode_default';
  };
  /** Ruler and grid modes: the line the user was asked to follow. */
  planned_line: { start_m: Vec3; end_m: Vec3 } | null;
  streams: {
    mag: Stream<typeof MAG_COLUMNS> & { sensor: 'uncalibrated' | 'calibrated' };
    orientation: Stream<typeof ORIENTATION_COLUMNS> & { source: OrientationSource };
    position: Stream<typeof POSITION_COLUMNS, PositionRow>;
    accel?: Stream<typeof VECTOR_COLUMNS> & { unit: 'm/s2' };
    gyro?: Stream<typeof VECTOR_COLUMNS> & { unit: 'rad/s' };
  };
  /** Informational; the backend recomputes what it needs. */
  stats: {
    duration_s: number;
    mag_rate_hz: number;
    orientation_rate_hz: number;
    mag_samples: number;
    saturated_samples: number;
    mean_speed_m_s: number | null;
    buffer_overflow: boolean;
  };
};
