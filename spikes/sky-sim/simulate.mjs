// Feasibility simulator for AstroFinder: can a phone in a bright city see enough
// stars, through a browser video stream, for plate solving to work?
//
// It does NOT render pixels. For each trial it:
//   1. Picks a random time and pointing as seen from the observer's location.
//   2. Uses a photon noise model to decide which real catalogue stars are detected.
//   3. Runs a real star-pattern solver on the resulting list of star positions.
//   4. Compares the solved pointing with the known truth.
//
// Usage: node simulate.mjs <stars.8.json> [trialsPerScenario] [outputJson]
// The star file is data/stars.8.json from https://github.com/ofrohn/d3-celestial
// It is used for this analysis only and is not part of the app.

import { readFileSync, writeFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Assumptions. Everything uncertain is here so it can be challenged and changed.
// ---------------------------------------------------------------------------

const SITE = {
  latitudeDeg: 39.47, // Valencia city centre
  zenithSkyMagPerArcsec2: 17.5, // Measured in the city centre, March to April 2014
  extinctionMagPerAirmass: 0.3, // Assumed for a low-altitude urban site
  skyBrighteningAtHorizonMag: 0.8, // Assumed: sky is this much brighter low down
  minStarAltitudeDeg: 15, // Assumed: buildings hide anything lower
};

// Electrons per second per cm² of aperture from a magnitude 0 star. This is
// 1000 photons/s/cm²/Å × 1000 Å effective band × 0.6 sensor efficiency × 0.8 optics.
const ZERO_MAG_ELECTRONS = 1000 * 1000 * 0.6 * 0.8;

const VIDEO_WIDTH_PX = 1920; // Assumed browser stream size, 16:9 crop of the sensor
const VIDEO_HEIGHT_PX = 1080;
const DETECTION_SNR = 5; // A star counts as detected above this signal to noise
let falseDetectionsPerFrame = 3; // Assumed noise spikes and hot pixels. Changed by stress tests
const VIGNETTING_AT_CORNER_MAG = 0.6; // Assumed light loss at the frame corner
const SIDEREAL_ARCSEC_PER_S = 15;

// Camera specs come from published Honor Magic5 Pro data. Physical focal length is
// derived from the 35 mm equivalent. PSF and read noise are assumptions.
const CAMERAS = {
  main: { label: 'Main 23 mm f/1.6', fEqMm: 23, fNumber: 1.6, sensorWidthMm: 11.4, sensorDiagMm: 14.3, nativePixelUm: 1.4, psfUm: 6, readNoiseE: 1.5 },
  tele: { label: 'Telephoto 90 mm f/3.0', fEqMm: 90, fNumber: 3.0, sensorWidthMm: 5.7, sensorDiagMm: 7.14, nativePixelUm: 0.7, psfUm: 4, readNoiseE: 1.5 },
  wide: { label: 'Ultrawide 13 mm f/2.0', fEqMm: 13, fNumber: 2.0, sensorWidthMm: 5.2, sensorDiagMm: 6.5, nativePixelUm: 0.64, psfUm: 4, readNoiseE: 1.5 },
  // A hypothetical 8×30 monocular clipped in front of the main camera.
  clipOn: { label: 'Main + 8×30 clip-on', fEqMm: 23, fNumber: 1.6, sensorWidthMm: 11.4, sensorDiagMm: 14.3, nativePixelUm: 1.4, psfUm: 8, readNoiseE: 1.5, afocalMagnification: 8, objectiveMm: 30, throughput: 0.7 },
  // A StarSense-style mirror mount. Same camera, some light lost, image flipped.
  mirror: { label: 'Main + mirror', fEqMm: 23, fNumber: 1.6, sensorWidthMm: 11.4, sensorDiagMm: 14.3, nativePixelUm: 1.4, psfUm: 6, readNoiseE: 1.5, throughput: 0.85, flipped: true },
};

// How much the phone's image processing and 8-bit video reduce signal to noise.
// This is the largest unknown and can only be measured on the real phone.
const PROCESSING = { nominal: 0.7, pessimistic: 0.4 };

// Exposure of one frame, and how many frames are stacked.
const EXPOSURES = [
  { label: '1/30 s', t: 1 / 30, frames: 1 },
  { label: '1/15 s', t: 1 / 15, frames: 1 },
  { label: '1/8 s', t: 1 / 8, frames: 1 },
  { label: '1/4 s', t: 1 / 4, frames: 1 },
  { label: '1 s', t: 1, frames: 1 },
  { label: '1/15 s × 30', t: 1 / 15, frames: 30 },
];

// Stress tests: deliberately bad conditions, applied to the main camera, to find
// where the conclusion breaks. Each changes the baseline in the ways listed.
const STRESS_TESTS = [
  { label: 'Baseline', processing: 0.7 },
  { label: 'Sky 1 mag brighter (16.5)', processing: 0.7, sky: 16.5 },
  { label: 'Focus off, stars 3× wider', processing: 0.7, psfScale: 3 },
  { label: 'Heavy processing (SNR × 0.2)', processing: 0.2 },
  { label: '30 false detections per frame', processing: 0.7, falseDetections: 30 },
  { label: 'All bad: sky 17, stars 2× wider, SNR × 0.4, 10 false', processing: 0.4, sky: 17, psfScale: 2, falseDetections: 10 },
];

// A solver in a real app must give up eventually, so a frame that exceeds this
// many candidates counts as unsolved. Without it, frames with too few real stars
// search the whole catalogue, which takes hours at narrow fields of view.
const MAX_CANDIDATES = 500_000;

// Standard deviation of the sensor estimate given to the solver.
const HINTS = [
  { label: 'none', sigmaDeg: null },
  { label: 'compass 10°', sigmaDeg: 10 },
  { label: 'tracked 1°', sigmaDeg: 1 },
];

// ---------------------------------------------------------------------------
// Small maths helpers
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const angleDeg = (a, b) => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b)) / RAD;
const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN);
const median = (values) => percentile([...values].sort((a, b) => a - b), 0.5);

// Seeded random numbers, so every run gives the same answer.
function makeRandom(seed) {
  let s = seed >>> 0;
  const uniform = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gaussian = () => Math.sqrt(-2 * Math.log(uniform() + 1e-12)) * Math.cos(2 * Math.PI * uniform());
  const poisson = (lambda) => {
    const limit = Math.exp(-lambda);
    let k = 0;
    for (let p = uniform(); p > limit; p *= uniform()) k++;
    return k;
  };
  return { uniform, gaussian, poisson };
}

// ---------------------------------------------------------------------------
// Camera and noise model
// ---------------------------------------------------------------------------

/** Works out the optical numbers that follow from a camera's published specs. */
function deriveCamera(spec) {
  const magnification = spec.afocalMagnification ?? 1;
  const nativeFocalMm = (spec.fEqMm * spec.sensorDiagMm) / 43.27;
  const focalMm = nativeFocalMm * magnification;
  // A clip-on's light gathering is limited by the smaller of its objective and
  // the phone's entrance pupil scaled up by the magnification.
  const apertureMm = Math.min(spec.objectiveMm ?? Infinity, (nativeFocalMm / spec.fNumber) * magnification);
  const outputPixelUm = (spec.sensorWidthMm * 1000) / VIDEO_WIDTH_PX;
  const arcsecPerPixel = (206265 * (outputPixelUm / 1000)) / focalMm;
  const focalPx = (focalMm * 1000) / outputPixelUm;
  const nativePerOutput = (outputPixelUm / spec.nativePixelUm) ** 2;
  return {
    ...spec,
    focalMm,
    focalPx,
    apertureAreaCm2: Math.PI * (apertureMm / 20) ** 2 * (spec.throughput ?? 1),
    arcsecPerPixel,
    // Downscaling sums native pixels, so their read noise adds in quadrature.
    readNoisePerOutputPixel: spec.readNoiseE * Math.sqrt(nativePerOutput),
    psfPx: Math.max(1.5, spec.psfUm / outputPixelUm),
    fovHDeg: (2 * Math.atan(VIDEO_WIDTH_PX / 2 / focalPx)) / RAD,
    fovVDeg: (2 * Math.atan(VIDEO_HEIGHT_PX / 2 / focalPx)) / RAD,
    fovDiagDeg: (2 * Math.atan(Math.hypot(VIDEO_WIDTH_PX, VIDEO_HEIGHT_PX) / 2 / focalPx)) / RAD,
  };
}

const airmass = (altitudeDeg) => {
  const s = Math.sin(altitudeDeg * RAD);
  return 1 / (s + 0.025 * Math.exp(-11 * s));
};

/**
 * Signal to noise of one star in a stacked exposure, using a matched filter.
 * Noise is star shot noise plus sky shot noise and read noise across the PSF.
 */
function starSnr(cam, exposure, processing, cameraMag, altitudeDeg, cornerFraction) {
  const vignetting = VIGNETTING_AT_CORNER_MAG * cornerFraction ** 2;
  const starMag = cameraMag + SITE.extinctionMagPerAirmass * airmass(altitudeDeg) + vignetting;
  const skyMag = SITE.zenithSkyMagPerArcsec2 - SITE.skyBrighteningAtHorizonMag * (1 - Math.sin(altitudeDeg * RAD)) + vignetting;
  const scale = ZERO_MAG_ELECTRONS * cam.apertureAreaCm2;

  const star = scale * 10 ** (-0.4 * starMag) * exposure.t;
  const skyPerPixel = scale * 10 ** (-0.4 * skyMag) * cam.arcsecPerPixel ** 2 * exposure.t;

  // Earth's rotation smears the star during a single frame. Stacked frames are
  // assumed to be aligned first, so only one frame's smear counts.
  const trailPx = (SIDEREAL_ARCSEC_PER_S * exposure.t) / cam.arcsecPerPixel;
  const fwhmPx = Math.hypot(cam.psfPx, trailPx);
  const noisePixels = 2.27 * fwhmPx ** 2; // Effective pixels for a Gaussian matched filter

  const variance = star + noisePixels * (skyPerPixel + cam.readNoisePerOutputPixel ** 2);
  return { snr: (star / Math.sqrt(variance)) * Math.sqrt(exposure.frames) * processing, fwhmPx };
}

/** Faintest magnitude detectable at the frame centre at a given altitude. */
function limitingMagnitude(cam, exposure, processing, altitudeDeg = 60) {
  let low = -2;
  let high = 15;
  for (let i = 0; i < 40; i++) {
    const mag = (low + high) / 2;
    if (starSnr(cam, exposure, processing, mag, altitudeDeg, 0).snr > DETECTION_SNR) low = mag;
    else high = mag;
  }
  return low;
}

// ---------------------------------------------------------------------------
// Sky: real stars seen from the site at a random time and pointing
// ---------------------------------------------------------------------------

function loadStars(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8')).features;
  return raw
    .map((f) => {
      const ra = f.geometry.coordinates[0] * RAD;
      const dec = f.geometry.coordinates[1] * RAD;
      const bv = Number.parseFloat(f.properties.bv);
      return {
        v: [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)],
        mag: f.properties.mag,
        // Phone sensors see more red light than the V band, so red stars look brighter.
        cameraMag: f.properties.mag - 0.3 * ((Number.isFinite(bv) ? bv : 0.6) - 0.6),
      };
    })
    .sort((a, b) => a.mag - b.mag);
}

/** Rows of the rotation from equatorial coordinates to local east, north, up. */
function equatorialToLocal(lstRad) {
  const sinLat = Math.sin(SITE.latitudeDeg * RAD);
  const cosLat = Math.cos(SITE.latitudeDeg * RAD);
  const c = Math.cos(lstRad);
  const s = Math.sin(lstRad);
  return [
    [-s, c, 0],
    [-sinLat * c, -sinLat * s, cosLat],
    [cosLat * c, cosLat * s, sinLat],
  ];
}

/** Simulates one frame. Returns the detected star list and the true pointing. */
function simulateFrame(cam, exposure, processing, stars, rng) {
  const lst = rng.uniform() * 2 * Math.PI;
  const toLocal = equatorialToLocal(lst);

  // Pick a pointing uniformly over the sky between 30° and 85° altitude.
  const sinAlt = Math.sin(30 * RAD) + rng.uniform() * (Math.sin(85 * RAD) - Math.sin(30 * RAD));
  const cosAlt = Math.sqrt(1 - sinAlt * sinAlt);
  const az = rng.uniform() * 2 * Math.PI;
  const bore = [cosAlt * Math.sin(az), cosAlt * Math.cos(az), sinAlt];

  // Build the camera axes, with the phone rolled to a random angle.
  const right0 = norm(cross(bore, [0, 0, 1]));
  const up0 = cross(right0, bore);
  const roll = rng.uniform() * 2 * Math.PI;
  const right = right0.map((r, i) => Math.cos(roll) * r + Math.sin(roll) * up0[i]);
  const up = up0.map((u, i) => Math.cos(roll) * u - Math.sin(roll) * right0[i]);

  // The lens model is only known approximately after calibration.
  const focalError = 1 + 0.002 * rng.gaussian();
  const distortionPx = 1.5 * rng.gaussian();
  const halfDiagPx = Math.hypot(VIDEO_WIDTH_PX, VIDEO_HEIGHT_PX) / 2;
  const flip = cam.flipped ? -1 : 1;

  const detections = [];
  for (const star of stars) {
    const e = star.v;
    const local = [dot(toLocal[0], e), dot(toLocal[1], e), dot(toLocal[2], e)];
    const z = dot(local, bore);
    if (z <= 0) continue;
    const px = (cam.focalPx * dot(local, right)) / z;
    const py = (cam.focalPx * dot(local, up)) / z;
    if (Math.abs(px) > VIDEO_WIDTH_PX / 2 || Math.abs(py) > VIDEO_HEIGHT_PX / 2) continue;

    const altitudeDeg = Math.asin(local[2]) / RAD;
    if (altitudeDeg < SITE.minStarAltitudeDeg) continue;

    const corner = Math.hypot(px, py) / halfDiagPx;
    const { snr, fwhmPx } = starSnr(cam, exposure, processing, star.cameraMag, altitudeDeg, corner);
    const measuredSnr = snr + rng.gaussian();
    if (measuredSnr < DETECTION_SNR) continue;

    // Centroid noise shrinks with signal, down to a floor from sampling and optics.
    const sigmaPx = Math.hypot(fwhmPx / (2.355 * Math.max(measuredSnr, 1)), 0.1);
    const radial = 1 + (distortionPx * corner ** 2) / Math.max(Math.hypot(px, py), 1);
    detections.push({
      x: flip * (px * radial * focalError + sigmaPx * rng.gaussian()),
      y: py * radial * focalError + sigmaPx * rng.gaussian(),
      strength: measuredSnr,
    });
  }

  // Add false detections just above the threshold.
  const falseCount = rng.poisson(falseDetectionsPerFrame);
  for (let i = 0; i < falseCount; i++) {
    detections.push({
      x: (rng.uniform() - 0.5) * VIDEO_WIDTH_PX,
      y: (rng.uniform() - 0.5) * VIDEO_HEIGHT_PX,
      strength: DETECTION_SNR - Math.log(rng.uniform() + 1e-12),
    });
  }
  detections.sort((a, b) => b.strength - a.strength);

  // The true pointing in equatorial coordinates uses the rotation's transpose.
  const truth = [0, 1, 2].map((i) => toLocal[0][i] * bore[0] + toLocal[1][i] * bore[1] + toLocal[2][i] * bore[2]);
  return { detections, truth, realCount: detections.length - falseCount };
}

// ---------------------------------------------------------------------------
// Solver: match triangles of detected stars against a catalogue
// ---------------------------------------------------------------------------

/** Looks up the catalogue star closest to a direction, using a 3D grid. */
class StarGrid {
  constructor(stars, cellSize) {
    this.stars = stars;
    this.cellSize = cellSize;
    this.cells = new Map();
    stars.forEach((star, index) => {
      const key = this.key(...this.coords(star.v));
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key).push(index);
    });
  }

  coords(v) {
    return v.map((c) => Math.floor((c + 1) / this.cellSize));
  }

  key(x, y, z) {
    return (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  }

  /** Returns true if a star lies within the angular tolerance of the direction. */
  hasNear(v, cosTolerance) {
    const [cx, cy, cz] = this.coords(v);
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (let z = cz - 1; z <= cz + 1; z++) {
          const bucket = this.cells.get(this.key(x, y, z));
          if (!bucket) continue;
          for (const index of bucket) {
            if (dot(this.stars[index].v, v) > cosTolerance) return true;
          }
        }
      }
    }
    return false;
  }
}

/** Pre-computes what the solver needs for a camera. Real apps would ship this as an index. */
function buildIndex(cam, stars, verifyLimitMag) {
  // Use enough stars for about 40 in the frame. This density is what a pattern
  // solver needs. More stars only add false candidates.
  const fovAreaDeg2 = cam.fovHDeg * cam.fovVDeg;
  const patternCount = Math.min(stars.length, Math.round((40 * 41253) / fovAreaDeg2));
  const pattern = stars.slice(0, patternCount);

  const maxSep = cam.fovDiagDeg * RAD;
  const cosMax = Math.cos(maxSep);
  const pairs = [];
  for (let i = 0; i < pattern.length; i++) {
    for (let j = i + 1; j < pattern.length; j++) {
      const c = dot(pattern[i].v, pattern[j].v);
      if (c > cosMax) pairs.push({ sep: Math.acos(Math.min(1, c)), i, j });
    }
  }
  pairs.sort((a, b) => a.sep - b.sep);

  const seps = Float64Array.from(pairs, (p) => p.sep);
  const first = Int32Array.from(pairs, (p) => p.i);
  const second = Int32Array.from(pairs, (p) => p.j);

  // Tolerance covers a few pixels of error plus the lens model error at the edge.
  const toleranceRad = Math.max(3 * cam.arcsecPerPixel, 0.004 * cam.fovDiagDeg * 1800) * (RAD / 3600);
  const verifyStars = stars.filter((s) => s.mag <= verifyLimitMag);
  return {
    pattern,
    seps,
    first,
    second,
    toleranceRad,
    cosTolerance: Math.cos(toleranceRad),
    patternGrid: new StarGrid(pattern, Math.max(toleranceRad * 2, 0.01)),
    verifyGrid: new StarGrid(verifyStars, Math.max(toleranceRad * 2, 0.01)),
    verifyStars,
    memoryPairs: pairs.length,
  };
}

const lowerBound = (array, value) => {
  let low = 0;
  let high = array.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (array[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
};

/** An attitude from two direction pairs. Returns a camera to sky rotation function. */
function triad(camA, camB, skyA, skyB) {
  const c2 = norm(cross(camA, camB));
  const c3 = cross(camA, c2);
  const s2 = norm(cross(skyA, skyB));
  const s3 = cross(skyA, s2);
  return (v) => {
    const a = dot(v, camA);
    const b = dot(v, c2);
    const c = dot(v, c3);
    return [0, 1, 2].map((i) => a * skyA[i] + b * s2[i] + c * s3[i]);
  };
}

/** Solves one frame. Returns the pointing, or null if no confident match exists. */
function solve(cam, index, detections, hint, tryBothParities) {
  const started = performance.now();
  const use = detections.slice(0, 12);
  const verify = detections.slice(0, 25);
  const needed = Math.max(6, Math.ceil(verify.length * 0.5));
  let candidates = 0;
  if (use.length < 4) return { result: null, candidates, ms: performance.now() - started };

  // With a hint, only catalogue stars the frame could possibly contain are considered.
  const allowed = hint ? index.pattern.map((s) => dot(s.v, hint.direction) > hint.cosRadius) : null;

  for (const parity of tryBothParities ? [1, -1] : [1]) {
    // Image axes (x right, y up, looking forward) are left-handed, but rotations
    // need right-handed axes, so y is negated. Without this, every frame looks
    // like a mirror image to the solver and nothing matches.
    const toVector = (d) => norm([(parity * d.x) / cam.focalPx, -d.y / cam.focalPx, 1]);
    const useVecs = use.map(toVector);
    const verifyVecs = verify.map(toVector);

    for (let a = 0; a < useVecs.length; a++) {
      for (let b = a + 1; b < useVecs.length; b++) {
        const sep = Math.acos(Math.min(1, dot(useVecs[a], useVecs[b])));
        const end = lowerBound(index.seps, sep + index.toleranceRad);
        for (let p = lowerBound(index.seps, sep - index.toleranceRad); p < end; p++) {
          const i = index.first[p];
          const j = index.second[p];
          if (allowed && !(allowed[i] && allowed[j])) continue;

          // A pair of stars has two possible assignments.
          for (const [skyA, skyB] of [[index.pattern[i].v, index.pattern[j].v], [index.pattern[j].v, index.pattern[i].v]]) {
            candidates++;
            if (candidates > MAX_CANDIDATES) return { result: null, candidates, ms: performance.now() - started };
            const toSky = triad(useVecs[a], useVecs[b], skyA, skyB);

            // Quick rejection: a third star must also land on a catalogue star.
            let thirdFound = false;
            for (let c = 0; c < useVecs.length && !thirdFound; c++) {
              if (c !== a && c !== b) thirdFound = index.patternGrid.hasNear(toSky(useVecs[c]), index.cosTolerance);
            }
            if (!thirdFound) continue;

            // Full check: enough of the detected stars must match the catalogue.
            let matched = 0;
            for (const vector of verifyVecs) {
              if (index.verifyGrid.hasNear(toSky(vector), index.cosTolerance)) matched++;
            }
            if (matched >= needed) {
              return { result: { pointing: toSky([0, 0, 1]), parity, matched }, candidates, ms: performance.now() - started };
            }
          }
        }
      }
    }
  }
  return { result: null, candidates, ms: performance.now() - started };
}

/** Moves a direction by a random error, to mimic an imperfect sensor estimate. */
function perturb(direction, sigmaDeg, rng) {
  const helper = Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm(cross(direction, helper));
  const e2 = cross(direction, e1);
  const a = Math.tan(sigmaDeg * RAD * rng.gaussian());
  const b = Math.tan(sigmaDeg * RAD * rng.gaussian());
  return norm(direction.map((d, i) => d + a * e1[i] + b * e2[i]));
}

// ---------------------------------------------------------------------------
// Scenario runner and report
// ---------------------------------------------------------------------------

function runScenario(cam, index, exposure, processing, hintSpec, stars, trials, seed) {
  // Separate generators, so every hint setting is tested on identical frames.
  const rng = makeRandom(seed);
  const hintRng = makeRandom(seed + 1000003);
  const counts = [];
  const errors = [];
  const times = [];
  const candidates = [];
  let solved = 0;
  let wrong = 0;
  let enoughStars = 0;

  for (let t = 0; t < trials; t++) {
    const frame = simulateFrame(cam, exposure, processing, stars, rng);
    counts.push(frame.realCount);
    if (frame.realCount >= 8) enoughStars++;

    const hint = hintSpec.sigmaDeg === null
      ? null
      : {
          direction: perturb(frame.truth, hintSpec.sigmaDeg, hintRng),
          // Three sigma of sensor error, per axis, plus half the frame diagonal.
          cosRadius: Math.cos((3.5 * hintSpec.sigmaDeg + cam.fovDiagDeg / 2) * RAD),
        };
    const outcome = solve(cam, index, frame.detections, hint, !!cam.flipped);
    times.push(outcome.ms);
    candidates.push(outcome.candidates);
    if (outcome.result) {
      const error = angleDeg(outcome.result.pointing, frame.truth);
      if (error > 1 || (cam.flipped && outcome.result.parity !== -1)) wrong++;
      else {
        solved++;
        errors.push(error);
      }
    }
  }
  const sortedCounts = [...counts].sort((a, b) => a - b);
  const sortedErrors = [...errors].sort((a, b) => a - b);
  return {
    trials,
    starsMedian: percentile(sortedCounts, 0.5),
    starsP10: percentile(sortedCounts, 0.1),
    pctEnoughStars: (100 * enoughStars) / trials,
    pctSolved: (100 * solved) / trials,
    pctWrong: (100 * wrong) / trials,
    errorMedianDeg: percentile(sortedErrors, 0.5),
    errorP95Deg: percentile(sortedErrors, 0.95),
    msMedian: median(times),
    candidatesMedian: median(candidates),
  };
}

function main() {
  const [, , starPath, trialsArg, outputPath] = process.argv;
  if (!starPath) throw new Error('Usage: node simulate.mjs <stars.8.json> [trials] [outputJson]');
  const trials = Number(trialsArg ?? 200);
  const stars = loadStars(starPath);
  const output = { site: SITE, trials, cameras: {}, limits: [], scenarios: [] };

  console.log(`Loaded ${stars.length} stars. ${trials} trials per scenario.`);
  // SIM_CAMERAS limits the run to some cameras, for example SIM_CAMERAS=clipOn.
  const onlyCameras = process.env.SIM_CAMERAS?.split(',');
  for (const [key, spec] of Object.entries(CAMERAS)) {
    if (onlyCameras && !onlyCameras.includes(key)) continue;
    const cam = deriveCamera(spec);
    output.cameras[key] = {
      label: cam.label,
      focalMm: cam.focalMm,
      apertureAreaCm2: cam.apertureAreaCm2,
      arcsecPerPixel: cam.arcsecPerPixel,
      fovHDeg: cam.fovHDeg,
      fovVDeg: cam.fovVDeg,
    };
    console.log(`${cam.label}: f=${cam.focalMm.toFixed(1)} mm, ${cam.arcsecPerPixel.toFixed(0)}"/px, FOV ${cam.fovHDeg.toFixed(1)}×${cam.fovVDeg.toFixed(1)}°`);

    for (const exposure of EXPOSURES) {
      for (const [processingName, processing] of Object.entries(PROCESSING)) {
        output.limits.push({ camera: key, exposure: exposure.label, processing: processingName, limitMag: limitingMagnitude(cam, exposure, processing) });
      }
    }

    // Verify against stars down to the deepest limit this camera might reach.
    const deepest = Math.min(8, limitingMagnitude(cam, EXPOSURES.at(-1), PROCESSING.nominal) + 0.5);
    const index = buildIndex(cam, stars, deepest);
    console.log(`  index: ${index.pattern.length} stars, ${index.memoryPairs} pairs, tolerance ${(index.toleranceRad / RAD).toFixed(3)}°`);

    let seed = 12345;
    for (const exposure of EXPOSURES) {
      for (const [processingName, processing] of Object.entries(PROCESSING)) {
        seed += 1;
        for (const hint of HINTS) {
          // The clip-on's large catalogue makes it much slower, so it gets fewer trials.
          const scenarioTrials = key === 'clipOn' ? Math.ceil(trials / 4) : trials;
          const stats = runScenario(cam, index, exposure, processing, hint, stars, scenarioTrials, seed);
          output.scenarios.push({ camera: key, exposure: exposure.label, processing: processingName, hint: hint.label, ...stats });
          console.log(
            `  ${exposure.label.padEnd(12)} ${processingName.padEnd(11)} hint ${hint.label.padEnd(12)} stars ${String(stats.starsMedian).padStart(4)} (p10 ${String(stats.starsP10).padStart(4)}) solved ${stats.pctSolved.toFixed(0).padStart(3)}% wrong ${stats.pctWrong.toFixed(1)}% err ${stats.errorMedianDeg?.toFixed(3)}° ${stats.msMedian.toFixed(1)} ms`,
          );
        }
      }
    }
  }
  // Stress tests use the main camera at exposures a browser might plausibly allow.
  output.stress = [];
  console.log('Stress tests: main camera, compass hint');
  for (const test of STRESS_TESTS) {
    const cam = deriveCamera({ ...CAMERAS.main, psfUm: CAMERAS.main.psfUm * (test.psfScale ?? 1) });
    // Without this floor removal, the 1.5 pixel minimum would hide a focus error.
    cam.psfPx = Math.max(1.5, (CAMERAS.main.psfUm / ((CAMERAS.main.sensorWidthMm * 1000) / VIDEO_WIDTH_PX)) * (test.psfScale ?? 1));
    const index = buildIndex(cam, stars, 8);
    SITE.zenithSkyMagPerArcsec2 = test.sky ?? 17.5;
    falseDetectionsPerFrame = test.falseDetections ?? 3;
    for (const exposure of EXPOSURES.filter((e) => ['1/15 s', '1/8 s', '1/4 s', '1/15 s × 30'].includes(e.label))) {
      const stats = runScenario(cam, index, exposure, test.processing, HINTS[1], stars, trials, 777);
      output.stress.push({ test: test.label, exposure: exposure.label, ...stats });
      console.log(`  ${test.label.padEnd(54)} ${exposure.label.padEnd(12)} stars ${String(stats.starsMedian).padStart(4)} solved ${stats.pctSolved.toFixed(0).padStart(3)}% wrong ${stats.pctWrong.toFixed(1)}%`);
    }
  }
  SITE.zenithSkyMagPerArcsec2 = 17.5;
  falseDetectionsPerFrame = 3;

  if (outputPath) writeFileSync(outputPath, JSON.stringify(output, null, 2));
}

main();
