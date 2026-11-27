// Which features tell real stars from lit windows, building edges and other non-stars, on
// real frames. For every field test frame that solves, each detection is labelled real if it
// lands on a catalogue star, and a few measurements around it are compared between the two
// groups. Generic measurements only: nothing about where in the frame or the sky.
// Run from the repository root, with the sessions' folder:
//   $env:FIELD_SESSIONS="C:/.../AstroTurboMaxiPuck/field-sessions"
//   npx vitest run spikes/solver-replay/features.test.ts --config vitest.config.mts
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { test } from 'vitest';

import { buildSolverIndex, catalogFromRows, solveFrame } from '../../src/app/core/solver/plate-solver';
import type { DetectedStar } from '../../src/app/core/solver/star-detector';
import { detectStars } from '../../src/app/core/solver/star-detector';

type Vector3 = [number, number, number];

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

/** Pixels in a ring around a point, from rIn to rOut pixels. */
function ring(
  pixels: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  rIn: number,
  rOut: number,
): number[] {
  const values: number[] = [];
  for (let dy = -rOut; dy <= rOut; dy++) {
    for (let dx = -rOut; dx <= rOut; dx++) {
      const r = Math.hypot(dx, dy);
      if (r < rIn || r > rOut) continue;
      const [px, py] = [Math.round(x + dx), Math.round(y + dy)];
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      values.push(pixels[py * width + px]);
    }
  }
  return values;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/** Mean size of the brightness steps between neighbouring pixels in a box: how busy it is. */
function edgeDensity(pixels: Float32Array, width: number, height: number, x: number, y: number, half: number): number {
  let sum = 0;
  let count = 0;
  for (let py = Math.max(1, Math.round(y - half)); py < Math.min(height - 1, Math.round(y + half)); py++) {
    for (let px = Math.max(1, Math.round(x - half)); px < Math.min(width - 1, Math.round(x + half)); px++) {
      // Leave out the star itself.
      if (Math.hypot(px - x, py - y) < 6) continue;
      const i = py * width + px;
      sum += Math.abs(pixels[i + 1] - pixels[i - 1]) + Math.abs(pixels[i + width] - pixels[i - width]);
      count++;
    }
  }
  return count ? sum / count : 0;
}

interface Row {
  real: boolean;
  rank: number;
  features: Record<string, number>;
}

test('features of real stars and non-stars', { timeout: 900_000 }, () => {
  const root = process.env['FIELD_SESSIONS'];
  if (!root) throw new Error('Set FIELD_SESSIONS to the puck repository field-sessions folder.');
  const catalog = catalogFromRows(JSON.parse(readFileSync('src/assets/data/stars.json', 'utf8')) as number[][]);
  const indexes = new Map<string, ReturnType<typeof buildSolverIndex>>();
  const rows: Row[] = [];
  let frames = 0;
  for (const folder of solveFolders(root)) {
    const report = JSON.parse(readFileSync(join(folder, 'solve.json'), 'utf8'));
    const bytes = readFileSync(join(folder, 'solve.f32'));
    const pixels = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const { width, height, focalPx, hint, timeLimitMs } = report.inputs;
    const geometry = { width, height, focalPx };
    const key = JSON.stringify(geometry);
    if (!indexes.has(key)) indexes.set(key, buildSolverIndex(catalog, geometry));
    const detection = detectStars(pixels, width, height);
    const solution = solveFrame(detection.stars, geometry, indexes.get(key)!, hint ?? undefined, timeLimitMs);
    if (!solution) continue;
    frames++;
    // A detection is real if it lands within 4 px of a catalogue star.
    const tolerance = Math.cos(4 / solution.focalPx);
    const isReal = (star: DetectedStar): boolean => {
      const v: Vector3 = [(star.x - width / 2) / solution.focalPx, (star.y - height / 2) / solution.focalPx, 1];
      const n = Math.hypot(...v);
      const sky = solution.toSky([v[0] / n, v[1] / n, v[2] / n]);
      return catalog.some(
        (c) => c.mag < 7.5 && c.vector[0] * sky[0] + c.vector[1] * sky[1] + c.vector[2] * sky[2] > tolerance,
      );
    };
    detection.stars.forEach((star, rank) => {
      const around = ring(pixels, width, height, star.x, star.y, 8, 16);
      const level = median(around);
      const spread = median(around.map((v) => Math.abs(v - level))) * 1.4826;
      rows.push({
        real: isReal(star),
        rank,
        features: {
          // How busy the sky around it is, against the frame's own noise.
          ringSpread: spread / Math.max(detection.noise, 0.25),
          // How much brighter than the frame's sky the sky around it is.
          ringAbove: (level - detection.background) / Math.max(detection.noise, 0.25),
          edges: edgeDensity(pixels, width, height, star.x, star.y, 24) / Math.max(detection.noise, 0.25),
          peak: star.peak,
          width: star.width,
          pixels: star.pixels,
          snr: star.snr,
        },
      });
    });
  }

  const lines = [`${frames} frames solved, ${rows.length} detections, ${rows.filter((r) => r.real).length} real`];
  const top = rows.filter((r) => r.rank < 25);
  lines.push(`Among each frame's 25 brightest: ${top.filter((r) => r.real).length} real of ${top.length}`);
  const quartiles = (values: number[]): string => {
    const s = [...values].sort((a, b) => a - b);
    const q = (p: number): string => (s[Math.floor(p * (s.length - 1))] ?? 0).toFixed(2);
    return `${q(0.1)} ${q(0.25)} ${q(0.5)} ${q(0.75)} ${q(0.9)}`;
  };
  for (const name of Object.keys(rows[0]?.features ?? {})) {
    const real = rows.filter((r) => r.real).map((r) => r.features[name]);
    const other = rows.filter((r) => !r.real).map((r) => r.features[name]);
    // The best single cut: keep below (or above) a value, scored by real kept and others dropped.
    let best = '';
    let bestScore = -1;
    const all = [...real, ...other].sort((a, b) => a - b);
    for (let i = 0; i < all.length; i += Math.max(1, Math.floor(all.length / 400))) {
      const cut = all[i];
      for (const below of [true, false]) {
        const keptReal = real.filter((v) => (below ? v <= cut : v >= cut)).length / real.length;
        const droppedOther = other.filter((v) => (below ? v > cut : v < cut)).length / other.length;
        // Real stars matter more: losing one costs more than keeping a non-star.
        if (keptReal < 0.97) continue;
        if (droppedOther > bestScore) {
          bestScore = droppedOther;
          best = `${below ? '<=' : '>='} ${cut.toFixed(2)} keeps ${(keptReal * 100).toFixed(0)}% of real, drops ${(droppedOther * 100).toFixed(0)}% of others`;
        }
      }
    }
    lines.push(`${name.padEnd(10)} real ${quartiles(real)}  |  others ${quartiles(other)}  |  ${best}`);
  }
  // The real stars an edge cut would drop: if they are the brightest, their own halo is
  // counted as busy surroundings.
  const dropped = rows.filter((r) => r.real && r.features['edges'] > 4.4);
  lines.push(
    `Real stars over 4.4 in edges: ${dropped.length}; their peak ${quartiles(dropped.map((r) => r.features['peak']))}` +
      `, pixels ${quartiles(dropped.map((r) => r.features['pixels']))}, rank ${quartiles(dropped.map((r) => r.rank))}`,
  );
  const out = join(tmpdir(), 'field-features.txt');
  writeFileSync(out, `${lines.join('\n')}\n`);
});
