import { type Api, ApiError } from '../api/client';
import type { SyncRepo } from '../db/sync';

/** Upload queue (NF-8: a recorded swipe is never lost). Swipes are saved on the phone first;
 * this sends every pending one, scan by scan and in order, then waits for the session's fit.
 *
 * - Offline or server busy: stops and says when to try again; nothing is marked uploaded.
 * - Server forgot the session (404 after 30 min idle): starts a new one and sends the scan's
 *   swipes again from the first, once per run.
 * - A swipe the server refuses as invalid (422) is marked rejected with the reason, so it
 *   cannot block the queue for ever.
 * - Version mismatch (409): stops; the app or server must be updated. */

export type SyncOutcome =
  | { status: 'idle'; message: string | null }
  | { status: 'no_server' | 'blocked'; message: string }
  | { status: 'offline' | 'busy'; message: string; retryAfterS: number };

export type SyncDeps = {
  api: Pick<Api, 'createSession' | 'uploadSwipe' | 'job'>;
  repo: SyncRepo;
  server: () => string | null;
  appVersion: string;
  sleep: (ms: number) => Promise<void>;
  pollMs?: number;
  pollLimit?: number;
};

export const OFFLINE_RETRY_S = 15;

export async function syncOnce(d: SyncDeps): Promise<SyncOutcome> {
  const base = d.server();
  if (!base) return { status: 'no_server', message: 'No server address set. Add one in Settings.' };
  let note: string | null = null;
  try {
    for (const scan of d.repo.scansWithPending()) {
      let sessionId = scan.server_session_id;
      let restarted = false;
      let lastJob: string | null = null;
      for (;;) {
        if (!sessionId) {
          sessionId = (await d.api.createSession(base, d.appVersion)).session_id;
          d.repo.setServerSession(scan.id, sessionId);
        }
        let lost = false;
        for (const sw of d.repo.pendingSwipes(scan.id)) {
          const body = await d.repo.readFile(sw.file_uri);
          try {
            const r = await d.api.uploadSwipe(base, sessionId, body);
            d.repo.markUploaded(sw.id, r.job_id);
            lastJob = r.job_id;
          } catch (e) {
            if (!(e instanceof ApiError) || e.kind !== 'http') throw e;
            if (e.status === 404 && !restarted) {
              lost = true;
              break;
            }
            if (e.status === 422) {
              d.repo.markRejected(sw.id, e.message);
              continue;
            }
            throw e;
          }
        }
        if (!lost) break;
        d.repo.resetScan(scan.id);
        sessionId = null;
        restarted = true;
        lastJob = null;
      }
      if (lastJob) note = await waitForFit(d, base, scan.id, lastJob);
    }
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'network')
      return { status: 'offline', message: e.message, retryAfterS: OFFLINE_RETRY_S };
    if (e instanceof ApiError && e.kind === 'busy')
      return { status: 'busy', message: e.message, retryAfterS: Math.max(1, e.retryAfterS) };
    return { status: 'blocked', message: (e as Error).message };
  }
  return { status: 'idle', message: note };
}

async function waitForFit(d: SyncDeps, base: string, scanId: string, jobId: string): Promise<string | null> {
  const limit = d.pollLimit ?? 120;
  for (let i = 0; i < limit; i++) {
    const j = await d.api.job(base, jobId);
    if (j.status === 'done') {
      if (j.result) await d.repo.saveResult(scanId, j.result);
      return null;
    }
    if (j.status === 'failed') return `The fit did not finish: ${j.error ?? 'unknown reason'}`;
    await d.sleep(d.pollMs ?? 500);
  }
  return 'The fit is taking longer than expected; it will be fetched next time.';
}
