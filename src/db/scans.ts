import { Directory, File, Paths } from 'expo-file-system';

import type { SwipeV1, TrackingMode } from '../modules/capture/swipeFormat';
import type { Vec3 } from '../utils/quaternion';
import { getDb } from './index';

export type ScanRow = {
  id: string;
  name: string;
  created_at: string;
  status: 'recording' | 'finished';
  tracking_mode: TrackingMode;
  table_z_m: number;
  yaw_alignment_rad: number | null;
  android_bias_ut: string | null;
  noise_ut: string | null;
  range_ut: number | null;
  baseline_start_ut: string | null;
  baseline_end_ut: string | null;
  server_session_id?: string | null;
  result_summary?: string | null; // JSON ResultSummary (db/sync.ts)
  swipe_count?: number;
  uploaded_count?: number;
};

export type SwipeRow = {
  id: string;
  scan_id: string;
  ord: number;
  format_version: number;
  file_uri: string;
  created_at: string;
  mag_samples: number;
  mag_rate_hz: number;
  duration_s: number;
  saturated_samples: number;
  mean_speed_m_s: number | null;
  upload_state?: 'pending' | 'uploaded' | 'rejected';
  upload_error?: string | null;
};

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function scanDir(scanId: string): Directory {
  return new Directory(Paths.document, 'scans', scanId);
}

export function createScan(s: {
  id: string;
  name: string;
  trackingMode: TrackingMode;
  tableZ: number;
  yawAlignment: number;
  androidBias: Vec3;
  noise: Vec3;
  rangeUt: number;
  baselineStart: Vec3;
}): void {
  getDb().runSync(
    `INSERT INTO scan (id, name, created_at, status, tracking_mode, table_z_m, yaw_alignment_rad,
       android_bias_ut, noise_ut, range_ut, baseline_start_ut)
     VALUES (?, ?, ?, 'recording', ?, ?, ?, ?, ?, ?, ?)`,
    [
      s.id,
      s.name,
      new Date().toISOString(),
      s.trackingMode,
      s.tableZ,
      s.yawAlignment,
      JSON.stringify(s.androidBias),
      JSON.stringify(s.noise),
      s.rangeUt,
      JSON.stringify(s.baselineStart),
    ],
  );
}

export function listScans(): ScanRow[] {
  return getDb().getAllSync<ScanRow>(
    `SELECT scan.*,
       (SELECT COUNT(*) FROM swipe WHERE swipe.scan_id = scan.id) AS swipe_count,
       (SELECT COUNT(*) FROM swipe WHERE swipe.scan_id = scan.id AND upload_state = 'uploaded') AS uploaded_count
     FROM scan ORDER BY created_at DESC`,
    [],
  );
}

export function getScan(id: string): ScanRow | null {
  return getDb().getFirstSync<ScanRow>('SELECT * FROM scan WHERE id = ?', [id]);
}

export function listSwipes(scanId: string): SwipeRow[] {
  return getDb().getAllSync<SwipeRow>('SELECT * FROM swipe WHERE scan_id = ? ORDER BY ord', [
    scanId,
  ]);
}

/** Writes the swipe file first, then the row, so a row never points at a missing file. */
export async function saveSwipe(swipe: SwipeV1): Promise<SwipeRow> {
  const dir = scanDir(swipe.session_id);
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `swipe-${String(swipe.swipe_index).padStart(3, '0')}.json`);
  await file.write(JSON.stringify(swipe));
  const row: SwipeRow = {
    id: newId(),
    scan_id: swipe.session_id,
    ord: swipe.swipe_index,
    format_version: swipe.format_version,
    file_uri: file.uri,
    created_at: swipe.recorded_at,
    mag_samples: swipe.stats.mag_samples,
    mag_rate_hz: swipe.stats.mag_rate_hz,
    duration_s: swipe.stats.duration_s,
    saturated_samples: swipe.stats.saturated_samples,
    mean_speed_m_s: swipe.stats.mean_speed_m_s,
  };
  getDb().runSync(
    `INSERT INTO swipe (id, scan_id, ord, format_version, file_uri, created_at, mag_samples,
       mag_rate_hz, duration_s, saturated_samples, mean_speed_m_s)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.scan_id,
      row.ord,
      row.format_version,
      row.file_uri,
      row.created_at,
      row.mag_samples,
      row.mag_rate_hz,
      row.duration_s,
      row.saturated_samples,
      row.mean_speed_m_s,
    ],
  );
  return row;
}

export async function readSwipe(row: SwipeRow): Promise<SwipeV1> {
  return JSON.parse(await new File(row.file_uri).text()) as SwipeV1;
}

/** Ends a scan: stores the end baseline on the scan and in the last swipe's file (SRS 4.4). */
export async function finishScan(scanId: string, baselineEnd: Vec3 | null): Promise<void> {
  const swipes = listSwipes(scanId);
  const last = swipes[swipes.length - 1];
  if (last && baselineEnd) {
    const s = await readSwipe(last);
    s.session_geometry.baseline_end_ut = baselineEnd;
    await new File(last.file_uri).write(JSON.stringify(s));
  }
  getDb().runSync(`UPDATE scan SET status = 'finished', baseline_end_ut = ? WHERE id = ?`, [
    baselineEnd ? JSON.stringify(baselineEnd) : null,
    scanId,
  ]);
}

export function deleteScan(scanId: string): void {
  getDb().runSync('DELETE FROM scan WHERE id = ?', [scanId]);
  const dir = scanDir(scanId);
  if (dir.exists) dir.delete();
}

/** All swipes of a scan in one JSON file for sharing (Export "Full scan"). */
export async function exportScan(scanId: string): Promise<File> {
  const scan = getScan(scanId);
  const swipes = await Promise.all(listSwipes(scanId).map(readSwipe));
  const file = new File(Paths.cache, `magnet-eye-scan-${scanId}.json`);
  await file.write(JSON.stringify({ format: 'magnet-eye-scan', format_version: 1, scan, swipes }));
  return file;
}

/** "Redo last": removes the most recent swipe of a scan, row and file. */
export function deleteLastSwipe(scanId: string): SwipeRow | null {
  const swipes = listSwipes(scanId);
  const last = swipes[swipes.length - 1];
  if (!last) return null;
  getDb().runSync('DELETE FROM swipe WHERE id = ?', [last.id]);
  const f = new File(last.file_uri);
  if (f.exists) f.delete();
  return last;
}
