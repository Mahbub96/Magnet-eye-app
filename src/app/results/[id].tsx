import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { FullResult } from '../../api/result';
import { readResult } from '../../db/export';
import { getScan } from '../../db/scans';
import { useSync } from '../../sync/useSync';
import { Banner, Button, Card, Chip, Screen, Stat, Title } from '../../ui/components';
import { ErrorBoundary } from '../../ui/ErrorBoundary';
import { ExportSheet } from '../../ui/ExportSheet';
import { FieldView3D, type FieldViewHandle } from '../../ui/FieldView3D';
import { Text } from '../../ui/Text';
import { color, space, type } from '../../ui/theme';

const WARNINGS: Record<string, string> = {
  magnet_may_have_moved: 'The last swipe does not fit the earlier ones: the magnet or table may have moved.',
  high_residual: 'The fit stays poor with good coverage: iron or another magnet may be nearby.',
  saturated_readings_dropped: 'Some readings hit the sensor limit and were left out.',
};

/** 07 Results Screen with offline safety, network retry, and 3D crash resilience */
export default function ResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isSample = __DEV__ && id === 'sample';
  const [result, setResult] = useState<FullResult | null>(null);
  const [missing, setMissing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const view = useRef<FieldViewHandle>(null);
  const scan = useMemoScan(id);
  const name = isSample ? 'Sample disc magnet' : (scan?.name ?? 'Scan');

  const { status: syncStatus, pending, kick } = useSync();

  const loadData = async () => {
    try {
      const r = isSample ? (await import('../../dev/sample')).sampleResult() : await readResult(id);
      if (r) {
        setResult(r);
        setMissing(false);
      } else {
        setMissing(true);
      }
    } catch (e) {
      console.warn('[ResultsScreen] Error loading result:', e);
      setMissing(true);
    }
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!alive) return;
      await loadData();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isSample, syncStatus]);

  const moment = result?.magnet?.moment_am2
    ? Math.hypot(...result.magnet.moment_am2.map((v) => (isFinite(v) ? v : 0)))
    : 0;
  const momentSigma = result?.magnet?.moment_sigma_am2
    ? Math.hypot(...result.magnet.moment_sigma_am2.map((v) => (isFinite(v) ? v : 0)))
    : 0;
  const uncPercent = isFinite(result?.relative_uncertainty as number)
    ? Math.round((result?.relative_uncertainty ?? 0) * 100)
    : 0;
  const detailMm = isFinite(result?.finest_detail_m as number)
    ? ((result?.finest_detail_m ?? 0) * 1000).toFixed(0)
    : '—';

  return (
    <ErrorBoundary>
      <Screen>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[type.small, { color: color.accent }]}>‹ Back</Text>
        </Pressable>
        <Title label="Result" title={name} />

        {/* Offline & Pending Upload Safety Fallback */}
        {missing ? (
          <Card style={{ marginVertical: space.md, gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Text style={{ fontSize: 20 }}>📡</Text>
              <Text style={[type.title, { fontSize: 16 }]}>Awaiting 3D Field Inversion</Text>
            </View>

            <Text style={[type.body, { color: color.textDim }]}>
              {syncStatus === 'syncing'
                ? 'Uploading scan swipes and computing regularized inverse solution...'
                : syncStatus === 'offline'
                  ? 'Your phone is currently offline. All raw sensor swipes are safely saved in local storage and will automatically solve once reconnected.'
                  : syncStatus === 'no_server'
                    ? 'No backend service URL configured. Configure your server in Settings to solve this scan.'
                    : syncStatus === 'busy'
                      ? 'The backend server worker is currently processing another job. It will retry automatically in a moment.'
                      : 'The 3D field has not been computed yet for this scan.'}
            </Text>

            {pending > 0 ? (
              <Chip text={`${pending} swipe${pending > 1 ? 's' : ''} queued for upload`} tone="warn" />
            ) : null}

            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
              <Button
                title={syncStatus === 'syncing' ? 'Syncing…' : 'Sync & Solve Now'}
                disabled={syncStatus === 'syncing'}
                style={{ flex: 1 }}
                onPress={() => {
                  kick();
                  void loadData();
                }}
              />
              <Button
                title="Server URL"
                kind="secondary"
                onPress={() => router.push('/connection')}
              />
            </View>
          </Card>
        ) : null}

        {result ? (
          <>
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              {isSample ? <Chip text="Sample data · not a measurement" tone="warn" /> : null}
              <Chip
                text={`Uncertainty ±${uncPercent}%`}
                tone={(result.relative_uncertainty ?? 1) <= 0.15 ? 'good' : 'warn'}
              />
              <Chip text={`${result.swipes ?? 0} swipes`} tone="info" />
            </View>

            <FieldView3D ref={view} result={result} />

            <Legend />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Stat label="Strength" value={moment.toFixed(2)} unit="A·m²" note={`± ${momentSigma.toFixed(2)}`} />
              <Stat label="Finest detail" value={detailMm} unit="mm" note="at this scan height" />
            </View>
            <Text style={[type.small, { lineHeight: 18 }]}>{result.label ?? ''}</Text>
            {(result.warnings ?? []).map((w) => (
              <Banner key={w} tone="warn" text={WARNINGS[w] ?? w} />
            ))}
            <Button title="Export…" kind="secondary" onPress={() => setExporting(true)} />
            <ExportSheet
              visible={exporting}
              onClose={() => setExporting(false)}
              scanId={isSample ? '' : id}
              name={name}
              hasResult={!isSample}
              onImage={() => view.current?.snapshot() ?? Promise.resolve(null)}
            />
          </>
        ) : null}
      </Screen>
    </ErrorBoundary>
  );
}

function useMemoScan(id: string) {
  const [scan, setScan] = useState(() => getScan(id));
  useEffect(() => {
    setScan(getScan(id));
  }, [id]);
  return scan;
}

function Legend() {
  const dot = (c: string, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
      <Text style={type.small}>{label}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        {dot(color.north, 'North up')}
        {dot(color.south, 'South up')}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={type.small}>weak</Text>
        <View style={{ flexDirection: 'row', height: 6, width: 70, borderRadius: 3, overflow: 'hidden' }}>
          <View style={{ flex: 1, backgroundColor: color.accent }} />
          <View style={{ flex: 1, backgroundColor: '#B8A8A2' }} />
          <View style={{ flex: 1, backgroundColor: color.warn }} />
        </View>
        <Text style={type.small}>strong</Text>
      </View>
    </View>
  );
}
