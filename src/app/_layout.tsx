import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSync } from '../sync/useSync';
import { color } from '../ui/theme';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: color.bg, card: color.bg, primary: color.accent },
};

export default function RootLayout() {
  // Upload queue: try once at start, and again whenever the network comes back.
  useEffect(() => useSync.getState().start(), []);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
