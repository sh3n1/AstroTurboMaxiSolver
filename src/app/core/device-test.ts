// Measures what this phone's camera and sensors can really do, in a browser. The
// results replace assumptions in spikes/sky-sim/simulate.mjs. It needs no clear sky.

import type { SeriesSummary } from './device-orientation';
import { requestSensorPermission, summarize, summarizeAngles } from './device-orientation';

type Constraints = Record<string, unknown>;

interface Range {
  min?: number;
  max?: number;
  step?: number;
}

/** Newer camera properties that TypeScript's built-in types don't include yet. */
type CameraCapabilities = MediaTrackCapabilities & {
  exposureMode?: string[];
  exposureTime?: Range;
  exposureCompensation?: Range;
  iso?: Range;
  focusMode?: string[];
  focusDistance?: Range;
  zoom?: Range;
};
type CameraSettings = MediaTrackSettings & Record<string, unknown>;

export interface ExposureTest {
  applied: boolean;
  requestedSeconds: number;
  reportedSeconds: number | null;
  brightnessAtShortest: number;
  brightnessAtLongest: number;
  error?: string;
}

export interface CameraReport {
  label: string;
  capabilities: Constraints;
  settings: Constraints;
  maxExposureSeconds: number | null;
  exposureTest: ExposureTest | null;
  infinityFocus: { applied: boolean; focusDistance: unknown; error?: string } | null;
  error?: string;
}

export interface SensorReport {
  durationSeconds: number;
  orientationEventsPerSecond: number;
  motionEventsPerSecond: number;
  absoluteOrientationAvailable: boolean;
  headingDeg: SeriesSummary;
  betaDeg: SeriesSummary;
  gammaDeg: SeriesSummary;
  /** A still phone should read zero, so the mean is the gyroscope's drift rate. */
  gyroDegPerSecond: { x: SeriesSummary; y: SeriesSummary; z: SeriesSummary };
}

// The specification measures exposureTime in units of 100 microseconds.
const EXPOSURE_UNITS_PER_SECOND = 10_000;
const SETTLE_MS = 1500;
const FIRST_FRAME_TIMEOUT_MS = 5000;
const MAX_CAMERAS = 8;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const message = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** Average brightness of the current video frame, from 0 to 255. */
function measureBrightness(video: HTMLVideoElement): number {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return -1;
  ctx.drawImage(video, 0, 0, 64, 64);
  const { data } = ctx.getImageData(0, 0, 64, 64);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) total += (data[i] + data[i + 1] + data[i + 2]) / 3;
  return Math.round((total / (data.length / 4)) * 10) / 10;
}

/**
 * Checks that long exposure really takes effect. A browser can accept a setting and
 * ignore it, and Chromium has had bugs where manual mode turned the image black, so
 * the picture's brightness is compared as well as the reported value.
 */
async function testExposure(
  track: MediaStreamTrack,
  video: HTMLVideoElement,
  capabilities: CameraCapabilities,
): Promise<ExposureTest | null> {
  const { exposureTime, iso } = capabilities;
  if (!capabilities.exposureMode?.includes('manual') || !exposureTime?.max) return null;

  const requestedSeconds = exposureTime.max / EXPOSURE_UNITS_PER_SECOND;
  const result: ExposureTest = {
    applied: false,
    requestedSeconds,
    reportedSeconds: null,
    brightnessAtShortest: -1,
    brightnessAtLongest: -1,
  };

  const setExposure = async (time: number): Promise<void> => {
    const advanced: Constraints = { exposureMode: 'manual', exposureTime: time };
    if (iso?.max) advanced['iso'] = Math.min(iso.max, Math.max(iso.min ?? 0, 800));
    await track.applyConstraints({ advanced: [advanced] } as MediaTrackConstraints);
    await wait(SETTLE_MS + time / 10);
  };

  try {
    await setExposure(exposureTime.min ?? 1);
    result.brightnessAtShortest = measureBrightness(video);
    await setExposure(exposureTime.max);
    result.brightnessAtLongest = measureBrightness(video);
    const reported = (track.getSettings() as CameraSettings)['exposureTime'];
    if (typeof reported === 'number') result.reportedSeconds = reported / EXPOSURE_UNITS_PER_SECOND;
    result.applied =
      result.reportedSeconds !== null && Math.abs(result.reportedSeconds - requestedSeconds) < requestedSeconds * 0.1;
  } catch (error) {
    result.error = message(error);
  }
  return result;
}

/** Checks whether focus can be locked as far away as the lens goes, for stars. */
async function testFocus(
  track: MediaStreamTrack,
  capabilities: CameraCapabilities,
): Promise<CameraReport['infinityFocus']> {
  const { focusDistance } = capabilities;
  if (!capabilities.focusMode?.includes('manual') || !focusDistance) return null;
  try {
    // In this API, smaller focus distances are reported in metres and larger are farther.
    const advanced = { focusMode: 'manual', focusDistance: focusDistance.max };
    await track.applyConstraints({ advanced: [advanced] } as MediaTrackConstraints);
    await wait(SETTLE_MS);
    const reported = (track.getSettings() as CameraSettings)['focusDistance'];
    return { applied: reported === focusDistance.max, focusDistance: reported };
  } catch (error) {
    return { applied: false, focusDistance: null, error: message(error) };
  }
}

async function testCamera(deviceId: string, fallbackLabel: string): Promise<CameraReport> {
  const report: CameraReport = {
    label: fallbackLabel,
    capabilities: {},
    settings: {},
    maxExposureSeconds: null,
    exposureTest: null,
    infinityFocus: null,
  };

  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities() as CameraCapabilities;
    report.label = track.label || fallbackLabel;
    report.capabilities = { ...capabilities };
    report.settings = { ...track.getSettings() };
    delete report.capabilities['deviceId'];
    delete report.capabilities['groupId'];
    delete report.settings['deviceId'];
    delete report.settings['groupId'];
    if (capabilities.exposureTime?.max)
      report.maxExposureSeconds = capabilities.exposureTime.max / EXPOSURE_UNITS_PER_SECOND;

    // Brightness can only be read from a playing video.
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await Promise.race([video.play(), wait(FIRST_FRAME_TIMEOUT_MS)]);

    report.exposureTest = await testExposure(track, video, capabilities);
    report.infinityFocus = await testFocus(track, capabilities);
    video.srcObject = null;
  } catch (error) {
    report.error = message(error);
  } finally {
    // Always release the camera, or the next one can't open and the light stays on.
    stream?.getTracks().forEach((track) => track.stop());
  }
  return report;
}

/** Tests every camera the browser offers. Reports progress as it goes. */
export async function runCameraTest(onProgress: (text: string) => void): Promise<CameraReport[]> {
  // Camera names and ids stay hidden until the user has allowed camera access once.
  const permission = await navigator.mediaDevices.getUserMedia({ video: true });
  permission.getTracks().forEach((track) => track.stop());

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === 'videoinput').slice(0, MAX_CAMERAS);
  const reports: CameraReport[] = [];
  for (const [index, camera] of cameras.entries()) {
    onProgress(`Testing camera ${index + 1} of ${cameras.length}…`);
    reports.push(await testCamera(camera.deviceId, camera.label || `Camera ${index + 1}`));
  }
  return reports;
}

/** Records the sensors while the phone rests still, to measure noise and drift. */
export async function runSensorTest(seconds: number): Promise<SensorReport> {
  if (!(await requestSensorPermission())) throw new Error('Sensor access was not allowed.');

  const headings: number[] = [];
  const betas: number[] = [];
  const gammas: number[] = [];
  const [gyroX, gyroY, gyroZ]: number[][] = [[], [], []];
  let orientationEvents = 0;
  let motionEvents = 0;
  let absoluteAvailable = false;

  const onOrientation = (event: DeviceOrientationEvent): void => {
    if (event.alpha === null) return;
    orientationEvents++;
    if (event.type === 'deviceorientationabsolute' || event.absolute) absoluteAvailable = true;
    // Only use one stream of headings, so relative and absolute values don't mix.
    if (absoluteAvailable && event.type !== 'deviceorientationabsolute') return;
    headings.push((360 - event.alpha) % 360);
    betas.push(event.beta ?? 0);
    gammas.push(event.gamma ?? 0);
  };
  const onMotion = (event: DeviceMotionEvent): void => {
    motionEvents++;
    const rate = event.rotationRate;
    if (rate?.alpha == null || rate.beta == null || rate.gamma == null) return;
    // The specification maps alpha, beta and gamma rates to the phone's z, x and y axes.
    gyroZ.push(rate.alpha);
    gyroX.push(rate.beta);
    gyroY.push(rate.gamma);
  };

  window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
  window.addEventListener('deviceorientation', onOrientation);
  window.addEventListener('devicemotion', onMotion);
  await wait(seconds * 1000);
  window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
  window.removeEventListener('deviceorientation', onOrientation);
  window.removeEventListener('devicemotion', onMotion);

  return {
    durationSeconds: seconds,
    orientationEventsPerSecond: Math.round(orientationEvents / seconds),
    motionEventsPerSecond: Math.round(motionEvents / seconds),
    absoluteOrientationAvailable: absoluteAvailable,
    headingDeg: summarizeAngles(headings),
    betaDeg: summarize(betas),
    gammaDeg: summarize(gammas),
    gyroDegPerSecond: { x: summarize(gyroX), y: summarize(gyroY), z: summarize(gyroZ) },
  };
}
