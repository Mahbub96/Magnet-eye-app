import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import type { FullResult } from '../../api/result';
import { readResult } from '../../db/export';
import { getScan } from '../../db/scans';
import { Banner, Button, Chip, Screen, Stat, Title } from '../../ui/components';
import { ExportSheet } from '../../ui/ExportSheet';
import { FieldView3D, type FieldViewHandle } from '../../ui/FieldView3D';
import { Text } from '../../ui/Text';
import { color, space, type } from '../../ui/theme';

const WARNINGS: Record<string, string> = {
  magnet_may_have_moved: 'The last swipe does not fit the earlier ones: the magnet or table may have moved.',
  high_residual: 'The fit stays poor with good coverage: iron or another magnet may be nearby.',
  saturated_readings_dropped: 'Some readings hit the sensor limit and were left out.',
};

/** Figma "07 Results". `id` is a saved scan; in a development build `sample` shows the
 * formula-made sample from src/dev for design review. */
export default function ResultsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isSample = __DEV__ && id === 'sample';
  const [result, setResult] = useState<FullResult | null>(null);
  const [missing, setMissing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const view = useRef<FieldViewHandle>(null);
  const name = isSample ? 'Sample disc magnet' : (getScan(id)?.name ?? 'Scan');

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = isSample ? (await import('../../dev/sample')).sampleResult() : await readResult(id);
      if (!alive) return;
      if (r) setResult(r);
      else setMissing(true);
    })();
    return () => {
      alive = false;
    };
  }, [id, isSample]);

  const moment = result ? Math.hypot(...result.magnet.moment_am2) : 0;
  const momentSigma = result ? Math.hypot(...result.magnet.moment_sigma_am2) : 0;
  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={12}>
        <Text style={[type.small, { color: color.accent }]}>‹ Back</Text>
      </Pressable>
      <Title label="Result" title={name} />
      {missing ? <Banner tone="warn" text="This scan has no fit yet. It appears once its swipes are uploaded and fitted." /> : null}
      {result ? (
        <>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {isSample ? <Chip text="Sample data · not a measurement" tone="warn" /> : null}
            <Chip text={`Uncertainty ±${Math.round(result.relative_uncertainty * 100)}%`} tone={result.relative_uncertainty <= 0.15 ? 'good' : 'warn'} />
            <Chip text={`${result.swipes} swipes`} tone="info" />
          </View>
          <FieldView3D ref={view} result={result} />
          <Legend />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Stat label="Strength" value={moment.toFixed(2)} unit="A·m²" note={`± ${momentSigma.toFixed(2)}`} />
            <Stat label="Finest detail" value={(result.finest_detail_m * 1000).toFixed(0)} unit="mm" note="at this scan height" />
          </View>
          <Text style={[type.small, { lineHeight: 18 }]}>{result.label}</Text>
          {result.warnings.map((w) => (
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
  );
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
