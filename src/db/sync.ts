import { Directory, File, Paths } from 'expo-file-system';

import type { FitResult } from '../api/client';
import { getDb } from './index';

/** What the uploader needs from local storage. */
export type SyncScan = { id: string; server_session_id: string | null };
export type SyncSwipe = { id: string; scan_id: string; ord: number; file_uri: string; upload_state: string };

export type ResultSummary = {
  swipes: number;
  relative_uncertainty: number;
  finest_detail_m: number;
  warnings: string[];
  moment_am2: number[];
  fitted_at: string;
};

export type SyncRepo = {
  scansWithPending(): SyncScan[];
  pendingSwipes(scanId: string): SyncSwipe[];
  setServerSession(scanId: string, sessionId: string | null): void;
  markUploaded(swipeId: string, jobId: string): void;
  markRejected(swipeId: string, reason: string): void;
  resetScan(scanId: string): void;
  readFile(uri: string): Promise<string>;
  saveResult(scanId: string, result: FitResult): Promise<void>;
  pendingCount(): number;
};

export const sqliteRepo: SyncRepo = {
  scansWithPending: () =>
    getDb().getAllSync<SyncScan>(
      `SELECT id, server_session_id FROM scan
       WHERE EXISTS (SELECT 1 FROM swipe WHERE swipe.scan_id = scan.id AND upload_state = 'pending')
       ORDER BY created_at`,
    ),
  pendingSwipes: (scanId) =>
    getDb().getAllSync<SyncSwipe>(
      `SELECT id, scan_id, ord, file_uri, upload_state FROM swipe
       WHERE scan_id = ? AND upload_state = 'pending' ORDER BY ord`,
      [scanId],
    ),
  setServerSession: (scanId, sessionId) =>
    getDb().runSync('UPDATE scan SET server_session_id = ? WHERE id = ?', [sessionId, scanId]),
  markUploaded: (swipeId, jobId) =>
    getDb().runSync(`UPDATE swipe SET upload_state = 'uploaded', job_id = ?, upload_error = NULL WHERE id = ?`, [
      jobId,
      swipeId,
    ]),
  markRejected: (swipeId, reason) =>
    getDb().runSync(`UPDATE swipe SET upload_state = 'rejected', upload_error = ? WHERE id = ?`, [reason, swipeId]),
  resetScan: (scanId) => {
    const db = getDb();
    db.withTransactionSync(() => {
      db.runSync('UPDATE scan SET server_session_id = NULL WHERE id = ?', [scanId]);
      db.runSync(
        `UPDATE swipe SET upload_state = 'pending', job_id = NULL, upload_error = NULL
         WHERE scan_id = ? AND upload_state != 'rejected'`,
        [scanId],
      );
    });
  },
  readFile: (uri) => new File(uri).text(),
  saveResult: async (scanId, r) => {
    const dir = new Directory(Paths.document, 'scans', scanId);
    if (!dir.exists) dir.create({ intermediates: true });
    await new File(dir, 'result.json').write(JSON.stringify(r));
    const summary: ResultSummary = {
      swipes: r.swipes,
      relative_uncertainty: r.relative_uncertainty,
      finest_detail_m: r.finest_detail_m,
      warnings: r.warnings,
      moment_am2: r.magnet.moment_am2,
      fitted_at: new Date().toISOString(),
    };
    getDb().runSync('UPDATE scan SET result_summary = ? WHERE id = ?', [JSON.stringify(summary), scanId]);
  },
  pendingCount: () =>
    getDb().getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM swipe WHERE upload_state = 'pending'`)?.n ?? 0,
};

/** "Redo last" on a swipe the server already has: the server cannot drop one swipe, so the
 * scan starts a fresh server session and uploads its swipes again. */
export function swipeWasUploaded(swipeId: string): boolean {
  return (
    getDb().getFirstSync<{ s: string }>('SELECT upload_state AS s FROM swipe WHERE id = ?', [swipeId])?.s ===
    'uploaded'
  );
}
