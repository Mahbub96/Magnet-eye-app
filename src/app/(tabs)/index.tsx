import * as Application from 'expo-application';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { getScan } from '../../db/scans';
import { getSetting, PROFILE } from '../../db/settings';
import type { ResultSummary } from '../../db/sync';
import { canScan } from '../../modules/capture/deviceCheck';
import type { PhoneProfile } from '../../modules/capture/profile';
import { BACKGROUND_MAX_UT, BOX_HEIGHT_MM, deg, FLAT_MAX_RAD, tiltRad } from '../../modules/capture/quality';
import { recalibrationReason } from '../../modules/capture/recalibrate';
import { BASELINE_MS, rangeOf, SAFE_FRACTION, useLive, useRecorder } from '../../store/recorder';
import { useSync } from '../../sync/useSync';
import { BeforeYouScan } from '../../ui/BeforeYouScan';
import { MagnetMoved } from '../../ui/MagnetMoved';
import { NoMagnetometer } from '../../ui/NoMagnetometer';
import { Toast } from '../../ui/patterns';
import { CoverageGrid, PaperMap, SpeedMeter, UncertaintyGauge } from '../../ui/scan';
import {
  Banner,
  Button,
  Card,
  Chip,
  Field,
  NumberField,
  Screen,
  Section,
  Stat,
  Title,
} from '../../ui/components';
import { color, space, type } from '../../ui/theme';
import { Text } from '../../ui/Text';

/** Last few seconds of field strength: one SVG drawing (two paths) instead of 90 views. Scaled
 * to what is on screen (at least 100 µT), so the Earth's field alone is visible and the magnet's
 * rise stands out; bars above the safe limit turn amber. */
const Sparkline = memo(function Sparkline({ values, limit }: { values: number[]; limit: number }) {
  const [w, setW] = useState(0);
  const H = 44;
  const n = 90;
  const max = Math.max(100, 1.2 * Math.max(0, ...values));
  let ok = '';
  let over = '';
  if (w > 0) {
    const step = w / n;
    const bw = Math.max(1, step - 1);
    const x0 = w - values.length * step;
    values.forEach((v, i) => {
      const h = Math.max(2, (v / max) * H);
      const d = `M${(x0 + i * step).toFixed(1)} ${H}v${(-h).toFixed(1)}h${bw.toFixed(1)}v${h.toFixed(1)}z`;
      if (v > limit) over += d;
      else ok += d;
    });
  }
  return (
    <View style={{ height: H }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={color.accent} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color.accent} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Path d={ok} fill="url(#fade)" />
          <Path d={over} fill={color.warn} />
        </Svg>
      ) : null}
    </View>
  );
});

/** "Field now" with its sparkline. The only part of the screen that redraws on every sample. */
function LiveField({ range, limit }: { range: number; limit: number }) {
  const field = useLive((s) => s.field);
  const history = useLive((s) => s.history);
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={type.small}>Field now</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: '600', color: color.text, letterSpacing: -0.2 }}>{field.toFixed(0)}</Text>
        <Text style={[type.small, { marginBottom: 3 }]}>µT</Text>
        <Text style={[type.small, { marginBottom: 3, marginLeft: 'auto', color: color.textFaint }]}>±{range.toFixed(0)}</Text>
      </View>
      <Sparkline values={history} limit={limit} />
    </View>
  );
}

/** Rate and tilt chips; redraw only when the rounded value changes. */
function LiveChips() {
  const hz = useLive((s) => Math.round(s.live?.rateHz ?? 0));
  const tilt = useLive((s) => (s.live ? Math.round(deg(tiltRad(s.live.quat))) : 0));
  return (
    <>
      <Chip text={`${hz} Hz`} tone={hz > 50 ? 'good' : 'warn'} />
      <Chip text={`Tilt ${tilt}°`} tone={tilt > deg(FLAT_MAX_RAD) ? 'warn' : 'good'} />
    </>
  );
}

/** Warning strips for the sensor limit and a tilted phone. */
function LiveToasts({ limit }: { limit: number }) {
  const nearLimit = useLive((s) => !!s.live && limit > 0 && Math.max(...s.live.mag.map(Math.abs)) > limit);
  const tilt = useLive((s) => (s.live ? Math.round(deg(tiltRad(s.live.quat))) : 0));
  return (
    <>
      {nearLimit ? <Toast text="Near the sensor limit — lift the phone or move away from the magnet" /> : null}
      {tilt > deg(FLAT_MAX_RAD) ? <Toast text={`Phone tilted ${tilt}° — lay it flat, screen up`} /> : null}
    </>
  );
}

function BackgroundWarning() {
  const field = useLive((s) => (s.live && s.field > BACKGROUND_MAX_UT ? Math.round(s.field) : 0));
  return field ? (
    <Banner tone="warn" text={`Field is ${field} µT — the Earth alone is about 25–65 µT. Move the magnet away before the baseline.`} />
  ) : null;
}

/** Seconds since Record, ticking 10 times a second without redrawing the rest of the screen. */
function RecordLabel({ phase }: { phase: string }) {
  const elapsed = useElapsed(phase === 'recording');
  return (
    <Text style={type.small}>{phase === 'recording' ? `${elapsed.toFixed(1)} s` : phase === 'saving' ? 'Saving…' : 'Record'}</Text>
  );
}

function RecordButton({ recording, disabled, onPress }: {
  recording: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop swipe' : 'Record swipe'}
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 76,
        height: 76,
        borderRadius: 38,
        borderWidth: 3,
        borderColor: color.text,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View
        style={{
          width: recording ? 28 : 58,
          height: recording ? 28 : 58,
          borderRadius: recording ? 6 : 29,
          backgroundColor: color.bad,
        }}
      />
    </Pressable>
  );
}

function useElapsed(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    return () => {
      clearInterval(id);
      setElapsed(0);
    };
  }, [running]);
  return running ? elapsed : 0;
}

/** Upload status; tap for the connection screen (Figma 12). */
function SyncChip() {
  const { status, pending } = useSync();
  const [text, tone]: [string, 'good' | 'warn' | 'bad' | 'info'] =
    status === 'syncing'
      ? ['Uploading', 'info']
      : status === 'offline'
        ? [`Offline · ${pending} waiting`, 'warn']
        : status === 'busy'
          ? [`Server busy · ${pending} waiting`, 'warn']
          : status === 'no_server'
            ? ['No server', 'warn']
            : status === 'blocked'
              ? ['Server mismatch', 'bad']
              : pending > 0
                ? [`${pending} waiting`, 'warn']
                : ['Server ✓', 'good'];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Upload status: ${text}`} onPress={() => router.push('/connection')}>
      <Chip text={text} tone={tone} />
    </Pressable>
  );
}

export default function ScanScreen() {
  const r = useRecorder();
  const [name, setName] = useState('');
  const [sheet, setSheet] = useState(false);
  const [movedAt, setMovedAt] = useState<number | null>(null); // fit size the dialog was answered for
  const syncStatus = useSync((st) => st.status);
  // After each upload round, look at the open scan's latest fit for a moved magnet (PR-19).
  const fit = useMemo(() => {
    if (!r.scan || syncStatus === 'syncing') return null;
    const row = getScan(r.scan.id);
    return row?.result_summary ? (JSON.parse(row.result_summary) as ResultSummary) : null;
  }, [r.scan, syncStatus]);
  const moved = !!fit && fit.warnings.includes('magnet_may_have_moved') && movedAt !== fit.swipes;
  // Speed range measured for this phone on the first run (Your phone can scan).
  const [speedMin, speedMax] = useMemo(() => {
    const p = getSetting(PROFILE);
    const prof = p ? (JSON.parse(p) as PhoneProfile) : null;
    return [prof?.speedMinCmS ?? 2, prof?.speedMaxCmS ?? 10];
  }, []);
  const init = useRecorder((s) => s.init);
  useFocusEffect(useCallback(() => init(), [init]));

  const range = rangeOf(r.caps);
  const limit = SAFE_FRACTION * range;
  const ns = fit?.next_swipe;
  const suggested = useMemo(
    () =>
      ns
        ? { x0: Math.round(ns.start_m[0] * 1000), y0: Math.round(ns.start_m[1] * 1000), x1: Math.round(ns.end_m[0] * 1000), y1: Math.round(ns.end_m[1] * 1000) }
        : null,
    [ns],
  );
  const showCurrent = r.phase === 'recording' || r.phase === 'ready';
  const current = useMemo(() => (showCurrent ? r.line : null), [showCurrent, r.line]);
  const busy = r.phase === 'baseline' || r.phase === 'saving' || r.phase === 'endBaseline';
  const inScan = r.scan !== null;

  if (r.capsError) {
    return (
      <Screen>
        <Title title="Sensors unavailable" sub="Magnet Eye could not start the phone's sensors." />
        <Banner tone="bad" text={r.capsError} />
      </Screen>
    );
  }

  // Recalibration prompt (Phase 5): only where a profile can apply (raw sensor present).
  const recal =
    r.caps?.sensors.magnetometerUncalibrated
      ? recalibrationReason(r.profile, {
          model: `${r.caps.manufacturer} ${r.caps.model}`,
          android_sdk: r.caps.sdkInt,
          app_version: Application.nativeApplicationVersion ?? '0.0.0',
        })
      : null;

  if (r.caps && !canScan(r.caps)) return <NoMagnetometer onViewSaved={() => router.navigate('/saved')} />;

  const s = r.caps?.sensors;
  const capWarnings: string[] = [];
  if (r.caps && !s?.magnetometerUncalibrated)
    capWarnings.push('No uncalibrated magnetometer: readings may jump when Android recalibrates.');
  if (r.caps && !s?.gameRotationVector)
    capWarnings.push('No game rotation vector: orientation cannot be recorded on this phone.');
  if (r.caps && !r.caps.highSamplingRateGranted)
    capWarnings.push('High sampling rate not granted: Android limits sensors to 200 Hz.');

  const panelField = <LiveField range={range} limit={limit} />;
  const toasts = <LiveToasts limit={limit} />;

  if (!inScan)
    return (
      <Screen>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Chip text="No scan" tone="warn" />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (r.caps?.arcoreStatus === 'ready') {
                r.setTrackingMode(r.trackingMode === 'arcore' ? 'ruler' : 'arcore');
              } else {
                Alert.alert(
                  'ARCore Tracking',
                  r.caps?.arcoreStatus === 'needs_install'
                    ? 'Google Play Services for AR is required on this phone for camera tracking.'
                    : 'Camera tracking (ARCore) is not supported on this phone. Ruler mode will be used.',
                );
              }
            }}
          >
            <Chip text={`Tracking: ${r.trackingMode === 'arcore' ? 'ARCore (3D Freeform)' : 'Ruler'}`} tone="good" />
          </Pressable>
          <LiveChips />
          <SyncChip />
        </View>
        <Title
          label={r.trackingMode === 'arcore' ? 'ARCore 3D freeform' : 'Ruler mode'}
          title={r.trackingMode === 'arcore' ? 'Scan magnet' : 'Record swipes'}
          sub={
            r.trackingMode === 'arcore'
              ? 'Move the phone freely in any direction, at any angle, and any height over the magnet. ARCore camera odometry tracks position continuously.'
              : 'Tape the magnet to the table (z = 0) and cover it with a box 3–5 cm tall. Tape paper on the box top and draw x and y axes, origin above the magnet.'
          }
        />
        <Card style={{ gap: space.sm }}>{panelField}</Card>
        {toasts}
        <BackgroundWarning />
        {capWarnings.map((w) => (
          <Banner key={w} tone="warn" text={w} />
        ))}
        {recal ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/calibrate', params: { from: 'settings' } })}
          >
            <Banner tone="info" text={`${recal} Tap to calibrate.`} />
          </Pressable>
        ) : null}
        {r.message ? <Banner tone={r.message === 'Scan saved' ? 'good' : 'warn'} text={r.message} /> : null}
        <Field label="Scan name" placeholder="e.g. Ring magnet" value={name} onChangeText={setName} />
        <Button title="Start a scan" disabled={!r.caps} onPress={() => setSheet(true)} />
        <BeforeYouScan
          visible={sheet}
          measuring={r.phase === 'baseline'}
          baselineMs={BASELINE_MS}
          error={r.phase === 'idle' && r.message && r.message !== 'Scan saved' ? r.message : null}
          onStart={async () => {
            await r.startScan(name);
            // Close once the baseline is accepted; on a refusal the sheet shows why.
            if (useRecorder.getState().scan) setSheet(false);
          }}
          onClose={() => setSheet(false)}
        />
      </Screen>
    );

  // ---- Scanning: Figma "06 Scan" layout. The camera view becomes a map of the paper until
  // camera tracking (Phase 6).
  const cancel = () =>
    Alert.alert(
      'Cancel this scan?',
      r.swipeCount ? 'Its swipes stay in Saved as an unfinished scan.' : 'Nothing has been recorded yet.',
      [
        { text: 'Keep scanning', style: 'cancel' },
        { text: 'Cancel scan', style: 'destructive', onPress: r.cancelScan },
      ],
    );
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel scan"
          disabled={busy || r.phase === 'recording'}
          onPress={cancel}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 14, fontWeight: '500', color: color.text }}>✕</Text>
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Chip text={`Swipe ${r.swipeCount + 1}`} tone="info" />
          <Chip
            text={fit ? `Uncertainty ${Math.round(fit.relative_uncertainty * 100)}%` : 'No fit yet'}
            tone={fit ? (fit.relative_uncertainty <= 0.15 ? 'good' : 'warn') : 'info'}
          />
          <SyncChip />
        </View>
      </View>
      <Text style={[type.title, { fontSize: 20 }]}>{r.scan!.name}</Text>
      <UncertaintyGauge uncertainty={fit ? fit.relative_uncertainty : null} />
      {fit && (fit.relative_uncertainty <= 0.15 || fit.relative_uncertainty <= 15) ? (
        <Banner
          tone="good"
          text={`Target accuracy reached (±${Math.round(fit.relative_uncertainty <= 1 ? fit.relative_uncertainty * 100 : fit.relative_uncertainty)}%)! The 3D field has converged. Tap "Finish" below to inspect.`}
        />
      ) : null}

      <PaperMap done={r.done} current={current} suggested={suggested} />
      {suggested ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ width: 14, height: 2, backgroundColor: color.warn }} />
          <Text style={[type.small, { flex: 1 }]}>
            Suggested line (+{Math.round((fit?.next_swipe?.variance_reduction ?? 0.45) * 100)}% accuracy gain)
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => r.setLine({ x0: suggested.x0, y0: suggested.y0, x1: suggested.x1, y1: suggested.y1 })}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: color.surface2 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '500', color: color.text }}>Use it</Text>
          </Pressable>
        </View>
      ) : null}
      {toasts}
      {r.message ? <Banner tone="info" text={r.message} /> : null}

      <Card style={{ gap: space.lg, padding: space.lg }}>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          {panelField}
          <View style={{ gap: 6 }}>
            <Text style={type.small}>Coverage</Text>
            <CoverageGrid done={r.done} />
          </View>
        </View>
        <SpeedMeter speed={r.last?.mean_speed_m_s ? r.last.mean_speed_m_s * 100 : null} min={speedMin} max={speedMax} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Button title="Redo last" kind="secondary" disabled={busy || r.phase === 'recording' || r.swipeCount === 0} onPress={r.redoLast} />
          <View style={{ alignItems: 'center', gap: space.xs }}>
            <RecordButton
              recording={r.phase === 'recording'}
              disabled={busy}
              onPress={r.phase === 'recording' ? r.stopSwipe : r.startSwipe}
            />
            <RecordLabel phase={r.phase} />
          </View>
          <Button title="Finish" kind="secondary" disabled={busy || r.phase === 'recording'} onPress={r.finishScan} />
        </View>
      </Card>

      {r.last ? (
        <>
          <Section title={`Swipe ${r.last.ord + 1} saved`} />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Stat label="Rate" value={r.last.mag_rate_hz.toFixed(0)} unit="Hz" />
            <Stat label="Readings" value={String(r.last.mag_samples)} note={`${r.last.duration_s.toFixed(1)} s`} />
            <Stat
              label="Saturated"
              value={String(r.last.saturated_samples)}
              tone={r.last.saturated_samples ? 'warn' : 'good'}
              note={r.last.saturated_samples ? 'lift the phone' : 'none'}
            />
          </View>
          {r.last.warnings.map((w) => (
            <Banner key={w} tone="warn" text={`${w} Tap Redo last.`} />
          ))}
          {r.last.problems.length ? <Banner tone="bad" text={`Missing or invalid: ${r.last.problems.join(', ')}`} /> : null}
        </>
      ) : null}

      {r.trackingMode === 'arcore' ? (
        <Card style={{ gap: space.xs, padding: space.md, backgroundColor: color.surface }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: color.accent }}>ARCore Freeform 3D Tracking</Text>
          <Text style={[type.small, { lineHeight: 18 }]}>
            Move your phone freely across the magnet in curves, loops, or multiple passes at any height. ARCore camera VIO
            tracks 6DoF position at 60 Hz.
          </Text>
        </Card>
      ) : (
        <>
          <Section title="Swipe line (mm on the paper)" />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <NumberField label="Start x" value={r.line.x0} onChange={(v) => r.setLine({ x0: v })} />
            <NumberField label="Start y" value={r.line.y0} onChange={(v) => r.setLine({ y0: v })} />
            <NumberField label="End x" value={r.line.x1} onChange={(v) => r.setLine({ x1: v })} />
            <NumberField label="End y" value={r.line.y1} onChange={(v) => r.setLine({ y1: v })} />
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <NumberField label="Box height (mm)" value={r.line.z} onChange={(v) => r.setLine({ z: v })} />
            <NumberField label="Next line step" value={r.line.step} onChange={(v) => r.setLine({ step: v })} />
          </View>
          {r.line.z <= 0 ? (
            <Banner tone="warn" text="Enter the box height: how far the paper on the box top is above the table, in mm." />
          ) : r.line.z < BOX_HEIGHT_MM[0] || r.line.z > BOX_HEIGHT_MM[1] ? (
            <Banner
              tone="warn"
              text={`Box height ${r.line.z} mm (${(r.line.z / 10).toFixed(1)} cm) is unusual — check it is in mm. A 3–5 cm box is 30–50 mm.`}
            />
          ) : null}
          <Text style={[type.small, { lineHeight: 18 }]}>
            Put the centre of the phone’s top edge on the start mark, press record, slide steadily along the ruler to the end
            mark, then stop. Lines may pass right over the magnet.
          </Text>
        </>
      )}

      <MagnetMoved
        visible={moved}
        onKeepGoing={() => setMovedAt(fit?.swipes ?? null)}
        onRestart={() => {
          setMovedAt(fit?.swipes ?? null);
          r.cancelScan(); // the swipes so far stay in Saved as an unfinished scan
        }}
      />
    </Screen>
  );
}
