# Swipe format v1

One JSON file per swipe, written by the app and uploaded unchanged to the backend
(SRS 4.4, PR-21). TypeScript types: `src/modules/capture/swipeFormat.ts`. Builder and
validator: `src/modules/capture/buildSwipe.ts`.

**Status:** frozen at the end of Phase 2. Any change after that bumps `format_version`.

## Conventions

| Item | Value |
| --- | --- |
| Units | µT, metres, nanoseconds, radians |
| World frame | right-handed, z up. In ruler and grid modes: the paper, x and y as drawn, z = 0 on the table |
| Phone frame | Android sensor frame: x right, y towards the top edge, z out of the screen |
| Quaternions | `w, x, y, z`, rotating phone-frame vectors into the world frame |
| Times | `t_ns` = hardware timestamp (`SensorEvent.timestamp`, elapsedRealtimeNanos clock) minus `clock.origin_ns` |
| Streams | `{ "columns": [...], "rows": [[...], ...] }`; `np.array(rows)` gives one row per sample |

Each stream has its own timestamps. The app does not resample or align streams; the backend
does (Architecture 3.3).

## Header

| Field | Meaning |
| --- | --- |
| `format`, `format_version` | `"magnet-eye-swipe"`, `1` |
| `app_version`, `api_version`, `calibration_schema_version` | version safety (NF-14) |
| `session_id`, `swipe_index` | scan id; 0-based order within the scan |
| `recorded_at` | ISO 8601, phone clock (informational) |
| `device` | `manufacturer`, `model`, `android_sdk` |
| `tracking_mode` | `arcore`, `ruler` or `grid` |
| `reference_point` | the point the position stream describes: `top_edge_centre_back` (centre of the phone's top edge, on its back) in ruler/grid modes, `arcore_camera` with ARCore |
| `clock` | `source: "elapsedRealtimeNanos"`, `origin_ns` (decimal string, exact) |

## calibration

| Field | Meaning |
| --- | --- |
| `source` | `profile` (Phase 5 calibration), `android_estimate` (Android's hard-iron estimate, frozen at the session baseline) or `none` |
| `profile_id` | calibration profile id or null |
| `hard_iron_ut`, `soft_iron` | `cal = soft_iron · (raw − hard_iron)` |
| `noise_ut` | per-axis standard deviation of raw readings with the phone still (from the baseline) |
| `range_ut` | sensor full-scale range reported by Android (±, per axis) |
| `saturation_threshold_ut` | a reading is flagged saturated when any axis reaches this (98 % of range) |
| `sampling_rate_hz` | measured from this swipe's magnetometer timestamps (median interval) |
| `sensor_offset_m`, `sensor_offset_source` | sensor position relative to `reference_point`, phone frame (CL-10); `[0,0,0]` + `unknown` until measured |

## session_geometry

| Field | Meaning |
| --- | --- |
| `table_z_m` | table plane height (0 in ruler/grid modes) |
| `baseline_start_ut` | world-frame field with the magnet away, after hard-iron removal, measured at session start. Present on swipe 0 (null on later swipes) |
| `baseline_end_ut` | same at session end; written into the last swipe when the scan is finished |
| `yaw_alignment_rad` | rotation about z applied to the game rotation vector so the world axes match the paper. During the baseline the phone lies flat with its top along paper +y |

## error_sizes

Expected position jitter and per-swipe offset (m), orientation jitter and offset (rad).
`source` is `mode_default` until tracking confidence is measured (Phase 6). These feed the
backend's noise model and per-swipe correlated offsets (PR-23).

## planned_line

Ruler and grid modes: the line the user was asked to follow, `start_m` and `end_m` (world).

## Streams

| Stream | Columns | Notes |
| --- | --- | --- |
| `mag` | `t_ns, raw_x_ut, raw_y_ut, raw_z_ut, cal_x_ut, cal_y_ut, cal_z_ut, saturated` | `sensor`: `uncalibrated` (preferred) or `calibrated` (phone has no raw sensor). `saturated` is 0/1 |
| `orientation` | `t_ns, qw, qx, qy, qz` | `source`: `game_rotation_vector` or `arcore`. Already includes `yaw_alignment_rad` |
| `position` | `t_ns, px_m, py_m, pz_m, state, confidence` | `state`: `tracking`, `limited`, `lost`, `ruler_endpoint`, `grid_mark` |
| `accel` (optional) | `t_ns, x, y, z` | m/s², phone frame, includes gravity |
| `gyro` (optional) | `t_ns, x, y, z` | rad/s, phone frame |

### Ruler mode positions

Positions between the marks are not measured. The app writes four rows: the start mark at the
first reading, the start mark when the accelerometer shows the slide beginning, the end mark
when it shows the slide ending, and the end mark at the last reading. If no motion is detected
only the first and last rows are written. The backend interpolates linearly in time between
rows (constant speed), which is why ruler mode's `position_jitter_m` is larger.

## stats

Informational only: `duration_s`, `mag_rate_hz`, `orientation_rate_hz`, `mag_samples`,
`saturated_samples`, `mean_speed_m_s`, `buffer_overflow`, `max_tilt_rad` (largest tilt from
flat during the swipe; ruler mode expects under 10° = 0.175 rad) and `motion_detected` (ruler
and grid: the accelerometer found the slide, so rows 2 and 3 of `position` exist).

Motion is detected on the accelerometer rotated into the world frame, so tilting the phone is
not mistaken for sliding it.

## Loading in Python

```python
import json, numpy as np
s = json.load(open("swipe-000.json"))
mag = np.array(s["streams"]["mag"]["rows"])          # (N, 8)
q = np.array(s["streams"]["orientation"]["rows"])    # (M, 5)
pos = s["streams"]["position"]["rows"]               # mixed types: t, x, y, z, state, confidence
```
