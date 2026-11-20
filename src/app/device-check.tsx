import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import MagnetCapture, { type Capabilities } from '../../modules/magnet-capture/src';
import { ONBOARDED, setSetting } from '../db/settings';
import { canScan, type CheckStatus, deviceChecks } from '../modules/capture/deviceCheck';
import { Banner, Button, ProgressBar, TintIcon } from '../ui/components';
import { ListCard, ListRow } from '../ui/patterns';
import { color, space, type } from '../ui/theme';
import { Text } from '../ui/Text';

const STATUS: Record<CheckStatus | 'testing', { label: string; tint: string }> = {
  ready: { label: 'Ready', tint: color.good },
  limited: { label: 'Limited', tint: color.warn },
  missing: { label: 'Missing', tint: color.bad },
  later: { label: 'Later', tint: color.textFaint },
  testing: { label: 'Testing', tint: color.accent },
};

/** Figma "02 Device check". Every value comes from the phone's own sensor report. */
export default function DeviceCheckScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const caps = useMemo<Capabilities | Error>(() => {
    try {
      return MagnetCapture.getCapabilities();
    } catch (e) {
      return e as Error;
    }
  }, []);
  const checks = caps instanceof Error ? [] : deviceChecks(caps);
  // Reveal one result at a time so each check is readable.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= checks.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), 280);
    return () => clearTimeout(id);
  }, [shown, checks.length]);
  const done = checks.length > 0 && shown >= checks.length;

  const finish = () => {
    if (from === 'settings' && router.canGoBack()) router.back();
    else if (!(caps instanceof Error) && canScan(caps)) router.push('/capability');
    else {
      setSetting(ONBOARDED, '1'); // nothing more to set up on a phone that cannot scan
      router.replace('/no-magnetometer');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingVertical: space.xl, gap: 20 }}>
        <View style={{ gap: 6 }}>
          <Text style={type.label}>{from === 'settings' ? 'PHONE CHECK' : 'STEP 1 OF 3'}</Text>
          <Text style={[type.title, { fontSize: 24 }]}>Checking your phone</Text>
          <Text style={[type.body, { lineHeight: 21 }]}>
            {caps instanceof Error
              ? 'We test each sensor to tune Magnet Eye to this phone. Nothing is assumed.'
              : `We test each sensor to tune Magnet Eye to this ${caps.manufacturer} ${caps.model}. Nothing is assumed.`}
          </Text>
        </View>

        {caps instanceof Error ? (
          <Banner tone="bad" text={`Could not read the sensors: ${caps.message}`} />
        ) : (
          <ListCard>
            {checks.map((c, i) => {
              const st = STATUS[i < shown ? c.status : 'testing'];
              return (
                <ListRow
                  key={c.key}
                  icon={<TintIcon tint={st.tint} round />}
                  title={c.title}
                  detail={i < shown ? c.detail : 'Testing…'}
                  trailing={st.label}
                  trailingTint={st.tint}
                />
              );
            })}
          </ListCard>
        )}

        <View style={{ flex: 1 }} />
        <View style={{ gap: space.sm }}>
          <ProgressBar value={checks.length ? shown / checks.length : 1} />
          <Text style={type.small}>
            {checks.length ? `${Math.min(shown, checks.length)} of ${checks.length} checks done` : 'Check finished'}
          </Text>
        </View>
        <Button title="Continue" kind="secondary" disabled={!done && !(caps instanceof Error)} onPress={finish} />
      </View>
    </SafeAreaView>
  );
}
