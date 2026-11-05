// A test plate solver, with no Angular dependency. It matches triangles of detected
// stars against a catalogue. It proves the idea on real images, and isn't necessarily
// the final solver. tetra3 and cedar-solve are still to be evaluated.
//
// Image coordinates are x to the right and y downwards. With z looking out through the
// image, those axes are right-handed, so a real rotation links them to the sky.

import type { Vector3 } from './astronomy';
import { equatorialVector } from './astronomy';

export interface CatalogStar {
  vector: Vector3;
  mag: number;
}

export interface ImageStar {
  x: number;
  y: number;
}

export interface FrameGeometry {
  width: number;
  height: number;
  /** Focal length in pixels, which sets the field of view. */
  focalPx: number;
  /** True for a mirror mount, which reverses the image. */
  flipped?: boolean;
}

export interface SolveHint {
  direction: Vector3;
  radiusDeg: number;
}

export interface Solution {
  /** Where the middle of the image points, as a J2000 vector. */
  pointing: Vector3;
  raDeg: number;
  decDeg: number;
  /** How many of the stars checked landed on a catalogue star. */
  matched: number;
  checked: number;
  /** The focal length that fitted, which measures the camera's real field of view. */
  focalPx: number;
  /** Maps a direction from the camera's axes to the sky. */
  toSky: (v: Vector3) => Vector3;
}

/** Everything the solver prepares in advance for a given field of view. */
export interface SolverIndex {
  pattern: CatalogStar[];
  separations: Float64Array;
  first: Int32Array;
  second: Int32Array;
  grid: StarGrid;
  allStars: CatalogStar[];
}

const RAD = Math.PI / 180;
const STARS_PER_FRAME = 40; // Enough catalogue stars for patterns, without false candidates
const STARS_TO_MATCH = 12;
const STARS_TO_CHECK = 25;
const MIN_MATCHES = 8;
/**
 * How unlikely the matches must be by chance alone before an answer is accepted. The
 * search can try millions of candidates, so a frame gets millions of chances for an
 * accident, and this has to be far smaller than one in millions. Testing found confident
 * wrong answers on a starless image with looser limits.
 */
const MAX_CHANCE_PROBABILITY = 1e-12;
/** Each candidate is built to fit two stars and passes a check on a third, so they prove nothing. */
const STARS_MATCHED_BY_CONSTRUCTION = 3;
/** Only compare with this many times as many catalogue stars as are being checked. */
const CATALOG_STARS_PER_CHECKED_STAR = 4;
const MAX_CANDIDATES = 400_000;
/**
 * A frame with nothing to find, such as clouds, otherwise searches every possibility.
 * The limit keeps the phone responsive. Giving up just means no answer for that frame.
 */
const DEFAULT_TIME_LIMIT_MS = 6000;
const TOLERANCE_PX = 3;
const TOLERANCE_FIELD_SHARE = 0.004; // Allows for lens distortion, growing with the field
/** The real field of view isn't known exactly, so the search tries these scale factors. */
const FOCAL_FACTORS = [1, 0.97, 1.03, 0.94, 1.06, 0.91, 1.09, 0.88, 1.12, 0.85, 1.15];

const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vector3): Vector3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Finds the catalogue star closest to a direction quickly, using a 3D grid. */
class StarGrid {
  private readonly cells = new Map<number, number[]>();

  constructor(
    private readonly stars: CatalogStar[],
    private readonly cellSize: number,
  ) {
    stars.forEach((star, index) => {
      const [x, y, z] = this.coordinates(star.vector);
      const key = this.key(x, y, z);
      const cell = this.cells.get(key);
      if (cell) cell.push(index);
      else this.cells.set(key, [index]);
    });
  }

  private coordinates(v: Vector3): [number, number, number] {
    return [
      Math.floor((v[0] + 1) / this.cellSize),
      Math.floor((v[1] + 1) / this.cellSize),
      Math.floor((v[2] + 1) / this.cellSize),
    ];
  }

  private key(x: number, y: number, z: number): number {
    return (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  }

  /** The closest star no fainter than a limit, within an angle given by its cosine. */
  nearest(v: Vector3, cosTolerance: number, limitMag = Infinity): CatalogStar | null {
    const [cx, cy, cz] = this.coordinates(v);
    let best: CatalogStar | null = null;
    let bestDot = cosTolerance;
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let z = cz - 1; z <= cz + 1; z++) {
          for (const index of this.cells.get(this.key(x, y, z)) ?? []) {
            const d = dot(this.stars[index].vector, v);
            if (d > bestDot && this.stars[index].mag <= limitMag) {
              bestDot = d;
              best = this.stars[index];
            }
          }
        }
      }
    }
    return best;
  }
}

/** The widest angle across a frame, in degrees. */
function fieldDiagonalDeg({ width, height, focalPx }: FrameGeometry): number {
  return (2 * Math.atan(Math.hypot(width, height) / 2 / focalPx)) / RAD;
}

function toleranceRad(geometry: FrameGeometry): number {
  const perPixel = 1 / geometry.focalPx;
  return Math.max(TOLERANCE_PX * perPixel, TOLERANCE_FIELD_SHARE * fieldDiagonalDeg(geometry) * RAD);
}

/** Prepares the solver for a frame size. Stars must be sorted brightest first. */
export function buildSolverIndex(stars: CatalogStar[], geometry: FrameGeometry): SolverIndex {
  const halfW = Math.atan(geometry.width / 2 / geometry.focalPx) / RAD;
  const halfH = Math.atan(geometry.height / 2 / geometry.focalPx) / RAD;
  const count = Math.min(stars.length, Math.round((STARS_PER_FRAME * 41253) / (4 * halfW * halfH)));
  const pattern = stars.slice(0, count);

  // Allow for the widest focal factor that the search will try.
  const maxSeparation = Math.min(Math.PI, fieldDiagonalDeg(geometry) * RAD * 1.2);
  const cosMax = Math.cos(maxSeparation);
  const pairs: { separation: number; i: number; j: number }[] = [];
  for (let i = 0; i < pattern.length; i++) {
    for (let j = i + 1; j < pattern.length; j++) {
      const c = dot(pattern[i].vector, pattern[j].vector);
      if (c > cosMax) pairs.push({ separation: Math.acos(Math.min(1, c)), i, j });
    }
  }
  pairs.sort((a, b) => a.separation - b.separation);

  return {
    pattern,
    separations: Float64Array.from(pairs, (p) => p.separation),
    first: Int32Array.from(pairs, (p) => p.i),
    second: Int32Array.from(pairs, (p) => p.j),
    grid: new StarGrid(stars, Math.max(toleranceRad(geometry) * 2, 0.01)),
    allStars: stars,
  };
}

/** The probability of at least k successes in n tries, each with probability p. */
export function chanceOfAtLeast(k: number, n: number, p: number): number {
  let term = (1 - p) ** n; // The probability of exactly zero successes
  let total = k === 0 ? term : 0;
  for (let i = 1; i <= n; i++) {
    term *= ((n - i + 1) / i) * (p / (1 - p));
    if (i >= k) total += term;
  }
  return Math.min(1, total);
}

/** The fewest matches that couldn't reasonably happen by chance, or null if none could. */
export function matchesNeeded(checked: number, chancePerStar: number): number | null {
  const independent = checked - STARS_MATCHED_BY_CONSTRUCTION;
  for (let k = 1; k <= independent; k++) {
    if (chanceOfAtLeast(k, independent, chancePerStar) < MAX_CHANCE_PROBABILITY) {
      return Math.max(MIN_MATCHES, k + STARS_MATCHED_BY_CONSTRUCTION);
    }
  }
  return null;
}

const lowerBound = (values: Float64Array, target: number): number => {
  let [low, high] = [0, values.length];
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
};

/** An orientation from two matching pairs of directions, as a camera to sky function. */
function triad(cameraA: Vector3, cameraB: Vector3, skyA: Vector3, skyB: Vector3): (v: Vector3) => Vector3 {
  const c2 = normalize(cross(cameraA, cameraB));
  const c3 = cross(cameraA, c2);
  const s2 = normalize(cross(skyA, skyB));
  const s3 = cross(skyA, s2);
  return (v) => {
    const [a, b, c] = [dot(v, cameraA), dot(v, c2), dot(v, c3)];
    return [
      a * skyA[0] + b * s2[0] + c * s3[0],
      a * skyA[1] + b * s2[1] + c * s3[1],
      a * skyA[2] + b * s2[2] + c * s3[2],
    ];
  };
}

/** The direction in the camera's axes for a point in the image. */
export function imageToCamera({ x, y }: ImageStar, geometry: FrameGeometry): Vector3 {
  const dx = (x - geometry.width / 2) * (geometry.flipped ? -1 : 1);
  return normalize([dx / geometry.focalPx, (y - geometry.height / 2) / geometry.focalPx, 1]);
}

/** Tries one focal length. The image stars must be sorted brightest first. */
function solveAtFocal(
  imageStars: ImageStar[],
  geometry: FrameGeometry,
  index: SolverIndex,
  deadline: number,
  hint?: SolveHint,
): Solution | null {
  const tolerance = toleranceRad(geometry);
  const cosTolerance = Math.cos(tolerance);
  const toMatch = imageStars.slice(0, STARS_TO_MATCH).map((star) => imageToCamera(star, geometry));
  const toCheck = imageStars.slice(0, STARS_TO_CHECK).map((star) => imageToCamera(star, geometry));

  // The brightest detections should be the brightest stars in view, so only compare
  // with catalogue stars bright enough to be among them. Fewer catalogue stars means
  // fewer accidental matches.
  const frameAreaDeg2 =
    4 *
    (Math.atan(geometry.width / 2 / geometry.focalPx) / RAD) *
    (Math.atan(geometry.height / 2 / geometry.focalPx) / RAD);
  const expectedInFrame = CATALOG_STARS_PER_CHECKED_STAR * toCheck.length;
  const catalogCount = Math.round((expectedInFrame * 41253) / frameAreaDeg2);
  const limitMag = index.allStars[Math.min(catalogCount, index.allStars.length) - 1]?.mag ?? Infinity;

  // The chance that one detection lands near a catalogue star by accident.
  const toleranceDeg = tolerance / RAD;
  const chancePerStar = Math.min(0.5, (expectedInFrame / frameAreaDeg2) * Math.PI * toleranceDeg ** 2);
  const needed = matchesNeeded(toCheck.length, chancePerStar);
  if (needed === null) return null;

  // With a hint, only catalogue stars the frame could contain are considered.
  const allowed = hint
    ? index.pattern.map(
        (star) => dot(star.vector, hint.direction) > Math.cos((hint.radiusDeg + fieldDiagonalDeg(geometry) / 2) * RAD),
      )
    : null;

  let candidates = 0;
  for (let a = 0; a < toMatch.length; a++) {
    for (let b = a + 1; b < toMatch.length; b++) {
      const separation = Math.acos(Math.min(1, dot(toMatch[a], toMatch[b])));
      const end = lowerBound(index.separations, separation + tolerance);
      for (let p = lowerBound(index.separations, separation - tolerance); p < end; p++) {
        const [i, j] = [index.first[p], index.second[p]];
        if (allowed && !(allowed[i] && allowed[j])) continue;
        const [starI, starJ] = [index.pattern[i].vector, index.pattern[j].vector];

        // A pair of stars has two possible assignments.
        for (const [skyA, skyB] of [
          [starI, starJ],
          [starJ, starI],
        ]) {
          if (++candidates > MAX_CANDIDATES) return null;
          // Reading the clock is slow by comparison, so only check it now and then.
          if ((candidates & 1023) === 0 && performance.now() > deadline) return null;
          const toSky = triad(toMatch[a], toMatch[b], skyA, skyB);

          // Quick rejection: a third star must also land on a catalogue star.
          const thirdFound = toMatch.some(
            (v, c) => c !== a && c !== b && index.grid.nearest(toSky(v), cosTolerance, limitMag),
          );
          if (!thirdFound) continue;

          // Full check: enough of the detected stars must match the catalogue.
          // A catalogue star only counts once, however many detections sit beside it. On a
          // real overexposed frame, clusters of artifacts otherwise looked like many matches.
          const usedStars = new Set<CatalogStar>();
          const matches = toCheck.flatMap((camera) => {
            const star = index.grid.nearest(toSky(camera), cosTolerance, limitMag);
            if (!star || usedStars.has(star)) return [];
            usedStars.add(star);
            return [{ camera, sky: star.vector }];
          });
          if (matches.length < needed) continue;

          // Improve the answer using the two matches farthest apart.
          let [bestA, bestB, widest] = [matches[0], matches[1], -1];
          for (const m of matches) {
            for (const n of matches) {
              const angle = 1 - dot(m.camera, n.camera);
              if (angle > widest) [bestA, bestB, widest] = [m, n, angle];
            }
          }
          const refined = triad(bestA.camera, bestB.camera, bestA.sky, bestB.sky);
          const pointing = refined([0, 0, 1]);
          return {
            pointing,
            raDeg: (((Math.atan2(pointing[1], pointing[0]) / RAD) % 360) + 360) % 360,
            decDeg: Math.asin(Math.max(-1, Math.min(1, pointing[2]))) / RAD,
            matched: matches.length,
            checked: toCheck.length,
            focalPx: geometry.focalPx,
            toSky: refined,
          };
        }
      }
    }
  }
  return null;
}

/**
 * Solves a frame, trying a range of focal lengths around the expected one. Returns null
 * if nothing fits confidently. A frame with no answer is better than a wrong answer.
 */
export function solveFrame(
  imageStars: ImageStar[],
  geometry: FrameGeometry,
  index: SolverIndex,
  hint?: SolveHint,
  timeLimitMs = DEFAULT_TIME_LIMIT_MS,
): Solution | null {
  const deadline = performance.now() + timeLimitMs;
  for (const factor of FOCAL_FACTORS) {
    if (performance.now() > deadline) return null;
    const solution = solveAtFocal(
      imageStars,
      { ...geometry, focalPx: geometry.focalPx * factor },
      index,
      deadline,
      hint,
    );
    if (solution) return solution;
  }
  return null;
}

export interface DepthBin {
  mag: number;
  inFrame: number;
  detected: number;
}

/**
 * Measures how faint the camera really reached: for each magnitude, how many catalogue
 * stars were in the frame, and how many of them were detected. This is the number to
 * compare with the simulation.
 */
export function measureDepth(
  solution: Solution,
  imageStars: ImageStar[],
  geometry: FrameGeometry,
  stars: CatalogStar[],
): DepthBin[] {
  const frame = { ...geometry, focalPx: solution.focalPx };
  const tolerancePx = Math.max(TOLERANCE_PX, toleranceRad(frame) * frame.focalPx);

  // The inverse of the camera to sky rotation, found from where the axes land.
  const axisX = solution.toSky([1, 0, 0]);
  const axisY = solution.toSky([0, 1, 0]);
  const axisZ = solution.toSky([0, 0, 1]);

  const bins = new Map<number, DepthBin>();
  for (const star of stars) {
    const z = dot(star.vector, axisZ);
    if (z <= 0) continue;
    const cameraX = (frame.focalPx * dot(star.vector, axisX)) / z;
    const x = frame.width / 2 + cameraX * (frame.flipped ? -1 : 1);
    const y = frame.height / 2 + (frame.focalPx * dot(star.vector, axisY)) / z;
    if (x < 0 || x >= frame.width || y < 0 || y >= frame.height) continue;
    const mag = Math.floor(star.mag);
    const bin = bins.get(mag) ?? { mag, inFrame: 0, detected: 0 };
    bin.inFrame++;
    if (imageStars.some((s) => Math.hypot(s.x - x, s.y - y) <= tolerancePx)) bin.detected++;
    bins.set(mag, bin);
  }
  return [...bins.values()].sort((a, b) => a.mag - b.mag);
}

/** Converts the app's star file rows to catalogue stars. */
export function catalogFromRows(rows: readonly (readonly number[])[]): CatalogStar[] {
  return rows.map(([ra, dec, mag]) => ({ vector: equatorialVector(ra, dec), mag }));
}
