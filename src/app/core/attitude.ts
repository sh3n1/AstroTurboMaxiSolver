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

/** The local direction the right edge of the phone points, along the phone's x axis. */
export function phoneRightDirection([w, x, y, z]: Quaternion): Vector3 {
  // The first column of the rotation matrix for this quaternion.
  return [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
}

/**
 * The local direction the top of the screen's picture points. With the phone upright it
 * is the top of the phone. Turned on its side, the browser turns the picture, by the
 * screen's angle: at 90°, with the phone's top to the left, the picture's top is the
 * phone's right edge, and at 270° its left edge.
 */
export function screenUpDirection(attitude: Quaternion, screenAngleDeg: number): Vector3 {
  const angle = screenAngleDeg * RAD;
  const [up, right] = [phoneUpDirection(attitude), phoneRightDirection(attitude)];
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  return [cos * up[0] + sin * right[0], cos * up[1] + sin * right[1], cos * up[2] + sin * right[2]];
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

/** The reverse rotation. For a unit quaternion this is its conjugate. */
export function inverseAttitude([w, x, y, z]: Quaternion): Quaternion {
  return [w, -x, -y, -z];
}

/** Applies b, then a. */
export function combineAttitudes(a: Quaternion, b: Quaternion): Quaternion {
  return normalize(multiply(a, b));
}

/** The attitude whose phone x, y and z axes point along three local unit vectors. */
export function attitudeFromAxes(x: Vector3, y: Vector3, z: Vector3): Quaternion {
  // Standard conversion from a rotation matrix, whose columns are these axes.
  const trace = x[0] + y[1] + z[2];
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return normalize([0.25 / s, (y[2] - z[1]) * s, (z[0] - x[2]) * s, (x[1] - y[0]) * s]);
  }
  if (x[0] > y[1] && x[0] > z[2]) {
    const s = 2 * Math.sqrt(1 + x[0] - y[1] - z[2]);
    return normalize([(y[2] - z[1]) / s, 0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s]);
  }
  if (y[1] > z[2]) {
    const s = 2 * Math.sqrt(1 + y[1] - x[0] - z[2]);
    return normalize([(z[0] - x[2]) / s, (y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s]);
  }
  const s = 2 * Math.sqrt(1 + z[2] - x[0] - y[1]);
  return normalize([(x[1] - y[0]) / s, (z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s]);
}

/**
 * The phone's attitude from a plate solve. Image axes are x right, y down and z out
 * through the lens. The rear camera looks out of the back of the phone, so the image's
 * y and z are the reverse of the phone's.
 */
export function attitudeFromImageAxes(imageX: Vector3, imageY: Vector3, imageZ: Vector3): Quaternion {
  const negate = (v: Vector3): Vector3 => [-v[0], -v[1], -v[2]];
  return attitudeFromAxes(imageX, negate(imageY), negate(imageZ));
}
