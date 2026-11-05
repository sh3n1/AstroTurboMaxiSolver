// Runs the clear-sky test: capture real frames at several settings, find the stars, and
// try a plate solve. Everything it learns goes in a report, which answers what the
// simulation in spikes/sky-sim could only assume.

import type { Vector3 } from './astronomy';
import type { DepthBin } from './plate-solver';
import { buildSolverIndex, catalogFromRows, measureDepth, solveFrame } from './plate-solver';
import { detectStars } from './star-detector';

/** One setting to try. These run from quick to slow, so a short clear gap still gives data. */
interface CaptureStep {
  exposureSeconds: number;
  iso: number;
  frames: number;
}

export const SKY_TEST_STEPS: readonly CaptureStep[] = [
  { exposureSeconds: 1 / 8, iso: 1600, frames: 1 },
  { exposureSeconds: 1 / 3, iso: 1600, frames: 1 },
  { exposureSeconds: 1 / 3, iso: 3200, frames: 6 },
  { exposureSeconds: 1 / 3, iso: 6400, frames: 6 },
];

/** A browser unit: the specification measures exposure in 100 microsecond steps. */
const EXPOSURE_UNITS_PER_SECOND = 10_000;
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
/**
 * Main camera focal length in pixels, as a share of the frame's long side. It comes from
 * the published 23 mm equivalent lens. The solver searches around it and reports the fit.
 */
const FOCAL_SHARE_OF_LONG_SIDE = 0.667;

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

export interface StepReport {
  requested: CaptureStep;
  /** What the camera reports it really used. */
  actual: { exposureSeconds: number | null; iso: number | null };
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
  /** A preview of the stacked frame, as a JPEG data URL. */
  image: string | null;
  error?: string;
}

export interface SkyTestOptions {
  starRows: readonly (readonly number[])[];
  flipped: boolean;
  /** The sensors' camera direction in J2000, if they are on. */
  sensorDirection: () => Vector3 | null;
  onProgress: (text: string) => void;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

type CameraTrackSettings = MediaTrackSettings & { exposureTime?: number; iso?: number };
interface RangeCapability {
  min?: number;
  max?: number;
}
type CameraTrackCapabilities = MediaTrackCapabilities & {
  exposureMode?: string[];
  exposureTime?: RangeCapability;
  iso?: RangeCapability;
  focusMode?: string[];
  focusDistance?: RangeCapability;
};

/** Sets manual exposure and far focus. Returns false if the camera refuses. */
async function applySettings(track: MediaStreamTrack, step: CaptureStep): Promise<boolean> {
  const capabilities = track.getCapabilities() as CameraTrackCapabilities;
  if (!capabilities.exposureMode?.includes('manual') || !capabilities.exposureTime?.max) return false;
  const clamp = (value: number, range?: RangeCapability): number =>
    Math.min(range?.max ?? value, Math.max(range?.min ?? value, value));

  const advanced: Record<string, unknown> = {
    exposureMode: 'manual',
    exposureTime: clamp(step.exposureSeconds * EXPOSURE_UNITS_PER_SECOND, capabilities.exposureTime),
  };
  if (capabilities.iso) advanced['iso'] = clamp(step.iso, capabilities.iso);
  if (capabilities.focusMode?.includes('manual') && capabilities.focusDistance?.max) {
    advanced['focusMode'] = 'manual';
    advanced['focusDistance'] = capabilities.focusDistance.max;
  }
  try {
    await track.applyConstraints({ advanced: [advanced] } as MediaTrackConstraints);
    return true;
  } catch {
    return false;
  }
}

/** Waits for the next new video frame, where the browser can report one. */
function nextFrame(video: HTMLVideoElement, fallbackMs: number): Promise<void> {
  const timeout = wait(Math.max(fallbackMs, 50) + FRAME_TIMEOUT_MS);
  if (typeof video.requestVideoFrameCallback !== 'function') return wait(fallbackMs);
  return Promise.race([new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve())), timeout]);
}

/** Captures and averages frames. Averaging raises faint stars above the noise. */
async function captureStack(
  video: HTMLVideoElement,
  step: CaptureStep,
): Promise<{ pixels: Float32Array; width: number; height: number }> {
  const [width, height] = [video.videoWidth, video.videoHeight];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !width || !height) throw new Error('The camera gave no picture.');

  const pixels = new Float32Array(width * height);
  for (let frame = 0; frame < step.frames; frame++) {
    await nextFrame(video, step.exposureSeconds * 1000);
    ctx.drawImage(video, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] += (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    }
  }
  for (let i = 0; i < pixels.length; i++) pixels[i] /= step.frames;
  return { pixels, width, height };
}

/** Makes a preview that shows faint stars by stretching just above the sky brightness. */
function previewImage(
  pixels: Float32Array,
  width: number,
  height: number,
  background: number,
  noise: number,
): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(width, height);
  const [black, range] = [background - noise, Math.max(noise * 40, 20)];
  for (let i = 0; i < pixels.length; i++) {
    const value = Math.max(0, Math.min(255, ((pixels[i] - black) / range) * 255));
    image.data[i * 4] = value;
    image.data[i * 4 + 1] = value;
    image.data[i * 4 + 2] = value;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function averageLevel(pixels: Float32Array): number {
  let total = 0;
  for (const value of pixels) total += value;
  return total / pixels.length;
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
      reports.push(await runStep(track, video, step, stars, options));
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
    report.manualControl = await applySettings(track, step);
    await wait(SETTLE_MS + step.exposureSeconds * 2000);

    // City skies vary a lot, so lower the ISO until the sky is no longer close to clipping.
    // A clear gap in the clouds can be short, and a white frame would waste it.
    let iso = step.iso;
    for (let attempt = 0; report.manualControl && attempt < MAX_ISO_REDUCTIONS && iso > MIN_ISO; attempt++) {
      const test = await captureStack(video, { ...step, frames: 1 });
      if (averageLevel(test.pixels) <= MAX_SKY_LEVEL) break;
      iso = Math.max(MIN_ISO, Math.round(iso / 2));
      options.onProgress(`Sky is bright, so trying ISO ${iso}…`);
      await applySettings(track, { ...step, iso });
      await wait(SETTLE_MS + step.exposureSeconds * 2000);
    }
    const settings = track.getSettings() as CameraTrackSettings;
    report.actual = {
      exposureSeconds: settings.exposureTime ? round(settings.exposureTime / EXPOSURE_UNITS_PER_SECOND, 4) : null,
      iso: settings.iso ?? null,
    };

    const { pixels, width, height } = await captureStack(video, step);
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
    report.image = previewImage(pixels, width, height, detection.background, detection.noise);

    // Clipped frames only produce artifacts, and those can look like stars to the solver.
    report.tooBright = report.clippedPercent > MAX_CLIPPED_PERCENT;
    if (report.tooBright) return report;

    // Let the page update before the slower solving work begins.
    options.onProgress(`Found ${detection.stars.length} stars. Solving…`);
    await wait(30);
    const geometry = {
      width,
      height,
      focalPx: FOCAL_SHARE_OF_LONG_SIDE * Math.max(width, height),
      flipped: options.flipped,
    };
    const index = buildSolverIndex(stars, geometry);
    const started = performance.now();
    const solution = solveFrame(detection.stars, geometry, index);
    const milliseconds = Math.round(performance.now() - started);

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
        focalFactor: round(solution.focalPx / geometry.focalPx, 3),
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
