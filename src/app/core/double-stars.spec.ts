import {
  arcsecText,
  companionPosition,
  dawesLimitArcsec,
  doubleComponents,
  doubleKindText,
  pairBv,
  pairRelation,
  spectralBv,
  splitAdvice,
  withoutDoubleCopies,
} from './double-stars';
import { starColourName } from './target-details';
import type { DoubleStar, Target } from './targets';

// Albireo, as the Washington Double Star Catalog has it.
const ALBIREO: DoubleStar = {
  raDeg: 292.68033,
  decDeg: 27.95969,
  spectral: 'K3II+B9.5',
  pairs: [{ components: 'AB', sepArcsec: 34.3, paDeg: 54, year: 2025, mag1: 3.19, mag2: 4.68, physical: false }],
};

describe('double stars', () => {
  it('names the colours of the two stars from their spectral types', () => {
    const [main, companion] = pairBv(ALBIREO.spectral);
    expect(starColourName(main!)).toBe('Orange');
    expect(starColourName(companion!)).toBe('Blue-white');
    // The Sun's type, G2, is yellow.
    expect(starColourName(spectralBv('G2V')!)).toBe('Yellow');
    expect(pairBv('A1VpSrSi')[1]).toBeNull();
    expect(spectralBv('pec')).toBeNull();
  });

  it('places the companion at its angle and distance from the main star', () => {
    // Due north: the same right ascension, higher declination.
    const north = companionPosition({ raDeg: 100, decDeg: 0 }, { paDeg: 0, sepArcsec: 36 });
    expect(north.raDeg).toBeCloseTo(100, 9);
    expect(north.decDeg).toBeCloseTo(0.01, 9);
    // Due east: greater right ascension, by more near the pole where its lines crowd together.
    const east = companionPosition({ raDeg: 100, decDeg: 60 }, { paDeg: 90, sepArcsec: 36 });
    expect(east.raDeg).toBeCloseTo(100.02, 6);
    expect(east.decDeg).toBeCloseTo(60, 9);
  });

  it('says whether a telescope splits a pair, and at what magnification', () => {
    expect(dawesLimitArcsec(130)).toBeCloseTo(0.89, 2);
    // Albireo splits at any magnification.
    expect(splitAdvice(ALBIREO.pairs[0], 130, 26)).toEqual({ text: 'Splits with your eyepiece, at 26×', splits: true });
    // Epsilon Lyrae's 2.1″ pairs need more than a low-power eyepiece.
    expect(splitAdvice({ sepArcsec: 2.1, mag1: 5.2, mag2: 6.1 }, 130, 26)).toEqual({
      text: 'Needs about 115× to split · your eyepiece gives 26×',
      splits: true,
    });
    // Too close for a small telescope, and harder still with a faint companion.
    expect(splitAdvice({ sepArcsec: 1.2, mag1: 5, mag2: 5.5 }, 60, 100).splits).toBe(false);
    expect(splitAdvice({ sepArcsec: 1.2, mag1: 5, mag2: 5.5 }, 130, 250).splits).toBe(true);
    expect(splitAdvice({ sepArcsec: 1.2, mag1: 5, mag2: 9 }, 130, 250).splits).toBe(false);
    // Mizar and Alcor, 12′ apart.
    expect(splitAdvice({ sepArcsec: 715.5, mag1: 2.2, mag2: 4 }, 130, 26).text).toBe('Splits by eye or in binoculars');
  });

  it('describes pairs in words', () => {
    expect(arcsecText(2.14)).toBe('2.1″');
    expect(arcsecText(34.3)).toBe('34″');
    expect(arcsecText(209.4)).toBe('3.5′');
    expect(arcsecText(715.5)).toBe('12′');
    expect(pairRelation({ physical: false })).toBe('line-of-sight pair');
    expect(pairRelation({ physical: true, orbit: true })).toBe('orbiting pair');
    expect(pairRelation({})).toBeNull();
    expect(doubleKindText(ALBIREO)).toBe('Double star');
    expect(doubleKindText({ ...ALBIREO, pairs: [...ALBIREO.pairs, { ...ALBIREO.pairs[0], components: 'AC' }] })).toBe(
      'Multiple star',
    );
  });

  it('draws each star of a double once, at its precise place', () => {
    const albireo = { id: 'Albireo', kind: 'Star', bv: 1.09, double: ALBIREO } as Target;
    const components = doubleComponents([albireo]);
    expect(components.length).toBe(2);
    expect(components[0]).toEqual({ raDeg: 292.68033, decDeg: 27.95969, mag: 3.19, bv: 1.09 });
    // The star map's copies, rounded to 0.001°, give way. A faint star nearby stays.
    const mapStars = [
      { raDeg: 292.68, decDeg: 27.96, mag: 3.05 },
      { raDeg: 292.689, decDeg: 27.965, mag: 5.12 },
      { raDeg: 292.685, decDeg: 27.962, mag: 9.5 },
      { raDeg: 10, decDeg: 10, mag: 4 },
    ];
    expect(withoutDoubleCopies(mapStars, components)).toEqual([mapStars[2], mapStars[3]]);
  });
});
