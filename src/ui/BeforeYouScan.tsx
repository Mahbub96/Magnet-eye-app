import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { Banner, Button, TintIcon } from './components';
import { Sheet } from './patterns';
import { color, space, type } from './theme';
import { Text } from './Text';
import type { TrackingMode } from '../modules/capture/swipeFormat';

const TIPS_RULER: [string, string, string][] = [
  ['Tape the magnet down', 'It must not move between swipes.', color.accent],
  ['Wood or plastic table', 'Steel desks and laptops bend the field.', color.accent],
  ['Unplug and remove magnetic cases', 'Charging current and cases add noise.', color.accent],
  ['Keep strong magnets off the screen', 'They can pinch fingers and wipe cards.', color.warn],
];

const TIPS_ARCORE: [string, string, string][] = [
  ['Tape the magnet to the table', 'It must stay in one spot while you scan over it.', color.accent],
  ['Good lighting on the table', 'The camera uses table textures to track 3D position.', color.accent],
  ['Remove magnetic cases', 'Phone cases with metal or magnets add noise.', color.accent],
  ['Wave in smooth curves', 'Move in zigzags, loops, and at 2–3 different heights.', color.good],
];

/** Figma "05 Before you scan": setup tips, then the baseline measurement.
 * In ARCore mode: hold still in the air away from the magnet.
 * In Ruler mode: lay phone flat on the box top. */
export function BeforeYouScan({
  visible,
  trackingMode = 'ruler',
  measuring,
  baselineMs,
  error,
  onStart,
  onClose,
}: {
  visible: boolean;
  trackingMode?: TrackingMode;
  measuring: boolean;
  baselineMs: number;
  error: string | null;
  onStart: () => void;
  onClose: () => void;
}) {
  const isArcore = trackingMode === 'arcore';
  const tips = isArcore ? TIPS_ARCORE : TIPS_RULER;
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!measuring) {
      progress.setValue(0);
      return;
    }
    const a = Animated.timing(progress, {
      toValue: 1,
      duration: baselineMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [measuring, baselineMs, progress]);

  return (
    <Sheet visible={visible} onClose={onClose} locked={measuring}>
        <View style={{ gap: space.xs }}>
          <Text style={[type.title, { fontSize: 20 }]}>Before you scan</Text>
          <Text style={[type.small, { fontSize: 13 }]}>Four things that make a scan accurate and safe.</Text>
        </View>
        <View style={{ gap: space.md }}>
          {tips.map(([t, d, tint]) => (
            <View key={t} style={{ flexDirection: 'row', gap: space.md }}>
              <TintIcon tint={tint} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: color.text }}>{t}</Text>
                <Text style={type.small}>{d}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ gap: space.sm, padding: 14, borderRadius: 14, backgroundColor: color.surface2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: color.text }}>
              {isArcore ? 'Hold phone still in the air' : 'Lay the phone flat on the box top'}
            </Text>
            <Text style={[type.small, { fontSize: 13 }]}>{(baselineMs / 1000).toFixed(0)} s</Text>
          </View>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: color.bg, overflow: 'hidden' }}>
            <Animated.View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: color.good,
                width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }}
            />
          </View>
          <Text style={[type.small, { fontSize: 11, color: color.textFaint }]}>
            {measuring
              ? (isArcore ? 'Hold still · measuring Earth background and locking camera' : 'Hold still · measuring the background field at this spot')
              : (isArcore ? 'Hold phone 50 cm away from the magnet for 2s. This zeroes out background noise.' : 'Top along +y, magnet at least 50 cm away for now. This measures the background field.')}
          </Text>
        </View>

        {error && !measuring ? <Banner tone="warn" text={error} /> : null}
        <Button title={measuring ? 'Measuring…' : error ? 'Try again' : 'Start scanning'} busy={measuring} onPress={onStart} />
    </Sheet>
  );
}
