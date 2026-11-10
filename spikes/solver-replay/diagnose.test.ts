// Labels each detection in the saved sky map frames as a real star (it lands on a
// catalogue star once the frame is solved) or not, and prints their features, so star
// tests can be chosen from data. Frames the app couldn't solve are solved here for
// reference only, from their upper part, which in these frames is open sky.
//   npx vitest run spikes/solver-replay/diagnose --config vitest.config.mts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { test } from 'vitest';

import type { Vector3 } from '../../src/app/core/astronomy';
import { buildSolverIndex, catalogFromRows, solveFrame } from '../../src/app/core/plate-solver';
import type { DetectedStar } from '../../src/app/core/star-detector';
import { detectStars } from '../../src/app/core/star-detector';

const FOLDER = 'device-reports';

test('diagnose detections', () => {
  const catalog = catalogFromRows(JSON.parse(readFileSync('src/assets/data/stars.json', 'utf8')) as number[][]);
  const rows: string[] = ['frame,rank,real,x,y,pixels,flux,peak,width,snr,conc'];
  for (const name of readdirSync(FOLDER)
    .filter((n) => /^live-solve-\d+\.json$/.test(n))
    .sort()) {
    const report = JSON.parse(readFileSync(join(FOLDER, name), 'utf8'));
    const rawPath = join(FOLDER, name.replace('.json', '.f32'));
    if (!existsSync(rawPath)) continue;
    const bytes = readFileSync(rawPath);
    const pixels = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const { width, height, focalPx, flipped, hint } = report.inputs;
    const geometry = { width, height, focalPx, flipped };
    const index = buildSolverIndex(catalog, geometry);
    const { stars } = detectStars(pixels, width, height);
    const solution =
      solveFrame(stars, geometry, index, hint, 20000) ??
      solveFrame(
        stars.filter((s) => s.y < height * 0.6),
        geometry,
        index,
        hint,
        20000,
      );
    if (!solution) {
      console.log(`${name}: no reference solve`);
      continue;
    }
    // Real if a catalogue star (to mag 6.5) lies within 10 px of where the detection points.
    const toleranceCos = Math.cos(10 / focalPx);
    const isReal = (s: DetectedStar): boolean => {
      const sign = flipped ? -1 : 1;
      const v: Vector3 = [(sign * (s.x - width / 2)) / focalPx, (s.y - height / 2) / focalPx, 1];
      const n = Math.hypot(...v);
      const sky = solution.toSky([v[0] / n, v[1] / n, v[2] / n]);
      return catalog.some(
        (c) => c.mag < 6.5 && c.vector[0] * sky[0] + c.vector[1] * sky[1] + c.vector[2] * sky[2] > toleranceCos,
      );
    };
    stars.forEach((s, rank) => {
      rows.push(
        [
          name.slice(11, 24),
          rank,
          isReal(s) ? 1 : 0,
          s.x.toFixed(0),
          s.y.toFixed(0),
          s.pixels,
          s.flux.toFixed(1),
          s.peak.toFixed(2),
          s.width.toFixed(2),
          s.snr.toFixed(1),
          (s.peak / s.flux).toFixed(3),
        ].join(','),
      );
    });
  }
  console.log(rows.join('\n'));
}, 600_000);
