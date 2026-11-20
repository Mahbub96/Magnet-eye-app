import Constants from 'expo-constants';

import { getSetting, setSetting } from '../db/settings';

export const SERVER_URL = 'server_url';
export const DEV_API_PORT = 8001;

/** In a development build the backend usually runs on the same computer as Metro
 * (`uvicorn ... --port 8001`), so that is the default; a release has no default. */
export function devDefaultServer(): string | null {
  if (!__DEV__) return null;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:${DEV_API_PORT}` : null;
}

export function getServerUrl(): string | null {
  return getSetting(SERVER_URL) || devDefaultServer();
}

export function setServerUrl(url: string): void {
  setSetting(SERVER_URL, url.trim().replace(/\/+$/, ''));
}
