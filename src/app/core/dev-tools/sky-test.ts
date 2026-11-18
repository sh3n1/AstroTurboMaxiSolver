// Runs the clear-sky test: capture real frames at several settings, find the stars, and
// try a plate solve. Everything it learns goes in a report, which answers what the
// simulation in spikes/sky-sim could only assume.

import type { Vector3 } from '../astronomy/astronomy';
import type { CameraTrackSettings } from '../solver/camera';
import {
  EXPOSURE_UNITS_PER_SECOND,
  FOCAL_SHARE_OF_LONG_SIDE,
  applyCameraSettings,
  averageLevel,
  brightenAutoExposure,
  captureStack,
  highestIso,
  planCapture,
} from '../solver/camera';
import type { DepthBin } from '../solver/plate-solver';
import { buildSolverIndex, catalogFromRows, measureDepth, solveFrame } from '../solver/plate-solver';
import { detectStars } from '../solver/star-detector';

/** One setting to try. These run from quick to slow, so a short clear gap still gives data. */
interface CaptureStep {
  exposureSeconds: number;
  iso: number;
  frames: number;
  /**
   * Leaves the exposure to the phone and stacks video frames, as the sky map does on
   * phones without manual exposure, such as iPhones. The frame count then comes from the
   * video's speed, and the exposure and ISO above are only placeholders.
   */
  automatic?: boolean;
  /** Automatic, but asking the phone for its brightest picture, through exposure compensation. */
  brightened?: boolean;
  /** Uses the camera's highest ISO, whatever `iso` says, which is then only a fallback. */
  highestIso?: boolean;
}

/*
 * Stacking is the fallback for phones that can't expose long on the web. Measured in a
 * city sky, stacking dark short frames added nothing: faint stars are rounded away inside
 * each frame before averaging. So the fallback steps try to make each frame brighter.
 */
export const SKY_TEST_STEPS: readonly CaptureStep[] = [
  // First, while the camera is still automatic: how phones without manual exposure do.
  // The short stacks take 24 frames, and PARTIAL_STACKS shows how many were worth it.
  { exposureSeconds: 1 / 30, iso: 0, frames: 24, automatic: true },
  // The same, with the phone asked for its brightest picture.
  { exposureSeconds: 1 / 30, iso: 0, frames: 24, automatic: true, brightened: true },
  { exposureSeconds: 1 / 8, iso: 1600, frames: 1 },
  // Short exposures stacked, as on phones that cap manual exposure below 1/8 s, as bright as they go.
  { exposureSeconds: 1 / 15, iso: 6400, frames: 24, highestIso: true },
  { exposureSeconds: 1 / 3, iso: 1600, frames: 1 },
  { exposureSeconds: 1 / 3, iso: 3200, frames: 6 },
  { exposureSeconds: 1 / 3, iso: 6400, frames: 6 },
];

/**
 * A stack is also measured part way through, after this many frames, where it has more.
 * One frame shows what stacking adds at all, and the others where adding more stops paying.
 */
const PARTIAL_STACKS = [1, 6, 12];

/**
 * Below this sky level in the first, automatic step, with hardly any stars, the camera
 * sees almost no light. Measured: about 5 with the lens covered, 11 to 14 in a city sky.
 */
const COVERED_SKY_LEVEL = 8;
const COVERED_MAX_STARS = 2;

/** Whether a step's frame looks like the lens is covered: almost no light and no stars. */
export function looksCovered(step: Pick<StepReport, 'background' | 'starCount' | 'error' | 'skipped'>): boolean {
  return !step.error && !step.skipped && step.background < COVERED_SKY_LEVEL && step.starCount <= COVERED_MAX_STARS;
}

const SETTLE_MS = 1000; // Lets the camera apply new settings before capturing
const FRAME_TIMEOUT_MS = 3000;
const FULL_WELL_LEVEL = 250; // Pixels above this on the 0 to 255 scale have clipped
const STARS_IN_REPORT = 40;
/** Above this average brightness the sky is close to clipping, and stars get lost in it. */
const MAX_SKY_LEVEL = 170;
const MIN_ISO = 100;
const MAX_ISO_REDUCTIONS = 7; // Enough to come down from the highest ISO this test asks for
/** A frame with more than this share of clipped pixels has nothing reliable to solve. */
const MAX_CLIPPED_PERCENT = 5;

export interface SolveReport {
  raDeg: number;
  decDeg: number;
  matched: number;
  checked: number;
  /** The real focal length found, relative to the expected one. */
  focalFactor: number;
  milliseconds: number;
  /** Solved again using the sensors as a hint, to see how much faster it is. */
  hintedMilliseconds: number | null;
  /** How far the sensors were from the solved position. This measures compass error. */
  sensorErrorDeg: number | null;
  depth: DepthBin[];
}

/**
 * A stack measured part way through: its first few frames averaged. Stacking is the
 * fallback for phones that can't expose long on the web, so this shows what each extra
 * frame adds, at exactly the same settings. Its depth is measured against the full
 * stack's solution, so it is there even when the part alone doesn't solve.
 */
export interface PartialStackReport {
  frames: number;
  background: number;
  noise: number;
  starCount: number;
  solve: { raDeg: number; decDeg: number; matched: number; checked: number } | null;
  depth: DepthBin[] | null;
}

export interface StepReport {
  requested: CaptureStep;
  /** What the camera reports it really used, and the exposure compensation the app set. */
  actual: { exposureSeconds: number | null; iso: number | null; exposureCompensation?: number | null };
  /** Why the step wasn't captured, when the camera doesn't offer what it needs. */
  skipped?: string;
  manualControl: boolean;
  width: number;
  height: number;
  background: number;
  noise: number;
  clippedPercent: number;
  /** True if the frame was too bright to try solving. */
  tooBright: boolean;
  starCount: number;
  stars: { x: number; y: number; flux: number; snr: number; pixels: number }[];
  solve: SolveReport | null;
  /** For a stack: the same stack part way through, fewest frames first. */
  partial?: PartialStackReport[];
  /** A preview of the stacked frame, as a JPEG data URL. */
  image: string | null;
  /** How the preview's grey levels map back to the frame's, so it can be analysed later. */
  previewStretch?: PreviewStretch;
  error?: string;
}

/**
 * The preview's curve: frame level = black + softness × sinh(preview level / 255 ×
 * asinh((255 − black) / softness)). Faint levels just above the sky are spread out, so
 * faint stars show, and bright ones are squeezed, so lit buildings and glow keep their
 * detail rather than turning flat white.
 */
export interface PreviewStretch {
  kind: 'asinh';
  black: number;
  softness: number;
}

export interface SkyTestOptions {
  starRows: readonly (readonly number[])[];
  /** The sensors' camera direction in J2000, if they are on. */
  sensorDirection: () => Vector3 | null;
  onProgress: (text: string) => void;
  /** The learnt field of view, relative to the estimate from published specs. */
  focalFactor: number;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

/** The preview's curve for a frame, from its sky brightness and noise. */
export function previewStretch(background: number, noise: number): PreviewStretch {
  return { kind: 'asinh', black: round(background - noise, 3), softness: round(Math.max(noise * 4, 1), 3) };
}

/**
 * Makes a preview that shows faint stars and bright detail alike: levels just above the
 * sky are stretched, and brighter ones squeezed, with the curve in PreviewStretch.
 */
export function previewImage(
  pixels: Float32Array,
  width: number,
  height: number,
  stretch: PreviewStretch,
): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(width, height);
  const { black, softness } = stretch;
  const top = Math.asinh((255 - black) / softness);
  for (let i = 0; i < pixels.length; i++) {
    const value = Math.min(255, (Math.asinh(Math.max(0, pixels[i] - black) / softness) / top) * 255);
    image.data[i * 4] = value;
    image.data[i * 4 + 1] = value;
    image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  // High quality, so the levels can be recovered closely for analysis.
  return canvas.toDataURL('image/jpeg', 0.95);
}

/** Runs every step, keeping whatever it gets if one of them fails. */
export async function runSkyTest(options: SkyTestOptions): Promise<StepReport[]> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  const reports: StepReport[] = [];
  try {
    const track = stream.getVideoTracks()[0];
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await Promise.race([video.play(), wait(FRAME_TIMEOUT_MS)]);

    const stars = catalogFromRows(options.starRows);
    for (const [index, step] of SKY_TEST_STEPS.entries()) {
      options.onProgress(`Step ${index + 1} of ${SKY_TEST_STEPS.length}: capturing. Keep the phone still…`);
      const report = await runStep(track, video, step, stars, options);
      reports.push(report);
      // A covered lens would waste the rest of the test, so stop and say so.
      if (index === 0 && looksCovered(report)) break;
    }
  } finally {
    // Always release the camera, whatever happened.
    stream.getTracks().forEach((t) => t.stop());
  }
  return reports;
}

async function runStep(
  track: MediaStreamTrack,
  video: HTMLVideoElement,
  step: CaptureStep,
  stars: ReturnType<typeof catalogFromRows>,
  options: SkyTestOptions,
): Promise<StepReport> {
  const report: StepReport = {
    requested: { ...step, exposureSeconds: round(step.exposureSeconds, 4) },
    actual: { exposureSeconds: null, iso: null },
    manualControl: false,
    width: 0,
    height: 0,
    background: 0,
    noise: 0,
    clippedPercent: 0,
    tooBright: false,
    starCount: 0,
    stars: [],
    solve: null,
    image: null,
  };

  try {
    if (step.automatic) {
      if (step.brightened) {
        const compensation = await brightenAutoExposure(track);
        report.actual.exposureCompensation = compensation;
        if (compensation === null) {
          report.skipped = 'The camera has no exposure compensation';
          return report;
        }
      }
      // The video's real speed sets how long each frame is. The sky map stacks fewer frames
      // than this step, and the partial stacks include its number.
      const { frameSeconds } = planCapture('stack', null, track.getSettings().frameRate);
      step = { ...step, exposureSeconds: frameSeconds };
      report.requested = { ...step, exposureSeconds: round(frameSeconds, 4) };
      await wait(SETTLE_MS);
    } else {
      if (step.highestIso) {
        step = { ...step, iso: highestIso(track) ?? step.iso };
        report.requested = { ...step, exposureSeconds: round(step.exposureSeconds, 4) };
      }
      report.manualControl = await applyCameraSettings(track, step);
      await wait(SETTLE_MS + step.exposureSeconds * 2000);
    }

    // City skies vary a lot, so lower the ISO until the sky is no longer close to clipping.
    // A clear gap in the clouds can be short, and a white frame would waste it.
    let iso = step.iso;
    for (let attempt = 0; report.manualControl && attempt < MAX_ISO_REDUCTIONS && iso > MIN_ISO; attempt++) {
      const test = await captureStack(video, { ...step, frames: 1 });
      if (averageLevel(test.pixels) <= MAX_SKY_LEVEL) break;
      iso = Math.max(MIN_ISO, Math.round(iso / 2));
      options.onProgress(`Sky is bright, so trying ISO ${iso}…`);
      await applyCameraSettings(track, { ...step, iso });
      await wait(SETTLE_MS + step.exposureSeconds * 2000);
    }
    const settings = track.getSettings() as CameraTrackSettings;
    report.actual = {
      ...report.actual,
      exposureSeconds: settings.exposureTime ? round(settings.exposureTime / EXPOSURE_UNITS_PER_SECOND, 4) : null,
      iso: settings.iso ?? null,
    };

    const { pixels, width, height, partial } = await captureStack(video, step, PARTIAL_STACKS);
    report.width = width;
    report.height = height;

    const detection = detectStars(pixels, width, height);
    report.background = round(detection.background);
    report.noise = round(detection.noise);
    let clipped = 0;
    for (const value of pixels) if (value >= FULL_WELL_LEVEL) clipped++;
    report.clippedPercent = round((clipped / pixels.length) * 100);
    report.starCount = detection.stars.length;
    report.stars = detection.stars.slice(0, STARS_IN_REPORT).map((s) => ({
      x: round(s.x, 1),
      y: round(s.y, 1),
      flux: round(s.flux, 1),
      snr: round(s.snr, 1),
      pixels: s.pixels,
    }));
    report.previewStretch = previewStretch(detection.background, detection.noise);
    report.image = previewImage(pixels, width, height, report.previewStretch);

    // Clipped frames only produce artifacts, and those can look like stars to the solver.
    report.tooBright = report.clippedPercent > MAX_CLIPPED_PERCENT;
    if (report.tooBright) return report;

    // Let the page update before the slower solving work begins.
    options.onProgress(`Found ${detection.stars.length} stars. Solving…`);
    await wait(30);
    const geometry = {
      width,
      height,
      focalPx: FOCAL_SHARE_OF_LONG_SIDE * Math.max(width, height) * options.focalFactor,
    };
    const index = buildSolverIndex(stars, geometry);
    const started = performance.now();
    const solution = solveFrame(detection.stars, geometry, index);
    const milliseconds = Math.round(performance.now() - started);

    // The same stack part way through: what fewer frames would have given.
    if (partial?.length) {
      report.partial = partial.map((part) => {
        const found = detectStars(part.pixels, width, height);
        const partSolution = solveFrame(found.stars, geometry, index);
        // The full stack's solution is the better reference for depth, when there is one.
        const reference = solution ?? partSolution;
        return {
          frames: part.frames,
          background: round(found.background),
          noise: round(found.noise),
          starCount: found.stars.length,
          solve: partSolution && {
            raDeg: round(partSolution.raDeg, 3),
            decDeg: round(partSolution.decDeg, 3),
            matched: partSolution.matched,
            checked: partSolution.checked,
          },
          depth: reference && measureDepth(reference, found.stars, geometry, stars),
        };
      });
    }

    if (solution) {
      const sensor = options.sensorDirection();
      let hintedMilliseconds: number | null = null;
      let sensorErrorDeg: number | null = null;
      if (sensor) {
        const cosine =
          sensor[0] * solution.pointing[0] + sensor[1] * solution.pointing[1] + sensor[2] * solution.pointing[2];
        sensorErrorDeg = round((Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI, 1);
        const hintedStart = performance.now();
        solveFrame(detection.stars, { ...geometry, focalPx: solution.focalPx }, index, {
          direction: sensor,
          radiusDeg: 30,
        });
        hintedMilliseconds = Math.round(performance.now() - hintedStart);
      }
      report.solve = {
        raDeg: round(solution.raDeg, 3),
        decDeg: round(solution.decDeg, 3),
        matched: solution.matched,
        checked: solution.checked,
        focalFactor: round(solution.focalPx / (FOCAL_SHARE_OF_LONG_SIDE * Math.max(width, height)), 3),
        milliseconds,
        hintedMilliseconds,
        sensorErrorDeg,
        depth: measureDepth(solution, detection.stars, geometry, stars),
      };
    }
  } catch (error) {
    report.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  return report;
}
