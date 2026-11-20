import type { FullResult } from '../api/result';

/** DEVELOPMENT ONLY sample data for the design preview: a vertical point dipole computed by
 * formula, not a measurement. Never imported outside `__DEV__` screens. Units: m, µT, A/m. */
export const SAMPLE_LABEL = 'Sample data · not a measurement';

const MU0_4PI_UT = 1e-7 * 1e6;
const M: [number, number, number] = [0, 0, 1.5]; // A·m², a 20 mm NdFeB disc
const SRC: [number, number, number] = [0, 0, 0.0025];

function field(p: number[]): [number, number, number] {
  const r = [p[0] - SRC[0], p[1] - SRC[1], p[2] - SRC[2]];
  const d = Math.hypot(r[0], r[1], r[2]);
  const md = M[0] * r[0] + M[1] * r[1] + M[2] * r[2];
  return [0, 1, 2].map((i) => MU0_4PI_UT * ((3 * r[i] * md) / d ** 5 - M[i] / d ** 3)) as [number, number, number];
}

function trace(seed: number[], dir: 1 | -1): number[][] {
  const pts = [seed];
  let p = seed;
  for (let i = 0; i < 80; i++) {
    const b = field(p);
    const n = Math.hypot(...b);
    p = [p[0] + (dir * 0.002 * b[0]) / n, p[1] + (dir * 0.002 * b[1]) / n, p[2] + (dir * 0.002 * b[2]) / n];
    if (p[2] < 0.012 || Math.hypot(p[0], p[1]) > 0.08) break;
    pts.push(p);
  }
  return pts;
}

export function sampleResult(): FullResult {
  const points: number[][] = [];
  for (const x of [-0.06, -0.03, 0, 0.03, 0.06])
    for (const y of [-0.06, -0.03, 0, 0.03, 0.06]) for (const z of [0.045, 0.06]) points.push([x, y, z]);
  const lines: number[][][] = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * 2 * Math.PI;
    const seed = [0.008 * Math.cos(a), 0.008 * Math.sin(a), 0.013];
    lines.push([...trace(seed, -1).reverse(), ...trace(seed, 1).slice(1)]);
  }
  const vox: number[][] = [];
  const mag: number[][] = [];
  for (const x of [-0.006, 0, 0.006])
    for (const y of [-0.006, 0, 0.006]) {
      vox.push([x, y, 0.0025]);
      const f = x === 0 && y === 0 ? 1 : 0.55;
      mag.push([0, 0, 9.0e5 * f]);
    }
  return {
    label: 'Estimate: a magnetisation pattern consistent with the measured field, not a view inside the magnet.',
    swipes: 8,
    readings: 3200,
    fit_seconds: 0.3,
    relative_uncertainty: 0.07,
    finest_detail_m: 0.014,
    misfit_per_reading: 1.1,
    warnings: [],
    magnet: { centre_m: SRC, moment_am2: M, moment_sigma_am2: [0.02, 0.02, 0.05] },
    next_swipe: null,
    field: { points_m: points, b_ut: points.map(field), sigma_ut: points.map(() => [0.8, 0.8, 0.8]) },
    field_lines_m: lines,
    magnetisation: { voxel_centres_m: vox, voxel_size_m: 0.006, m_a_per_m: mag },
  };
}
