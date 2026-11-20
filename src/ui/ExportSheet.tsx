import { useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { exportScan } from '../db/scans';
import { fieldCsv, readResult, share, writeCache } from '../db/export';
import { Sheet, ListCard, ListRow } from './patterns';
import { TintIcon } from './components';
import { Text } from './Text';
import { color, type } from './theme';

/** Figma "14 Export". `onImage` is given only where a 3D view exists to capture. */
export function ExportSheet({ visible, onClose, scanId, name, hasResult, onImage }: {
  visible: boolean;
  onClose: () => void;
  scanId: string;
  name: string;
  hasResult: boolean;
  onImage?: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<boolean>) => {
    setBusy(key);
    try {
      if (!(await fn())) Alert.alert('Nothing to share', 'This phone cannot open the share sheet, or the data is missing.');
    } catch (e) {
      Alert.alert('Export failed', (e as Error).message);
    } finally {
      setBusy(null);
      onClose();
    }
  };
  const safe = name.replace(/[^\w-]+/g, '-').toLowerCase();
  const rows: { key: string; title: string; detail: string; enabled: boolean; go: () => Promise<boolean> }[] = [
    {
      key: 'image',
      title: 'Image',
      detail: onImage ? 'PNG of the current 3D view' : 'Open the result to export its 3D view',
      enabled: !!onImage,
      go: async () => {
        const uri = await onImage!();
        return uri ? share(uri, 'image/png', name) : false;
      },
    },
    {
      key: 'csv',
      title: 'Field data',
      detail: hasResult ? 'CSV · field and uncertainty on a 3D grid' : 'Available once the scan has a fit',
      enabled: hasResult,
      go: async () => {
        const r = await readResult(scanId);
        if (!r) return false;
        const f = await writeCache(`magnet-eye-field-${safe}.csv`, fieldCsv(r));
        return share(f.uri, 'text/csv', name);
      },
    },
    {
      key: 'json',
      title: 'Full scan',
      detail: 'JSON · swipes, calibration, result',
      enabled: true,
      go: async () => share((await exportScan(scanId)).uri, 'application/json', name),
    },
  ];
  return (
    <Sheet visible={visible} onClose={onClose} locked={!!busy}>
      <Text style={[type.title, { fontSize: 18 }]}>Export “{name}”</Text>
      <ListCard style={{ backgroundColor: color.surface2 }}>
        {rows.map((r) => (
          <Pressable
            key={r.key}
            accessibilityRole="button"
            disabled={!r.enabled || !!busy}
            onPress={() => run(r.key, r.go)}
            style={({ pressed }) => ({ opacity: !r.enabled ? 0.45 : pressed ? 0.7 : 1 })}
          >
            <ListRow
              icon={<TintIcon tint={color.accent} />}
              title={r.title}
              detail={busy === r.key ? 'Preparing…' : r.detail}
              trailing="›"
              trailingTint={color.textFaint}
            />
          </Pressable>
        ))}
      </ListCard>
      <Text style={[type.small, { color: color.textFaint, lineHeight: 17 }]}>
        Opens the Android share sheet. Nothing is sent to the Magnet Eye server.
      </Text>
    </Sheet>
  );
}
