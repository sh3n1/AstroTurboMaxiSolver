// Shared camera handling for the clear-sky test and live plate solving.

import { screenAngleDeg } from '../sensors/sideways';

/** A browser unit: the specification measures exposure in 100 microsecond steps. */
export const EXPOSURE_UNITS_PER_SECOND = 10_000;

/**
 * Main camera focal length in pixels, as a share of the frame's long side: a typical
 * phone main camera, about 24 mm full-frame equivalent. Most are between 23 and 28 mm.
 * Browsers don't report the lens, so this is only a starting guess. The solver searches
 * around it, and the app learns the real value from the first good solve.
 */
export const FOCAL_SHARE_OF_LONG_SIDE = 0.667;

const FRAME_TIMEOUT_MS = 3000;

/**
 * How the sky map takes its pictures. Normal picks for itself: one long exposure where the
 * phone allows it, otherwise several short frames averaged. The other two force one way,
 * for testing on a phone that could do either.
 */
export type CaptureMode = 'normal' | 'exposure' | 'stack';

/** Below this, one frame shows too few stars in a city sky, so frames are stacked instead. */
export const MIN_SINGLE_EXPOSURE_SECONDS = 1 / 8;
/** A stack aims for about this much light in total, like one long exposure. */
const STACK_TARGET_SECONDS = 0.5;
const MIN_STACK_FRAMES = 4;
/** More frames make each attempt slower, and the phone more likely to move. */
const MAX_STACK_FRAMES = 12;
/** The video rate assumed when the browser doesn't report one. */
const DEFAULT_FRAME_RATE = 30;

/** How each picture is taken: how many frames, how long each lasts, and whether manually. */
export interface CapturePlan {
  frames: number;
  /** The exposure of each frame, or the time between frames when the phone chooses it. */
  frameSeconds: number;
  /** Whether the app set the exposure itself. Otherwise the phone exposes automatically. */
  manual: boolean;
}

/**
 * Decides how to take pictures. `manualSeconds` is the exposure the camera accepted, or
 * null if it refused manual exposure. `frameRate` is the video's frames per second.
 */
export function planCapture(mode: CaptureMode, manualSeconds: number | null, frameRate?: number): CapturePlan {
  const manual = manualSeconds !== null;
  // With automatic exposure each frame lasts at most one video frame.
  const frameSeconds = manualSeconds ?? 1 / (frameRate && frameRate > 0 ? frameRate : DEFAULT_FRAME_RATE);
  const single = mode === 'exposure' || (mode === 'normal' && manual && frameSeconds >= MIN_SINGLE_EXPOSURE_SECONDS);
  if (single) return { frames: 1, frameSeconds, manual };
  const frames = Math.min(MAX_STACK_FRAMES, Math.max(MIN_STACK_FRAMES, Math.ceil(STACK_TARGET_SECONDS / frameSeconds)));
  return { frames, frameSeconds, manual };
}

/**
 * The ISO to start from. Short manual frames that are stacked use the camera's highest
 * ISO: measured in a city sky, frames at 1/15 s and ISO 3200 were so dark that faint stars
 * were rounded away inside each one, and stacking them added nothing. At the highest ISO
 * (96,000 on an Honor Magic5 Pro) they survive, and 6 frames solved 4 times in 5. If that
 * makes the sky too bright, the solver lowers the ISO as usual. Everything else starts
 * from the standard ISO. `highest` is null when the camera doesn't say.
 */
export function startingIso(plan: CapturePlan, highest: number | null, standard: number): number {
  const shortStack = plan.manual && plan.frames > 1;
  return shortStack && highest ? Math.max(highest, standard) : standard;
}

export interface CaptureSettings {
  exposureSeconds: number;
  iso: number;
  frames: number;
}

export type CameraTrackSettings = MediaTrackSettings & { exposureTime?: number; iso?: number };

interface RangeCapability {
  min?: number;
  max?: number;
}
type CameraTrackCapabilities = MediaTrackCapabilities & {
  exposureMode?: string[];
  exposureTime?: RangeCapability;
  exposureCompensation?: RangeCapability;
  iso?: RangeCapability;
  focusMode?: string[];
  focusDistance?: RangeCapability;
};

export interface OpenCamera {
  stream: MediaStream;
  track: MediaStreamTrack;
  video: HTMLVideoElement;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens the rear camera, playing into a video element that is never shown. */
export async function openRearCamera(): Promise<OpenCamera> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await Promise.race([video.play(), wait(FRAME_TIMEOUT_MS)]);
  return { stream, track: stream.getVideoTracks()[0], video };
}

/**
 * The longest exposure the camera allows, in seconds, up to a limit. Phones differ a lot,
 * and longer exposures show fainter stars, so each phone uses as much as it offers.
 */
export function longestExposureSeconds(track: MediaStreamTrack, limitSeconds: number): number {
  const max = (track.getCapabilities?.() as CameraTrackCapabilities | undefined)?.exposureTime?.max;
  return max ? Math.min(limitSeconds, max / EXPOSURE_UNITS_PER_SECOND) : limitSeconds;
}

/** Releases the camera, so its light goes off and other apps can use it. */
export function closeCamera(camera: OpenCamera | null): void {
  camera?.stream.getTracks().forEach((track) => track.stop());
  if (camera) camera.video.srcObject = null;
  // Its full size drawing canvas isn't needed until the camera opens again.
  if (captureCanvas) captureCanvas.width = captureCanvas.height = 0;
}

/**
 * The canvas frames are drawn on to read their pixels. One is reused rather than one per
 * picture: a phone camera frame takes about 8 MB, and a finder phone takes pictures all
 * night, faster than old phones free the memory of discarded canvases.
 */
let captureCanvas: HTMLCanvasElement | null = null;
let captureContext: CanvasRenderingContext2D | null = null;

/** Sets manual exposure and far focus. Returns false if the camera refuses. */
export async function applyCameraSettings(track: MediaStreamTrack, settings: CaptureSettings): Promise<boolean> {
  const capabilities = track.getCapabilities() as CameraTrackCapabilities;
  if (!capabilities.exposureMode?.includes('manual') || !capabilities.exposureTime?.max) return false;
  const clamp = (value: number, range?: RangeCapability): number =>
    Math.min(range?.max ?? value, Math.max(range?.min ?? value, value));

  const advanced: Record<string, unknown> = {
    exposureMode: 'manual',
    exposureTime: clamp(settings.exposureSeconds * EXPOSURE_UNITS_PER_SECOND, capabilities.exposureTime),
  };
  if (capabilities.iso) advanced['iso'] = clamp(settings.iso, capabilities.iso);
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

/** The highest ISO the camera offers, or null if the browser doesn't say. */
export function highestIso(track: MediaStreamTrack): number | null {
  return (track.getCapabilities?.() as CameraTrackCapabilities | undefined)?.iso?.max ?? null;
}

/**
 * Keeps the exposure automatic but asks for the brightest picture the phone allows,
 * through exposure compensation. On a phone without manual exposure this is the only way
 * to make each short frame brighter, so faint stars aren't rounded away before stacking.
 * Returns the compensation set, or null if the camera doesn't offer it.
 */
export async function brightenAutoExposure(track: MediaStreamTrack): Promise<number | null> {
  const range = (track.getCapabilities?.() as CameraTrackCapabilities | undefined)?.exposureCompensation;
  if (range?.max === undefined) return null;
  try {
    await track.applyConstraints({
      advanced: [{ exposureMode: 'continuous', exposureCompensation: range.max } as MediaTrackConstraintSet],
    });
    return range.max;
  } catch {
    return null;
  }
}

/** Waits for the next new video frame, where the browser can report one. */
function nextFrame(video: HTMLVideoElement, fallbackMs: number): Promise<void> {
  const timeout = wait(Math.max(fallbackMs, 50) + FRAME_TIMEOUT_MS);
  if (typeof video.requestVideoFrameCallback !== 'function') return wait(fallbackMs);
  return Promise.race([new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve())), timeout]);
}

/** A captured picture in greyscale, from 0 to 255. */
export interface CapturedFrame {
  pixels: Float32Array;
  width: number;
  height: number;
  /**
   * The screen's angle as the picture was taken (sideways.ts): the browser turns the
   * camera's picture with the screen, which the attitude from a solve must turn back.
   */
  screenAngleDeg: number;
  /**
   * The stack part way through, when asked for: the average of its first few frames, for
   * each count asked. The sky test compares them, to see how many frames are worth taking.
   */
  partial?: { frames: number; pixels: Float32Array }[];
}

/**
 * Captures and averages frames into greyscale. Averaging raises faint stars above the noise.
 * `partialAt` lists frame counts, below the total, at which to keep the average so far.
 */
export async function captureStack(
  video: HTMLVideoElement,
  settings: CaptureSettings,
  partialAt: readonly number[] = [],
): Promise<CapturedFrame> {
  const [width, height] = [video.videoWidth, video.videoHeight];
  const screenAngle = screenAngleDeg();
  if (!captureCanvas) {
    captureCanvas = document.createElement('canvas');
    captureContext = captureCanvas.getContext('2d', { willReadFrequently: true });
  }
  const [canvas, ctx] = [captureCanvas, captureContext];
  if (!ctx || !width || !height) throw new Error('The camera gave no picture.');

  const pixels = new Float32Array(width * height);
  const partial: { frames: number; pixels: Float32Array }[] = [];
  for (let frame = 0; frame < settings.frames; frame++) {
    await nextFrame(video, settings.exposureSeconds * 1000);
    // Sized each time: another camera may have been closed meanwhile, which shrinks it.
    if (canvas.width !== width || canvas.height !== height) [canvas.width, canvas.height] = [width, height];
    ctx.drawImage(video, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] += (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    }
    // The sum so far, divided by its count, is the stack as it would be if it stopped here.
    const count = frame + 1;
    if (count < settings.frames && partialAt.includes(count)) {
      partial.push({ frames: count, pixels: pixels.map((value) => value / count) });
    }
  }
  for (let i = 0; i < pixels.length; i++) pixels[i] /= settings.frames;
  return { pixels, width, height, screenAngleDeg: screenAngle, partial };
}

/** Average brightness of a greyscale image, from 0 to 255. */
export function averageLevel(pixels: Float32Array): number {
  let total = 0;
  for (const value of pixels) total += value;
  return total / pixels.length;
}
