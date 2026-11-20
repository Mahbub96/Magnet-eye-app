import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from './components';
import { color, space, type } from './theme';

/** Figma "11 Phone limitation": the phone has no magnetometer, so it cannot scan. */
export function NoMagnetometer({ onViewSaved }: { onViewSaved: () => void }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingVertical: space.xl }}>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'center', gap: 14 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: color.bad + '24',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 26, fontWeight: '600', color: color.bad }}>!</Text>
          </View>
          <Text style={[type.title, { fontSize: 22, textAlign: 'center' }]}>This phone has no magnetometer</Text>
          <Text style={[type.body, { textAlign: 'center', lineHeight: 21 }]}>
            That’s a hardware limitation of this phone, not a problem with the app. Scanning isn’t possible,
            but you can still open scans shared with you.
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.sm,
              paddingHorizontal: space.md,
              paddingVertical: space.sm,
              borderRadius: 999,
              backgroundColor: color.surface,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.bad }} />
            <Text style={type.small}>Magnetometer: not found</Text>
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <Button title="View saved scans" onPress={onViewSaved} />
      </View>
    </SafeAreaView>
  );
}
