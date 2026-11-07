// Astronomy and projection maths, with no Angular dependency.
//
// astronomy-engine does the astronomy: where the sky is for a time and place, and
// where the Sun and Moon are. This file adapts it and adds the view projection.
//
// Angles are in degrees unless a name says otherwise. Azimuth is measured from
// north through east. Local vectors use the axes east, north, up. Catalogue
// positions are J2000. Atmospheric refraction is not applied yet.

import { Body, Equator, Horizon, Illumination, Observer, Rotation_EQJ_HOR, SearchAltitude } from 'astronomy-engine';

export type Vector3 = readonly [number, number, number];
export type Matrix3 = readonly [Vector3, Vector3, Vector3];

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

/** Observing conditions for a time and place. */
export interface SkyConditions {
  sunAltDeg: number;
  /** When full darkness starts, or null if it is already dark or never gets dark. */
  darkFrom: Date | null;
  /** When full darkness ends, or null if it isn't reached in the next day. */
  darkUntil: Date | null;
  moonAltDeg: number;
  moonIlluminatedPercent: number;
}

const RAD = Math.PI / 180;
// The Sun's altitude when astronomical twilight ends and the sky is fully dark.
const FULL_DARKNESS_SUN_ALT_DEG = -18;

const normalizeDeg = (deg: number): number => ((deg % 360) + 360) % 360;

const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vector3): Vector3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** Unit vector for a J2000 sky position, with x towards RA 0 and z towards the north pole. */
export function equatorialVector(raDeg: number, decDeg: number): Vector3 {
  const ra = raDeg * RAD;
  const dec = decDeg * RAD;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/**
 * Rotation from J2000 sky vectors to local east, north, up vectors, including
 * precession. Build it once and reuse it, since it is applied to thousands of stars.
 */
export function skyRotation(date: Date, latitudeDeg: number, longitudeDeg: number): Matrix3 {
  // The library stores this matrix by columns, and its local axes are north, west, up.
  const { rot } = Rotation_EQJ_HOR(date, new Observer(latitudeDeg, longitudeDeg, 0));
  return [
    [-rot[0][1], -rot[1][1], -rot[2][1]],
    [rot[0][0], rot[1][0], rot[2][0]],
    [rot[0][2], rot[1][2], rot[2][2]],
  ];
}

export const applyMatrix = (m: Matrix3, v: Vector3): Vector3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];

/** Unit vector in local coordinates for an altitude and azimuth. */
export function horizontalVector({ altDeg, azDeg }: Horizontal): Vector3 {
  const alt = altDeg * RAD;
  const az = azDeg * RAD;
  return [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
}

/** Altitude and azimuth for a local unit vector. */
export function vectorToHorizontal([east, north, up]: Vector3): Horizontal {
  return { altDeg: Math.asin(Math.max(-1, Math.min(1, up))) / RAD, azDeg: normalizeDeg(Math.atan2(east, north) / RAD) };
}

/** Altitude and azimuth of a J2000 sky position, using a rotation from skyRotation. */
export function equatorialToHorizontal(rotation: Matrix3, raDeg: number, decDeg: number): Horizontal {
  return vectorToHorizontal(applyMatrix(rotation, equatorialVector(raDeg, decDeg)));
}

/** Angle between two sky positions in altitude and azimuth. */
export function separationDeg(a: Horizontal, b: Horizontal): number {
  const va = horizontalVector(a);
  const vb = horizontalVector(b);
  // atan2 stays accurate for very small and very large angles, unlike acos.
  return Math.atan2(Math.hypot(...cross(va, vb)), dot(va, vb)) / RAD;
}

/** Shortest azimuth change from one position to another. Positive means turn right. */
export function azimuthChangeDeg(fromDeg: number, toDeg: number): number {
  const change = normalizeDeg(toDeg - fromDeg);
  return change > 180 ? change - 360 : change;
}

/** Names an azimuth as one of the eight main compass directions. */
export function compassPoint(azDeg: number): string {
  const names = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return names[Math.round(normalizeDeg(azDeg) / 45) % 8];
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

/** Local vector for coordinates along the view's axes. The inverse of toViewCoordinates. */
export function fromViewCoordinates({ right, up, forward }: ViewBasis, [x, y, z]: Vector3): Vector3 {
  return [
    x * right[0] + y * up[0] + z * forward[0],
    x * right[1] + y * up[1] + z * forward[1],
    x * right[2] + y * up[2] + z * forward[2],
  ];
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

/** Where a planet or the Moon is, as a J2000 position, seen from a place at a time. */
export function solarSystemPosition(
  bodyName: string,
  date: Date,
  latitudeDeg: number,
  longitudeDeg: number,
): { raDeg: number; decDeg: number; mag: number; litFraction: number } {
  const body = bodyName as Body;
  // Using the observer's location matters most for the Moon, which is close enough
  // to appear in a different place from different parts of the Earth.
  const { ra, dec } = Equator(body, date, new Observer(latitudeDeg, longitudeDeg, 0), false, true);
  const { mag, phase_fraction } = Illumination(body, date);
  return { raDeg: ra * 15, decDeg: dec, mag, litFraction: phase_fraction };
}

/** Where the Sun is, as a J2000 position, for working out which side of a phase is lit. */
export function sunPosition(date: Date, latitudeDeg: number, longitudeDeg: number): { raDeg: number; decDeg: number } {
  const { ra, dec } = Equator(Body.Sun, date, new Observer(latitudeDeg, longitudeDeg, 0), false, true);
  return { raDeg: ra * 15, decDeg: dec };
}

/**
 * Whether a body's sunlit side looks to be on the right, for someone facing it from
 * where they stand. The lit side faces the Sun. A body east of the Sun, like the
 * evening Moon, has the Sun to its west, which is on the right when facing south
 * from the northern hemisphere and on the left from the southern hemisphere.
 */
export function litOnRight(bodyRaDeg: number, sunRaDeg: number, latitudeDeg: number): boolean {
  const eastOfSun = (((bodyRaDeg - sunRaDeg) % 360) + 360) % 360 < 180;
  return eastOfSun === latitudeDeg >= 0;
}

/** Altitude of the Sun or Moon for a time and place. */
function bodyAltitudeDeg(body: Body, date: Date, observer: Observer): number {
  const { ra, dec } = Equator(body, date, observer, true, true);
  return Horizon(date, observer, ra, dec).altitude;
}

/** Works out the darkness window and Moon for a time and place. */
export function skyConditions(date: Date, latitudeDeg: number, longitudeDeg: number): SkyConditions {
  const observer = new Observer(latitudeDeg, longitudeDeg, 0);
  const sunAltDeg = bodyAltitudeDeg(Body.Sun, date, observer);
  const alreadyDark = sunAltDeg <= FULL_DARKNESS_SUN_ALT_DEG;

  // Search forward one day. Far enough north in summer, it never gets fully dark.
  const start = alreadyDark ? null : SearchAltitude(Body.Sun, observer, -1, date, 1, FULL_DARKNESS_SUN_ALT_DEG);
  const end =
    alreadyDark || start ? SearchAltitude(Body.Sun, observer, +1, start ?? date, 1, FULL_DARKNESS_SUN_ALT_DEG) : null;

  return {
    sunAltDeg,
    darkFrom: start?.date ?? null,
    darkUntil: end?.date ?? null,
    moonAltDeg: bodyAltitudeDeg(Body.Moon, date, observer),
    moonIlluminatedPercent: Illumination(Body.Moon, date).phase_fraction * 100,
  };
}

/** A J2000 position for a local vector, using a rotation from skyRotation. */
export function localToEquatorial(rotation: Matrix3, [east, north, up]: Vector3): { raDeg: number; decDeg: number } {
  // A rotation's inverse is its transpose.
  const x = rotation[0][0] * east + rotation[1][0] * north + rotation[2][0] * up;
  const y = rotation[0][1] * east + rotation[1][1] * north + rotation[2][1] * up;
  const z = rotation[0][2] * east + rotation[1][2] * north + rotation[2][2] * up;
  return { raDeg: normalizeDeg(Math.atan2(y, x) / RAD), decDeg: Math.asin(Math.max(-1, Math.min(1, z))) / RAD };
}

/** Right ascension as hours and minutes, such as "5h 36m". */
export function formatRa(raDeg: number): string {
  const totalMinutes = Math.round((normalizeDeg(raDeg) / 15) * 60) % (24 * 60);
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
}

/** A place on Earth as compass-labelled degrees, such as "39.47° N, 0.38° W". */
export function formatLocation(latitudeDeg: number, longitudeDeg: number): string {
  const part = (value: number, positive: string, negative: string): string =>
    `${Math.abs(value).toFixed(2)}° ${value >= 0 ? positive : negative}`;
  return `${part(latitudeDeg, 'N', 'S')}, ${part(longitudeDeg, 'E', 'W')}`;
}

/** Declination as degrees and minutes, such as "+38° 47′". */
export function formatDec(decDeg: number): string {
  const totalMinutes = Math.round(Math.abs(decDeg) * 60);
  const sign = decDeg < 0 && totalMinutes > 0 ? '−' : '+';
  return `${sign}${Math.floor(totalMinutes / 60)}° ${String(totalMinutes % 60).padStart(2, '0')}′`;
}

/**
 * How far the phone is turned about the camera's axis, away from level. Zero means the
 * top of the phone points up the sky. The phone's up direction is a local vector.
 */
export function viewRollDeg(pointing: Horizontal, phoneUp: Vector3): number {
  const basis = viewBasis(pointing);
  return Math.atan2(dot(phoneUp, basis.right), dot(phoneUp, basis.up)) / RAD;
}

/** Turns view coordinates to match the phone's roll, so the map turns with the phone. */
export function rotateInView(x: number, y: number, rollDeg: number): { x: number; y: number } {
  if (rollDeg === 0) return { x, y };
  const [sin, cos] = [Math.sin(rollDeg * RAD), Math.cos(rollDeg * RAD)];
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}
