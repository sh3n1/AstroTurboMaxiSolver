// Replays the plate solves of field tests (the puck repository's field-sessions/, each solve
// a folder with solve.json and its raw frame solve.f32) through the current star detector
// and solver, so a change can be measured on a night's frames before going out again.
// Run from the repository root, with the sessions' folder:
//   $env:FIELD_SESSIONS="C:/.../AstroTurboMaxiPuck/field-sessions"
//   npx vitest run spikes/solver-replay/field.test.ts --config vitest.config.mts
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { test } from 'vitest';

import { buildSolverIndex, catalogFromRows, solveFrame } from '../../src/app/core/solver/plate-solver';
import { detectStars } from '../../src/app/core/solver/star-detector';

import { edgeDensity } from './frame-measures';

/** Every solve folder under the sessions' folder: <session>/steps/<step>/solves/<solve>. */
function solveFolders(root: string): string[] {
  const folders: string[] = [];
  const walk = (folder: string): void => {
    for (const name of readdirSync(folder)) {
      const path = join(folder, name);
      if (!statSync(path).isDirectory()) continue;
      if (existsSync(join(path, 'solve.json')) && existsSync(join(path, 'solve.f32'))) folders.push(path);
      else walk(path);
    }
  };
  walk(root);
  return folders.sort();
}

test('replay field test solves', { timeout: 600_000 }, () => {
  const root = process.env['FIELD_SESSIONS'];
  if (!root) throw new Error('Set FIELD_SESSIONS to the puck repository field-sessions folder.');
  const catalog = catalogFromRows(JSON.parse(readFileSync('src/assets/data/stars.json', 'utf8')) as number[][]);
  const indexes = new Map<string, ReturnType<typeof buildSolverIndex>>();
  let solvedBefore = 0;
  let solvedNow = 0;
  let total = 0;
  const lines: string[] = [];
  for (const folder of solveFolders(root)) {
    const report = JSON.parse(readFileSync(join(folder, 'solve.json'), 'utf8'));
    const bytes = readFileSync(join(folder, 'solve.f32'));
    const pixels = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const { width, height, focalPx, flipped, hint, timeLimitMs } = report.inputs;
    const geometry = { width, height, focalPx, flipped };
    const key = JSON.stringify(geometry);
    if (!indexes.has(key)) indexes.set(key, buildSolverIndex(catalog, geometry));
    const started = Date.now();
    const detection = detectStars(pixels, width, height);
    // Optionally, detections in busy surroundings (windows, edges) left out: EDGE_CUT, in
    // multiples of the frame's noise (features.test.ts).
    const edgeCut = Number(process.env['EDGE_CUT'] ?? 0);
    if (edgeCut > 0) {
      const noise = Math.max(detection.noise, 0.25);
      detection.stars = detection.stars.filter(
        (star) => edgeDensity(pixels, width, height, star.x, star.y, 24) / noise <= edgeCut,
      );
    }
    const solution = solveFrame(detection.stars, geometry, indexes.get(key)!, hint ?? undefined, timeLimitMs);
    const ms = Date.now() - started;
    // A failure tried again with no hint: tells a wrong hint (sensors far off) from frames
    // whose detections can't be matched anywhere.
    let blind = '';
    if (!solution) {
      const blindStarted = Date.now();
      const again = solveFrame(detection.stars, geometry, indexes.get(key)!, undefined, 30_000);
      const blindMs = Date.now() - blindStarted;
      blind = again
        ? `  blind solved ${again.matched}/${again.checked} in ${blindMs} ms`
        : `  blind failed in ${blindMs} ms`;
      if (again && hint) {
        const [a, b] = [again.pointing, hint.direction];
        blind += ` (hint ${((Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI).toFixed(0)}° off)`;
      }
    }
    const before = report.result.solution;
    total++;
    if (before) solvedBefore++;
    if (solution) solvedNow++;
    let agree = '';
    if (solution && before) {
      const [a, b] = [solution.pointing, before.axes[2]];
      agree = ` ${((Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI).toFixed(2)}° from phone`;
    }
    const name = folder.split(/[\\/]steps[\\/]/)[1] ?? folder;
    lines.push(
      `${name.padEnd(40)} phone ${before ? 'solved' : 'failed'}  now ${solution ? `solved ${solution.matched}/${solution.checked}` : 'failed'}` +
        `  stars ${detection.stars.length}  ${ms} ms${agree}${blind}`,
    );
  }
  // Written to a file: vitest keeps a test's console output short.
  const out = join(tmpdir(), 'field-replay.txt');
  writeFileSync(out, `${lines.join('\n')}\n\nSolved: phone ${solvedBefore}/${total}, now ${solvedNow}/${total}\n`);
});
