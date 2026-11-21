import { describe, expect, it } from 'vitest';

import type { Matrix3, Vector3 } from '../astronomy/astronomy';
import { horizontalVector, skyRotation } from '../astronomy/astronomy';
import type { MapView } from '../sky-map/map-view.service';

import { VIEW_BYTES, encodeView, matrixToQuaternion, targetDirectionDeg, viewMatrix } from './puck-view';
import type { Quaternion } from './puck-view';

/** Turns a vector by a quaternion, as the puck does. */
function rotate([w, x, y, z]: Quaternion, v: Vector3): Vector3 {
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

const apply = (m: Matrix3, v: Vector3): Vector3 =>
  m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]) as unknown as Vector3;

function expectClose(a: Vector3, b: Vector3): void {
  a.forEach((value, i) => expect(value).toBeCloseTo(b[i], 6));
}

const SOME_VECTORS: Vector3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [0.48, -0.6, 0.64],
];

function mapView(overrides: Partial<MapView> = {}): MapView {
  return {
    pointing: { altDeg: 30, azDeg: 180 },
    rollDeg: 0,
    fieldDeg: 60,
    flipX: 1,
    flipY: 1,
    eyepiece: false,
    starLimitMag: 6,
    rotation: skyRotation(new Date('2026-11-21T22:00:00Z'), 40.4, -3.7),
    frame: 1,
    ...overrides,
  };
}

describe('puck view', () => {
  it('turns vectors by the quaternion as the sky rotation does', () => {
    const rotation = skyRotation(new Date('2026-11-21T22:00:00Z'), 40.4, -3.7);
    const q = matrixToQuaternion(rotation);
    for (const v of SOME_VECTORS) expectClose(rotate(q, v), apply(rotation, v));
  });

  it('puts the pointing straight ahead, at minus z, whatever the roll', () => {
    const pointing = { altDeg: 25, azDeg: 70 };
    for (const rollDeg of [0, 35, -120]) {
      const q = matrixToQuaternion(viewMatrix(pointing, rollDeg));
      expectClose(rotate(q, horizontalVector(pointing)), [0, 0, -1]);
      for (const v of SOME_VECTORS) expectClose(rotate(q, v), apply(viewMatrix(pointing, rollDeg), v));
    }
  });

  it('turns the picture as the map does: rolled 90°, up goes to the left', () => {
    const pointing = { altDeg: 30, azDeg: 180 };
    const above = horizontalVector({ altDeg: 31, azDeg: 180 });
    const [x, y] = apply(viewMatrix(pointing, 90), above);
    expect(x).toBeLessThan(0);
    expect(Math.abs(y)).toBeLessThan(1e-9);
  });

  it('gives the direction to the target as the map draws it', () => {
    const above = { altDeg: 40, azDeg: 180 };
    expect(targetDirectionDeg(mapView(), above)).toBeCloseTo(0, 6);
    expect(targetDirectionDeg(mapView({ rollDeg: 90 }), above)).toBeCloseTo(270, 6);
    expect(targetDirectionDeg(mapView({ flipY: -1 }), above)).toBeCloseTo(180, 6);
    // Facing south, west is on the right.
    expect(targetDirectionDeg(mapView(), { altDeg: 30, azDeg: 190 })).toBeGreaterThan(80);
    expect(targetDirectionDeg(mapView({ flipX: -1 }), { altDeg: 30, azDeg: 190 })).toBeGreaterThan(260);
  });

  it('writes the layout of docs/puck.md', () => {
    const buffer = encodeView(mapView({ flipX: -1, eyepiece: true }), null, 65537, 1234.4);
    expect(buffer.byteLength).toBe(VIEW_BYTES);
    const data = new DataView(buffer);
    expect(data.getUint8(0)).toBe(1);
    expect(data.getUint8(1)).toBe(1);
    expect(data.getUint16(2, true)).toBe(1);
    expect(data.getUint32(4, true)).toBe(1234);
    const sky = [8, 12, 16, 20].map((at) => data.getFloat32(at, true));
    expect(Math.hypot(...sky)).toBeCloseTo(1, 5);
    expect(data.getFloat32(40, true)).toBe(60);
    expect(data.getFloat32(44, true)).toBe(30);
    expect(data.getFloat32(48, true)).toBe(180);
    expect(data.getFloat32(52, true)).toBeNaN();
    expect(data.getFloat32(56, true)).toBeNaN();
    expect(data.getFloat32(60, true)).toBe(6);
    expect(data.getUint8(64)).toBe(1 | 4);
  });

  it('measures the distance to a target', () => {
    const view = mapView();
    // Where the target is in J2000 doesn't matter here: only that it comes out somewhere.
    const data = new DataView(encodeView(view, { raDeg: 83.6, decDeg: 22 }, 0, 0));
    const distance = data.getFloat32(52, true);
    expect(distance).toBeGreaterThanOrEqual(0);
    expect(distance).toBeLessThanOrEqual(180);
    expect(data.getFloat32(56, true)).toBeGreaterThanOrEqual(0);
  });
});
