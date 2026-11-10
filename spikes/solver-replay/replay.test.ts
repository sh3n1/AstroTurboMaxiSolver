// Replays the sky map solves sent from the phone (device-reports/live-solve-*.json and
// their raw .f32 frames) through the current star detector and solver, so a change can be
// measured on real frames before going outside. Run from the repository root:
//   npx vitest run spikes/solver-replay --config vitest.config.mts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { test } from 'vitest';

import { buildSolverIndex, catalogFromRows, solveFrame } from '../../src/app/core/plate-solver';
import { detectStars } from '../../src/app/core/star-detector';

const FOLDER = 'device-reports';

test('replay sky map solves', () => {
  const catalog = catalogFromRows(JSON.parse(readFileSync('src/assets/data/stars.json', 'utf8')) as number[][]);
  const files = readdirSync(FOLDER)
    .filter((name) => /^live-solve-\d+\.json$/.test(name))
    .sort();
  let solvedBefore = 0;
  let solvedNow = 0;
  const lines: string[] = [];
  for (const name of files) {
    const report = JSON.parse(readFileSync(join(FOLDER, name), 'utf8'));
    const rawPath = join(FOLDER, name.replace('.json', '.f32'));
    if (!existsSync(rawPath)) continue;
    const bytes = readFileSync(rawPath);
    const pixels = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const { width, height, focalPx, flipped, hint, timeLimitMs } = report.inputs;
    const geometry = { width, height, focalPx, flipped };
    const detection = detectStars(pixels, width, height);
    const solution = solveFrame(
      detection.stars,
      geometry,
      buildSolverIndex(catalog, geometry),
      hint ?? undefined,
      timeLimitMs,
    );
    const before = report.result.solution;
    if (before) solvedBefore++;
    if (solution) solvedNow++;
    // How well a solution fits: RMS distance in pixels from each detection to the nearest
    // catalogue star (to mag 6.5) within 10 px, and how many such pairs there are.
    const fit = (toSky: (v: number[]) => number[]): string => {
      const errors: number[] = [];
      for (const star of detection.stars) {
        const v = [((flipped ? -1 : 1) * (star.x - width / 2)) / focalPx, (star.y - height / 2) / focalPx, 1];
        const n = Math.hypot(v[0], v[1], v[2]);
        const sky = toSky([v[0] / n, v[1] / n, v[2] / n]);
        let best = -1;
        for (const c of catalog) {
          if (c.mag > 6.5) continue;
          const d = c.vector[0] * sky[0] + c.vector[1] * sky[1] + c.vector[2] * sky[2];
          if (d > best) best = d;
        }
        const px = Math.acos(Math.min(1, best)) * focalPx;
        if (px < 10) errors.push(px);
      }
      const rms = Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0) / Math.max(1, errors.length));
      return `${rms.toFixed(2)} px over ${errors.length}`;
    };
    const fits = [
      before
        ? `phone fit ${fit((v) => [0, 1, 2].map((i) => v[0] * before.axes[0][i] + v[1] * before.axes[1][i] + v[2] * before.axes[2][i]))}`
        : '',
      solution ? `new fit ${fit((v) => solution.toSky(v as [number, number, number]))}` : '',
    ]
      .filter(Boolean)
      .join('  ');
    // Distance from the phone's own solve, to catch a different (wrong) answer.
    let agree = '';
    if (solution && before) {
      const [a, b] = [solution.pointing, before.axes[2]];
      agree = ` ${((Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI).toFixed(2)}° from phone`;
    }
    lines.push(
      `${name.slice(11, 24)}  phone ${before ? 'solved' : 'failed'}  now ${solution ? `solved ${solution.matched}/${solution.checked}` : 'failed'}` +
        `  stars ${detection.stars.length}  noise ${detection.noise.toFixed(2)}${agree}  ${fits}`,
    );
  }
  console.log(`${lines.join('\n')}\nSolved: phone ${solvedBefore}/${files.length}, now ${solvedNow}/${files.length}`);
}, 600_000);
