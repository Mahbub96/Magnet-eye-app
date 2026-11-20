import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { type SyncStatus, useSync } from '../sync/useSync';
import { CenteredState } from '../ui/patterns';
import { Text } from '../ui/Text';
import { color, space, type } from '../ui/theme';

const COPY: Record<SyncStatus, { title: string; text: string; tint: string; glyph: string }> = {
  offline: {
    title: 'Scanning needs a connection',
    text: 'Swipes are saved on your phone and will upload when you’re back online. Checks, calibration and saved scans still work offline.',
    tint: color.warn,
    glyph: '⇅',
  },
  busy: {
    title: 'The server is busy',
    text: 'Your swipes are safe on your phone. They will upload by themselves as soon as the server has room.',
    tint: color.warn,
    glyph: '⇅',
  },
  no_server: {
    title: 'No server set',
    text: 'Magnet Eye sends swipes to a Magnet Eye server to rebuild the field. Add its address to start uploading. Swipes wait on your phone until then.',
    tint: color.warn,
    glyph: '⇅',
  },
  blocked: {
    title: 'App and server don’t match',
    text: 'The server refused the upload. Update the app, or point it at a server for this version.',
    tint: color.bad,
    glyph: '!',
  },
  syncing: {
    title: 'Uploading',
    text: 'Sending your swipes and waiting for the fit.',
    tint: color.accent,
    glyph: '⇅',
  },
  idle: {
    title: 'Connected',
    text: 'All swipes are uploaded.',
    tint: color.good,
    glyph: '✓',
  },
};

/** Figma "12 Offline": why uploads are waiting, how many, and when the next try is. */
export default function ConnectionScreen() {
  const { status, message, pending, retryAt, kick } = useSync();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const c = COPY[status];
  const secs = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : null;
  return (
    <CenteredState
      tint={c.tint}
      glyph={c.glyph}
      title={status === 'idle' && pending > 0 ? 'Waiting to upload' : c.title}
      text={c.text}
      extra={
        <View style={{ alignSelf: 'stretch', gap: space.sm, padding: 14, borderRadius: 14, backgroundColor: color.surface }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: color.text }}>Waiting to upload</Text>
            <Text style={[type.small, { fontSize: 13 }]}>
              {pending} swipe{pending === 1 ? '' : 's'}
            </Text>
          </View>
          {secs !== null || message ? (
            <Text style={[type.small, { color: color.textFaint }]}>
              {[secs !== null ? `Retrying in ${secs} s` : null, message].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      }
      primary={{ title: 'Retry now', onPress: kick }}
      secondary={{ title: 'Change server', onPress: () => router.push('/server') }}
    />
  );
}
