import { describe, expect, it } from 'vitest';

import {
  UNCATEGORIZED_ID,
  catalogueTargets,
  ngcTargets,
  rowDesignations,
  exportFileName,
  exportLists,
  parseImport,
  startingLists,
  uniqueName,
} from './target-lists';
import type { Target } from './targets';

function target(id: string, aliases = ''): Target {
  return { id, name: 'X', aliases, kind: 'Galaxy', raDeg: 0, decDeg: 0, mag: 5 };
}

describe('bookmark lists', () => {
  it('starts with Saved for later, holding the old session plan', () => {
    expect(startingLists(['M31', 'M42'])).toEqual([
      { id: UNCATEGORIZED_ID, name: 'Saved for later', targetIds: ['M31', 'M42'] },
    ]);
  });

  it('keeps list names unique, ignoring case', () => {
    expect(uniqueName('Galaxies', ['Saved for later'])).toBe('Galaxies');
    expect(uniqueName('galaxies', ['Galaxies'])).toBe('galaxies (2)');
    expect(uniqueName('Galaxies', ['Galaxies', 'Galaxies (2)'])).toBe('Galaxies (3)');
    expect(uniqueName('  ', [])).toBe('New list');
  });

  it('reads back what it exports', () => {
    const text = exportLists([{ name: 'Spring', targetIds: ['M81', 'M82'] }]);
    expect(parseImport(text)).toEqual([{ name: 'Spring', targetIds: ['M81', 'M82'] }]);
  });

  it('refuses files that are not AstroFinder lists, with a clear message', () => {
    expect(() => parseImport('not json')).toThrow("This isn't an AstroFinder list file");
    expect(() => parseImport('{"lists": []}')).toThrow("This isn't an AstroFinder list file");
    expect(() => parseImport('{"format": "astrofinder-lists", "lists": [{"name": 3}]}')).toThrow('damaged');
  });

  it('drops repeated and non-text target ids from an import', () => {
    const text = '{"format": "astrofinder-lists", "lists": [{"name": "A", "targets": ["M1", 5, "M1", "M2"]}]}';
    expect(parseImport(text)).toEqual([{ name: 'A', targetIds: ['M1', 'M2'] }]);
  });

  it('names export files after the list, safely', () => {
    expect(exportFileName('Galaxias de primavera')).toBe('astrofinder-galaxias-de-primavera.json');
    expect(exportFileName('Nébulas!')).toBe('astrofinder-nebulas.json');
    expect(exportFileName('★')).toBe('astrofinder-list.json');
  });

  it('puts catalogue lists in number order, finding Caldwell numbers among other names', () => {
    const targets = [target('M110'), target('NGC 7000', 'C20'), target('M2'), target('Vega'), target('NGC 188', 'C1')];
    expect(catalogueTargets(targets, 'M').map((t) => t.id)).toEqual(['M2', 'M110']);
    expect(catalogueTargets(targets, 'C').map((t) => t.id)).toEqual(['NGC 188', 'NGC 7000']);
  });

  it('finds NGC lists by any designation, with a row for each number of a shared object', () => {
    const targets = [target('M76', 'NGC 650/1'), target('NGC 2371', 'NGC 2372'), target('NGC 40')];
    // 2371 and 2372 are one object, so the second row is listed as 2372. NGC 9999 isn't in the data.
    const rows = ngcTargets(targets, [40, 650, 2371, 2372, 9999]);
    expect(rows.map((t) => t.id)).toEqual(['NGC 40', 'M76', 'NGC 2371', 'NGC 2371']);
    expect(rows.map(rowDesignations)).toEqual([
      'NGC 40',
      'M76 · NGC 650',
      'NGC 2371 · NGC 2372',
      'NGC 2372 · NGC 2371',
    ]);
  });
});
