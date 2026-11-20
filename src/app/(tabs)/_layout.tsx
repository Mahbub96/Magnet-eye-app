import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { getSetting, ONBOARDED } from '../../db/settings';
import { TabIcon } from '../../ui/icons';
import { color, font } from '../../ui/theme';

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
        tabBarLabelStyle: { fontSize: 11, fontFamily: font, fontWeight: '500' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Scan', tabBarIcon: ({ focused }) => <TabIcon name="scan" tint={focused ? color.accent : color.textFaint} /> }} />
      <Tabs.Screen name="saved" options={{ title: 'Saved', tabBarIcon: ({ focused }) => <TabIcon name="saved" tint={focused ? color.accent : color.textFaint} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ focused }) => <TabIcon name="settings" tint={focused ? color.accent : color.textFaint} /> }} />
    </Tabs>
  );
}
