import { router } from 'expo-router';
import { Linking } from 'react-native';

import { CenteredState } from '../ui/patterns';
import { color } from '../ui/theme';

/** Figma "10 Permission denied". Shown when camera tracking (ARCore, Phase 6) is chosen but
 * the camera permission is off. */
export default function CameraOffScreen() {
  return (
    <CenteredState
      tint={color.accent}
      glyph="◉"
      title="Camera access is off"
      text="Magnet Eye uses the camera only to track where the phone is (ARCore). Nothing is recorded or uploaded."
      primary={{ title: 'Open Android settings', onPress: () => void Linking.openSettings() }}
      secondary={{ title: 'Use ruler mode instead', onPress: () => (router.canGoBack() ? router.back() : router.replace('/')) }}
    />
  );
}
