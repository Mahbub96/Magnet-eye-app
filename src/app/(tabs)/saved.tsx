import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { listScans, type ScanRow } from '../../db/scans';
import type { ResultSummary } from '../../db/sync';
import { Card, Row, Screen, Title } from '../../ui/components';
import { type } from '../../ui/theme';
import { Text } from '../../ui/Text';

/** Fitted (with its uncertainty), uploading, or only recorded. */
function stateOf(s: ScanRow): { text: string; tone: 'good' | 'warn' | 'info' } {
  const n = s.swipe_count ?? 0;
  const up = s.uploaded_count ?? 0;
  if (s.result_summary) {
    const r = JSON.parse(s.result_summary) as ResultSummary;
    return { text: `Fitted ±${Math.round(r.relative_uncertainty * 100)}%`, tone: 'good' };
  }
  if (n > 0 && up < n) return { text: `${up}/${n} uploaded`, tone: 'warn' };
  if (s.status !== 'finished') return { text: 'Unfinished', tone: 'warn' };
  return { text: 'Recorded', tone: 'info' };
}

export default function SavedScreen() {
  const [scans, setScans] = useState<ScanRow[]>([]);
  useFocusEffect(useCallback(() => setScans(listScans()), []));

  return (
    <Screen>
      <Title title="Saved scans" sub={`${scans.length} on this phone. The server forgets uploads after 30 minutes.`} />
      {scans.length === 0 ? (
        <Card>
          <Text style={type.body}>No scans yet. Record one from the Scan tab.</Text>
        </Card>
      ) : (
        scans.map((s) => (
          <Row
            key={s.id}
            title={s.name}
            sub={`${new Date(s.created_at).toLocaleString()} · ${s.swipe_count ?? 0} swipes · ${s.tracking_mode}`}
            right={stateOf(s).text}
            tone={stateOf(s).tone}
            onPress={() => router.push({ pathname: '/scan/[id]', params: { id: s.id } })}
          />
        ))
      )}
    </Screen>
  );
}
