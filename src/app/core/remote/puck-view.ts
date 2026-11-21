// The puck's binary `view` message (docs/puck.md, "The view"): where the map points, for the
// puck to turn and project its own copy of the sky. Plain functions, so they can be tested
// without a link.

import type { Horizontal, Matrix3, Vector3 } from '../astronomy/astronomy';
import { bearingInViewDeg, equatorialToHorizontal, separationDeg, viewBasis } from '../astronomy/astronomy';
import type { MapView } from '../sky-map/map-view.service';

/** The message's size, type and layout version, as docs/puck.md defines them. */
export const VIEW_BYTES = 68;
const VIEW_TYPE = 1;
const VIEW_VERSION = 1;
const FLAG_MIRROR_X = 1;
const FLAG_MIRROR_Y = 2;
const FLAG_EYEPIECE = 4;

/** A unit quaternion (w, x, y, z). */
export type Quaternion = [number, number, number, number];

/** The quaternion of a rotation matrix (rows), which must be a proper rotation. */
export function matrixToQuaternion(m: Matrix3): Quaternion {
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = m;
  const trace = m00 + m11 + m22;
  let q: Quaternion;
  // Shepperd's method: divide by the largest of the four, so rounding stays small.
  if (trace > 0) {
    const s = 2 * Math.sqrt(1 + trace);
    q = [s / 4, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [(m21 - m12) / s, s / 4, (m01 + m10) / s, (m02 + m20) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m02 - m20) / s, (m01 + m10) / s, s / 4, (m12 + m21) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, s / 4];
  }
  const length = Math.hypot(...q);
  return q.map((value) => value / length) as Quaternion;
}

/**
 * Local vectors to the puck's view frame: right, up, and back towards the viewer. The map's
 * own (right, up, forward) is a mirror image, which no quaternion can hold, so the puck
 * takes forward as minus z. The roll is folded in, as `rotateInView` turns the picture.
 */
export function viewMatrix(pointing: Horizontal, rollDeg: number): Matrix3 {
  const { right, up, forward } = viewBasis(pointing);
  const [sin, cos] = [Math.sin((rollDeg * Math.PI) / 180), Math.cos((rollDeg * Math.PI) / 180)];
  const mix = (a: Vector3, ka: number, b: Vector3, kb: number): Vector3 => [
    a[0] * ka + b[0] * kb,
    a[1] * ka + b[1] * kb,
    a[2] * ka + b[2] * kb,
  ];
  return [mix(right, cos, up, -sin), mix(right, sin, up, cos), [-forward[0], -forward[1], -forward[2]]];
}

/** Direction to the target on the puck's screen, clockwise from up, as the map draws it. */
export function targetDirectionDeg(view: MapView, target: Horizontal): number {
  let direction = bearingInViewDeg(viewBasis(view.pointing), target) - view.rollDeg;
  if (view.flipX < 0) direction = -direction;
  if (view.flipY < 0) direction = 180 - direction;
  return ((direction % 360) + 360) % 360;
}

/** The `view` message for a frame of the map, and the selected target's J2000 position, if any. */
export function encodeView(
  view: MapView,
  target: { raDeg: number; decDeg: number } | null,
  seq: number,
  timeMs: number,
): ArrayBuffer {
  const buffer = new ArrayBuffer(VIEW_BYTES);
  const data = new DataView(buffer);
  data.setUint8(0, VIEW_TYPE);
  data.setUint8(1, VIEW_VERSION);
  data.setUint16(2, seq & 0xffff, true);
  data.setUint32(4, Math.max(0, Math.round(timeMs)) >>> 0, true);
  const floats = (offset: number, values: readonly number[]): void =>
    values.forEach((value, i) => data.setFloat32(offset + i * 4, value, true));
  floats(8, matrixToQuaternion(view.rotation));
  floats(24, matrixToQuaternion(viewMatrix(view.pointing, view.rollDeg)));
  const at = target ? equatorialToHorizontal(view.rotation, target.raDeg, target.decDeg) : null;
  floats(40, [
    view.fieldDeg,
    view.pointing.altDeg,
    view.pointing.azDeg,
    at ? separationDeg(view.pointing, at) : NaN,
    at ? targetDirectionDeg(view, at) : NaN,
    view.starLimitMag,
  ]);
  const flags =
    (view.flipX < 0 ? FLAG_MIRROR_X : 0) | (view.flipY < 0 ? FLAG_MIRROR_Y : 0) | (view.eyepiece ? FLAG_EYEPIECE : 0);
  data.setUint8(64, flags);
  return buffer;
}
