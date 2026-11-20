import { router } from 'expo-router';
import { Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../ui/components';
import { color, space, type } from '../ui/theme';

const HIGHLIGHTS: [string, string][] = [
  ['No extra hardware', 'Uses the sensors already in your phone'],
  ['Any shape', 'Rings, bars, discs, even broken magnets'],
  ['Private', 'Your scans are saved on your phone'],
];

/** Figma "01 Welcome", first screen of the first run. */
export default function WelcomeScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingVertical: space.xl }}>
        <View style={{ flex: 1 }} />
        <Image
          source={require('../../assets/splash-icon.png')}
          style={{ width: 120, height: 120, marginLeft: -10 }}
          accessibilityIgnoresInvertColors
        />
        <Text style={{ marginTop: 32, fontSize: 32, fontWeight: '700', color: color.text, letterSpacing: -0.6 }}>
          Magnet Eye
        </Text>
        <Text style={[type.body, { marginTop: 10, fontSize: 16, lineHeight: 24 }]}>
          See the magnetic field around any magnet. Just your phone and a few swipes.
        </Text>
        <View style={{ flex: 1 }} />
        <View style={{ gap: 12 }}>
          {HIGHLIGHTS.map(([t, d]) => (
            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent }} />
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: color.text }}>{t}</Text>
                <Text style={[type.small, { fontSize: 13 }]}>{d}</Text>
              </View>
            </View>
          ))}
        </View>
        <Button title="Get started" onPress={() => router.push('/device-check')} style={{ marginTop: 28 }} />
        <Text style={[type.small, { marginTop: 12, textAlign: 'center', color: color.textFaint }]}>
          Free and open source · MIT
        </Text>
      </View>
    </SafeAreaView>
  );
}
