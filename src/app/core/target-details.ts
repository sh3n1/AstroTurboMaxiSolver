// What the details box on the sky map says about a target, beyond its name: what kind of
// object it is, in words, its size, which constellation it is in, when it rises, is highest
// and sets, and whether the Moon is in the way. Plain functions, so they can be tested.

import { Constellation } from 'astronomy-engine';

import { equatorialVector } from './astronomy';
import { doubleKindText } from './double-stars';
import type { Target } from './targets';

/** Object types in OpenNGC's codes, which the catalogue files keep, in plain words. */
const TYPE_NAMES: Record<string, string> = {
  PN: 'Planetary nebula',
  SNR: 'Supernova remnant',
  HII: 'Star-forming nebula',
  EmN: 'Emission nebula',
  RfN: 'Reflection nebula',
  Neb: 'Nebula',
  'Cl+N': 'Open cluster with nebula',
  GPair: 'Galaxy pair',
  GTrpl: 'Galaxy triplet',
  GGroup: 'Galaxy group',
};

/**
 * A galaxy's Hubble type in words, with the code after it, such as "Barred spiral
 * galaxy (SBb)". The code's letters say the shape: E elliptical, S0 lenticular (a disc
 * with no arms), S spiral, with B for a bar or AB for a weak one, and I irregular.
 * Messier galaxies only have a plain S, E or I, which adds nothing to the words.
 */
export function hubbleText(code: string): string {
  const words = HUBBLE_WORDS.find(([prefix]) => code.startsWith(prefix))?.[1] ?? 'Galaxy';
  return ['S', 'E', 'I'].includes(code) ? words : `${words} (${code})`;
}

/** Hubble code beginnings, the more specific first, since "SB" also starts with "S". */
const HUBBLE_WORDS: readonly [string, string][] = [
  ['E-S0', 'Elliptical or lenticular galaxy'],
  ['E', 'Elliptical galaxy'],
  ['S0', 'Lenticular galaxy'],
  ['SAB', 'Weakly barred spiral galaxy'],
  ['SB', 'Barred spiral galaxy'],
  ['S', 'Spiral galaxy'],
  ['I', 'Irregular galaxy'],
];

/**
 * The colour a star shows in a telescope, from its B-V colour index: hot stars are
 * blue-white and cool ones orange or red. The Sun, at 0.65, would be yellow. The colour
 * says how hot the star is, but not whether it is a giant or a dwarf.
 */
export function starColourName(bv: number): string {
  if (bv < -0.15) return 'Blue';
  if (bv < 0) return 'Blue-white';
  if (bv < 0.3) return 'White';
  if (bv < 0.6) return 'Yellow-white';
  if (bv < 0.8) return 'Yellow';
  if (bv < 1.4) return 'Orange';
  if (bv < 1.8) return 'Orange-red';
  return 'Red';
}

/** What kind of object a target is, as specifically as the catalogues say. */
export function objectTypeText(target: Target): string {
  if (target.double) return doubleKindText(target.double);
  if (target.kind === 'Star') return target.bv === undefined ? 'Star' : `${starColourName(target.bv)} star`;
  if (target.type && TYPE_NAMES[target.type]) return TYPE_NAMES[target.type];
  if (target.kind === 'Galaxy' && target.hubble) return hubbleText(target.hubble);
  return target.kind;
}

/** A size in arcminutes, or in arcseconds when under one: "66′", "4.5′", "40″". */
function arcminText(value: number): string {
  if (value < 1) return `${Math.round(value * 60)}″`;
  return value >= 10 ? `${Math.round(value)}′` : `${Number(value.toFixed(1))}′`;
}

/** Both sides of an object, such as "66′ × 60′", or one for a round object, or null. */
export function sizeText(target: Pick<Target, 'sizeArcmin' | 'minorArcmin'>): string | null {
  const { sizeArcmin, minorArcmin } = target;
  if (!sizeArcmin) return null;
  if (!minorArcmin || minorArcmin === sizeArcmin) return `${arcminText(sizeArcmin)} across`;
  return `${arcminText(sizeArcmin)} × ${arcminText(minorArcmin)}`;
}

/** The angle between two catalogue positions, in degrees. */
export function equatorialSeparationDeg(
  a: Pick<Target, 'raDeg' | 'decDeg'>,
  b: Pick<Target, 'raDeg' | 'decDeg'>,
): number {
  const [va, vb] = [equatorialVector(a.raDeg, a.decDeg), equatorialVector(b.raDeg, b.decDeg)];
  const cosine = va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2];
  return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
}

/** The constellation a J2000 position is in, by the official IAU boundaries. */
export function constellationName(raDeg: number, decDeg: number): string {
  return Constellation(raDeg / 15, decDeg).name;
}

/**
 * The target's other names, without the ones the box's heading already shows, or an
 * empty string if none are left. "NGC 1976 Orion Nebula" under "M42 · NGC 1976 Orion
 * Nebula" adds nothing.
 */
export function otherNames(aliases: string | undefined, shown: readonly string[]): string {
  let rest = ` ${aliases ?? ''} `;
  // Longest first, so "Orion Nebula" goes before a shorter name inside it could.
  for (const name of [...shown].sort((a, b) => b.length - a.length)) {
    if (name) rest = rest.split(` ${name} `).join(' ');
  }
  return rest.replace(/\s+/g, ' ').trim();
}

/** A target's pass across the sky, as found by skyPass(). */
export interface SkyPass {
  /** When it rises, or null if it never sets. */
  rise: Date | null;
  /** When it is highest, and how high. Null if it doesn't rise within a day. */
  highest: { time: Date; altDeg: number } | null;
  /** When it sets, or null if it never sets. */
  set: Date | null;
}

/** Ten minutes between checks: close enough for times read off a phone. */
const PASS_STEP_MS = 10 * 60_000;
/** How far to look for a rise or set: a day, the longest a pass can take. */
const PASS_SEARCH_MS = 24 * 3_600_000;

/**
 * A target's pass across the sky: the one it is on now if it is up, or else its next
 * one. Its rise, its highest point and its set, whether that is day or night. Takes the
 * target's height at any time, so it works the same for stars, planets and the Moon.
 * Checks every ten minutes, and finds the rise and set between checks by straight lines.
 */
export function skyPass(altitudeAt: (time: Date) => number, now: Date): SkyPass {
  /**
   * The first moment, going back (-1) or forward (+1) from a start, when the height
   * crosses the horizon to the other side from where it started, or null within a day.
   */
  const crossing = (start: number, direction: 1 | -1): Date | null => {
    let [time, altDeg] = [start, altitudeAt(new Date(start))];
    const startsUp = altDeg > 0;
    for (let step = PASS_STEP_MS; step <= PASS_SEARCH_MS; step += PASS_STEP_MS) {
      const nextTime = start + direction * step;
      const nextAlt = altitudeAt(new Date(nextTime));
      if (nextAlt > 0 !== startsUp) {
        // Where the straight line between the two checks meets the horizon.
        return new Date(time + ((nextTime - time) * altDeg) / (altDeg - nextAlt));
      }
      [time, altDeg] = [nextTime, nextAlt];
    }
    return null;
  };

  /** The highest point between two times. */
  const highestBetween = (from: number, until: number): { time: Date; altDeg: number } => {
    let highest = { time: new Date(from), altDeg: altitudeAt(new Date(from)) };
    for (let t = from + PASS_STEP_MS; t <= until; t += PASS_STEP_MS) {
      const altDeg = altitudeAt(new Date(t));
      if (altDeg > highest.altDeg) highest = { time: new Date(t), altDeg };
    }
    return highest;
  };

  const time = now.getTime();
  if (altitudeAt(now) > 0) {
    // Up now: the pass it is on, from its last rise to its next set.
    const [rise, set] = [crossing(time, -1), crossing(time, 1)];
    // Never sets: its highest point within the next day.
    const highest = highestBetween(rise?.getTime() ?? time, set?.getTime() ?? time + PASS_SEARCH_MS);
    return { rise, highest, set };
  }
  // Down now: its next pass, if it rises within a day at all.
  const rise = crossing(time, 1);
  if (!rise) return { rise: null, highest: null, set: null };
  const set = crossing(rise.getTime() + PASS_STEP_MS, 1);
  return { rise, highest: highestBetween(rise.getTime(), set?.getTime() ?? rise.getTime() + PASS_SEARCH_MS), set };
}

/** Within this, a bright Moon's glare washes out faint objects. */
const MOON_GLARE_DEG = 40;
/** A Moon less lit than this, a thin crescent, doesn't light the sky much. */
const MOON_BRIGHT_FRACTION = 0.3;

/** A note on where the Moon is, and a warning when its glare will hide faint detail. */
export function moonNote(
  separationDeg: number,
  moonAltDeg: number,
  litFraction: number,
): { text: string; warn: boolean } {
  if (moonAltDeg <= 0) return { text: 'Moon below the horizon now', warn: false };
  const lit = `${Math.round(litFraction * 100)}% lit`;
  const away = `${Math.round(separationDeg)}° away`;
  if (separationDeg < MOON_GLARE_DEG && litFraction >= MOON_BRIGHT_FRACTION) {
    return { text: `Bright Moon ${away}, ${lit}: faint detail will be hard to see`, warn: true };
  }
  return { text: `Moon ${away}, ${lit}`, warn: false };
}
