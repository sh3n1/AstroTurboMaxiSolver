import {
  PLANNING_RANGE_MS,
  addDays,
  clampToRange,
  isoDay,
  onDay,
  skyShade,
  snapToStep,
  timeAfterDrag,
} from './planning-time';

describe('the planning time', () => {
  const at = (text: string) => new Date(text).getTime();

  it('moves in five-minute steps', () => {
    expect(snapToStep(at('2026-11-14T23:32:10Z')).toISOString()).toBe('2026-11-14T23:30:00.000Z');
    expect(snapToStep(at('2026-11-14T23:33:00Z')).toISOString()).toBe('2026-11-14T23:35:00.000Z');
  });

  it('moves later when the ruler is dragged to the left, by the hours dragged', () => {
    const start = new Date('2026-11-14T22:00:00Z');
    const now = at('2026-11-14T20:00:00Z');
    expect(timeAfterDrag(start, -120, 60, now).toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(timeAfterDrag(start, 30, 60, now).toISOString()).toBe('2026-11-14T21:30:00.000Z');
  });

  it('stays within a year of now', () => {
    const now = at('2026-11-14T20:00:00Z');
    expect(clampToRange(now + 2 * PLANNING_RANGE_MS, now)).toBe(now + PLANNING_RANGE_MS);
    expect(clampToRange(now - 2 * PLANNING_RANGE_MS, now)).toBe(now - PLANNING_RANGE_MS);
  });

  it('changes the day but keeps the time of day', () => {
    const time = new Date(2026, 10, 14, 23, 30);
    const next = addDays(time, 1);
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([15, 23, 30]);
    expect(isoDay(time)).toBe('2026-11-14');
    const moved = onDay(time, '2027-01-02');
    expect([moved.getFullYear(), moved.getMonth(), moved.getDate(), moved.getHours()]).toEqual([2027, 0, 2, 23]);
  });

  it('shades the sky by how far the Sun is below the horizon', () => {
    expect(skyShade(10)).toBe('day');
    expect(skyShade(-3)).toBe('civil');
    expect(skyShade(-9)).toBe('nautical');
    expect(skyShade(-15)).toBe('astronomical');
    expect(skyShade(-30)).toBe('night');
  });
});
