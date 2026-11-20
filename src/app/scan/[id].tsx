import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';


import { deleteScan, getScan, listSwipes } from '../../db/scans';
import type { ResultSummary } from '../../db/sync';
import { Banner, Button, Row, Screen, Section, Stat, Title } from '../../ui/components';
import { ExportSheet } from '../../ui/ExportSheet';
import { color, space, type } from '../../ui/theme';
import { Text } from '../../ui/Text';

async function share(uri: string, title: string) {
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert('Sharing unavailable', 'This phone cannot open the share sheet.');
    return;
  }
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: title });
}

const WARNINGS: Record<string, string> = {
  magnet_may_have_moved: 'The last swipe does not fit the earlier ones: the magnet or table may have moved.',
  high_residual: 'The fit stays poor with good coverage: iron or another magnet may be nearby.',
  saturated_readings_dropped: 'Some readings hit the sensor limit and were left out.',
};

export default function ScanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scan = useMemo(() => getScan(id), [id]);
  const swipes = useMemo(() => listSwipes(id), [id]);
  const summary = scan?.result_summary ? (JSON.parse(scan.result_summary) as ResultSummary) : null;
  const [exporting, setExporting] = useState(false);

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

      {summary ? (
        <>
          <Section title="Latest fit" />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Stat label="Uncertainty" value={`±${Math.round(summary.relative_uncertainty * 100)}`} unit="%" />
            <Stat label="Finest detail" value={(summary.finest_detail_m * 1000).toFixed(0)} unit="mm" />
            <Stat label="Strength" value={Math.hypot(...summary.moment_am2).toFixed(2)} unit="A·m²" />
          </View>
          <Text style={type.small}>
            Estimate from {summary.swipes} swipes: a magnetisation pattern consistent with the measured field, not a view
            inside the magnet. The 3D view comes in a later version.
          </Text>
          {summary.warnings.map((w) => (
            <Banner key={w} tone="warn" text={WARNINGS[w] ?? w} />
          ))}
        </>
      ) : null}

      <Section title="Swipes" />
      {swipes.map((w) => (
        <Row
          key={w.id}
          title={`Swipe ${w.ord + 1}`}
          sub={`${w.mag_samples} readings · ${w.duration_s.toFixed(1)} s · ${w.mag_rate_hz.toFixed(0)} Hz${
            w.mean_speed_m_s ? ` · ${(w.mean_speed_m_s * 100).toFixed(1)} cm/s` : ''
          }`}
          right={w.upload_state === 'uploaded' ? 'Uploaded · Share' : w.upload_state === 'rejected' ? 'Refused · Share' : 'Waiting · Share'}
          tone={w.upload_state === 'rejected' || w.saturated_samples ? 'warn' : 'good'}
          onPress={() => share(w.file_uri, `Swipe ${w.ord + 1}`)}
        />
      ))}

      {summary ? (
        <Button
          title="View result"
          style={{ marginTop: space.md }}
          onPress={() => router.push({ pathname: '/results/[id]', params: { id } })}
        />
      ) : null}
      <Button title="Export…" kind="secondary" disabled={swipes.length === 0} onPress={() => setExporting(true)} />
      <ExportSheet
        visible={exporting}
        onClose={() => setExporting(false)}
        scanId={id}
        name={scan.name}
        hasResult={!!summary}
      />
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
