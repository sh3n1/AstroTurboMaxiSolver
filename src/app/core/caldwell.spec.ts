import { describe, expect, it } from 'vitest';

import caldwellFile from '../../assets/data/caldwell.json';
import openNgcFile from '../../assets/data/openngc.json';

import type { CaldwellData } from './caldwell';
import { joinCaldwell } from './caldwell';
import { designationText, designations } from './designations';
import type { Target } from './targets';

const caldwell = caldwellFile as CaldwellData;

function target(id: string, aliases = ''): Target {
  return { id, name: 'X', aliases, kind: 'Galaxy', raDeg: 0, decDeg: 0, mag: 5 };
}

describe('Caldwell catalogue', () => {
  it('has all 109 objects, each once', () => {
    const numbers = [...Object.keys(caldwell.objects), ...caldwell.extraTargets.map((t) => designations(t)[0])];
    expect(new Set(numbers).size).toBe(109);
    for (let n = 1; n <= 109; n++) expect(numbers).toContain(`C${n}`);
  });

  it('finds every Caldwell object among the NGC and IC objects', () => {
    const joined = joinCaldwell(openNgcFile as Target[], caldwell);
    const found = new Set(joined.flatMap((t) => designations(t).filter((d) => /^C\d/.test(d))));
    expect(found.size).toBe(Object.keys(caldwell.objects).length);
  });

  it('adds the Caldwell number, including for an object filed under another number', () => {
    const [northAmerica, rosette, other] = joinCaldwell(
      [target('NGC 7000'), target('NGC 2239', 'NGC 2244'), target('NGC 1')],
      caldwell,
    );
    expect(northAmerica.aliases).toContain('C20');
    expect(rosette.aliases).toContain('C50');
    expect(other.aliases).toBe('');
  });
});

describe('designations', () => {
  it('lists Messier, then Caldwell, then NGC, then IC', () => {
    expect(designationText(target('M31', 'NGC 224 Andromeda Galaxy'))).toBe('M31 · NGC 224');
    expect(designationText(target('NGC 7000', 'C20 North America Nebula'))).toBe('C20 · NGC 7000');
    expect(designationText(target('IC 5146', 'C19 Cocoon Nebula'))).toBe('C19 · IC 5146');
    expect(designationText(target('NGC 2239', 'C50 NGC 2244'))).toBe('C50 · NGC 2239 · NGC 2244');
  });

  it('gives a star or planet just its name', () => {
    expect(designationText(target('Vega'))).toBe('Vega');
  });
});
