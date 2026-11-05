// Messages between the page and the solver worker.

import type { Vector3 } from './astronomy';
import type { SolveHint } from './plate-solver';

export type SolveRequest =
  | { type: 'init'; starRows: number[][] }
  | {
      type: 'solve';
      id: number;
      pixels: Float32Array;
      width: number;
      height: number;
      focalPx: number;
      flipped: boolean;
      hint: SolveHint | null;
      timeLimitMs: number;
    };

export interface SolveResponse {
  id: number;
  starCount: number;
  solution: {
    raDeg: number;
    decDeg: number;
    matched: number;
    checked: number;
    focalPx: number;
    /** Where the image's x (right), y (down) and z (forward) axes point, in J2000. */
    axes: [Vector3, Vector3, Vector3];
  } | null;
}
