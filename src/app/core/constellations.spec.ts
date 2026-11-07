import { describe, expect, it } from 'vitest';

import rows from '../../assets/data/constellations.json';

import { constellationTargets } from './constellations';
import type { ConstellationRow } from './constellations';

describe('constellation targets', () => {
  const targets = constellationTargets(rows as ConstellationRow[]);

  it('makes one target for each of the 88 constellations', () => {
    expect(targets).toHaveLength(88);
    expect(new Set(targets.map((t) => t.id)).size).toBe(88);
  });

  it('names Serpens once, though it is drawn in two parts', () => {
    expect(targets.filter((t) => t.id.startsWith('Serpens')).map((t) => t.id)).toEqual(['Serpens']);
  });

  it('can be found by full name or abbreviation, aimed at its middle', () => {
    const orion = targets.find((t) => t.id === 'Orion');
    expect(orion).toMatchObject({ kind: 'Constellation', aliases: 'Ori' });
    // Orion lies on the celestial equator, around RA 5h 30m.
    expect(orion!.raDeg).toBeGreaterThan(70);
    expect(orion!.raDeg).toBeLessThan(95);
    expect(Math.abs(orion!.decDeg)).toBeLessThan(15);
  });
});
