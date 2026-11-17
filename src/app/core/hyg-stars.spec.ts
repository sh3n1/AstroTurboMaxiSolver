import { describe, expect, it } from 'vitest';

import type { HygRow } from './hyg-stars';
import { joinHygStars } from './hyg-stars';
import { targetFinder } from './list-files';
import type { Target } from './targets';

const ACHIRD: Target = {
  id: 'Achird',
  name: 'η Cas',
  // With a thin space, as targets.json writes the named stars' Hipparcos numbers.
  aliases: 'HIP 3821 STF 60 Σ 60 WDS 00491+5749',
  kind: 'Star',
  raDeg: 12.276,
  decDeg: 57.815,
  mag: 3.46,
};
const STF_2758: Target = {
  id: 'STF 2758',
  name: 'Double star',
  aliases: 'STF 2758 Σ 2758 WDS 21069+3845',
  kind: 'Double star',
  raDeg: 316.72479,
  decDeg: 38.74942,
  mag: 5.35,
};

const ROWS: HygRow[] = [
  ['η Cas|24 Cas|HR 219|HD 4614|HIP 3821', 'Achird', 12.2739, 57.81519, 3.46, 0.59],
  ['61 Cyg|V1803 Cyg|HR 8085|HD 201091|HIP 104214', '', 316.72191, 38.74941, 5.2, 1.07],
  ['61 Cyg|HR 8086|HD 201092|HIP 104217', '', 316.72744, 38.74206, 6.05, 1.31],
  ['Y CVn|HR 4846|HD 110914|HIP 62223', 'La Superba', 191.28261, 45.44026, 5.42, 2.99],
  ['ζ Psc|86 Psc|HR 361|HD 7344|HIP 5737', 'Revati', 18.43285, 7.57535, 5.21, 0.32],
  ['ζ Psc|86 Psc|HR 362|HD 7345|HIP 5743', 'Revati B', 18.4386, 7.57826, 6.44, 0.49],
];

describe('joinHygStars', () => {
  const joined = joinHygStars([ACHIRD, STF_2758], ROWS);
  const byId = new Map(joined.map((t) => [t.id, t]));

  it("adds a named star's catalogue names to it, found by its Hipparcos number", () => {
    const achird = byId.get('Achird')!;
    expect(achird.name).toBe('η Cas');
    expect(achird.aliases).toContain('24 Cas');
    expect(achird.aliases).toContain('HR 219');
    expect(joined.filter((t) => t.aliases?.includes('HR 219'))).toHaveLength(1);
  });

  it("gives a double star found at its main star's place both stars' names, and a name", () => {
    const double = byId.get('STF 2758')!;
    expect(double.name).toBe('61 Cyg');
    expect(double.aliases).toContain('HR 8085');
    expect(double.aliases).toContain('HR 8086');
  });

  it('makes every other star a target of its own, named by its best-known name', () => {
    const superba = byId.get('Y CVn')!;
    expect(superba).toMatchObject({ kind: 'Star', name: 'La Superba', mag: 5.42, bv: 2.99 });
    // Named, it is labelled on the map like other named stars; a star with no name isn't.
    expect(superba.unnamed).toBeUndefined();
    expect(joinHygStars([], [['HR 7633|HD 189276', '', 299.6, 40.4, 5.3, 1.1]])[0].unnamed).toBe(true);
    expect(superba.aliases).toContain('HD 110914');
    // The second star of a pair with the same names takes the next name nothing else has.
    expect(byId.get('ζ Psc')?.name).toBe('Revati');
    expect(byId.get('86 Psc')).toBeUndefined();
    expect(byId.get('HR 362')?.name).toBe('Revati B');
  });

  it('lets imports find stars by any of these names', () => {
    const find = targetFinder(joined);
    expect(find('61 Cyg')?.id).toBe('STF 2758');
    expect(find('HR 7001')).toBeNull();
    expect(find('HD 110914')?.id).toBe('Y CVn');
    expect(find('La Superba')?.id).toBe('Y CVn');
    expect(find('24 Cas')?.id).toBe('Achird');
  });
});
