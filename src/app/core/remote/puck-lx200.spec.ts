import { describe, expect, it } from 'vitest';

import { fromEquinoxOfDate, toEquinoxOfDate } from '../astronomy/astronomy';
import type { Target } from '../catalog/targets';

import { gotoTarget, pointingMessage } from './puck-lx200';

const date = new Date('2026-11-22T22:00:00Z');
const target = (id: string, raDeg: number, decDeg: number, kind = 'Nebula'): Target =>
  ({ id, name: id, kind, raDeg, decDeg, mag: 4 }) as Target;

describe('puck LX200', () => {
  it('precesses to the date and back', () => {
    const now = toEquinoxOfDate(83.82, -5.39, date);
    // About a third of a degree in 26 years, mostly in right ascension.
    expect(Math.abs(now.raDeg - 83.82)).toBeGreaterThan(0.2);
    expect(Math.abs(now.raDeg - 83.82)).toBeLessThan(0.5);
    const back = fromEquinoxOfDate(now.raDeg, now.decDeg, date);
    expect(back.raDeg).toBeCloseTo(83.82, 6);
    expect(back.decDeg).toBeCloseTo(-5.39, 6);
  });

  it("sends the telescope's pointing of the date", () => {
    const message = pointingMessage({ raDeg: 83.82, decDeg: -5.39 }, date);
    const now = toEquinoxOfDate(83.82, -5.39, date);
    expect(message.t).toBe('pointing');
    expect(message.raDeg).toBeCloseTo(now.raDeg, 3);
    expect(message.decDeg).toBeCloseTo(now.decDeg, 3);
  });

  it('takes a GoTo to the nearest object within 2°, but not a constellation', () => {
    const m42 = target('M42', 83.82, -5.39);
    const m43 = target('M43', 83.88, -5.27);
    const orion = target('Orion', 83.8, -5.4, 'Constellation');
    const now = toEquinoxOfDate(83.82, -5.39, date);
    expect(gotoTarget([m43, orion, m42], now.raDeg, now.decDeg, date)?.id).toBe('M42');
    expect(gotoTarget([m42], now.raDeg + 5, now.decDeg, date)).toBeNull();
  });
});
