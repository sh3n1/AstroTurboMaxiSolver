// Where the dwarf planet Ceres and the bright asteroids Vesta, Pallas and Juno are.
//
// astronomy-engine covers the major planets and Pluto, but not asteroids, so these are
// worked out here from their orbits, which scripts/build-minor-planets.mjs fetches from
// NASA/JPL. Each orbit is an ellipse around the Sun, exact at one moment. The planets pull
// it slowly away from that, so positions stay within a few arcminutes for about a year.

import { Body, HelioVector, MakeTime } from 'astronomy-engine';

import data from '../../assets/data/minor-planets.json';

export interface MinorPlanet {
  name: string;
  kind: 'Dwarf planet' | 'Asteroid';
  designation: string;
  /** Julian date the orbit is exact at. */
  epochJd: number;
  /** Half the orbit's long axis, in astronomical units. */
  a: number;
  e: number;
  /** Orbit angles in degrees, against the J2000 ecliptic. */
  i: number;
  node: number;
  perihelion: number;
  meanAnomaly: number;
  /** Degrees a day around the orbit, on average. */
  dailyMotion: number;
  /** Brightness at 1 au from the Sun and the Earth, and how it fades with phase. */
  h: number;
  g: number;
  /** Mean diameter in kilometres. */
  diameterKm: number;
}

/** Where a minor planet appears from the Earth, how bright, and how far from us and the Sun. */
export interface MinorPlanetPosition {
  raDeg: number;
  decDeg: number;
  mag: number;
  /** Distance from the Earth, in astronomical units. */
  earthDistanceAu: number;
  /** The angle between it and the Sun, seen from the Earth. */
  sunAngleDeg: number;
  /** How much of the disc facing us is sunlit, from 0 to 1. */
  litFraction: number;
}

export const MINOR_PLANETS: readonly MinorPlanet[] = data.bodies as MinorPlanet[];

const RAD = Math.PI / 180;
/** The tilt of the Earth's axis at J2000, between the ecliptic and the equator. */
const OBLIQUITY = 23.4392911 * RAD;
/** Days light takes to travel one astronomical unit. */
const LIGHT_DAYS_PER_AU = 0.0057755183;
/** Julian date of J2000, which astronomy-engine counts its days from. */
const J2000_JD = 2451545;

type Vector = [number, number, number];

/** The minor planet with this name, or undefined if it isn't one. */
export function minorPlanet(name: string): MinorPlanet | undefined {
  return MINOR_PLANETS.find((planet) => planet.name === name);
}

/**
 * Where the object is on its orbit at a Julian date, from the Sun, in J2000 equatorial
 * coordinates and astronomical units, the same frame astronomy-engine uses.
 */
function heliocentric(planet: MinorPlanet, jd: number): Vector {
  const { a, e } = planet;
  const meanAnomaly = (planet.meanAnomaly + planet.dailyMotion * (jd - planet.epochJd)) * RAD;
  // Kepler's equation, solved by Newton's method. A few steps are plenty for these orbits.
  let eccentric = meanAnomaly;
  for (let step = 0; step < 8; step++) {
    eccentric -= (eccentric - e * Math.sin(eccentric) - meanAnomaly) / (1 - e * Math.cos(eccentric));
  }
  // Position in the plane of the orbit, with x towards the closest point to the Sun.
  const x = a * (Math.cos(eccentric) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(eccentric);

  // Turn the orbit's plane into place against the ecliptic.
  const [w, node, i] = [planet.perihelion * RAD, planet.node * RAD, planet.i * RAD];
  const [cw, sw, cn, sn, ci, si] = [Math.cos(w), Math.sin(w), Math.cos(node), Math.sin(node), Math.cos(i), Math.sin(i)];
  const ex = (cn * cw - sn * sw * ci) * x + (-cn * sw - sn * cw * ci) * y;
  const ey = (sn * cw + cn * sw * ci) * x + (-sn * sw + cn * cw * ci) * y;
  const ez = sw * si * x + cw * si * y;

  // Then tilt the ecliptic onto the equator.
  return [ex, ey * Math.cos(OBLIQUITY) - ez * Math.sin(OBLIQUITY), ey * Math.sin(OBLIQUITY) + ez * Math.cos(OBLIQUITY)];
}

const length = ([x, y, z]: Vector): number => Math.hypot(x, y, z);

/**
 * How bright the object looks, from the standard H, G system for asteroids: its distance
 * from the Sun and the Earth, and how much of its sunlit side faces us.
 */
function magnitude(planet: MinorPlanet, sunDistance: number, earthDistance: number, earthSunDistance: number): number {
  const cosPhase = (sunDistance ** 2 + earthDistance ** 2 - earthSunDistance ** 2) / (2 * sunDistance * earthDistance);
  const halfPhaseTan = Math.tan(Math.acos(Math.max(-1, Math.min(1, cosPhase))) / 2);
  const phi1 = Math.exp(-3.33 * halfPhaseTan ** 0.63);
  const phi2 = Math.exp(-1.87 * halfPhaseTan ** 1.22);
  return (
    planet.h + 5 * Math.log10(sunDistance * earthDistance) - 2.5 * Math.log10((1 - planet.g) * phi1 + planet.g * phi2)
  );
}

/**
 * Where a minor planet appears from the Earth at a time, as a J2000 position, and how
 * bright it looks. Allows for the time its light takes to reach us. Seen from the Earth's
 * centre, since these are far enough away for where on Earth to make no difference.
 */
export function minorPlanetPosition(planet: MinorPlanet, date: Date): MinorPlanetPosition {
  const time = MakeTime(date);
  const earthVector = HelioVector(Body.Earth, time);
  const earth: Vector = [earthVector.x, earthVector.y, earthVector.z];
  const jd = time.tt + J2000_JD;

  // Where it was when the light we see now left it: two steps converge closely enough.
  let sun = heliocentric(planet, jd);
  let fromEarth: Vector = [sun[0] - earth[0], sun[1] - earth[1], sun[2] - earth[2]];
  for (let step = 0; step < 2; step++) {
    sun = heliocentric(planet, jd - length(fromEarth) * LIGHT_DAYS_PER_AU);
    fromEarth = [sun[0] - earth[0], sun[1] - earth[1], sun[2] - earth[2]];
  }

  const distance = length(fromEarth);
  const raDeg = (((Math.atan2(fromEarth[1], fromEarth[0]) / RAD) % 360) + 360) % 360;
  const decDeg = Math.asin(fromEarth[2] / distance) / RAD;
  // The Sun is in the opposite direction to the Earth's own position from it.
  const sunAngleDeg = angleDeg([-earth[0], -earth[1], -earth[2]], fromEarth);
  // The phase angle is Sun to object to Earth. The lit share of the disc follows from it.
  const phaseAngle = angleDeg([-sun[0], -sun[1], -sun[2]], [-fromEarth[0], -fromEarth[1], -fromEarth[2]]) * RAD;
  return {
    raDeg,
    decDeg,
    mag: magnitude(planet, length(sun), distance, length(earth)),
    earthDistanceAu: distance,
    sunAngleDeg,
    litFraction: (1 + Math.cos(phaseAngle)) / 2,
  };
}

/** The angle between two directions, in degrees. */
function angleDeg(a: Vector, b: Vector): number {
  const cosine = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (length(a) * length(b));
  return Math.acos(Math.max(-1, Math.min(1, cosine))) / RAD;
}
