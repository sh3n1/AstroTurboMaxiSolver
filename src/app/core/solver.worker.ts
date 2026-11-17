/// <reference lib="webworker" />

// Finds stars and plate solves in the background, so the sky map stays smooth while a
// frame is being solved. The page sends the star catalogue once, then one frame at a time.

import type { Vector3 } from './astronomy';
import type { SolverIndex } from './plate-solver';
import { buildSolverIndex, catalogFromRows, solveFrame } from './plate-solver';
import type { SolveRequest, SolveResponse } from './solver-messages';
import { detectStars } from './star-detector';

let stars: ReturnType<typeof catalogFromRows> = [];
/**
 * Building an index takes a moment, so the last one is kept for the next frame of the same
 * size and field of view. Only one: the field of view is learnt from each solve and shifts
 * a little, and each index is a megabyte or two. Keeping every one filled the memory of a
 * finder phone solving all night until Android closed Chrome.
 */
let cached: { key: string; index: SolverIndex } | null = null;

addEventListener('message', ({ data }: MessageEvent<SolveRequest>) => {
  if (data.type === 'init') {
    stars = catalogFromRows(data.starRows);
    cached = null;
    return;
  }

  const { id, pixels, width, height, focalPx, hint, timeLimitMs } = data;
  const geometry = { width, height, focalPx };
  const key = `${width}x${height}x${focalPx}`;
  if (cached?.key !== key) cached = { key, index: buildSolverIndex(stars, geometry) };
  const index = cached.index;

  const started = performance.now();
  const detection = detectStars(pixels, width, height);
  const detected = performance.now();
  const solution = solveFrame(detection.stars, geometry, index, hint ?? undefined, timeLimitMs);
  const solved = performance.now();
  const axis = (v: Vector3): Vector3 => (solution ? solution.toSky(v) : v);
  const response: SolveResponse = {
    id,
    starCount: detection.stars.length,
    stars: detection.stars,
    background: detection.background,
    noise: detection.noise,
    detectMs: Math.round(detected - started),
    solveMs: Math.round(solved - detected),
    solution: solution
      ? {
          raDeg: solution.raDeg,
          decDeg: solution.decDeg,
          matched: solution.matched,
          checked: solution.checked,
          focalPx: solution.focalPx,
          // The image's own axes in the sky, which give the camera's full orientation.
          axes: [axis([1, 0, 0]), axis([0, 1, 0]), axis([0, 0, 1])],
        }
      : null,
  };
  postMessage(response);
});
