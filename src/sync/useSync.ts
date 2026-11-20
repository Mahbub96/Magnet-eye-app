import NetInfo from '@react-native-community/netinfo';
import * as Application from 'expo-application';
import { create } from 'zustand';

import { api } from '../api/client';
import { getServerUrl } from '../api/server';
import { sqliteRepo } from '../db/sync';
import { type SyncOutcome, syncOnce } from './uploader';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'busy' | 'blocked' | 'no_server';

type State = {
  status: SyncStatus;
  message: string | null;
  pending: number;
  retryAt: number | null; // epoch ms of the next automatic try
  /** Starts listening for the network coming back and tries once. Call once at app start. */
  start: () => () => void;
  /** Try now (after a new swipe, on Retry, on reconnect). Safe to call any time. */
  kick: () => void;
};

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export const useSync = create<State>((set, get) => ({
  status: 'idle',
  message: null,
  pending: 0,
  retryAt: null,

  start: () => {
    get().kick();
    return NetInfo.addEventListener((s) => {
      if (s.isConnected && (get().status === 'offline' || get().pending > 0)) get().kick();
    });
  },

  kick: () => {
    if (running) {
      again = true; // a swipe arrived while sending: go round once more
      return;
    }
    if (timer) clearTimeout(timer);
    timer = null;
    running = true;
    set({ status: 'syncing', pending: sqliteRepo.pendingCount(), retryAt: null });
    void (async () => {
      let out: SyncOutcome;
      do {
        again = false;
        out = await syncOnce({
          api,
          repo: sqliteRepo,
          server: getServerUrl,
          appVersion: Application.nativeApplicationVersion ?? '0.0.0',
          sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        });
      } while (again && out.status === 'idle');
      running = false;
      const pending = sqliteRepo.pendingCount();
      if (out.status === 'offline' || out.status === 'busy') {
        const retryAt = Date.now() + out.retryAfterS * 1000;
        timer = setTimeout(() => get().kick(), out.retryAfterS * 1000);
        set({ status: out.status, message: out.message, pending, retryAt });
      } else {
        set({ status: out.status, message: out.message, pending, retryAt: null });
      }
    })();
  },
}));
