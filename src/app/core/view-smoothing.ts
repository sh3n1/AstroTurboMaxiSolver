// Steadies what the view shows, with no Angular dependency.
//
// Sensor readings jitter a little. On the wide sky map that is invisible, but at high
// magnification in the eyepiece view the same jitter is magnified with the sky and the
// view shakes. Smoothing what is shown, more strongly for narrower views, keeps it calm.

import type { Horizontal } from './astronomy';
import { horizontalVector, vectorToHorizontal } from './astronomy';

/** How long the view takes to catch up about two thirds of the way to a new reading. */
export const SKY_MAP_SMOOTHING_MS = 80;
export const EYEPIECE_SMOOTHING_MS = 450;

/** The share of the remaining distance to cover in a frame, given its length in time. */
export function smoothingFactor(frameMs: number, timeConstantMs: number): number {
  if (timeConstantMs <= 0) return 1;
  return 1 - Math.exp(-Math.max(0, frameMs) / timeConstantMs);
}

/** Moves the shown pointing part of the way towards the latest reading. */
export function smoothPointing(shown: Horizontal | null, latest: Horizontal, factor: number): Horizontal {
  if (!shown) return latest;
  const from = horizontalVector(shown);
  const to = horizontalVector(latest);
  const blended: [number, number, number] = [
    from[0] + (to[0] - from[0]) * factor,
    from[1] + (to[1] - from[1]) * factor,
    from[2] + (to[2] - from[2]) * factor,
  ];
  const length = Math.hypot(...blended);
  return length > 0 ? vectorToHorizontal([blended[0] / length, blended[1] / length, blended[2] / length]) : latest;
}
