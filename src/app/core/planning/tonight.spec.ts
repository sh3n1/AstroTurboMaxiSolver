import { describe, expect, it } from 'vitest';

import { nightWindow, tonight, tonightChart } from './tonight';

/** A local time on 11 or 12 November 2026. */
const at = (day: number, hours: number, minutes = 0): Date => new Date(2026, 10, day, hours, minutes);
/** Hours after 18:00 on the 11th. */
const hoursIn = (time: Date): number => (time.getTime() - at(11, 18).getTime()) / 3_600_000;

// A made-up night: full darkness from 19:30 to 06:00, twilight either side, and a target
// that peaks at 60° at 22:00, losing 10° an hour either side.
const sunAltitude = (time: Date): number => (hoursIn(time) >= 1.5 && hoursIn(time) <= 12 ? -30 : -3);
const targetAltitude = (time: Date): number => 60 - Math.abs(hoursIn(time) - 4) * 10;

describe('nightWindow', () => {
  it('shows tonight from the afternoon, and last night until noon', () => {
    expect(nightWindow(at(11, 23)).start).toEqual(at(11, 18));
    expect(nightWindow(at(11, 14)).start).toEqual(at(11, 18));
    expect(nightWindow(at(12, 3)).start).toEqual(at(11, 18));
    expect(nightWindow(at(12, 3)).end).toEqual(at(12, 7));
  });
});

describe('tonight', () => {
  const night = tonight(targetAltitude, sunAltitude, at(11, 21));

  it('finds the highest point while the Sun is down', () => {
    expect(night.highest).toEqual({ time: at(11, 22), altDeg: 60 });
  });

  it('finds the longest stretch of full darkness with the target well up', () => {
    // Well up from 19:00 to 01:00, but fully dark only from 19:30.
    expect(night.best).toEqual({ from: at(11, 19, 30), until: at(12, 1) });
  });

  it('has no best time for a target that stays low', () => {
    const low = tonight(() => 20, sunAltitude, at(11, 21));
    expect(low.best).toBeNull();
    expect(low.highest?.altDeg).toBe(20);
  });

  it('has no highest point for a target below the horizon all night', () => {
    expect(tonight(() => -10, sunAltitude, at(11, 21)).highest).toBeNull();
  });
});

describe('tonightChart', () => {
  const night = tonight(targetAltitude, sunAltitude, at(11, 21));
  const chart = tonightChart(night, at(11, 21), 260, 10, 100);

  it('puts time across and height up, with heights below the horizon on it', () => {
    // 22:00 is 4 of 13 hours across; 60° is two thirds of the way up from the horizon.
    expect(chart.peak).toEqual({ x: 80, y: 40 });
    expect(chart.goodY).toBe(70);
    // At 18:00 the target is 20° up.
    expect(chart.line.startsWith('0,80 ')).toBe(true);
    // One below the horizon all night rests on it.
    const down = tonightChart(
      tonight(() => -10, sunAltitude, at(11, 21)),
      at(11, 21),
      260,
      10,
      100,
    );
    expect(down.line.startsWith('0,100 ')).toBe(true);
    expect(down.peak).toBeNull();
  });

  it('marks now, the best time, and every three hours', () => {
    // At 21:00 the target is 50° up.
    expect(chart.now).toEqual({ x: 60, y: 50 });
    // 19:30 to 01:00: five and a half hours.
    expect(chart.best).toEqual({ x: 30, width: 110 });
    expect(chart.hours.map((h) => h.x)).toEqual([0, 60, 120, 180, 240]);
  });

  it('shades the sky in strips, joining checks of the same shade', () => {
    expect(chart.bands.map((b) => b.shade)).toEqual(['civil', 'night', 'civil']);
    expect(chart.bands[0]).toEqual({ x: 0, width: 30, shade: 'civil' });
  });

  it('leaves out now when it is outside the night shown', () => {
    expect(tonightChart(night, at(12, 10), 260, 10, 100).now).toBeNull();
  });
});
