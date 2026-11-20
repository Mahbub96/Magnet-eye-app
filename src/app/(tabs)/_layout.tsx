import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';

import { getSetting, ONBOARDED } from '../../db/settings';
import { color } from '../../ui/theme';

/** Minimal line icons drawn with views, matching the Figma tab bar. */
function Icon({ name, active }: { name: 'scan' | 'saved' | 'settings'; active: boolean }) {
  const c = active ? color.accent : color.textFaint;
  if (name === 'scan')
    return (
      <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
      </View>
    );
  if (name === 'saved')
    return (
      <View style={{ gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: c }} />
        ))}
      </View>
    );
  return (
    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 2, borderColor: c }} />
    </View>
  );
}

export default function TabsLayout() {
  // First run: welcome and phone check before the app itself.
  if (getSetting(ONBOARDED) !== '1') return <Redirect href="/welcome" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: color.bg, borderTopColor: color.border },
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.textFaint,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Scan', tabBarIcon: ({ focused }) => <Icon name="scan" active={focused} /> }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved', tabBarIcon: ({ focused }) => <Icon name="saved" active={focused} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ focused }) => <Icon name="settings" active={focused} /> }} />
    </Tabs>
  );
}
