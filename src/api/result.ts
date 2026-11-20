import type { FitResult } from './client';

/** The whole fit result as the server returns it (backend app/api/fit_job.py). Units: m, µT,
 * A/m, A·m². The 3D viewer and the CSV export read these arrays. */
export type FullResult = FitResult & {
  field: { points_m: number[][]; b_ut: number[][]; sigma_ut: number[][] };
  field_lines_m: number[][][];
  magnetisation: { voxel_centres_m: number[][]; voxel_size_m: number; m_a_per_m: number[][] };
};
