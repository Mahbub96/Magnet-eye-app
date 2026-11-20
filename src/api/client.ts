/** Backend API v1 client (SRS 4.3). Every call has a timeout and fails with an ApiError that
 * says whether the server was unreachable (offline), busy (429, with its retry time), or
 * refused the request (with the server's own code and message). */

export const API_VERSION = 'v1';
export const CALIBRATION_SCHEMA_VERSION = 1;

export type ApiErrorKind = 'network' | 'busy' | 'http';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status = 0,
    readonly code = '',
    readonly retryAfterS = 0,
  ) {
    super(message);
  }
}

export type Health = {
  status: string;
  server_version: string;
  api_version: string;
  calibration_schema_version: number;
  queue: { waiting: number; size: number };
};

export type JobStatus = {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  swipes: number;
  error?: string;
  result?: FitResult | null;
};

/** The part of a fit result the app reads now; the full field arrives with Phase 8. */
export type FitResult = {
  label: string;
  swipes: number;
  readings: number;
  fit_seconds: number;
  relative_uncertainty: number;
  finest_detail_m: number;
  misfit_per_reading: number;
  warnings: string[];
  magnet: { centre_m: number[]; moment_am2: number[]; moment_sigma_am2: number[] };
  next_swipe: { start_m: number[]; end_m: number[]; height_m: number; variance_reduction: number } | null;
};

async function request<T>(base: string, path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, '')}/${API_VERSION}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ApiError('network', (e as Error).name === 'AbortError' ? 'The server did not answer in time.' : 'Cannot reach the server.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  let body: { code?: string; message?: string } & Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get('Retry-After')) || 10;
    throw new ApiError('busy', body.message ?? 'The server is busy.', 429, 'busy', retry);
  }
  if (!res.ok) throw new ApiError('http', body.message ?? `Server error ${res.status}`, res.status, body.code ?? '');
  return body as T;
}

export const api = {
  health: (base: string) => request<Health>(base, '/health', {}, 6000),
  createSession: (base: string, appVersion: string) =>
    request<{ session_id: string; idle_timeout_s: number }>(base, '/sessions', {
      method: 'POST',
      body: JSON.stringify({
        app_version: appVersion,
        api_version: API_VERSION,
        calibration_schema_version: CALIBRATION_SCHEMA_VERSION,
      }),
    }),
  /** body: the swipe format v1 file exactly as saved on the phone. */
  uploadSwipe: (base: string, sessionId: string, body: string) =>
    request<{ job_id: string; swipes: number }>(base, `/sessions/${sessionId}/swipes`, { method: 'POST', body }, 60000),
  job: (base: string, jobId: string) => request<JobStatus>(base, `/jobs/${jobId}`),
  deleteSession: (base: string, sessionId: string) =>
    request<void>(base, `/sessions/${sessionId}`, { method: 'DELETE' }),
};

export type Api = typeof api;
