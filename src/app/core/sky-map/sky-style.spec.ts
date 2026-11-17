import { describe, expect, it } from 'vitest';

import type { Target } from '../targets';

import { COLOR, isShownAtField, magnitudeLimit, starTintIndex, useColors } from './sky-style';

function target(fields: Partial<Target>): Target {
  return { id: 'X', name: 'X', kind: 'Galaxy', raDeg: 0, decDeg: 0, mag: 8, ...fields } as Target;
}

describe('magnitudeLimit', () => {
  it('shows fainter stars the closer the view', () => {
    expect(magnitudeLimit(120)).toBe(5.5);
    expect(magnitudeLimit(60)).toBe(6);
    expect(magnitudeLimit(20)).toBe(6.5);
  });
});

describe('starTintIndex', () => {
  it('goes from blue to red with the colour index', () => {
    expect([-0.2, 0.2, 0.6, 1, 1.6].map(starTintIndex)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('isShownAtField', () => {
  it('always labels the Moon and planets, and never a constellation', () => {
    expect(isShownAtField(target({ kind: 'Planet', mag: 8 }), 120)).toBe(true);
    expect(isShownAtField(target({ kind: 'Moon' }), 120)).toBe(true);
    expect(isShownAtField(target({ kind: 'Constellation', mag: 0 }), 5)).toBe(false);
  });

  it('labels only bright named stars in a wide view', () => {
    expect(isShownAtField(target({ kind: 'Star', mag: 1 }), 90)).toBe(true);
    expect(isShownAtField(target({ kind: 'Star', mag: 2.5 }), 90)).toBe(false);
    expect(isShownAtField(target({ kind: 'Star', mag: 2.5 }), 40)).toBe(true);
    expect(isShownAtField(target({ kind: 'Star', mag: 4.5 }), 20)).toBe(true);
  });

  it('labels a star with no name only zoomed in, bright, and with a Greek letter', () => {
    const kappa = target({ id: 'κ Cyg', kind: 'Star', mag: 3.8, unnamed: true });
    expect(isShownAtField(kappa, 20)).toBe(true);
    expect(isShownAtField(kappa, 40)).toBe(false);
    expect(isShownAtField({ ...kappa, mag: 5 }, 20)).toBe(false);
    expect(isShownAtField({ ...kappa, id: 'HR 7633' }, 20)).toBe(false);
  });

  it('shows Messier objects sooner than other deep-sky objects', () => {
    expect(isShownAtField(target({ id: 'M31', mag: 3.4 }), 90)).toBe(true);
    expect(isShownAtField(target({ id: 'M74', mag: 9.4 }), 40)).toBe(true);
    expect(isShownAtField(target({ id: 'NGC 891', mag: 9.9 }), 40)).toBe(false);
    expect(isShownAtField(target({ id: 'NGC 891', mag: 9.9 }), 10)).toBe(true);
  });

  it('waits with double stars until zoomed in', () => {
    expect(isShownAtField(target({ kind: 'Double star', mag: 5 }), 30)).toBe(false);
    expect(isShownAtField(target({ kind: 'Double star', mag: 5 }), 20)).toBe(true);
    expect(isShownAtField(target({ kind: 'Double star', mag: 8 }), 20)).toBe(false);
    expect(isShownAtField(target({ kind: 'Double star', mag: 8 }), 6)).toBe(true);
  });
});

describe('useColors', () => {
  it('brightens faint lines at night, and goes back by day', () => {
    useColors(false);
    const dayGrid = COLOR.grid;
    useColors(true);
    expect(COLOR.grid).not.toBe(dayGrid);
    useColors(false);
    expect(COLOR.grid).toBe(dayGrid);
  });
});
