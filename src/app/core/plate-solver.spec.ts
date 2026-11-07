import starRows from '../../assets/data/stars.json';

import type { Vector3 } from './astronomy';
import { equatorialVector } from './astronomy';
import {
  buildSolverIndex,
  catalogFromRows,
  chanceOfAtLeast,
  matchesNeeded,
  measureDepth,
  solveFrame,
} from './plate-solver';
import falseSolve1 from './plate-solver.false-solve-1.json';
import { detectStars } from './star-detector';

// These tests run the whole chain on an image rendered from the real star catalogue:
// render, detect, solve, then compare with the known true pointing.

const RAD = Math.PI / 180;
const stars = catalogFromRows(starRows as number[][]);
const FRAME = { width: 540, height: 960, focalPx: 640 };

const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vector3): Vector3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const angleDeg = (a: Vector3, b: Vector3): number => Math.acos(Math.min(1, dot(a, b))) / RAD;

/** Repeatable random numbers, so failures can be reproduced. */
function randomSource(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface RenderOptions {
  raDeg: number;
  decDeg: number;
  rollDeg?: number;
  flipped?: boolean;
  focalPx?: number;
  limitMag?: number;
}

/** Draws a city-like frame: a bright uneven sky with noise, plus catalogue stars. */
function render(options: RenderOptions): { pixels: Float32Array; truth: Vector3 } {
  const { width, height } = FRAME;
  const focalPx = options.focalPx ?? FRAME.focalPx;
  const random = randomSource(12345);
  const pixels = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const noise = (random() + random() + random() - 1.5) * 4;
      pixels[y * width + x] = 40 + (y / height) * 25 + noise; // Brighter towards the horizon
    }
  }

  const forward = equatorialVector(options.raDeg, options.decDeg);
  const right0 = normalize(cross(forward, [0, 0, 1]));
  const down0 = cross(forward, right0);
  const roll = (options.rollDeg ?? 0) * RAD;
  const axisX: Vector3 = [
    Math.cos(roll) * right0[0] + Math.sin(roll) * down0[0],
    Math.cos(roll) * right0[1] + Math.sin(roll) * down0[1],
    Math.cos(roll) * right0[2] + Math.sin(roll) * down0[2],
  ];
  const axisY = cross(forward, axisX);

  for (const star of stars) {
    if (star.mag > (options.limitMag ?? 5.5)) break;
    const z = dot(star.vector, forward);
    if (z <= 0) continue;
    const cx = (focalPx * dot(star.vector, axisX)) / z;
    const px = width / 2 + cx * (options.flipped ? -1 : 1);
    const py = height / 2 + (focalPx * dot(star.vector, axisY)) / z;
    if (px < 4 || px >= width - 4 || py < 4 || py >= height - 4) continue;
    const amplitude = Math.min(210, 160 * 10 ** (-0.4 * (star.mag - 2)));
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const [ix, iy] = [Math.round(px) + dx, Math.round(py) + dy];
        const distance2 = (ix - px) ** 2 + (iy - py) ** 2;
        pixels[iy * width + ix] += amplitude * Math.exp(-distance2 / (2 * 1.1 ** 2));
      }
    }
  }
  return { pixels, truth: forward };
}

describe('star detection', () => {
  const { width, height } = FRAME;

  it('finds stars and measures their positions accurately', () => {
    const pixels = new Float32Array(width * height).fill(50);
    const [starX, starY] = [200.3, 400.7];
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const [ix, iy] = [Math.round(starX) + dx, Math.round(starY) + dy];
        pixels[iy * width + ix] += 100 * Math.exp(-((ix - starX) ** 2 + (iy - starY) ** 2) / 2);
      }
    }
    const { stars: found } = detectStars(pixels, width, height);
    expect(found).toHaveLength(1);
    expect(Math.hypot(found[0].x - starX, found[0].y - starY)).toBeLessThan(0.1);
  });

  it('ignores a single hot pixel', () => {
    const pixels = new Float32Array(width * height).fill(50);
    pixels[300 * width + 200] = 255;
    expect(detectStars(pixels, width, height).stars).toHaveLength(0);
  });

  it('ignores a large bright object such as a streetlight', () => {
    const pixels = new Float32Array(width * height).fill(50);
    for (let y = 100; y < 180; y++) for (let x = 100; x < 180; x++) pixels[y * width + x] = 250;
    expect(detectStars(pixels, width, height).stars).toHaveLength(0);
  });

  it('finds no stars in pure noise over an uneven sky', () => {
    const random = randomSource(99);
    const pixels = new Float32Array(width * height);
    for (let i = 0; i < pixels.length; i++) pixels[i] = 60 + (i / pixels.length) * 30 + (random() - 0.5) * 8;
    expect(detectStars(pixels, width, height).stars.length).toBeLessThan(3);
  });
});

describe('chance of accidental matches', () => {
  it('calculates simple cases exactly', () => {
    expect(chanceOfAtLeast(0, 10, 0.3)).toBeCloseTo(1, 9);
    expect(chanceOfAtLeast(1, 1, 0.3)).toBeCloseTo(0.3, 9);
    expect(chanceOfAtLeast(2, 2, 0.5)).toBeCloseTo(0.25, 9);
    expect(chanceOfAtLeast(1, 2, 0.5)).toBeCloseTo(0.75, 9);
  });

  it('asks for more matches as accidents get more likely', () => {
    expect(matchesNeeded(25, 0.01)!).toBeLessThan(matchesNeeded(25, 0.1)!);
  });

  it('refuses when even matching everything could be an accident', () => {
    expect(matchesNeeded(10, 0.5)).toBeNull();
  });
});

describe('plate solving from a rendered image', () => {
  const index = buildSolverIndex(stars, FRAME);

  for (const [name, options] of [
    ['Orion', { raDeg: 84, decDeg: 0 }],
    ['the Summer Triangle, rolled', { raDeg: 295, decDeg: 35, rollDeg: 40 }],
    ['around the Pole, rolled', { raDeg: 40, decDeg: 80, rollDeg: 130 }],
    ['the southern sky', { raDeg: 200, decDeg: -30, rollDeg: -75 }],
  ] as [string, RenderOptions][]) {
    it(`finds the right pointing on ${name}`, () => {
      const { pixels, truth } = render(options);
      const { stars: found } = detectStars(pixels, FRAME.width, FRAME.height);
      const solution = solveFrame(found, FRAME, index);
      expect(solution).not.toBeNull();
      expect(angleDeg(solution!.pointing, truth)).toBeLessThan(0.2);
    });
  }

  it('solves a mirrored image from a mirror mount', () => {
    const { pixels, truth } = render({ raDeg: 84, decDeg: 0, flipped: true });
    const { stars: found } = detectStars(pixels, FRAME.width, FRAME.height);
    const solution = solveFrame(found, { ...FRAME, flipped: true }, index);
    expect(solution).not.toBeNull();
    expect(angleDeg(solution!.pointing, truth)).toBeLessThan(0.2);
  });

  it('finds the real field of view when the assumed one is 6% off', () => {
    const { pixels, truth } = render({ raDeg: 84, decDeg: 0, focalPx: FRAME.focalPx * 1.06 });
    const { stars: found } = detectStars(pixels, FRAME.width, FRAME.height);
    const solution = solveFrame(found, FRAME, index);
    expect(solution).not.toBeNull();
    expect(angleDeg(solution!.pointing, truth)).toBeLessThan(0.3);
    expect(solution!.focalPx / FRAME.focalPx).toBeCloseTo(1.06, 1);
  }, 20_000);

  it('uses a sensor hint', () => {
    const { pixels, truth } = render({ raDeg: 84, decDeg: 0 });
    const { stars: found } = detectStars(pixels, FRAME.width, FRAME.height);
    const near = solveFrame(found, FRAME, index, { direction: equatorialVector(90, 5), radiusDeg: 20 });
    expect(angleDeg(near!.pointing, truth)).toBeLessThan(0.2);
    // A hint pointing at the opposite side of the sky must not produce an answer.
    expect(solveFrame(found, FRAME, index, { direction: equatorialVector(264, 0), radiusDeg: 5 })).toBeNull();
  }, 20_000);

  it('gives no answer rather than a wrong one for random dots', () => {
    const random = randomSource(7);
    const dots = Array.from({ length: 40 }, () => ({ x: random() * FRAME.width, y: random() * FRAME.height }));
    expect(solveFrame(dots, FRAME, index, undefined, 2000)).toBeNull();
  });

  // A real bug: a starless test pattern from the browser's fake camera once "solved" with
  // 8 of 16 chance matches. These cover that kind of image, with many different layouts.
  for (const [label, count] of [
    ['few', 12],
    ['some', 17],
    ['many', 25],
  ] as [string, number][]) {
    it(`never solves ${label} clustered false stars`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const random = randomSource(seed * 1000 + count);
        const centres = Array.from({ length: 4 }, () => ({ x: random() * FRAME.width, y: random() * FRAME.height }));
        const dots = Array.from({ length: count }, () => {
          const centre = centres[Math.floor(random() * centres.length)];
          return { x: centre.x + (random() - 0.5) * 120, y: centre.y + (random() - 0.5) * 120 };
        });
        expect(solveFrame(dots, FRAME, index, undefined, 150)).toBeNull();
      }
    }, 15_000);
  }

  it('never solves evenly spaced false stars, like a grid test pattern', () => {
    const dots = [];
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 4; col++) dots.push({ x: 60 + col * 130, y: 80 + row * 190 });
    expect(solveFrame(dots, FRAME, index, undefined, 1000)).toBeNull();
  });

  it('gives up within its time limit on a frame with nothing to find', () => {
    const random = randomSource(11);
    const dots = Array.from({ length: 60 }, () => ({ x: random() * FRAME.width, y: random() * FRAME.height }));
    const started = performance.now();
    expect(solveFrame(dots, FRAME, index, undefined, 300)).toBeNull();
    // A little over the limit is fine, since it only checks the clock now and then.
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it('gives no answer when too few stars are visible', () => {
    const { pixels } = render({ raDeg: 84, decDeg: 0, limitMag: 1 });
    const { stars: found } = detectStars(pixels, FRAME.width, FRAME.height);
    expect(solveFrame(found, FRAME, index)).toBeNull();
  });

  it('measures how faint the camera reached', () => {
    const { pixels } = render({ raDeg: 84, decDeg: 0, limitMag: 4 });
    const { stars: found } = detectStars(pixels, FRAME.width, FRAME.height);
    const solution = solveFrame(found, FRAME, index);
    expect(solution).not.toBeNull();
    const bins = measureDepth(solution!, found, FRAME, stars);
    const bright = bins.filter((bin) => bin.mag < 3);
    const faint = bins.find((bin) => bin.mag === 6);
    expect(bright.reduce((sum, bin) => sum + bin.detected, 0)).toBeGreaterThan(0);
    expect(bright.every((bin) => bin.detected >= bin.inFrame * 0.5)).toBe(true);
    // Stars fainter than the render's limit can't have been detected, beyond chance.
    expect(faint!.detected).toBeLessThan(faint!.inFrame * 0.3);
  });
});

describe('plate solving at the real camera field of view', () => {
  // A 1080×1920 frame from the main camera, about 80° along its long side.
  const WIDE = { width: 1080, height: 1920, focalPx: 0.667 * 1920 };
  const index = buildSolverIndex(stars, WIDE);

  it('rejects the artifacts from a real overexposed frame, which once solved falsely', () => {
    const geometry = { width: 1080, height: 1920, focalPx: 0.667 * 1920 };
    expect(falseSolve1.length).toBeGreaterThan(25);
    expect(solveFrame(falseSolve1, geometry, buildSolverIndex(stars, geometry), undefined, 3000)).toBeNull();
  }, 10_000);

  it('never solves clustered false stars', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const random = randomSource(seed * 77);
      const centres = Array.from({ length: 5 }, () => ({ x: random() * WIDE.width, y: random() * WIDE.height }));
      const dots = Array.from({ length: 16 + seed }, () => {
        const centre = centres[Math.floor(random() * centres.length)];
        return { x: centre.x + (random() - 0.5) * 300, y: centre.y + (random() - 0.5) * 300 };
      });
      expect(solveFrame(dots, WIDE, index, undefined, 200)).toBeNull();
    }
  }, 15_000);

  it('still solves real star positions, using only the stars a city sky would show', () => {
    // Project catalogue stars directly, brightest first, as detection would list them.
    const forward = equatorialVector(84, 0);
    const axisX = normalize(cross(forward, [0, 0, 1]));
    const axisY = cross(forward, axisX);
    const visible = [];
    for (const star of stars) {
      if (star.mag > 4.2) break;
      const z = dot(star.vector, forward);
      if (z <= 0) continue;
      const x = WIDE.width / 2 + (WIDE.focalPx * dot(star.vector, axisX)) / z;
      const y = WIDE.height / 2 + (WIDE.focalPx * dot(star.vector, axisY)) / z;
      if (x >= 0 && x < WIDE.width && y >= 0 && y < WIDE.height) visible.push({ x, y });
    }
    expect(visible.length).toBeGreaterThan(10);
    const solution = solveFrame(visible, WIDE, index);
    expect(solution).not.toBeNull();
    expect(angleDeg(solution!.pointing, forward)).toBeLessThan(0.1);
  });
});

// Real frames hold more than stars: the lens darkens the corners, some phones leave a
// darker band along one side, and the sky may be crossed by a terrace beam or edged by
// buildings with lit windows. None of these may crowd real stars out, or be taken for one.
describe('star detection among real-world clutter', () => {
  const { width, height } = FRAME;
  const index = buildSolverIndex(stars, FRAME);
  const at = (x: number, y: number): number => y * width + x;

  // The same sky with no clutter, to tell real stars from false ones.
  const clean = detectStars(render({ raDeg: 84, decDeg: 0 }).pixels, width, height).stars;

  /** Detections inside an area that are not real stars, found in the same sky with no clutter. */
  const falseIn = (found: { x: number; y: number }[], inside: (x: number, y: number) => boolean): number =>
    found.filter(
      ({ x, y }) =>
        inside(Math.round(x), Math.round(y)) && !clean.some((star) => Math.hypot(star.x - x, star.y - y) < 2),
    ).length;

  it('ignores the darkened corners and a dark band along one side', () => {
    const { pixels, truth } = render({ raDeg: 84, decDeg: 0 });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // The lens lets less light reach the corners.
        const r2 = ((x - width / 2) / (width / 2)) ** 2 + ((y - height / 2) / (height / 2)) ** 2;
        pixels[at(x, y)] *= 1 - 0.3 * r2;
        // A darker band down the left edge, with a sharp border.
        if (x < 40) pixels[at(x, y)] *= 0.5;
      }
    }
    const { stars: found } = detectStars(pixels, width, height);
    // Nothing along the band's border, where the sky changes sharply.
    expect(falseIn(found, (x) => Math.abs(x - 40) <= 4)).toBe(0);
    const solution = solveFrame(found, FRAME, index);
    expect(angleDeg(solution!.pointing, truth)).toBeLessThan(0.2);
  });

  it('ignores the edges of a terrace beam across the sky', () => {
    const { pixels, truth } = render({ raDeg: 84, decDeg: 0 });
    // A dark beam, 24 pixels wide, running diagonally across the frame.
    const distance = (x: number, y: number): number => Math.abs(0.6 * x - y + 300) / Math.hypot(0.6, 1);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (distance(x, y) < 12) pixels[at(x, y)] = 8;
    const { stars: found } = detectStars(pixels, width, height);
    expect(falseIn(found, (x, y) => distance(x, y) < 16)).toBe(0);
    const solution = solveFrame(found, FRAME, index);
    expect(angleDeg(solution!.pointing, truth)).toBeLessThan(0.2);
  });

  it('ignores lit windows and a streetlight, and their glare', () => {
    const { pixels, truth } = render({ raDeg: 84, decDeg: 0 });
    const building = (x: number, y: number): boolean => y >= 800;
    const windows: [number, number][] = [];
    for (let y = 800; y < height; y++) for (let x = 0; x < width; x++) pixels[at(x, y)] = 12;
    // Rows of lit windows, 8 by 6 pixels, evenly lit with hard edges, brighter than any star.
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        const [left, top] = [30 + col * 85, 820 + row * 45];
        windows.push([left, top]);
        for (let y = top; y < top + 6; y++) for (let x = left; x < left + 8; x++) pixels[at(x, y)] = 250;
      }
    }
    // A streetlight: a bright disc with glare fading around it, which noise breaks into spots.
    const [lampX, lampY] = [420, 700];
    const random = randomSource(5);
    for (let y = lampY - 60; y < lampY + 60; y++) {
      for (let x = lampX - 60; x < lampX + 60; x++) {
        const r = Math.hypot(x - lampX, y - lampY);
        pixels[at(x, y)] += r < 18 ? 200 : (2000 / r ** 1.5) * (0.5 + random());
      }
    }
    const { stars: found } = detectStars(pixels, width, height);
    expect(falseIn(found, (x, y) => building(x, y))).toBe(0);
    expect(falseIn(found, (x, y) => Math.hypot(x - lampX, y - lampY) < 40)).toBe(0);
    const solution = solveFrame(found, FRAME, index);
    expect(angleDeg(solution!.pointing, truth)).toBeLessThan(0.2);
  });

  it('still finds a bright star whose middle is clipped by the camera', () => {
    const pixels = new Float32Array(width * height).fill(30);
    const [starX, starY] = [270.4, 480.6];
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const [ix, iy] = [Math.round(starX) + dx, Math.round(starY) + dy];
        const value = 30 + 2000 * Math.exp(-((ix - starX) ** 2 + (iy - starY) ** 2) / (2 * 1.6 ** 2));
        pixels[at(ix, iy)] = Math.min(255, value);
      }
    }
    const { stars: found } = detectStars(pixels, width, height);
    expect(found).toHaveLength(1);
    expect(Math.hypot(found[0].x - starX, found[0].y - starY)).toBeLessThan(0.3);
  });
});
