import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { FullResult } from '../api/result';

/** The latest fit saved for a scan (result.json), or null if it has none yet. */
export async function readResult(scanId: string): Promise<FullResult | null> {
  const f = new File(new Directory(Paths.document, 'scans', scanId), 'result.json');
  if (!f.exists) return null;
  return JSON.parse(await f.text()) as FullResult;
}

/** Field data CSV (Figma 14): one row per grid point, field and its one-sigma uncertainty.
 * Units in the header: metres and microtesla, world frame (z up, origin on the paper). */
export function fieldCsv(r: FullResult): string {
  const lines = ['x_m,y_m,z_m,bx_ut,by_ut,bz_ut,sigma_bx_ut,sigma_by_ut,sigma_bz_ut'];
  r.field.points_m.forEach((p, i) => {
    lines.push([...p, ...r.field.b_ut[i], ...r.field.sigma_ut[i]].join(','));
  });
  return lines.join('\n') + '\n';
}

export async function writeCache(name: string, content: string): Promise<File> {
  const f = new File(Paths.cache, name);
  await f.write(content);
  return f;
}

export async function share(uri: string, mimeType: string, title: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
  return true;
}
