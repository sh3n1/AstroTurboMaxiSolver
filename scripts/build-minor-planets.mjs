// Builds the orbits of the dwarf planet Ceres and the bright asteroids Vesta, Pallas and
// Juno, which the app uses to work out where they are.
// Usage: node scripts/build-minor-planets.mjs
//
// The orbits come from NASA/JPL's Small-Body Database, which is free to use. They are
// osculating elements: an exact orbit at one moment, which the planets slowly pull away
// from. Worked out from them, positions stay within a few arcminutes for about a year,
// so run this again every year or so to keep them accurate.

import { writeFileSync } from 'node:fs';

const OUTPUT = 'src/assets/data/minor-planets.json';

/** The objects, by their number in the catalogue of minor planets, with how to describe them. */
const OBJECTS = [
  { number: 1, name: 'Ceres', kind: 'Dwarf planet' },
  { number: 4, name: 'Vesta', kind: 'Asteroid' },
  { number: 2, name: 'Pallas', kind: 'Asteroid' },
  { number: 3, name: 'Juno', kind: 'Asteroid' },
];

const number = (value, label) => {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Missing or invalid ${label}`);
  return result;
};

const bodies = [];
for (const { number: id, name, kind } of OBJECTS) {
  const url = `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${id}&full-prec=1&phys-par=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: the database answered ${response.status}`);
  const data = await response.json();
  if (data.orbit.equinox !== 'J2000') throw new Error(`${name}: expected J2000 elements, got ${data.orbit.equinox}`);
  const elements = Object.fromEntries(data.orbit.elements.map((e) => [e.name, e.value]));
  const physical = Object.fromEntries((data.phys_par ?? []).map((p) => [p.name, p.value]));
  bodies.push({
    name,
    kind,
    designation: data.object.fullname,
    // Julian date (TDB) the orbit is exact at.
    epochJd: number(data.orbit.epoch, `${name} epoch`),
    // Size and shape of the orbit, in astronomical units, and its eccentricity.
    a: number(elements.a, `${name} a`),
    e: number(elements.e, `${name} e`),
    // Angles in degrees, against the J2000 ecliptic: inclination, ascending node,
    // argument of perihelion, and mean anomaly at the epoch.
    i: number(elements.i, `${name} i`),
    node: number(elements.om, `${name} node`),
    perihelion: number(elements.w, `${name} perihelion`),
    meanAnomaly: number(elements.ma, `${name} mean anomaly`),
    // Mean motion, in degrees a day.
    dailyMotion: number(elements.n, `${name} daily motion`),
    // Brightness at 1 au from the Sun and the Earth, and how it changes with phase.
    h: number(physical.H, `${name} H`),
    g: Number.isFinite(Number(physical.G)) ? Number(physical.G) : 0.15,
    // Mean diameter in kilometres, for the size of the disc in the details box.
    diameterKm: number(physical.diameter, `${name} diameter`),
  });
}

const output = {
  about: 'Orbits from the NASA/JPL Small-Body Database (ssd.jpl.nasa.gov). Rebuild with scripts/build-minor-planets.mjs.',
  fetched: new Date().toISOString().slice(0, 10),
  bodies,
};
writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');
console.log(`Wrote ${bodies.length} orbits to ${OUTPUT}`);
