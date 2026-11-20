import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';


import { deleteScan, exportScan, getScan, listSwipes } from '../../db/scans';
import { Banner, Button, Row, Screen, Section, Stat, Title } from '../../ui/components';
import { color, space, type } from '../../ui/theme';
import { Text } from '../../ui/Text';

async function share(uri: string, title: string) {
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert('Sharing unavailable', 'This phone cannot open the share sheet.');
    return;
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: title });
}

export default function ScanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scan = useMemo(() => getScan(id), [id]);
  const swipes = useMemo(() => listSwipes(id), [id]);
  const [busy, setBusy] = useState(false);

  if (!scan) {
    return (
      <Screen>
        <Title title="Scan not found" />
        <Button title="Back" kind="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const rate = swipes.length ? swipes.reduce((s, w) => s + w.mag_rate_hz, 0) / swipes.length : 0;
  const sat = swipes.reduce((s, w) => s + w.saturated_samples, 0);
  const size = swipes.reduce((s, w) => s + (new File(w.file_uri).size ?? 0), 0);

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={[type.small, { color: color.accent }]}>‹ Saved scans</Text>
      </Pressable>
      <Title
        title={scan.name}
        sub={`${new Date(scan.created_at).toLocaleString()} · ${swipes.length} swipes · ${scan.tracking_mode}`}
      />
      {scan.status !== 'finished' ? (
        <Banner tone="warn" text="Unfinished: no end baseline. The backend can still use these swipes." />
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Stat label="Mean rate" value={rate.toFixed(0)} unit="Hz" />
        <Stat label="Saturated" value={String(sat)} tone={sat ? 'warn' : 'good'} note={sat ? 'readings' : 'none'} />
        <Stat label="Size" value={(size / 1e6).toFixed(1)} unit="MB" />
      </View>

      <Section title="Swipes" />
      {swipes.map((w) => (
        <Row
          key={w.id}
          title={`Swipe ${w.ord + 1}`}
          sub={`${w.mag_samples} readings · ${w.duration_s.toFixed(1)} s · ${w.mag_rate_hz.toFixed(0)} Hz${
            w.mean_speed_m_s ? ` · ${(w.mean_speed_m_s * 100).toFixed(1)} cm/s` : ''
          }`}
          right="Share"
          tone={w.saturated_samples ? 'warn' : 'good'}
          onPress={() => share(w.file_uri, `Swipe ${w.ord + 1}`)}
        />
      ))}

      <Button
        title="Export full scan (JSON)"
        busy={busy}
        disabled={swipes.length === 0}
        style={{ marginTop: space.md }}
        onPress={async () => {
          setBusy(true);
          try {
            const f = await exportScan(id);
            await share(f.uri, scan.name);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Text style={[type.small, { textAlign: 'center' }]}>
        Opens the Android share sheet. Nothing is sent to the Magnet Eye server.
      </Text>
      <Button
        title="Delete scan"
        kind="danger"
        onPress={() =>
          Alert.alert('Delete this scan?', 'Its swipe files are removed from the phone. This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                deleteScan(id);
                router.back();
              },
            },
          ])
        }
      />
    </Screen>
  );
}
