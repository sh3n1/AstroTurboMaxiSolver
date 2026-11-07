import { describe, expect, it } from 'vitest';

import { isExactDesignation, normalizeSearch, targetSearchText } from './search';
import type { Target } from './targets';

const ANDROMEDA: Target = {
  id: 'M31',
  name: 'Andromeda Galaxy',
  aliases: 'NGC 224',
  kind: 'Galaxy',
  raDeg: 10.68,
  decDeg: 41.27,
  mag: 3.4,
};

describe('search', () => {
  it('ignores case, extra spaces and the space before a catalogue number', () => {
    expect(normalizeSearch('NGC 224')).toBe('ngc224');
    expect(normalizeSearch('ngc224')).toBe('ngc224');
    expect(normalizeSearch('  NGC   224 ')).toBe('ngc224');
    expect(normalizeSearch('M 31')).toBe('m31');
  });

  it('keeps the spaces between words', () => {
    expect(normalizeSearch('Andromeda  Galaxy')).toBe('andromeda galaxy');
  });

  it('finds a target however its designation is typed', () => {
    for (const typed of ['NGC 224', 'ngc224', 'm 31', 'M31', 'andromeda']) {
      expect(targetSearchText(ANDROMEDA)).toContain(normalizeSearch(typed));
    }
  });

  it('knows an exact designation from part of one', () => {
    expect(isExactDesignation(ANDROMEDA, normalizeSearch('ngc224'))).toBe(true);
    expect(isExactDesignation(ANDROMEDA, normalizeSearch('m31'))).toBe(true);
    expect(isExactDesignation(ANDROMEDA, normalizeSearch('ngc22'))).toBe(false);
  });
});
