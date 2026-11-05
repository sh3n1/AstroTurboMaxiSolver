// Tracks which way the phone faces by combining its sensors, with no Angular dependency.
//
// The gyroscope is fast and smooth but slowly drifts. The compass-based orientation is
// slower and jittery but doesn't drift. So the gyroscope follows each movement, and the
// orientation reading gently pulls the result back. Plate solves will correct it later.
//
// An attitude is a unit quaternion [w, x, y, z] taking the phone's axes (x right across
// the screen, y to the top of the screen, z out of the screen) to the local axes (east,
// north, up).

import type { Vector3 } from './astronomy';

export type Quaternion = readonly [number, number, number, number];

const RAD = Math.PI / 180;

function multiply(a: Quaternion, b: Quaternion): Quaternion {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

function normalize(q: Quaternion): Quaternion {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

/** The attitude for a browser orientation reading, whose angles rotate about Z, X then Y. */
export function attitudeFromOrientation(alphaDeg: number, betaDeg: number, gammaDeg: number): Quaternion {
  const halfAngle = (deg: number): [number, number] => [Math.cos((deg * RAD) / 2), Math.sin((deg * RAD) / 2)];
  const [ca, sa] = halfAngle(alphaDeg);
  const [cb, sb] = halfAngle(betaDeg);
  const [cg, sg] = halfAngle(gammaDeg);
  return multiply(multiply([ca, 0, 0, sa], [cb, sb, 0, 0]), [cg, 0, sg, 0]);
}

/**
 * Applies a gyroscope reading. Rates are in degrees per second about the phone's own
 * x, y and z axes, which browsers report as rotationRate alpha, beta and gamma.
 */
export function integrateGyroscope(q: Quaternion, rates: Vector3, seconds: number): Quaternion {
  const [x, y, z] = rates.map((rate) => rate * RAD);
  const rate = Math.hypot(x, y, z);
  if (rate === 0 || seconds <= 0) return q;
  const half = (rate * seconds) / 2;
  const scale = Math.sin(half) / rate;
  return normalize(multiply(q, [Math.cos(half), x * scale, y * scale, z * scale]));
}

/** Moves an attitude part of the way towards another. A weight of 1 lands on the target. */
export function blendAttitude(from: Quaternion, to: Quaternion, weight: number): Quaternion {
  // A quaternion and its negative are the same attitude, so take the shorter way round.
  const sign = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3] < 0 ? -1 : 1;
  return normalize([
    from[0] + (sign * to[0] - from[0]) * weight,
    from[1] + (sign * to[1] - from[1]) * weight,
    from[2] + (sign * to[2] - from[2]) * weight,
    from[3] + (sign * to[3] - from[3]) * weight,
  ]);
}

/** The local direction the rear camera looks, along the phone's negative z axis. */
export function rearCameraDirection([w, x, y, z]: Quaternion): Vector3 {
  // The negated third column of the rotation matrix for this quaternion.
  return [-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))];
}

/** The local direction the top of the phone points, along the phone's y axis. */
export function phoneUpDirection([w, x, y, z]: Quaternion): Vector3 {
  // The second column of the rotation matrix for this quaternion.
  return [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
}

/** Below this rate, a phone on a mount counts as not moving. */
const STILL_RATE_DEG_PER_S = 0.5;
/** How long it must stay that way, so a brief pause doesn't count. */
const STILL_SECONDS = 1;

/**
 * Notices when the phone has stopped moving. This is when a plate solve can run, since
 * a long exposure would otherwise smear the stars.
 */
export class StillnessDetector {
  private stillFor = 0;

  /** Adds a gyroscope reading, and returns whether the phone now counts as still. */
  update(rates: Vector3, seconds: number): boolean {
    this.stillFor = Math.hypot(...rates) < STILL_RATE_DEG_PER_S ? this.stillFor + seconds : 0;
    return this.stillFor >= STILL_SECONDS;
  }
}
