import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MagnetCapture, { type Capabilities } from '../../modules/magnet-capture/src';
import { PROFILE, setSetting } from '../db/settings';
import { gradeNoise, gradeRange, gradeRate, measureProfile, type PhoneProfile } from '../modules/capture/profile';
import { useSensorStream } from '../modules/capture/useStream';
import { Banner, Button } from '../ui/components';
import { MetricCard, StepHeader } from '../ui/patterns';
import { Text } from '../ui/Text';
import { color, space, type } from '../ui/theme';

const MEASURE_MS = 2000;

/** Figma "03 Capability report": measured just now, with guidance derived from it. */
export default function CapabilityScreen() {
  useSensorStream();
  const caps = useMemo<Capabilities | null>(() => {
    try {
      return MagnetCapture.getCapabilities();
    } catch {
      return null;
    }
  }, []);
  const [profile, setProfile] = useState<PhoneProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (!caps) return;
    let alive = true;
    MagnetCapture.startRecording();
    const id = setTimeout(() => {
      const raw = MagnetCapture.stopRecording();
      if (!alive) return;
      try {
        const p = measureProfile(raw, caps);
        setSetting(PROFILE, JSON.stringify(p));
        setProfile(p);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    }, MEASURE_MS);
    return () => {
      alive = false;
      clearTimeout(id);
      if (MagnetCapture.isRecording()) MagnetCapture.stopRecording();
    };
  }, [caps, run]);

  const model = caps ? `${caps.manufacturer} ${caps.model}` : 'this phone';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: space.xl, gap: 16, flexGrow: 1 }}>
        <StepHeader
          label="STEP 2 OF 3"
          title="Your phone can scan"
          text={`Measured just now on ${model}. Guidance is set from these numbers.`}
        />
        {!profile && !error ? (
          <Banner tone="info" text="Measuring… keep the phone still for 2 seconds." />
        ) : null}
        {error ? <Banner tone="warn" text={error} /> : null}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <MetricCard
              label="Sample rate"
              value={profile ? `${profile.rateHz.toFixed(0)} Hz` : '…'}
              grade={profile ? gradeRate(profile.rateHz) : undefined}
            />
            <MetricCard
              label="Noise"
              value={profile ? `${profile.noiseUt.toFixed(1)} µT` : '…'}
              grade={profile ? gradeNoise(profile.noiseUt) : undefined}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <MetricCard
              label="Range"
              value={profile ? `±${Math.round(profile.rangeUt).toLocaleString()} µT` : '…'}
              grade={profile ? gradeRange(profile.rangeUt) : undefined}
            />
            <MetricCard label="Tracking" value="Ruler mode" grade="limited" />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: color.warn + '14' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.warn, marginTop: 6 }} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: color.text }}>Camera tracking comes later</Text>
            <Text style={[type.small, { fontSize: 13, lineHeight: 19 }]}>
              For now you swipe along a ruler instead — just as accurate, a bit slower.
            </Text>
          </View>
        </View>
        <View style={{ gap: 8, padding: 14, borderRadius: 16, backgroundColor: color.surface }}>
          <Text style={type.small}>Swipe speed for this phone</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '600', color: color.text, letterSpacing: -0.2 }}>
              {profile ? `${profile.speedMinCmS} – ${profile.speedMaxCmS} cm/s` : '…'}
            </Text>
            <Text style={[type.small, { color: color.textFaint }]}>
              {profile ? `a reading every ${profile.readingEveryMm.toFixed(1)} mm` : ''}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1 }} />
        {error ? <Button title="Measure again" kind="secondary" onPress={() => setRun((n) => n + 1)} /> : null}
        <Button title="Calibrate now" disabled={!profile} onPress={() => router.push('/calibrate')} />
      </ScrollView>
    </SafeAreaView>
  );
}
