import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { listScans, type ScanRow } from '../../db/scans';
import { Card, Row, Screen, Title } from '../../ui/components';
import { type } from '../../ui/theme';
import { Text } from '../../ui/Text';

export default function SavedScreen() {
  const [scans, setScans] = useState<ScanRow[]>([]);
  useFocusEffect(useCallback(() => setScans(listScans()), []));

  return (
    <Screen>
      <Title title="Saved scans" sub={`${scans.length} on this phone. Nothing is stored on the server.`} />
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
            right={s.status === 'finished' ? 'Recorded' : 'Unfinished'}
            tone={s.status === 'finished' ? 'good' : 'warn'}
            onPress={() => router.push({ pathname: '/scan/[id]', params: { id: s.id } })}
          />
        ))
      )}
    </Screen>
  );
}
