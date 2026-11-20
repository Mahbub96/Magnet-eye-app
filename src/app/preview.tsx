import { type Href, Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { BeforeYouScan } from '../ui/BeforeYouScan';
import { Screen, Title } from '../ui/components';
import { MagnetMoved } from '../ui/MagnetMoved';
import { ListCard, ListRow } from '../ui/patterns';
import { Text } from '../ui/Text';
import { color, type } from '../ui/theme';

/** DEVELOPMENT BUILD ONLY: every Figma screen in one list, for design review. */
const ROUTES: [string, string, Href][] = [
  ['01 Welcome', 'First launch', '/welcome'],
  ['02 Checking your phone', 'Live sensor report', { pathname: '/device-check', params: { from: 'settings' } }],
  ['03 Your phone can scan', 'Measures for 2 s', '/capability'],
  ['04 Calibrate', 'Live figure-eight coverage', { pathname: '/calibrate', params: { from: 'settings' } }],
  ['07 Results', 'Sample data', { pathname: '/results/[id]', params: { id: 'sample' } }],
  ['10 Camera access is off', 'Phase 6', '/camera-off'],
  ['11 No magnetometer', 'Edge state', '/no-magnetometer'],
  ['12 Needs a connection', 'Live upload state', '/connection'],
  ['Server', 'Settings', '/server'],
];

export default function PreviewScreen() {
  const [sheet, setSheet] = useState(false);
  const [moved, setMoved] = useState(false);
  if (!__DEV__) return <Redirect href="/" />;
  const row = (title: string, detail: string, onPress: () => void) => (
    <Pressable key={title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <ListRow title={title} detail={detail} trailing="›" trailingTint={color.textFaint} />
    </Pressable>
  );
  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={[type.small, { color: color.accent }]}>‹ Settings</Text>
      </Pressable>
      <Title label="Development build" title="Design preview" sub="Every screen of the Figma design. Sample data is labelled." />
      <ListCard>
        {ROUTES.map(([t, d, href]) => row(t, d, () => router.push(href)))}
        {row('05 Before you scan', 'Sheet (does not start a scan here)', () => setSheet(true))}
        {row('13 Did the magnet move?', 'Dialog', () => setMoved(true))}
      </ListCard>
      <BeforeYouScan
        visible={sheet}
        measuring={false}
        baselineMs={2000}
        error={null}
        onStart={() => setSheet(false)}
        onClose={() => setSheet(false)}
      />
      <MagnetMoved visible={moved} onRestart={() => setMoved(false)} onKeepGoing={() => setMoved(false)} />
    </Screen>
  );
}
