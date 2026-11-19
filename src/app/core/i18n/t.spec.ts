import { afterEach, describe, expect, it } from 'vitest';

import { num, setLocale, tn } from './t';

describe('num', () => {
  afterEach(() => setLocale('en'));

  it('writes decimals as the language does', () => {
    setLocale('en');
    expect(num(4.5, 1)).toBe('4.5');
    setLocale('es');
    expect(num(4.5, 1)).toBe('4,5');
  });

  it('drops trailing zeros down to the fewest decimals asked for', () => {
    setLocale('en');
    expect(num(2, 1, 0)).toBe('2');
    expect(num(2.25, 1, 0)).toBe('2.3');
  });

  it('writes no minus for a value that rounds to zero', () => {
    setLocale('en');
    expect(num(-0.2)).toBe('0');
    expect(num(-1.6)).toBe('-2');
  });
});

describe('tn', () => {
  it('picks the form for the count, with the count in it', () => {
    setLocale('en');
    expect(tn('testing.starsFound', 1)).toBe('1 star found');
    expect(tn('testing.starsFound', 12)).toBe('12 stars found');
  });
});
