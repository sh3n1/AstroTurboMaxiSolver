import { describe, expect, it } from 'vitest';

import type { DoubleRow } from '../astronomy/double-stars';

import { buildCatalog, joinDoubles } from './catalog-build';
import type { Target } from './targets';

const star = (id: string, aliases = ''): Target =>
  ({ id, name: id, kind: 'Star', raDeg: 10, decDeg: 20, magnitude: 3, aliases }) as unknown as Target;
const galaxy = (id: string): Target =>
  ({ id, name: id, kind: 'Galaxy', raDeg: 30, decDeg: 40, magnitude: 9 }) as unknown as Target;
const double = { pairs: [] } as unknown as DoubleRow['double'];

describe('catalogue building', () => {
  it('adds a double to its named star, and keeps the others as targets of their own', () => {
    const rows = [
      { starId: 'Albireo', aliases: 'STFA 43', double },
      { id: 'STF 1', name: 'STF 1', kind: 'Star', raDeg: 1, decDeg: 2, magnitude: 7, aliases: '', double },
    ] as unknown as DoubleRow[];
    const joined = joinDoubles([star('Albireo', 'Beta Cyg'), galaxy('Albireo')], rows);
    expect(joined.map((target) => target.id)).toEqual(['Albireo', 'Albireo', 'STF 1']);
    expect(joined[0].aliases).toBe('Beta Cyg STFA 43');
    expect(joined[0].double).toBe(double);
    // Only a star takes the double, even if something else shares its id.
    expect(joined[1].double).toBeUndefined();
  });

  it('builds from whichever files there are, the brightest objects first', () => {
    expect(buildCatalog({})).toEqual([]);
    const built = buildCatalog({ openngc: [galaxy('NGC 1')], targets: [star('Vega')] });
    expect(built.map((target) => target.id)).toEqual(['Vega', 'NGC 1']);
  });
});
