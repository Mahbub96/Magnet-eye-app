import * as Application from 'expo-application';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { getServerUrl } from '../../api/server';
import { activeProfile, resetProfiles } from '../../db/profiles';
import { getSetting, setSetting, TRACKING_PREFERENCE } from '../../db/settings';
import { requestCameraPermission } from '../../modules/capture/permissions';
import { useRecorder } from '../../store/recorder';
import MagnetCapture, { type Capabilities, type SensorKey } from '../../../modules/magnet-capture/src';
import { FORMAT_VERSION } from '../../modules/capture/swipeFormat';
import { Banner, Card, Row, Screen, Section, Title } from '../../ui/components';
import { type } from '../../ui/theme';
import { Text } from '../../ui/Text';

const LABELS: Record<SensorKey, [string, string]> = {
  magnetometerUncalibrated: ['Magnetometer (raw)', 'Needed: readings without Android’s jumps'],
  magnetometer: ['Magnetometer (calibrated)', 'Fallback'],
  gameRotationVector: ['Game rotation vector', 'Needed: tilt without the compass'],
  accelerometer: ['Accelerometer', 'Swipe start and end'],
  gyroscope: ['Gyroscope', 'Orientation'],
};

export default function SettingsScreen() {
  const r = useRecorder();
  const [profile, setProfile] = useState(activeProfile);
  const [trackingPref, setTrackingPref] = useState(() => getSetting(TRACKING_PREFERENCE) ?? 'auto');
  useFocusEffect(
    useCallback(() => {
      setProfile(activeProfile());
      setTrackingPref(getSetting(TRACKING_PREFERENCE) ?? 'auto');
    }, [])
  );
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
      <Section title="Setup" />
      <Card>
        <Row
          title="Server"
          sub={getServerUrl() ?? 'Not set: swipes wait on the phone'}
          right="›"
          onPress={() => router.push('/server')}
        />
      </Card>
      <Card>
        <Row
          title="Calibration profile"
          sub={
            profile
              ? `${new Date(profile.created_at).toLocaleDateString()} · ${profile.fit_model} fit ±${profile.residual_ut.toFixed(1)} µT · own field ${Math.hypot(...profile.hard_iron_ut).toFixed(0)} µT`
              : 'None: Android’s own estimate is used'
          }
          right={profile ? 'Reset' : undefined}
          tone={profile ? 'good' : 'warn'}
          onPress={
            profile
              ? () =>
                  Alert.alert('Reset calibration?', 'Scanning goes back to Android’s own estimate until you calibrate again.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Reset',
                      style: 'destructive',
                      onPress: () => {
                        resetProfiles();
                        setProfile(null);
                      },
                    },
                  ])
              : undefined
          }
        />
      </Card>
      <Card>
        <Row
          title="Calibrate"
          sub="Figure eight, background field and noise (about 30 s)"
          right="›"
          onPress={() => router.push({ pathname: '/calibrate', params: { from: 'settings' } })}
        />
      </Card>
      <Card>
        <Row
          title="Re-run phone check"
          sub="Test the sensors again, e.g. after an Android update"
          right="›"
          onPress={() => router.push({ pathname: '/device-check', params: { from: 'settings' } })}
        />
      </Card>
      <Card>
        <Row
          title="Tracking mode"
          sub={
            trackingPref === 'auto'
              ? `Auto: using ${r.trackingMode === 'arcore' ? 'ARCore (3D Freeform)' : 'Ruler on Paper'}`
              : trackingPref === 'arcore'
              ? 'Forced: ARCore 3D Freeform (Camera)'
              : 'Forced: Ruler on Paper'
          }
          right={trackingPref === 'auto' ? 'Auto ›' : trackingPref === 'arcore' ? 'ARCore ›' : 'Ruler ›'}
          tone={r.trackingMode === 'arcore' ? 'good' : 'info'}
          onPress={() => {
            const arStatus = caps instanceof Error ? 'unknown' : caps.arcoreStatus;
            const arText =
              arStatus === 'ready'
                ? 'Ready'
                : arStatus === 'needs_install'
                ? 'Needs Google Play Services for AR'
                : 'Device hardware unsupported';

            Alert.alert(
              'Select Tracking Mode',
              `Phone ARCore status: ${arText}`,
              [
                {
                  text: 'Auto (Recommended)',
                  onPress: () => {
                    setSetting(TRACKING_PREFERENCE, 'auto');
                    setTrackingPref('auto');
                    const target = arStatus === 'ready' ? 'arcore' : 'ruler';
                    r.setTrackingMode(target);
                  },
                },
                {
                  text: 'ARCore 3D Freeform',
                  onPress: async () => {
                    if (arStatus === 'needs_install') {
                      Alert.alert(
                        'Install Google Play Services for AR',
                        'ARCore needs to be installed or updated from Google Play Store.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Open Play Store', onPress: () => Linking.openURL('market://details?id=com.google.ar.core') },
                        ],
                      );
                      return;
                    }
                    if (arStatus === 'unsupported') {
                      Alert.alert('Unsupported', 'This phone hardware does not support ARCore camera tracking.');
                      return;
                    }
                    const ok = await requestCameraPermission();
                    if (ok) {
                      setSetting(TRACKING_PREFERENCE, 'arcore');
                      setTrackingPref('arcore');
                      r.setTrackingMode('arcore');
                    }
                  },
                },
                {
                  text: 'Ruler on Paper',
                  onPress: () => {
                    setSetting(TRACKING_PREFERENCE, 'ruler');
                    setTrackingPref('ruler');
                    r.setTrackingMode('ruler');
                  },
                },
                { text: 'Cancel', style: 'cancel' },
              ],
            );
          }}
        />
      </Card>
      {!(caps instanceof Error) && caps.arcoreStatus === 'needs_install' ? (
        <Card>
          <Row
            title="Install ARCore"
            sub="Install Google Play Services for AR to unlock freeform 3D camera tracking"
            right="Install ›"
            tone="warn"
            onPress={() => Linking.openURL('market://details?id=com.google.ar.core')}
          />
        </Card>
      ) : null}

      <Section title="About" />
      <Card>
        <Row
          title={`Magnet Eye ${Application.nativeApplicationVersion ?? 'dev'}`}
          sub={`Swipe format v${FORMAT_VERSION} · API v1 · free and open source, MIT licence`}
        />
      </Card>
      <Text style={[type.small, { lineHeight: 18 }]}>
        Results are estimates with their uncertainty: a magnetisation pattern consistent with the measured field, not a
        view inside the magnet. Scans are saved on this phone; the server forgets uploads after 30 minutes.
      </Text>
      {__DEV__ ? (
        <>
          <Section title="Development" />
          <Card>
            <Row title="Design preview" sub="Every Figma screen, for review" right="›" onPress={() => router.push('/preview')} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
