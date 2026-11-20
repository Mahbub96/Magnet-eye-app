import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';


import { canScan } from '../../modules/capture/deviceCheck';
import { BACKGROUND_MAX_UT, deg, FLAT_MAX_RAD, tiltRad } from '../../modules/capture/quality';
import { BASELINE_MS, rangeOf, SAFE_FRACTION, useRecorder } from '../../store/recorder';
import { BeforeYouScan } from '../../ui/BeforeYouScan';
import { NoMagnetometer } from '../../ui/NoMagnetometer';
import { Toast } from '../../ui/patterns';
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

export default function ScanScreen() {
  const r = useRecorder();
  const [name, setName] = useState('');
  const [sheet, setSheet] = useState(false);
  const init = useRecorder((s) => s.init);
  useFocusEffect(useCallback(() => init(), [init]));

  const range = rangeOf(r.caps);
  const limit = SAFE_FRACTION * range;
  const live = r.live;
  const field = live
    ? Math.hypot(live.mag[0] - live.bias[0], live.mag[1] - live.bias[1], live.mag[2] - live.bias[2])
    : 0;
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

  if (r.caps && !canScan(r.caps)) return <NoMagnetometer onViewSaved={() => router.navigate('/saved')} />;

  const s = r.caps?.sensors;
  const capWarnings: string[] = [];
  if (r.caps && !s?.magnetometerUncalibrated)
    capWarnings.push('No uncalibrated magnetometer: readings may jump when Android recalibrates.');
  if (r.caps && !s?.gameRotationVector)
    capWarnings.push('No game rotation vector: orientation cannot be recorded on this phone.');
  if (r.caps && !r.caps.highSamplingRateGranted)
    capWarnings.push('High sampling rate not granted: Android limits sensors to 200 Hz.');

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Chip text={inScan ? `Swipe ${r.swipeCount + 1}` : 'No scan'} tone={inScan ? 'info' : 'warn'} />
        <Chip text="Tracking: ruler" tone="good" />
        <Chip text={`${(live?.rateHz ?? 0).toFixed(0)} Hz`} tone={(live?.rateHz ?? 0) > 50 ? 'good' : 'warn'} />
        <Chip text={`Tilt ${deg(tilt).toFixed(0)}°`} tone={notFlat ? 'warn' : 'good'} />
      </View>

      <Title
        label="Ruler mode"
        title={inScan ? r.scan!.name : 'Record swipes'}
        sub={
          inScan
            ? 'Put the centre of the phone’s top edge on the start mark, press record, slide steadily along the ruler to the end mark, then stop.'
            : 'Tape a sheet of paper to the table and draw x and y axes. The paper is the table plane (z = 0).'
        }
      />

      <Card style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={type.small}>Field now</Text>
            <Text style={[type.value, { fontSize: 30 }]}>
              {field.toFixed(0)}
              <Text style={type.small}> µT</Text>
            </Text>
          </View>
          <Text style={type.small}>range ±{range.toFixed(0)} µT</Text>
        </View>
        <Sparkline values={r.history} limit={limit} />
      </Card>

      {nearLimit ? <Toast text="Near the sensor limit — lift the phone or move away from the magnet" /> : null}
      {notFlat ? <Toast text={`Phone tilted ${deg(tilt).toFixed(0)}° — lay it flat on the paper, screen up`} /> : null}
      {!inScan && live && field > BACKGROUND_MAX_UT ? (
        <Banner
          tone="warn"
          text={`Field is ${field.toFixed(0)} µT — the Earth alone is about 25–65 µT. Move the magnet away before the baseline.`}
        />
      ) : null}
      {capWarnings.map((w) => (
        <Banner key={w} tone="warn" text={w} />
      ))}
      {r.message ? (
        <Banner
          tone={r.message === 'Scan saved' ? 'good' : r.phase === 'idle' ? 'warn' : 'info'}
          text={r.message}
        />
      ) : null}

      {!inScan ? (
        <>
          <Field label="Scan name" placeholder="e.g. Ring magnet" value={name} onChangeText={setName} />
          <Button title="Start a scan" disabled={!r.caps} onPress={() => setSheet(true)} />
          <BeforeYouScan
            visible={sheet && !inScan}
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
        </>
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
            <NumberField label="Height above paper" value={r.line.z} onChange={(v) => r.setLine({ z: v })} />
            <NumberField label="Next line step" value={r.line.step} onChange={(v) => r.setLine({ step: v })} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm }}>
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

          {r.last ? (
            <>
              <Section title={`Swipe ${r.last.ord + 1} saved`} />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Stat label="Sample rate" value={r.last.mag_rate_hz.toFixed(0)} unit="Hz" />
                <Stat label="Readings" value={String(r.last.mag_samples)} note={`${r.last.duration_s.toFixed(1)} s`} />
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Stat
                  label="Speed"
                  value={r.last.mean_speed_m_s ? (r.last.mean_speed_m_s * 100).toFixed(1) : '–'}
                  unit="cm/s"
                />
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
              {r.last.problems.length ? (
                <Banner tone="bad" text={`Missing or invalid: ${r.last.problems.join(', ')}`} />
              ) : (
                <Chip text="All swipe format v1 fields present" tone="good" />
              )}
            </>
          ) : null}

          <Button title="Cancel scan" kind="danger" disabled={busy || r.phase === 'recording'} onPress={r.cancelScan} style={{ marginTop: space.md }} />
        </>
      )}
    </Screen>
  );
}
