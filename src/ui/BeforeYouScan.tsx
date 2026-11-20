import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { Banner, Button, TintIcon } from './components';
import { Sheet } from './patterns';
import { color, space, type } from './theme';
import { Text } from './Text';

const TIPS: [string, string, string][] = [
  ['Tape the magnet down', 'It must not move between swipes.', color.accent],
  ['Wood or plastic table', 'Steel desks and laptops bend the field.', color.accent],
  ['Unplug and remove magnetic cases', 'Charging current and cases add noise.', color.accent],
  ['Keep strong magnets off the screen', 'They can pinch fingers and wipe cards.', color.warn],
];

/** Figma "05 Before you scan": setup tips, then the baseline measurement (ruler mode: phone
 * flat on the paper, magnet away). The bar fills over the baseline time while it runs. */
export function BeforeYouScan({
  visible,
  measuring,
  baselineMs,
  error,
  onStart,
  onClose,
}: {
  visible: boolean;
  measuring: boolean;
  baselineMs: number;
  error: string | null;
  onStart: () => void;
  onClose: () => void;
}) {
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
          {TIPS.map(([t, d, tint]) => (
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
            <Text style={{ fontSize: 13, fontWeight: '500', color: color.text }}>Lay the phone flat on the box top</Text>
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
              ? 'Hold still · measuring the background field at this spot'
              : 'Top along +y, magnet at least 50 cm away for now. This measures the background field.'}
          </Text>
        </View>

        {error && !measuring ? <Banner tone="warn" text={error} /> : null}
        <Button title={measuring ? 'Measuring…' : error ? 'Try again' : 'Start scanning'} busy={measuring} onPress={onStart} />
    </Sheet>
  );
}
