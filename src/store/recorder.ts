import * as Application from 'expo-application';
import { create } from 'zustand';

import MagnetCapture, {
  type Capabilities,
  type LiveSample,
} from '../../modules/magnet-capture/src';
import {
  createScan,
  deleteLastSwipe,
  deleteScan,
  finishScan as finishScanRow,
  listSwipes,
  newId,
  saveSwipe,
  type SwipeRow,
} from '../db/scans';
import { activeProfile, type CalibrationProfile } from '../db/profiles';
import { sqliteRepo, swipeWasUploaded } from '../db/sync';
import { getSetting, PROFILE } from '../db/settings';
import { measureBaseline } from '../modules/capture/baseline';
import type { PhoneProfile } from '../modules/capture/profile';
import { apply, type Mat3 } from '../modules/capture/ironFit';
import { buildSwipe, validateSwipe } from '../modules/capture/buildSwipe';
import { baselineProblem, swipeProblems } from '../modules/capture/quality';
import { useSync } from '../sync/useSync';
import type { Vec3 } from '../utils/quaternion';

/** Stay under this share of the sensor range (Phase 1 pass bar, SAFE_FRACTION). */
export const SAFE_FRACTION = 0.7;
export const BASELINE_MS = 2000;
const IDENTITY: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const HISTORY = 90;

export type Phase = 'idle' | 'baseline' | 'ready' | 'recording' | 'saving' | 'endBaseline';

/** Planned swipe line on the paper, millimetres; z is the phone's height above the paper. */
export type Line = { x0: number; y0: number; x1: number; y1: number; z: number; step: number };

/** The calibration a scan uses: the phone's own profile (Phase 5) or Android's estimate. */
export type Iron = { source: 'profile' | 'android_estimate'; profileId: string | null; hardIron: Vec3; softIron: Mat3 };

export type ActiveScan = {
  id: string;
  name: string;
  yawAlignment: number;
  androidBias: Vec3;
  iron: Iron;
  noise: Vec3;
  rangeUt: number;
  baselineStart: Vec3;
  baselineRateHz: number;
};

/** problems: format fields missing (should never happen). warnings: the swipe was recorded
 * in a way that makes its positions untrustworthy (phone tilted, no slide found): redo it. */
export type LastSwipe = SwipeRow & { problems: string[]; warnings: string[] };

/** Live readings (~15 per second) live in their own small store, so only the few parts of a
 * screen that show them redraw on each sample, not the whole screen. */
type Live = { live: LiveSample | null; field: number; history: number[] };
export const useLive = create<Live>(() => ({ live: null, field: 0, history: [] }));

type State = {
  caps: Capabilities | null;
  capsError: string | null;
  /** Active calibration profile, when this phone has the raw sensor it applies to. */
  profile: CalibrationProfile | null;
  phase: Phase;
  scan: ActiveScan | null;
  swipeCount: number;
  line: Line;
  /** Lines recorded in this scan, in order (mm on the paper), for the map and coverage. */
  done: Line[];
  last: LastSwipe | null;
  message: string | null;
  init: () => () => void;
  setLine: (l: Partial<Line>) => void;
  startScan: (name: string) => Promise<void>;
  startSwipe: () => void;
  stopSwipe: () => Promise<void>;
  redoLast: () => void;
  finishScan: () => Promise<void>;
  cancelScan: () => void;
};

/** This phone's good swipe speed (cm/s), measured on the first run; defaults otherwise. */
function speedRange(): [number, number] {
  const raw = getSetting(PROFILE);
  const p = raw ? (JSON.parse(raw) as PhoneProfile) : null;
  return [p?.speedMinCmS ?? 2, p?.speedMaxCmS ?? 10];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Field strength of a live sample in µT, corrected with the profile if there is one. */
export function liveField(s: LiveSample, p: CalibrationProfile | null): number {
  if (p) return Math.hypot(...apply(p.soft_iron, p.hard_iron_ut, s.mag));
  return Math.hypot(s.mag[0] - s.bias[0], s.mag[1] - s.bias[1], s.mag[2] - s.bias[2]);
}

export function rangeOf(caps: Capabilities | null): number {
  const s = caps?.sensors.magnetometerUncalibrated ?? caps?.sensors.magnetometer;
  return s?.maxRange ?? 0;
}

export const useRecorder = create<State>((set, get) => ({
  caps: null,
  capsError: null,
  profile: null,
  phase: 'idle',
  scan: null,
  swipeCount: 0,
  line: { x0: -100, y0: 0, x1: 100, y1: 0, z: 0, step: 20 },
  done: [],
  last: null,
  message: null,

  init: () => {
    try {
      const caps = MagnetCapture.getCapabilities();
      set({ caps, capsError: null, profile: caps.sensors.magnetometerUncalibrated ? activeProfile() : null });
    } catch (e) {
      set({ capsError: String((e as Error).message ?? e) });
      return () => {};
    }
    const sub = MagnetCapture.addListener('onSample', (s) => {
      const b = liveField(s, get().profile);
      const h = useLive.getState().history;
      useLive.setState({ live: s, field: b, history: h.length >= HISTORY ? [...h.slice(1), b] : [...h, b] });
    });
    try {
      MagnetCapture.startStreaming();
    } catch (e) {
      set({ capsError: String((e as Error).message ?? e) });
    }
    return () => {
      sub.remove();
      // Leaving the screen mid-scan must not stop a recording.
      if (get().phase === 'idle') MagnetCapture.stopStreaming();
    };
  },

  setLine: (l) => set({ line: { ...get().line, ...l } }),

  startScan: async (name) => {
    // One baseline at a time: a second tap must not start another recording, which would
    // steal the first one's readings and reset an already started scan.
    if (get().phase !== 'idle' || get().scan) return;
    set({ phase: 'baseline', message: 'Hold still: phone flat, top along the paper +y, magnet away' });
    MagnetCapture.startRecording();
    await sleep(BASELINE_MS);
    const raw = MagnetCapture.stopRecording();
    try {
      const p = get().profile;
      const b = measureBaseline(raw, undefined, p ? { hardIron: p.hard_iron_ut, softIron: p.soft_iron } : undefined);
      if (b.maxTiltChangeRad > 0.05) throw new Error('The phone moved. Keep it still and try again.');
      const why = baselineProblem(b);
      if (why) throw new Error(why);
      const scan: ActiveScan = {
        id: newId(),
        name: name.trim() || `Scan ${new Date().toLocaleString()}`,
        yawAlignment: b.yawAlignment,
        androidBias: b.androidBias,
        // A profile replaces Android's estimate; the estimate is frozen for the scan otherwise.
        iron: p
          ? { source: 'profile', profileId: p.id, hardIron: p.hard_iron_ut, softIron: p.soft_iron }
          : { source: 'android_estimate', profileId: null, hardIron: b.androidBias, softIron: IDENTITY },
        noise: b.noise,
        rangeUt: rangeOf(get().caps),
        baselineStart: b.fieldWorld,
        baselineRateHz: b.rateHz,
      };
      createScan({
        id: scan.id,
        name: scan.name,
        trackingMode: 'ruler',
        tableZ: 0,
        yawAlignment: scan.yawAlignment,
        androidBias: scan.androidBias,
        noise: scan.noise,
        rangeUt: scan.rangeUt,
        baselineStart: scan.baselineStart,
      });
      set({ scan, phase: 'ready', swipeCount: 0, done: [], last: null, message: null });
    } catch (e) {
      set({ phase: get().scan ? 'ready' : 'idle', message: (e as Error).message });
    }
  },

  startSwipe: () => {
    if (get().phase !== 'ready') return;
    MagnetCapture.startRecording();
    set({ phase: 'recording', message: null });
  },

  stopSwipe: async () => {
    const { scan, caps, line, swipeCount } = get();
    if (get().phase !== 'recording' || !scan || !caps) return;
    const raw = MagnetCapture.stopRecording();
    set({ phase: 'saving' });
    try {
      const mm = (v: number) => v / 1000;
      const swipe = buildSwipe(raw, {
        sessionId: scan.id,
        swipeIndex: swipeCount,
        appVersion: Application.nativeApplicationVersion ?? '0.0.0',
        device: { manufacturer: caps.manufacturer, model: caps.model, android_sdk: caps.sdkInt },
        clockOriginNs: caps.clockOriginNs,
        trackingMode: 'ruler',
        tableZ: 0,
        yawAlignment: scan.yawAlignment,
        baselineStart: swipeCount === 0 ? scan.baselineStart : null,
        calibration: {
          source: scan.iron.source,
          profile_id: scan.iron.profileId,
          hard_iron_ut: scan.iron.hardIron,
          soft_iron: scan.iron.softIron,
          noise_ut: scan.noise,
          range_ut: scan.rangeUt,
          saturation_threshold_ut: 0.98 * scan.rangeUt,
          sensor_offset_m: [0, 0, 0],
          sensor_offset_source: 'unknown',
        },
        plannedLine: {
          start: [mm(line.x0), mm(line.y0), mm(line.z)],
          end: [mm(line.x1), mm(line.y1), mm(line.z)],
        },
      });
      const problems = validateSwipe(swipe);
      const warnings = swipeProblems({
        maxTiltRad: swipe.stats.max_tilt_rad,
        motionFound: swipe.stats.motion_detected,
        speedCmS: swipe.stats.mean_speed_m_s === null ? undefined : swipe.stats.mean_speed_m_s * 100,
        speedRange: speedRange(),
      });
      const row = await saveSwipe(swipe);
      useSync.getState().kick(); // upload now if the server is reachable; queued otherwise
      const along = Math.abs(line.x1 - line.x0) >= Math.abs(line.y1 - line.y0);
      set({
        phase: 'ready',
        swipeCount: swipeCount + 1,
        done: [...get().done, line],
        last: { ...row, problems, warnings },
        // Next parallel line, one step over.
        line: along
          ? { ...line, y0: line.y0 + line.step, y1: line.y1 + line.step }
          : { ...line, x0: line.x0 + line.step, x1: line.x1 + line.step },
      });
    } catch (e) {
      set({ phase: 'ready', message: `Swipe not saved: ${(e as Error).message}` });
    }
  },

  redoLast: () => {
    const { scan, swipeCount, line } = get();
    if (!scan || swipeCount === 0) return;
    // Check before deleting: the server cannot drop one swipe, so if it already has this one
    // the scan starts a new server session and its other swipes are sent again.
    const swipes = listSwipes(scan.id);
    const uploaded = swipes.length > 0 && swipeWasUploaded(swipes[swipes.length - 1].id);
    deleteLastSwipe(scan.id);
    if (uploaded) {
      sqliteRepo.resetScan(scan.id);
      useSync.getState().kick();
    }
    const along = Math.abs(line.x1 - line.x0) >= Math.abs(line.y1 - line.y0);
    set({
      swipeCount: swipeCount - 1,
      done: get().done.slice(0, -1),
      last: null,
      line: along
        ? { ...line, y0: line.y0 - line.step, y1: line.y1 - line.step }
        : { ...line, x0: line.x0 - line.step, x1: line.x1 - line.step },
    });
  },

  finishScan: async () => {
    const { scan } = get();
    if (!scan || get().phase !== 'ready') return;
    set({ phase: 'endBaseline', message: 'Move the magnet away, put the phone back on the start mark' });
    await sleep(1500);
    MagnetCapture.startRecording();
    await sleep(BASELINE_MS);
    const raw = MagnetCapture.stopRecording();
    let end: Vec3 | null = null;
    let note: string | null = null;
    try {
      const b = measureBaseline(
        raw,
        { yawAlignment: scan.yawAlignment, androidBias: scan.androidBias },
        scan.iron.source === 'profile' ? { hardIron: scan.iron.hardIron, softIron: scan.iron.softIron } : undefined,
      );
      // A bad end baseline is dropped rather than stored; the start baseline still stands.
      note = baselineProblem(b);
      end = note ? null : b.fieldWorld;
    } catch (e) {
      note = (e as Error).message;
    }
    await finishScanRow(scan.id, end);
    set({
      phase: 'idle',
      scan: null,
      swipeCount: 0,
      last: null,
      message: note ? `Scan saved without an end baseline. ${note}` : 'Scan saved',
    });
  },

  cancelScan: () => {
    const { scan, swipeCount } = get();
    if (MagnetCapture.isRecording()) MagnetCapture.stopRecording();
    // A scan with no swipes has nothing worth keeping; one with swipes stays (unfinished).
    if (scan && swipeCount === 0) deleteScan(scan.id);
    set({ phase: 'idle', scan: null, swipeCount: 0, last: null, message: null });
  },
}));
