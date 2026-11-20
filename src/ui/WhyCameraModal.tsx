import { View } from 'react-native';

import { Button, TintIcon } from './components';
import { Sheet } from './patterns';
import { color, radius, space, type } from './theme';
import { Text } from './Text';

export function WhyCameraModal({
  visible,
  onAllow,
  onUseRuler,
  onClose,
}: {
  visible: boolean;
  onAllow: () => void;
  onUseRuler: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ gap: space.sm }}>
        <Text style={[type.title, { fontSize: 20 }]}>Why We Need the Camera</Text>
        <Text style={[type.small, { fontSize: 13, color: color.accent }]}>
          Visual 3D Positioning · Complete Local Privacy
        </Text>
      </View>

      <View style={{ gap: space.md, marginVertical: space.xs }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <TintIcon tint={color.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: color.text }}>
              The Magnetic Sensor Has No Eyes
            </Text>
            <Text style={[type.small, { lineHeight: 18 }]}>
              The phone’s magnetometer feels magnetic strength, but has zero knowledge of where it is in physical space. The camera tracks 3D (x, y, z) position at 60 frames per second.
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
          <TintIcon tint={color.good} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: color.text }}>
              Scan in Freeform 3D (No Ruler Needed)
            </Text>
            <Text style={[type.small, { lineHeight: 18 }]}>
              With camera tracking, you can wave the phone freely in zigzags, curves, and at different heights over the magnet.
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            gap: space.md,
            alignItems: 'flex-start',
            padding: 12,
            borderRadius: radius.md,
            backgroundColor: color.surface2,
            borderWidth: 1,
            borderColor: color.border,
          }}
        >
          <TintIcon tint={color.good} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: color.good }}>
              100% On-Device & Private
            </Text>
            <Text style={[type.small, { fontSize: 12, lineHeight: 17 }]}>
              Camera frames are analyzed purely in real-time RAM to measure motion. No photos or videos are ever recorded, saved to your phone, or sent to any server.
            </Text>
          </View>
        </View>
      </View>

      <View style={{ gap: space.sm, marginTop: space.xs }}>
        <Button title="Allow Camera & Continue" onPress={onAllow} />
        <Button title="Use Ruler Mode Instead" kind="secondary" onPress={onUseRuler} />
      </View>
    </Sheet>
  );
}
