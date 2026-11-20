import * as Application from 'expo-application';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';


import { getScan } from '../../db/scans';
import { getSetting, PROFILE } from '../../db/settings';
import type { ResultSummary } from '../../db/sync';
import { canScan } from '../../modules/capture/deviceCheck';
import type { PhoneProfile } from '../../modules/capture/profile';
import { BACKGROUND_MAX_UT, deg, FLAT_MAX_RAD, tiltRad } from '../../modules/capture/quality';
import { recalibrationReason } from '../../modules/capture/recalibrate';
import { BASELINE_MS, liveField, rangeOf, SAFE_FRACTION, useRecorder } from '../../store/recorder';
import { useSync } from '../../sync/useSync';
import { BeforeYouScan } from '../../ui/BeforeYouScan';
import { MagnetMoved } from '../../ui/MagnetMoved';
import { NoMagnetometer } from '../../ui/NoMagnetometer';
import { Toast } from '../../ui/patterns';
import { CoverageGrid, PaperMap, SpeedMeter } from '../../ui/scan';
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

function Sparkline({ values, limit }: { values: number[]; limit: number }) {
  // Scale to what is on screen (at least 100 µT), so the Earth's field alone is visible and
  // the magnet's rise stands out; bars above the safe limit turn amber.
  const max = Math.max(100, 1.2 * Math.max(0, ...values));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 1 }}>
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(2, (v / max) * 44),
            borderRadius: 1,
            backgroundColor: v > limit ? color.warn : color.accent,
            opacity: 0.35 + (0.65 * i) / Math.max(values.length, 1),
          }}
        />
      ))}
    </View>
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
  const live = r.live;
  const field = live ? liveField(live, r.profile) : 0;
  const peakAxis = live ? Math.max(...live.mag.map(Math.abs)) : 0;
  const nearLimit = range > 0 && peakAxis > limit;
  const tilt = live ? tiltRad(live.quat) : 0;
  const notFlat = live !== null && tilt > FLAT_MAX_RAD;
  const elapsed = useElapsed(r.phase === 'recording');
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

  const panelField = (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={type.small}>Field now</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: '600', color: color.text, letterSpacing: -0.2 }}>{field.toFixed(0)}</Text>
        <Text style={[type.small, { marginBottom: 3 }]}>µT</Text>
        <Text style={[type.small, { marginBottom: 3, marginLeft: 'auto', color: color.textFaint }]}>±{range.toFixed(0)}</Text>
      </View>
      <Sparkline values={r.history} limit={limit} />
    </View>
  );
  const toasts = (
    <>
      {nearLimit ? <Toast text="Near the sensor limit — lift the phone or move away from the magnet" /> : null}
      {notFlat ? <Toast text={`Phone tilted ${deg(tilt).toFixed(0)}° — lay it flat, screen up`} /> : null}
    </>
  );

  if (!inScan)
    return (
      <Screen>
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Chip text="No scan" tone="warn" />
          <Chip text="Tracking: ruler" tone="good" />
          <Chip text={`${(live?.rateHz ?? 0).toFixed(0)} Hz`} tone={(live?.rateHz ?? 0) > 50 ? 'good' : 'warn'} />
          <Chip text={`Tilt ${deg(tilt).toFixed(0)}°`} tone={notFlat ? 'warn' : 'good'} />
          <SyncChip />
        </View>
        <Title
          label="Ruler mode"
          title="Record swipes"
          sub="Tape the magnet to the table (z = 0) and cover it with a box 3–5 cm tall. Tape paper on the box top and draw x and y axes, origin above the magnet."
        />
        <Card style={{ gap: space.sm }}>{panelField}</Card>
        {toasts}
        {live && field > BACKGROUND_MAX_UT ? (
          <Banner
            tone="warn"
            text={`Field is ${field.toFixed(0)} µT — the Earth alone is about 25–65 µT. Move the magnet away before the baseline.`}
          />
        ) : null}
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
  const current = r.phase === 'recording' || r.phase === 'ready' ? r.line : null;
  const ns = fit?.next_swipe;
  const suggested = ns
    ? { x0: Math.round(ns.start_m[0] * 1000), y0: Math.round(ns.start_m[1] * 1000), x1: Math.round(ns.end_m[0] * 1000), y1: Math.round(ns.end_m[1] * 1000) }
    : null;
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

      <PaperMap done={r.done} current={current} suggested={suggested} />
      {suggested ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ width: 14, height: 2, backgroundColor: color.warn }} />
          <Text style={[type.small, { flex: 1 }]}>Suggested next line from the latest fit</Text>
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
            <Text style={type.small}>{r.phase === 'recording' ? `${elapsed.toFixed(1)} s` : r.phase === 'saving' ? 'Saving…' : 'Record'}</Text>
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
      ) : null}
      <Text style={[type.small, { lineHeight: 18 }]}>
        Put the centre of the phone’s top edge on the start mark, press record, slide steadily along the ruler to the end
        mark, then stop. Lines may pass right over the magnet.
      </Text>

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
