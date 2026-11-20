import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MagnetCapture from '../../modules/magnet-capture/src';
import { ONBOARDED, setSetting } from '../db/settings';
import { nearestBin, SPHERE_BINS } from '../modules/capture/profile';
import { rows, stdVec } from '../modules/capture/stats';
import { useSensorStream } from '../modules/capture/useStream';
import type { Vec3 } from '../utils/quaternion';
import { Banner, Button } from '../ui/components';
import { ProgressRing, StepHeader, Stepper } from '../ui/patterns';
import { Text } from '../ui/Text';
import { color, space, type } from '../ui/theme';

export const CALIBRATION = 'calibration';
const STEPS = ['Away from metal', 'Figure eight', 'Baseline', 'Noise test'];
const COVERED_ENOUGH = 0.85; // share of the 26 directions
const STILL_MS = 2000;

type Result = { coverage: number; fieldUt: number; noiseUt: number; at: string };

/** Figma "04 Calibration". Measures how much of the sphere the figure eight covered, the
 * background field and the noise. Fitting the hard- and soft-iron model from these readings
 * is Phase 5; until then Android's own estimate is used, and the screen says so. */
export default function CalibrateScreen() {
  useSensorStream();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [step, setStep] = useState(0);
  const [bins, setBins] = useState<Set<number>>(() => new Set());
  const binsRef = useRef(new Set<number>());
  const [still, setStill] = useState<{ fieldUt?: number; noiseUt?: number }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Result | null>(null);
  const coverage = bins.size / SPHERE_BINS.length;

  // Figure eight: count the directions the field has pointed in, in the phone frame.
  useEffect(() => {
    if (step !== 1) return;
    const sub = MagnetCapture.addListener('onSample', (s) => {
      const v: Vec3 = [s.mag[0] - s.bias[0], s.mag[1] - s.bias[1], s.mag[2] - s.bias[2]];
      const b = nearestBin(v);
      if (!binsRef.current.has(b)) {
        binsRef.current.add(b);
        setBins(new Set(binsRef.current));
      }
    });
    return () => sub.remove();
  }, [step]);

  const measureStill = async (what: 'field' | 'noise') => {
    setBusy(true);
    MagnetCapture.startRecording();
    await new Promise((r) => setTimeout(r, STILL_MS));
    const mag = rows(MagnetCapture.stopRecording().mag, 7);
    setBusy(false);
    if (mag.length < 20) return;
    if (what === 'field') {
      const m = mag.map((r) => Math.hypot(r[1] - r[4], r[2] - r[5], r[3] - r[6]));
      setStill((s) => ({ ...s, fieldUt: m.reduce((a, b) => a + b, 0) / m.length }));
      setStep(3);
    } else {
      const sd = stdVec(mag.map((r) => [r[1], r[2], r[3]] as Vec3));
      const noiseUt = Math.sqrt((sd[0] ** 2 + sd[1] ** 2 + sd[2] ** 2) / 3);
      const result: Result = { coverage, fieldUt: still.fieldUt ?? 0, noiseUt, at: new Date().toISOString() };
      setSetting(CALIBRATION, JSON.stringify(result));
      setDone(result);
    }
  };

  const finish = () => {
    setSetting(ONBOARDED, '1');
    if (from === 'settings' && router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: space.xl, gap: 20, flexGrow: 1 }}>
        <StepHeader label="STEP 3 OF 3" title="Calibrate" text="Removes your phone’s own magnetism. About 30 seconds." />
        <Stepper steps={STEPS} current={done ? STEPS.length : step} />

        {step === 0 ? (
          <Instruction
            title="Move away from metal"
            text="At least 1 m from steel furniture, laptops, speakers and magnets. Take off a magnetic case."
          />
        ) : null}

        {step === 1 ? (
          <>
            <View style={{ alignItems: 'center', paddingVertical: space.lg, borderRadius: 20, backgroundColor: color.surface }}>
              <ProgressRing value={coverage} size={200}>
                <Text style={{ fontSize: 28, fontWeight: '600', color: color.text }}>{Math.round(coverage * 100)}%</Text>
                <Text style={type.small}>of directions covered</Text>
              </ProgressRing>
            </View>
            <Instruction
              title="Slowly draw a figure eight in the air"
              text="Tilt the phone through every direction. Keep 1 m away from metal."
            />
          </>
        ) : null}

        {step === 2 ? (
          <Instruction title="Put the phone down and keep it still" text="Measures the background field here (2 s)." />
        ) : null}
        {step === 3 && !done ? (
          <Instruction title="Keep it still a little longer" text="Measures the sensor noise (2 s)." />
        ) : null}

        {done ? (
          <View style={{ gap: space.sm }}>
            <Banner
              tone="good"
              text={`Measured: ${Math.round(done.coverage * 100)}% of directions, background ${done.fieldUt.toFixed(0)} µT, noise ${done.noiseUt.toFixed(1)} µT.`}
            />
            <Banner
              tone="info"
              text="Fitting your phone’s own magnetism from these readings arrives in a later version. Until then Magnet Eye uses Android’s estimate."
            />
          </View>
        ) : null}

        <View style={{ flex: 1 }} />
        {step === 0 ? <Button title="I’m away from metal" onPress={() => setStep(1)} /> : null}
        {step === 1 ? (
          <Button
            title={coverage >= COVERED_ENOUGH ? 'Next' : 'Keep going…'}
            disabled={coverage < COVERED_ENOUGH}
            onPress={() => setStep(2)}
          />
        ) : null}
        {step === 2 ? <Button title="Measure background" busy={busy} onPress={() => measureStill('field')} /> : null}
        {step === 3 && !done ? <Button title="Measure noise" busy={busy} onPress={() => measureStill('noise')} /> : null}
        {done ? <Button title="Start scanning" onPress={finish} /> : null}
        {!done ? <Button title="Skip for now" kind="ghost" onPress={finish} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Instruction({ title, text }: { title: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: color.surface }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: color.text }}>{title}</Text>
        <Text style={[type.small, { lineHeight: 18 }]}>{text}</Text>
      </View>
    </View>
  );
}
