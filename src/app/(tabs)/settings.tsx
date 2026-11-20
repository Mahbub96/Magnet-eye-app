import * as Application from 'expo-application';
import { useMemo } from 'react';
import { Text } from 'react-native';

import MagnetCapture, { type Capabilities, type SensorKey } from '../../../modules/magnet-capture/src';
import { FORMAT_VERSION } from '../../modules/capture/swipeFormat';
import { Banner, Card, Row, Screen, Section, Title } from '../../ui/components';
import { type } from '../../ui/theme';

const LABELS: Record<SensorKey, [string, string]> = {
  magnetometerUncalibrated: ['Magnetometer (raw)', 'Needed: readings without Android’s jumps'],
  magnetometer: ['Magnetometer (calibrated)', 'Fallback'],
  gameRotationVector: ['Game rotation vector', 'Needed: tilt without the compass'],
  accelerometer: ['Accelerometer', 'Swipe start and end'],
  gyroscope: ['Gyroscope', 'Orientation'],
};

export default function SettingsScreen() {
  const caps = useMemo<Capabilities | Error>(() => {
    try {
      return MagnetCapture.getCapabilities();
    } catch (e) {
      return e as Error;
    }
  }, []);

  return (
    <Screen>
      <Title title="Settings" />
      <Section title="This phone" />
      {caps instanceof Error ? (
        <Banner tone="bad" text={caps.message} />
      ) : (
        <>
          <Card>
            <Text style={[type.heading, { fontSize: 15 }]}>
              {caps.manufacturer} {caps.model}
            </Text>
            <Text style={type.small}>Android SDK {caps.sdkInt}</Text>
          </Card>
          {(Object.keys(LABELS) as SensorKey[]).map((k) => {
            const s = caps.sensors[k];
            const fastest = s && s.minDelayUs > 0 ? `${(1e6 / s.minDelayUs).toFixed(0)} Hz max` : 'on change';
            return (
              <Row
                key={k}
                title={LABELS[k][0]}
                sub={s ? `${s.vendor} ${s.name} · ${fastest}${k.startsWith('magnet') ? ` · ±${s.maxRange.toFixed(0)} µT · ${s.resolution.toFixed(3)} µT step` : ''}` : LABELS[k][1]}
                right={s ? 'Found' : 'Missing'}
                tone={s ? 'good' : k === 'magnetometer' ? 'warn' : 'bad'}
              />
            );
          })}
          <Row
            title="High sampling rate"
            sub="Android 12+ caps sensors at 200 Hz without it"
            right={caps.highSamplingRateGranted ? 'Granted' : 'Not granted'}
            tone={caps.highSamplingRateGranted ? 'good' : 'warn'}
          />
        </>
      )}
      <Section title="About" />
      <Text style={type.small}>
        Magnet Eye {Application.nativeApplicationVersion ?? 'dev'} · swipe format v{FORMAT_VERSION} · MIT · open source
      </Text>
    </Screen>
  );
}
