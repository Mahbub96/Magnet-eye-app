import type { Vec3 } from '../../utils/quaternion';

/** Hard- and soft-iron calibration from a figure eight (SRS CL, Phase 5).
 *
 * Model (phone frame, µT): calibrated = W (raw - b). The phone's own magnetism adds a constant
 * offset b (hard iron) and stretches the sphere of the Earth's field into an ellipsoid (soft
 * iron). Turning a still phone through every direction samples that ellipsoid; fitting it gives
 * b and W, with W symmetric and scaled so |calibrated| equals the measured field strength.
 *
 * Fit: least squares on the general quadric  A x² + B y² + C z² + 2D xy + 2E xz + 2F yz +
 * 2G x + 2H y + 2I z = 1. If the quadric is not an ellipsoid (too few directions, or a
 * fit that is not positive definite), it falls back to a sphere: hard iron only, W = I. */

export type Mat3 = [Vec3, Vec3, Vec3];

export type IronFit = {
  hardIronUt: Vec3;
  softIron: Mat3;
  fieldUt: number; // radius of the corrected sphere: the local field strength
  residualUt: number; // RMS of |W(raw - b)| - fieldUt over the readings
  model: 'ellipsoid' | 'sphere';
};

/** Solve n x n A x = y by Gaussian elimination with partial pivoting. */
function solve(a: number[][], y: number[]): number[] | null {
  const n = y.length;
  const m = a.map((r, i) => [...r, y[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((r, i) => r[n] / r[i]);
}

/** Least squares: minimise |X beta - y| through the normal equations (columns are few). */
function lstsq(x: number[][], y: number[]): number[] | null {
  const k = x[0].length;
  const xtx = Array.from({ length: k }, () => new Array(k).fill(0));
  const xty = new Array(k).fill(0);
  x.forEach((row, i) => {
    for (let a = 0; a < k; a++) {
      xty[a] += row[a] * y[i];
      for (let b = a; b < k; b++) xtx[a][b] += row[a] * row[b];
    }
  });
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) xtx[a][b] = xtx[b][a];
  return solve(xtx, xty);
}

/** Eigen-decomposition of a symmetric 3x3 matrix (cyclic Jacobi). Returns values and
 * vectors as columns of V, so S = V diag(values) V^T. */
export function eigSym3(s: Mat3): { values: Vec3; vectors: Mat3 } {
  const a = s.map((r) => [...r]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off < 1e-30) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const sn = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p];
        const akq = a[k][q];
        a[k][p] = c * akp - sn * akq;
        a[k][q] = sn * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k];
        const aqk = a[q][k];
        a[p][k] = c * apk - sn * aqk;
        a[q][k] = sn * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p];
        const vkq = v[k][q];
        v[k][p] = c * vkp - sn * vkq;
        v[k][q] = sn * vkp + c * vkq;
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v as Mat3 };
}

export function apply(w: Mat3, b: Vec3, raw: Vec3): Vec3 {
  const d = [raw[0] - b[0], raw[1] - b[1], raw[2] - b[2]];
  return [0, 1, 2].map((i) => w[i][0] * d[0] + w[i][1] * d[1] + w[i][2] * d[2]) as Vec3;
}

const IDENTITY: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function residual(raw: Vec3[], b: Vec3, w: Mat3): { radius: number; rms: number } {
  const r = raw.map((x) => Math.hypot(...apply(w, b, x)));
  const radius = r.reduce((s, v) => s + v, 0) / r.length;
  return { radius, rms: Math.sqrt(r.reduce((s, v) => s + (v - radius) ** 2, 0) / r.length) };
}

function sphereFit(raw: Vec3[]): IronFit | null {
  // |x - b|² = R²  ->  2 b·x + (R² - |b|²) = |x|²
  const sol = lstsq(
    raw.map((x) => [2 * x[0], 2 * x[1], 2 * x[2], 1]),
    raw.map((x) => x[0] ** 2 + x[1] ** 2 + x[2] ** 2),
  );
  if (!sol) return null;
  const b: Vec3 = [sol[0], sol[1], sol[2]];
  const { radius, rms } = residual(raw, b, IDENTITY);
  return { hardIronUt: b, softIron: IDENTITY, fieldUt: radius, residualUt: rms, model: 'sphere' };
}

export function fitIron(raw: Vec3[]): IronFit | null {
  if (raw.length < 30) return null;
  // Centre and scale the data first for a well-conditioned fit.
  const mu = [0, 1, 2].map((k) => raw.reduce((s, x) => s + x[k], 0) / raw.length) as Vec3;
  const sc = Math.max(...raw.map((x) => Math.hypot(x[0] - mu[0], x[1] - mu[1], x[2] - mu[2])), 1e-9);
  const u = raw.map((x) => [(x[0] - mu[0]) / sc, (x[1] - mu[1]) / sc, (x[2] - mu[2]) / sc]);
  const sol = lstsq(
    u.map(([x, y, z]) => [x * x, y * y, z * z, 2 * x * y, 2 * x * z, 2 * y * z, 2 * x, 2 * y, 2 * z]),
    u.map(() => 1),
  );
  const sphere = sphereFit(raw);
  if (!sol) return sphere;
  const [A, B, C, D, E, F, G, H, I] = sol;
  const q: Mat3 = [
    [A, D, E],
    [D, B, F],
    [E, F, C],
  ];
  const c = solve(q, [-G, -H, -I]); // centre in scaled units
  if (!c) return sphere;
  // x^T Q x + 2 p^T x = 1 with x = c + d  ->  d^T Q d = 1 + c^T Q c =: k
  const k = 1 + (c[0] * (A * c[0] + D * c[1] + E * c[2]) + c[1] * (D * c[0] + B * c[1] + F * c[2]) + c[2] * (E * c[0] + F * c[1] + C * c[2]));
  const { values, vectors } = eigSym3(q);
  if (k <= 0 || values.some((v) => v <= 0)) return sphere; // not an ellipsoid
  // W0 = V diag(sqrt(lambda/k)) V^T maps the ellipsoid (scaled units) onto the unit sphere.
  const sq = values.map((v) => Math.sqrt(v / k));
  const w0 = [0, 1, 2].map((i) => [0, 1, 2].map((j) => sq.reduce((s, l, m) => s + vectors[i][m] * l * vectors[j][m], 0))) as Mat3;
  const b: Vec3 = [mu[0] + sc * c[0], mu[1] + sc * c[1], mu[2] + sc * c[2]];
  // Back to µT and scale W so the sphere radius is the mean field strength: W = R * W0 / sc,
  // with R chosen so the average stretch is 1 (geometric mean of the axes).
  const det = sq[0] * sq[1] * sq[2];
  const stretch = Math.cbrt(det) / sc; // W0/sc maps µT -> unit sphere; its mean gain
  const w = w0.map((r) => r.map((v) => v / sc / stretch)) as Mat3;
  const { radius, rms } = residual(raw, b, w);
  const fit: IronFit = { hardIronUt: b, softIron: w, fieldUt: radius, residualUt: rms, model: 'ellipsoid' };
  // Keep the simpler model unless the ellipsoid explains the data clearly better.
  if (sphere && sphere.residualUt <= fit.residualUt * 1.05) return sphere;
  return fit;
}
