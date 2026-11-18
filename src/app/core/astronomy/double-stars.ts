// Double and multiple stars: how they look and whether a telescope splits them. The data
// comes from the Washington Double Star Catalog, through scripts/build-doubles.mjs.
// Plain functions, so they can be tested without the app around them.

import type { DoublePair, DoubleStar, Target } from '../catalog/targets';

/** A row of doubles.json: a double star of its own, or one to add to a named star. */
export type DoubleRow = (Partial<Target> & { double: DoubleStar; aliases: string }) & { starId?: string };

/**
 * Approximate B-V colour index at the start of each spectral class, O to M. A class
 * runs from 0 to 9, so "K3" is three tenths of the way from K0 to M0. Close enough to
 * name a colour, which is all the details box does with it.
 */
const CLASS_BV: Record<string, number> = { O: -0.32, B: -0.3, A: -0.02, F: 0.3, G: 0.58, K: 0.81, M: 1.4 };
const CLASS_ORDER = 'OBAFGKM';
/** Past M9, for the reddest stars. */
const LAST_BV = 2;

/** A B-V colour index from a spectral type such as "K3II" or "B9.5V", or null if unknown. */
export function spectralBv(spectral: string): number | null {
  const match = /^([OBAFGKM])(\d(?:\.\d)?)?/.exec(spectral.trim());
  if (!match) return null;
  const index = CLASS_ORDER.indexOf(match[1]);
  const start = CLASS_BV[match[1]];
  const next = index + 1 < CLASS_ORDER.length ? CLASS_BV[CLASS_ORDER[index + 1]] : LAST_BV;
  const tenths = match[2] ? Number(match[2]) / 10 : 0.5; // No number: the middle of the class
  return start + (next - start) * tenths;
}

/**
 * The colour indexes of a double's two stars, from the spectral types, such as "K3II+B9.5"
 * for Albireo's orange and blue-white. Either is null when the catalogue doesn't give it.
 */
export function pairBv(spectral: string | undefined): [number | null, number | null] {
  const [first, second] = (spectral ?? '').split('+');
  return [first ? spectralBv(first) : null, second ? spectralBv(second) : null];
}

/**
 * Where the companion is, as a J2000 position, from the main star's position and the
 * pair's angle and separation. The angle runs from north through east, as on the sky.
 * Pairs are at most a few arcminutes apart, so a flat patch of sky is accurate enough.
 */
export function companionPosition(
  main: Pick<DoubleStar, 'raDeg' | 'decDeg'>,
  pair: Pick<DoublePair, 'paDeg' | 'sepArcsec'>,
): { raDeg: number; decDeg: number } {
  const sepDeg = pair.sepArcsec / 3600;
  const pa = (pair.paDeg * Math.PI) / 180;
  const cosDec = Math.cos((main.decDeg * Math.PI) / 180);
  return {
    raDeg: main.raDeg + (sepDeg * Math.sin(pa)) / Math.max(cosDec, 1e-6),
    decDeg: main.decDeg + sepDeg * Math.cos(pa),
  };
}

/** The closest pair a telescope can split, in arcseconds: Dawes' limit, 116″ ÷ aperture in mm. */
export function dawesLimitArcsec(apertureMm: number): number {
  return 116 / apertureMm;
}

/**
 * The closest an uneven pair can be and still be split. A faint companion is lost in the
 * glare of a bright star, so each magnitude of difference beyond the first adds a quarter
 * to Dawes' limit. A rule of thumb, since the air's steadiness matters as much.
 */
export function splitLimitArcsec(apertureMm: number, magDifference: number): number {
  return dawesLimitArcsec(apertureMm) * (1 + 0.25 * Math.max(0, magDifference - 1));
}

/**
 * The magnification that splits a pair comfortably: enough to make it look 4′ apart,
 * twice what a sharp eye can just separate.
 */
export function splitPower(sepArcsec: number): number {
  return Math.ceil(240 / sepArcsec);
}

/** Wide enough to split by eye or in binoculars, like Mizar and Alcor. */
const NAKED_EYE_SEP_ARCSEC = 180;

/**
 * Whether and how the user's telescope splits a pair: as a sentence, as a few words for a
 * chip, as a yes or no, and the closest pair the telescope splits, in arcseconds.
 */
export function splitAdvice(
  pair: Pick<DoublePair, 'sepArcsec' | 'mag1' | 'mag2'>,
  apertureMm: number,
  power: number,
): { text: string; short: string; splits: boolean; limitArcsec: number } {
  const { sepArcsec: sep } = pair;
  const limitArcsec = splitLimitArcsec(apertureMm, Math.abs(pair.mag2 - pair.mag1));
  if (sep >= NAKED_EYE_SEP_ARCSEC) {
    return { text: 'Splits by eye or in binoculars', short: 'Splits by eye', splits: true, limitArcsec };
  }
  if (sep < limitArcsec) {
    return {
      text: `Too close for a ${Math.round(apertureMm)} mm telescope, which splits pairs down to about ${arcsecText(limitArcsec)}`,
      short: 'Too close',
      splits: false,
      limitArcsec,
    };
  }
  const needed = splitPower(sep);
  const shown = Math.round(power);
  if (shown >= needed) {
    return { text: `Splits with your eyepiece, at ${shown}×`, short: `Splits at ${shown}×`, splits: true, limitArcsec };
  }
  return {
    text: `Needs about ${needed}× to split · your eyepiece gives ${shown}×`,
    short: `Needs ${needed}×`,
    splits: true,
    limitArcsec,
  };
}

/** A separation in arcseconds, or arcminutes from a minute up: "2.1″", "34″", "12′". */
export function arcsecText(sepArcsec: number): string {
  if (sepArcsec >= 60) return `${Number((sepArcsec / 60).toFixed(sepArcsec >= 600 ? 0 : 1))}′`;
  return `${Number(sepArcsec.toFixed(sepArcsec >= 10 ? 0 : 1))}″`;
}

/** Whether a pair orbits, travels together, or only lines up by chance, in words. */
export function pairRelation(pair: Pick<DoublePair, 'physical' | 'orbit'>): string | null {
  if (pair.orbit) return 'orbiting pair';
  if (pair.physical === true) return 'true binary';
  if (pair.physical === false) return 'line-of-sight pair';
  return null;
}

/** "Double star", or "Multiple star" when there are more than two stars. */
export function doubleKindText(double: DoubleStar): string {
  const multiple = double.pairs.length > 1 || double.pairs.some((pair) => pair.components.length > 2);
  return multiple ? 'Multiple star' : 'Double star';
}

/** A star as the sky map draws it: where it is, how bright, and its colour index. */
export interface ComponentStar {
  raDeg: number;
  decDeg: number;
  mag: number;
  bv: number;
}

/** The colour of a star whose spectral type the catalogue doesn't give: plain white. */
const UNKNOWN_BV = 0.3;

/**
 * Each star of the double stars, at its precise position, so the eyepiece view shows
 * every pair at its real angle and distance: the main star and one companion per pair.
 */
export function doubleComponents(targets: readonly Target[]): ComponentStar[] {
  const stars: ComponentStar[] = [];
  for (const target of targets) {
    const double = target.double;
    if (!double) continue;
    const [mainBv, companionBv] = pairBv(double.spectral);
    const first = double.pairs[0];
    stars.push({ raDeg: double.raDeg, decDeg: double.decDeg, mag: first.mag1, bv: target.bv ?? mainBv ?? UNKNOWN_BV });
    double.pairs.forEach((pair, i) => {
      // The second spectral type is the main pair's companion.
      const bv = (i === 0 ? companionBv : null) ?? UNKNOWN_BV;
      stars.push({ ...companionPosition(double, pair), mag: pair.mag2, bv });
    });
  }
  return stars;
}

/** A star map star this close to a double's star, and about as bright, is the same star. */
const SAME_STAR_ARCSEC = 10;
const SAME_STAR_MAG = 1.5;

/**
 * The star map's stars without those the double stars draw themselves. The map's star
 * positions are rounded to about 4″, and some close pairs are a single blended star there,
 * so keeping both would show a pair twice, or three stars where there are two.
 */
export function withoutDoubleCopies<S extends Omit<ComponentStar, 'bv'>>(
  stars: readonly S[],
  components: readonly ComponentStar[],
): S[] {
  // Components grouped in bands of declination a hundredth of a degree (36″) high.
  const bands = new Map<number, ComponentStar[]>();
  for (const component of components) {
    const band = Math.floor(component.decDeg * 100);
    bands.set(band, [...(bands.get(band) ?? []), component]);
  }
  const isCopy = (star: S): boolean => {
    const band = Math.floor(star.decDeg * 100);
    const cosDec = Math.cos((star.decDeg * Math.PI) / 180);
    for (let b = band - 1; b <= band + 1; b++) {
      for (const component of bands.get(b) ?? []) {
        const apartArcsec = Math.hypot((star.raDeg - component.raDeg) * cosDec, star.decDeg - component.decDeg) * 3600;
        if (apartArcsec <= SAME_STAR_ARCSEC && Math.abs(star.mag - component.mag) <= SAME_STAR_MAG) return true;
      }
    }
    return false;
  };
  return stars.filter((star) => !isCopy(star));
}
