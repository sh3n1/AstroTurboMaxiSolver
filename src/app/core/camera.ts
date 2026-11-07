// Shared camera handling for the clear-sky test and live plate solving.

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
}

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

/** Waits for the next new video frame, where the browser can report one. */
function nextFrame(video: HTMLVideoElement, fallbackMs: number): Promise<void> {
  const timeout = wait(Math.max(fallbackMs, 50) + FRAME_TIMEOUT_MS);
  if (typeof video.requestVideoFrameCallback !== 'function') return wait(fallbackMs);
  return Promise.race([new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve())), timeout]);
}

/** Captures and averages frames into greyscale. Averaging raises faint stars above the noise. */
export async function captureStack(
  video: HTMLVideoElement,
  settings: CaptureSettings,
): Promise<{ pixels: Float32Array; width: number; height: number }> {
  const [width, height] = [video.videoWidth, video.videoHeight];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !width || !height) throw new Error('The camera gave no picture.');

  const pixels = new Float32Array(width * height);
  for (let frame = 0; frame < settings.frames; frame++) {
    await nextFrame(video, settings.exposureSeconds * 1000);
    ctx.drawImage(video, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] += (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
    }
  }
  for (let i = 0; i < pixels.length; i++) pixels[i] /= settings.frames;
  return { pixels, width, height };
}

/** Average brightness of a greyscale image, from 0 to 255. */
export function averageLevel(pixels: Float32Array): number {
  let total = 0;
  for (const value of pixels) total += value;
  return total / pixels.length;
}
