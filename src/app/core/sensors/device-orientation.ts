// Maths for the phone's orientation sensors, with no Angular dependency.
//
// Browsers report orientation as three angles, alpha, beta and gamma. The W3C
// specification defines them as rotations that take the phone's axes to the Earth's:
// x east, y north and z up. On the phone, x points right across the screen, y points
// to the top of the screen and z points out of the screen, towards the user.

import type { Horizontal, Vector3 } from '../astronomy/astronomy';
import { vectorToHorizontal } from '../astronomy/astronomy';

const RAD = Math.PI / 180;

/** Altitude limit for pointings. Exactly straight up or down has no defined "right". */
const MAX_ALTITUDE_DEG = 89;

/**
 * The direction the rear camera looks, as a local east, north, up vector. The camera
 * looks out of the back of the phone, along the phone's negative z axis.
 */
export function rearCameraVector(alphaDeg: number, betaDeg: number, gammaDeg: number): Vector3 {
  const [sinA, cosA] = [Math.sin(alphaDeg * RAD), Math.cos(alphaDeg * RAD)];
  const [sinB, cosB] = [Math.sin(betaDeg * RAD), Math.cos(betaDeg * RAD)];
  const [sinG, cosG] = [Math.sin(gammaDeg * RAD), Math.cos(gammaDeg * RAD)];
  // This is the negated third column of the specification's rotation matrix.
  return [-(cosA * sinG + sinA * sinB * cosG), -(sinA * sinG - cosA * sinB * cosG), -(cosB * cosG)];
}

/** A pointing for a camera direction, kept clear of the straight up and down limits. */
export function cameraPointing(vector: Vector3): Horizontal {
  const { altDeg, azDeg } = vectorToHorizontal(vector);
  return { altDeg: Math.max(-MAX_ALTITUDE_DEG, Math.min(MAX_ALTITUDE_DEG, altDeg)), azDeg };
}

export interface SeriesSummary {
  count: number;
  mean: number;
  standardDeviation: number;
}

/** Average and spread of a series of numbers. */
export function summarize(values: readonly number[]): SeriesSummary {
  if (values.length === 0) return { count: 0, mean: 0, standardDeviation: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { count: values.length, mean, standardDeviation: Math.sqrt(variance) };
}

/**
 * Average and spread of angles such as compass headings. Ordinary averaging fails
 * around north, where 359° and 1° should average to 0°, not 180°.
 */
export function summarizeAngles(anglesDeg: readonly number[]): SeriesSummary {
  if (anglesDeg.length === 0) return { count: 0, mean: 0, standardDeviation: 0 };
  const x = anglesDeg.reduce((sum, angle) => sum + Math.cos(angle * RAD), 0);
  const y = anglesDeg.reduce((sum, angle) => sum + Math.sin(angle * RAD), 0);
  const mean = (((Math.atan2(y, x) / RAD) % 360) + 360) % 360;
  const differences = anglesDeg.map((angle) => ((angle - mean + 540) % 360) - 180);
  return { count: anglesDeg.length, mean, standardDeviation: summarize(differences).standardDeviation };
}

interface PermissionRequester {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * Asks for sensor access where the browser requires it, which includes iOS and
 * current Chromium. It must be called straight after a tap, with nothing awaited first.
 */
export async function requestSensorPermission(): Promise<boolean> {
  const sources = [DeviceOrientationEvent, DeviceMotionEvent] as unknown as PermissionRequester[];
  const answers = await Promise.all(sources.map((source) => source.requestPermission?.call(source) ?? 'granted'));
  return answers.every((answer) => answer === 'granted');
}
