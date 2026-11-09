// Astronomy and projection maths, with no Angular dependency.
//
// astronomy-engine does the astronomy: where the sky is for a time and place, and
// where the Sun and Moon are. This file adapts it and adds the view projection.
//
// Angles are in degrees unless a name says otherwise. Azimuth is measured from
// north through east. Local vectors use the axes east, north, up. Catalogue
// positions are J2000. Local positions include atmospheric refraction: they are where
// things appear in the sky, which is what the phone's sensors and camera see.

import {
  Body,
  Equator,
  Horizon,
  Illumination,
  InverseRefraction,
  Observer,
  Refraction,
  Rotation_EQJ_HOR,
  SearchAltitude,
} from 'astronomy-engine';

import { minorPlanet, minorPlanetPosition } from './minor-planets';

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
/** The same direction as a vector, scaled to length 1. */
export const normalize = (a: Vector3): Vector3 => {
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

/**
 * astronomy-engine's refraction model for average air (10 °C, 1010 hPa). The air lifts
 * what is near the horizon by up to about half a degree, and almost nothing overhead.
 */
const REFRACTION = 'normal';

/** A local direction moved up (or down, for a negative angle), keeping its azimuth. */
function raiseBy([east, north, up]: Vector3, deg: number): Vector3 {
  const horizontal = Math.hypot(east, north);
  if (deg === 0 || horizontal < 1e-9) return [east, north, up]; // Straight up has no azimuth to keep
  const alt = Math.min(90, Math.atan2(up, horizontal) / RAD + deg) * RAD;
  const scale = Math.cos(alt) / horizontal;
  return [east * scale, north * scale, Math.sin(alt)];
}

/** Where a local direction appears in the sky, lifted by the air. */
export function refract(v: Vector3): Vector3 {
  return raiseBy(v, Refraction(REFRACTION, vectorToHorizontal(v).altDeg));
}

/** The real direction of something that appears at a local direction: refract() undone. */
export function unrefract(v: Vector3): Vector3 {
  return raiseBy(v, InverseRefraction(REFRACTION, vectorToHorizontal(v).altDeg));
}

/** A J2000 direction turned to where it appears in the local sky, using a rotation from skyRotation. */
export function toApparent(rotation: Matrix3, v: Vector3): Vector3 {
  return refract(applyMatrix(rotation, v));
}

/**
 * A plate solve's camera axes turned from J2000 to the local sky as it appears. The
 * camera sees the refracted sky, so all three axes are tilted together by the lift at
 * the centre of the image (z, out through the lens), which keeps them perpendicular.
 */
export function apparentAxes(rotation: Matrix3, axes: readonly Vector3[]): Vector3[] {
  const local = axes.map((axis) => applyMatrix(rotation, axis));
  const centre = local[2];
  const lifted = refract(centre);
  const turn = cross(centre, lifted);
  const sin = Math.hypot(turn[0], turn[1], turn[2]);
  if (sin < 1e-12) return local;
  // Rodrigues' rotation formula, about the axis that takes the centre to where it appears.
  const k = normalize(turn);
  const cos = dot(centre, lifted);
  return local.map((v): Vector3 => {
    const kxv = cross(k, v);
    const along = dot(k, v) * (1 - cos);
    return [
      v[0] * cos + kxv[0] * sin + k[0] * along,
      v[1] * cos + kxv[1] * sin + k[1] * along,
      v[2] * cos + kxv[2] * sin + k[2] * along,
    ];
  });
}

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

/** Where a J2000 sky position appears, as altitude and azimuth, using a rotation from skyRotation. */
export function equatorialToHorizontal(rotation: Matrix3, raDeg: number, decDeg: number): Horizontal {
  return vectorToHorizontal(toApparent(rotation, equatorialVector(raDeg, decDeg)));
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

/** The same compass direction as letters, such as "SE", short enough for a badge. */
export function compassShort(azDeg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(normalizeDeg(azDeg) / 45) % 8];
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
  // Ceres and the asteroids aren't in astronomy-engine, so they come from their orbits.
  const minor = minorPlanet(bodyName);
  if (minor) {
    const { raDeg, decDeg, mag, litFraction } = minorPlanetPosition(minor, date);
    return { raDeg, decDeg, mag, litFraction };
  }
  const body = bodyName as Body;
  // Using the observer's location matters most for the Moon, which is close enough
  // to appear in a different place from different parts of the Earth.
  const { ra, dec } = Equator(body, date, new Observer(latitudeDeg, longitudeDeg, 0), false, true);
  const { mag, phase_fraction } = Illumination(body, date);
  return { raDeg: ra * 15, decDeg: dec, mag, litFraction: phase_fraction };
}

/** How fast the sky turns, in degrees per hour of clock time: a turn in a sidereal day. */
const SKY_TURN_DEG_PER_HOUR = 360 / 23.9345;

/**
 * The real height of something that appears exactly on the horizon: just below it,
 * since the air lifts it by about half a degree there.
 */
const HORIZON_REAL_ALT_DEG = InverseRefraction(REFRACTION, 0);

/**
 * Hours until an object fixed among the stars rises above the horizon, from where it
 * appears now, or null if it never rises from this latitude. Worked out from its current
 * height and direction, so it agrees exactly with the heights shown elsewhere in the app.
 */
export function hoursUntilRise(apparent: Horizontal, latitudeDeg: number): number | null {
  const [east, north, up] = unrefract(horizontalVector(apparent));
  const lat = latitudeDeg * RAD;
  // Declination is the angle from the celestial equator, towards the celestial pole.
  const sinDec = north * Math.cos(lat) + up * Math.sin(lat);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  // Hour angle: how far west of the meridian the object is, in degrees.
  const hourAngle = Math.atan2(-east, -north * Math.sin(lat) + up * Math.cos(lat)) / RAD;
  // The hour angle at which it appears on the horizon. Beyond ±1, it never rises here.
  const cosRise =
    (Math.sin(HORIZON_REAL_ALT_DEG * RAD) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  if (cosRise >= 1) return null;
  if (cosRise <= -1) return 0; // Never sets, so it is up already
  const riseHourAngle = -Math.acos(cosRise) / RAD;
  const degreesToGo = (((riseHourAngle - hourAngle) % 360) + 360) % 360;
  return degreesToGo / SKY_TURN_DEG_PER_HOUR;
}

/**
 * When a planet or the Moon next rises above the horizon, within a day, or null if it
 * stays down that long. Measured to the body's centre as it appears, lifted by the air,
 * the same way the app works out every height.
 */
export function nextBodyRise(bodyName: string, date: Date, latitudeDeg: number, longitudeDeg: number): Date | null {
  // Ceres and the asteroids move so slowly that their rise is worked out like a star's.
  if (minorPlanet(bodyName)) {
    const { raDeg, decDeg } = solarSystemPosition(bodyName, date, latitudeDeg, longitudeDeg);
    const position = equatorialToHorizontal(skyRotation(date, latitudeDeg, longitudeDeg), raDeg, decDeg);
    const hours = hoursUntilRise(position, latitudeDeg);
    return hours === null || hours > 24 ? null : new Date(date.getTime() + hours * 3_600_000);
  }
  const observer = new Observer(latitudeDeg, longitudeDeg, 0);
  return SearchAltitude(bodyName as Body, observer, +1, date, 1, HORIZON_REAL_ALT_DEG)?.date ?? null;
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

/**
 * The J2000 position of what appears at a local direction, such as where the phone
 * points, using a rotation from skyRotation. Undoes the refraction first.
 */
export function localToEquatorial(rotation: Matrix3, apparent: Vector3): { raDeg: number; decDeg: number } {
  const [east, north, up] = unrefract(apparent);
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

/** How high the Sun is, in degrees, for a time and place. Negative once it has set. */
export function sunAltitudeDeg(date: Date, latitudeDeg: number, longitudeDeg: number): number {
  return bodyAltitudeDeg(Body.Sun, date, new Observer(latitudeDeg, longitudeDeg, 0));
}
