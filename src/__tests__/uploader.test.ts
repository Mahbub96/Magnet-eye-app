import { expect, test } from '@jest/globals';

import { ApiError, type FitResult } from '../api/client';
import type { SyncRepo, SyncScan, SyncSwipe } from '../db/sync';
import { syncOnce, type SyncDeps } from '../sync/uploader';

const RESULT = { swipes: 2, relative_uncertainty: 0.1, warnings: [], magnet: { moment_am2: [0, 0, 1] } } as unknown as FitResult;

function world(nSwipes = 2) {
  const scans: (SyncScan & { result?: FitResult })[] = [{ id: 'scan', server_session_id: null }];
  const swipes: (SyncSwipe & { job?: string; reason?: string })[] = Array.from({ length: nSwipes }, (_, i) => ({
    id: `sw${i}`,
    scan_id: 'scan',
    ord: i,
    file_uri: `file${i}`,
    upload_state: 'pending',
  }));
  const repo: SyncRepo = {
    scansWithPending: () => scans.filter((s) => swipes.some((w) => w.scan_id === s.id && w.upload_state === 'pending')),
    pendingSwipes: (id) => swipes.filter((w) => w.scan_id === id && w.upload_state === 'pending'),
    setServerSession: (id, sid) => {
      scans.find((s) => s.id === id)!.server_session_id = sid;
    },
    markUploaded: (id, job) => Object.assign(swipes.find((w) => w.id === id)!, { upload_state: 'uploaded', job }),
    markRejected: (id, reason) => Object.assign(swipes.find((w) => w.id === id)!, { upload_state: 'rejected', reason }),
    resetScan: (id) => {
      scans.find((s) => s.id === id)!.server_session_id = null;
      swipes.filter((w) => w.upload_state !== 'rejected').forEach((w) => (w.upload_state = 'pending'));
    },
    readFile: async (uri) => `{"from":"${uri}"}`,
    saveResult: async (id, r) => {
      scans.find((s) => s.id === id)!.result = r;
    },
    pendingCount: () => swipes.filter((w) => w.upload_state === 'pending').length,
  };
  const calls: string[] = [];
  let sessions = 0;
  let jobs = 0;
  const api: SyncDeps['api'] = {
    createSession: async () => {
      calls.push('session');
      return { session_id: `s${++sessions}`, idle_timeout_s: 1800 };
    },
    uploadSwipe: async (_b, sid, body) => {
      calls.push(`upload ${sid} ${body}`);
      return { job_id: `j${++jobs}`, swipes: jobs };
    },
    job: async (_b, id) => ({ job_id: id, status: 'done', swipes: 2, result: RESULT }),
  };
  const deps: SyncDeps = { api, repo, server: () => 'http://srv', appVersion: 't', sleep: async () => {}, pollMs: 0 };
  return { scans, swipes, deps, api, calls };
}

test('uploads every pending swipe in order, then stores the fit', async () => {
  const w = world();
  const out = await syncOnce(w.deps);
  expect(out.status).toBe('idle');
  expect(w.calls).toEqual(['session', 'upload s1 {"from":"file0"}', 'upload s1 {"from":"file1"}']);
  expect(w.swipes.every((s) => s.upload_state === 'uploaded')).toBe(true);
  expect(w.scans[0].result).toBe(RESULT);
});

test('offline: nothing is marked uploaded and it says when to retry', async () => {
  const w = world();
  w.api.createSession = async () => {
    throw new ApiError('network', 'Cannot reach the server.');
  };
  const out = await syncOnce(w.deps);
  expect(out.status).toBe('offline');
  expect(w.swipes.every((s) => s.upload_state === 'pending')).toBe(true);
});

test('busy: keeps the rest pending and passes on the server retry time', async () => {
  const w = world();
  let n = 0;
  w.api.uploadSwipe = async () => {
    if (++n === 2) throw new ApiError('busy', 'busy', 429, 'busy', 7);
    return { job_id: 'j', swipes: n };
  };
  const out = await syncOnce(w.deps);
  expect(out).toMatchObject({ status: 'busy', retryAfterS: 7 });
  expect(w.swipes.map((s) => s.upload_state)).toEqual(['uploaded', 'pending']);
});

test('a forgotten server session starts again and resends from the first swipe', async () => {
  const w = world();
  w.scans[0].server_session_id = 'old';
  w.swipes[0].upload_state = 'uploaded'; // sent before, to the old session
  let first = true;
  const real = w.api.uploadSwipe;
  w.api.uploadSwipe = async (b, sid, body) => {
    if (sid === 'old' && first) {
      first = false;
      throw new ApiError('http', 'No such session', 404, 'session_not_found');
    }
    return real(b, sid, body);
  };
  const out = await syncOnce(w.deps);
  expect(out.status).toBe('idle');
  expect(w.calls).toEqual(['session', 'upload s1 {"from":"file0"}', 'upload s1 {"from":"file1"}']);
});

test('an invalid swipe is set aside with the reason instead of blocking the queue', async () => {
  const w = world();
  let n = 0;
  const real = w.api.uploadSwipe;
  w.api.uploadSwipe = async (b, sid, body) => {
    if (++n === 1) throw new ApiError('http', 'session_id: missing', 422, 'invalid_swipe');
    return real(b, sid, body);
  };
  const out = await syncOnce(w.deps);
  expect(out.status).toBe('idle');
  expect(w.swipes[0]).toMatchObject({ upload_state: 'rejected', reason: 'session_id: missing' });
  expect(w.swipes[1].upload_state).toBe('uploaded');
});

test('a version mismatch stops with the server message', async () => {
  const w = world();
  w.api.createSession = async () => {
    throw new ApiError('http', 'This server speaks API v2', 409, 'api_version');
  };
  expect(await syncOnce(w.deps)).toEqual({ status: 'blocked', message: 'This server speaks API v2' });
});

test('no server address set', async () => {
  const w = world();
  expect((await syncOnce({ ...w.deps, server: () => null })).status).toBe('no_server');
});
