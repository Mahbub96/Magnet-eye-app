import { Modal, View } from 'react-native';

import { Button } from './components';
import { Text } from './Text';
import { color, space, type } from './theme';

/** Figma "13 Magnet moved": the server's fit says the last swipe does not fit the earlier
 * ones (PR-19). */
export function MagnetMoved({ visible, onRestart, onKeepGoing }: {
  visible: boolean;
  onRestart: () => void;
  onKeepGoing: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onKeepGoing} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
        <View style={{ gap: 14, padding: 22, borderRadius: 24, backgroundColor: color.surface }}>
          <View
            style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: color.warn + '24', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 26, fontWeight: '600', color: color.warn }}>↻</Text>
          </View>
          <Text style={[type.title, { fontSize: 20 }]}>Did the magnet move?</Text>
          <Text style={[type.body, { lineHeight: 21 }]}>
            The last swipe doesn’t fit the earlier ones. If the magnet or table shifted, the picture would be wrong.
          </Text>
          <View style={{ gap: 10, marginTop: space.xs }}>
            <Button title="Restart this scan" onPress={onRestart} />
            <Button title="Keep going — it didn’t move" kind="ghost" onPress={onKeepGoing} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
