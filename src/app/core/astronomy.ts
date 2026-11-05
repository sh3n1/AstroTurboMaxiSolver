// Plain astronomy and projection maths, with no Angular dependency.
//
// Angles are in degrees unless a name says otherwise. Azimuth is measured from
// north through east. Local vectors use the axes east, north, up.
//
// These formulas are good enough for the UI preview. They ignore precession and
// refraction. Stage 4 of todo.md evaluates astronomy-engine as a replacement.

export type Vector3 = readonly [number, number, number];
type Matrix3 = readonly [Vector3, Vector3, Vector3];

export interface Horizontal {
  altDeg: number;
  azDeg: number;
}

/** A camera or eyepiece orientation, as three perpendicular unit vectors. */
export interface ViewBasis {
  right: Vector3;
  up: Vector3;
  forward: Vector3;
}

const RAD = Math.PI / 180;
const normalizeDeg = (deg: number) => ((deg % 360) + 360) % 360;

const dot = (a: Vector3, b: Vector3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vector3): Vector3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Greenwich mean sidereal time, from Meeus, Astronomical Algorithms, equation 12.4. */
export function greenwichSiderealDeg(date: Date): number {
  const daysSinceJ2000 = date.getTime() / 86_400_000 + 2_440_587.5 - 2_451_545;
  const centuries = daysSinceJ2000 / 36_525;
  return normalizeDeg(
    280.46061837 + 360.98564736629 * daysSinceJ2000 + 0.000387933 * centuries ** 2 - centuries ** 3 / 38_710_000,
  );
}

/** Local sidereal time. Longitude is positive to the east. */
export function localSiderealDeg(date: Date, longitudeDeg: number): number {
  return normalizeDeg(greenwichSiderealDeg(date) + longitudeDeg);
}

/** Converts a sky position to altitude and azimuth for a place and sidereal time. */
export function equatorialToHorizontal(raDeg: number, decDeg: number, latitudeDeg: number, lstDeg: number): Horizontal {
  const hourAngle = (lstDeg - raDeg) * RAD;
  const dec = decDeg * RAD;
  const lat = latitudeDeg * RAD;
  const altitude = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle));
  const azimuth = Math.atan2(
    -Math.cos(dec) * Math.sin(hourAngle),
    Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(hourAngle) * Math.sin(lat),
  );
  return { altDeg: altitude / RAD, azDeg: normalizeDeg(azimuth / RAD) };
}

/** Unit vector for a sky position, with x towards RA 0 and z towards the north pole. */
export function equatorialVector(raDeg: number, decDeg: number): Vector3 {
  const ra = raDeg * RAD;
  const dec = decDeg * RAD;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/**
 * Rotation from equatorial vectors to local vectors. Building it once per frame
 * is much faster than running equatorialToHorizontal for thousands of stars.
 */
export function equatorialToLocalMatrix(latitudeDeg: number, lstDeg: number): Matrix3 {
  const sinLat = Math.sin(latitudeDeg * RAD);
  const cosLat = Math.cos(latitudeDeg * RAD);
  const sinLst = Math.sin(lstDeg * RAD);
  const cosLst = Math.cos(lstDeg * RAD);
  return [
    [-sinLst, cosLst, 0],
    [-sinLat * cosLst, -sinLat * sinLst, cosLat],
    [cosLat * cosLst, cosLat * sinLst, sinLat],
  ];
}

export const applyMatrix = (m: Matrix3, v: Vector3): Vector3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];

/** Unit vector in local coordinates for an altitude and azimuth. */
export function horizontalVector({ altDeg, azDeg }: Horizontal): Vector3 {
  const alt = altDeg * RAD;
  const az = azDeg * RAD;
  return [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
}

/** Angle between two sky positions in altitude and azimuth. */
export function separationDeg(a: Horizontal, b: Horizontal): number {
  const va = horizontalVector(a);
  const vb = horizontalVector(b);
  // atan2 stays accurate for very small and very large angles, unlike acos.
  return Math.atan2(Math.hypot(...cross(va, vb)), dot(va, vb)) / RAD;
}

/** Orientation of a view looking at a pointing, with the horizon level. */
export function viewBasis(pointing: Horizontal): ViewBasis {
  const forward = horizontalVector(pointing);
  // Looking straight up has no unique "right", so callers keep altitude below 90°.
  const right = normalize(cross(forward, [0, 0, 1]));
  return { right, up: cross(right, forward), forward };
}

/** Coordinates of a local vector along the view's right, up and forward axes. */
export function toViewCoordinates(basis: ViewBasis, v: Vector3): Vector3 {
  return [dot(v, basis.right), dot(v, basis.up), dot(v, basis.forward)];
}

/**
 * Stereographic projection of view coordinates to a plane. It keeps shapes
 * correct across a wide view, so constellations don't look stretched at the edge.
 * The result is 2 at 90° from the centre of the view.
 */
export function stereographic([x, y, z]: Vector3): { x: number; y: number } {
  const scale = 2 / (1 + z);
  return { x: x * scale, y: y * scale };
}

/** Projected distance from the view's centre for an angle. Matches stereographic(). */
export const stereographicRadius = (angleDeg: number): number => 2 * Math.tan((angleDeg * RAD) / 2);

/** Screen direction to a target: 0° is up and 90° is right. Works anywhere on the sky. */
export function bearingInViewDeg(basis: ViewBasis, target: Horizontal): number {
  const [x, y] = toViewCoordinates(basis, horizontalVector(target));
  return normalizeDeg(Math.atan2(x, y) / RAD);
}

/** Telescope magnification. */
export const magnification = (telescopeFocalMm: number, eyepieceFocalMm: number): number =>
  telescopeFocalMm / eyepieceFocalMm;

/** Approximate field of view through an eyepiece: apparent field divided by magnification. */
export const trueFieldDeg = (telescopeFocalMm: number, eyepieceFocalMm: number, apparentFieldDeg: number): number =>
  apparentFieldDeg / magnification(telescopeFocalMm, eyepieceFocalMm);
