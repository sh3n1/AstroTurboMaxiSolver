// Makes a night's field test plan (the puck's docs/field-tests.md) from what is up at the
// site and time: bright stars to align on, then targets spread low, middle and high in
// every direction, the Moon and planets, a few deep-sky objects, and steps for the link.
// It adapts to the night and the place, never a fixed list, and suits any telescope.
//
// Usage: node scripts/field-plan.mjs --lat 39.47 --lon -0.38 [--time 2026-11-24T22:00] [--count 12]
//        node scripts/field-plan.mjs --session <field session folder>   (site from the app's hello)
// Writes the plan as JSON on stdout, and a readable version on stderr.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Body, Equator, Horizon, Illumination, MakeTime, Observer } from 'astronomy-engine';

const TARGETS = 'src/assets/data/targets.json';
/** Stars bright enough to find at once in a finder, to align on. */
const ALIGN_MAG = 1.6;
/** Stars for the pointing steps: still easy to see in a town. */
const POINTING_MAG = 3;
/** Heights for the pointing steps: low, where trees and refraction get in; middle; high, hard for a Dobson. */
const BANDS = [
  { name: 'low', min: 15, max: 30 },
  { name: 'middle', min: 30, max: 60 },
  { name: 'high', min: 60, max: 85 },
];
const SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const PLANETS = [Body.Moon, Body.Mercury, Body.Venus, Body.Mars, Body.Jupiter, Body.Saturn, Body.Uranus, Body.Neptune];

function options() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  let lat = Number(value('lat'));
  let lon = Number(value('lon'));
  const session = value('session');
  if (session) {
    const info = JSON.parse(readFileSync(join(session, 'session.json'), 'utf8'));
    lat = info.app?.settings?.latitudeDeg;
    lon = info.app?.settings?.longitudeDeg;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Usage: node scripts/field-plan.mjs --lat <deg> --lon <deg> [--time <ISO>] [--count <n>]');
  }
  return { lat, lon, time: value('time') ? new Date(value('time')) : new Date(), count: Number(value('count') ?? 12) };
}

const sectorOf = (azDeg) => SECTORS[Math.round(azDeg / 45) % 8];
const azGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function main() {
  const { lat, lon, time, count } = options();
  const observer = new Observer(lat, lon, 0);
  const when = MakeTime(time);
  // J2000 positions straight into alt-az: precession moves them well under a degree, which
  // doesn't matter for choosing what to point at.
  const place = (raDeg, decDeg) => {
    const h = Horizon(when, observer, raDeg / 15, decDeg, 'normal');
    return { altDeg: Number(h.altitude.toFixed(1)), azDeg: Number(h.azimuth.toFixed(1)) };
  };
  const catalogue = JSON.parse(readFileSync(TARGETS, 'utf8')).map((t) => ({ ...t, ...place(t.raDeg, t.decDeg) }));
  const stars = catalogue.filter((t) => t.kind === 'Star').sort((a, b) => a.mag - b.mag);

  // Two or three bright stars, well apart round the sky, at comfortable heights.
  const align = [];
  for (const star of stars) {
    if (star.mag > ALIGN_MAG || star.altDeg < 25 || star.altDeg > 70) continue;
    if (align.every((s) => azGap(s.azDeg, star.azDeg) > 90)) align.push(star);
    if (align.length === 3) break;
  }

  // The brightest star in each height band and direction, then taken in turn round the sky
  // and up and down, so even a short session covers every kind of place.
  const cells = [];
  for (const band of BANDS) {
    for (const sector of SECTORS) {
      const star = stars.find(
        (s) =>
          s.mag <= POINTING_MAG &&
          s.altDeg >= band.min &&
          s.altDeg < band.max &&
          sectorOf(s.azDeg) === sector &&
          !align.includes(s),
      );
      if (star) cells.push({ ...star, band: band.name, sector });
    }
  }
  const pointing = [];
  for (let round = 0; pointing.length < count && cells.length; round++) {
    const band = BANDS[round % BANDS.length].name;
    const i = cells.findIndex(
      (c) => c.band === band && !pointing.some((p) => p.sector === c.sector && p.band === band),
    );
    pointing.push(...cells.splice(i >= 0 ? i : 0, 1));
  }

  const solarSystem = PLANETS.map((body) => {
    const eq = Equator(body, when, observer, true, true);
    const h = Horizon(when, observer, eq.ra, eq.dec, 'normal');
    return {
      id: body,
      altDeg: Number(h.altitude.toFixed(1)),
      azDeg: Number(h.azimuth.toFixed(1)),
      mag: Illumination(body, when).mag,
    };
  }).filter((p) => p.altDeg > 10);

  const deepSky = catalogue
    .filter((t) => t.kind !== 'Star' && t.kind !== 'Other' && t.mag <= 7 && t.altDeg > 30)
    .sort((a, b) => a.mag - b.mag)
    .slice(0, 4);

  const steps = [];
  const add = (kind, label, what, extra = {}) => steps.push({ step: steps.length + 1, kind, label, what, ...extra });
  add('link', 'pairing', 'Pair the puck with the phone; note how many tries it takes.');
  add('link', 'still', 'Leave everything still for 2 minutes: the baseline for the link and the sensors.');
  for (const s of align) {
    add(
      'align',
      s.id,
      `Align on ${s.id} (${s.name}), mag ${s.mag}, at ${s.altDeg}° ${sectorOf(s.azDeg)}.`,
      place(s.raDeg, s.decDeg),
    );
  }
  for (const s of pointing) {
    add(
      'point',
      s.id,
      `Choose ${s.id} (${s.band}, ${s.altDeg}° ${s.sector}) on the puck and follow its guidance; stop when the puck says centred.`,
      {
        altDeg: s.altDeg,
        azDeg: s.azDeg,
        band: s.band,
        mag: s.mag,
      },
    );
  }
  for (const p of solarSystem) {
    add('point', p.id, `Choose ${p.id} (${p.altDeg}° ${sectorOf(p.azDeg)}) on the puck and follow its guidance.`, {
      altDeg: p.altDeg,
      azDeg: p.azDeg,
    });
  }
  for (const d of deepSky) {
    add(
      'point',
      d.id,
      `Choose ${d.id} (${d.name}) and follow the guidance: a deep-sky target, centred by the map alone.`,
      {
        altDeg: d.altDeg,
        azDeg: d.azDeg,
      },
    );
  }
  add('link', 'walk', 'Walk 10 m away from the router with the puck and back, slowly.');
  add('link', 'lock', 'Lock the phone for 10 s, then unlock it: does the link come back by itself?');
  add('link', 'slew', 'Swing the telescope fast across the sky and stop: does the puck keep up, and settle?');

  const plan = { site: { lat, lon }, time: time.toISOString(), steps };
  process.stdout.write(JSON.stringify(plan, null, 1) + '\n');
  for (const s of steps) process.stderr.write(`${String(s.step).padStart(2)}. [${s.kind}] ${s.what}\n`);
}

main();
