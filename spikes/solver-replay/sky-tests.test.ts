// Replays the clear-sky test captures in device-reports/ through the current detector and
// solver. Those reports kept only a stretched JPEG preview per capture, so the frame is
// rebuilt by undoing the stretch (previewStretch in the report) on the decoded preview.
// JPEG loses a little detail, so this is a regression check, not an exact replay.
// First decode the previews: powershell -File spikes/solver-replay/decode-previews.ps1
// Then run from the repository root:
//   npx vitest run spikes/solver-replay/sky-tests --config vitest.config.mts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { test } from 'vitest';

import { FOCAL_SHARE_OF_LONG_SIDE } from '../../src/app/core/solver/camera';
import { buildSolverIndex, catalogFromRows, solveFrame } from '../../src/app/core/solver/plate-solver';
import { detectStars } from '../../src/app/core/solver/star-detector';

const FOLDER = 'device-reports';

test('replay sky tests', () => {
  const catalog = catalogFromRows(JSON.parse(readFileSync('src/assets/data/stars.json', 'utf8')) as number[][]);
  const lines: string[] = [];
  let [before, now, total] = [0, 0, 0];
  for (const name of readdirSync(FOLDER)
    .filter((n) => /^device-report-\d+\.json$/.test(n))
    .sort()) {
    const report = JSON.parse(readFileSync(join(FOLDER, name), 'utf8'));
    if (report.kind !== 'sky-test') continue;
    for (const [i, step] of (report.steps ?? []).entries()) {
      const stretch = step.previewStretch;
      const greyPath = typeof step.image === 'string' ? step.image.replace(/\.jpg$/, '.gray') : '';
      if (!stretch || !greyPath || !existsSync(greyPath)) continue;
      const { width, height } = step;
      const grey = readFileSync(greyPath);
      if (grey.length !== width * height) continue;
      // Undo the preview's asinh curve: level = black + softness × sinh(p / 255 × top).
      const top = Math.asinh((255 - stretch.black) / stretch.softness);
      const pixels = new Float32Array(width * height);
      for (let p = 0; p < pixels.length; p++) {
        pixels[p] = stretch.black + stretch.softness * Math.sinh((grey[p] / 255) * top);
      }
      const geometry = {
        width,
        height,
        focalPx: FOCAL_SHARE_OF_LONG_SIDE * Math.max(width, height) * (step.solve?.focalFactor ?? 1),
        flipped: report.mount === 'mirror',
      };
      const detection = detectStars(pixels, width, height);
      const solution = solveFrame(detection.stars, geometry, buildSolverIndex(catalog, geometry), undefined, 6000);
      total++;
      if (step.solve) before++;
      if (solution) now++;
      let agree = '';
      if (solution && step.solve) {
        const rad = Math.PI / 180;
        const cos =
          Math.sin(solution.decDeg * rad) * Math.sin(step.solve.decDeg * rad) +
          Math.cos(solution.decDeg * rad) *
            Math.cos(step.solve.decDeg * rad) *
            Math.cos((solution.raDeg - step.solve.raDeg) * rad);
        agree = `  ${(Math.acos(Math.min(1, cos)) / rad).toFixed(2)}° from phone`;
      }
      lines.push(
        `${(report.time ?? '').slice(0, 16)} step ${i + 1}  phone ${step.solve ? 'solved' : 'failed'}  now ${solution ? `solved ${solution.matched}/${solution.checked}` : 'failed'}  stars ${detection.stars.length}${agree}`,
      );
    }
  }
  console.log(`${lines.join('\n')}\nSolved: phone ${before}/${total}, now ${now}/${total}`);
}, 1_200_000);
