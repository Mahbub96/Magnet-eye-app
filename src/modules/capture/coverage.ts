/** Ruler-mode coverage on the paper (mm). A cell is covered when a recorded line passes
 * within half a cell of its centre. */
export type Seg = { x0: number; y0: number; x1: number; y1: number };

export function extentMm(segs: Seg[], min = 120): number {
  const m = Math.max(min, ...segs.flatMap((s) => [Math.abs(s.x0), Math.abs(s.y0), Math.abs(s.x1), Math.abs(s.y1)]));
  return Math.ceil((m + 10) / 20) * 20;
}

function distToSeg(px: number, py: number, s: Seg): number {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / l2)) : 0;
  return Math.hypot(px - (s.x0 + t * dx), py - (s.y0 + t * dy));
}

/** n x n cells over [-extent, extent]², row 0 at +y (top of the map). */
export function coverageGrid(segs: Seg[], extent: number, n = 6): boolean[][] {
  const cell = (2 * extent) / n;
  return Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => {
      const cx = -extent + (col + 0.5) * cell;
      const cy = extent - (row + 0.5) * cell;
      return segs.some((s) => distToSeg(cx, cy, s) <= cell / 2);
    }),
  );
}
