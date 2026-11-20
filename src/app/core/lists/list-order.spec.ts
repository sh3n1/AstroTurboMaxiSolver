import type { SkyFacts } from './list-order';
import { arrange, bestMatch, bestOfNight, currentFirst, firstRows, matchesType } from './list-order';

/** A row for the tests: its sky is set directly, instead of worked out. */
interface Row {
  id: string;
  mag: number;
  altDeg: number;
  rise?: string;
  best?: string;
  low?: boolean;
  awayDeg?: number;
}

const SKY: SkyFacts<Row> = {
  altDeg: (row) => row.altDeg,
  rise: (row) => (row.rise ? new Date(row.rise) : null),
  best: (row) => (row.best ? { time: new Date(row.best), altDeg: 50, good: !row.low } : null),
  now: new Date('2026-11-12T19:00'),
  awayDeg: (row) => row.awayDeg ?? 0,
};

const ROWS: Row[] = [
  { id: 'faint-high', mag: 9, altDeg: 70, best: '2026-11-12T23:00', awayDeg: 40 },
  { id: 'bright-low', mag: 1, altDeg: 10, best: '2026-11-12T20:00', awayDeg: 5, low: true },
  { id: 'rises-late', mag: 4, altDeg: -20, rise: '2026-11-13T03:00', best: '2026-11-13T05:00', awayDeg: 90 },
  { id: 'rises-soon', mag: 6, altDeg: -5, rise: '2026-11-12T22:00', best: '2026-11-13T01:00', awayDeg: 60 },
  { id: 'never', mag: 2, altDeg: -60, awayDeg: 120 },
];

const ids = (rows: readonly Row[]): string[] => rows.map((row) => row.id);

describe('arrange', () => {
  it("keeps the list's own order, with no headings", () => {
    const sections = arrange(ROWS, 'list', SKY);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBeNull();
    expect(ids(sections[0].rows)).toEqual(ids(ROWS));
  });

  it('puts the brightest first', () => {
    expect(ids(arrange(ROWS, 'brightest', SKY)[0].rows)).toEqual([
      'bright-low',
      'never',
      'rises-late',
      'rises-soon',
      'faint-high',
    ]);
  });

  it('puts the nearest to the reticle first', () => {
    expect(ids(arrange(ROWS, 'nearest', SKY)[0].rows)[0]).toBe('bright-low');
  });

  it('splits by height now: up, rising later by rise time, and not up today', () => {
    const sections = arrange(ROWS, 'highest', SKY);
    expect(sections.map((s) => s.title)).toEqual(['Up now', 'Rises later', 'Not up today']);
    expect(ids(sections[0].rows)).toEqual(['faint-high', 'bright-low']);
    expect(ids(sections[1].rows)).toEqual(['rises-soon', 'rises-late']);
    expect(ids(sections[2].rows)).toEqual(['never']);
  });

  it('orders what is well placed tonight by best time, and leaves out the rest', () => {
    const sections = arrange(ROWS, 'best-time', SKY);
    expect(sections.map((s) => s.title)).toEqual([null]);
    // Neither the one only low tonight, nor the one that stays down.
    expect(ids(sections[0].rows)).toEqual(['faint-high', 'rises-soon', 'rises-late']);
  });

  it('puts best moments that have passed after those still to come', () => {
    // At midnight, the 23:00 one passed an hour ago: it goes last.
    const sections = arrange(ROWS, 'best-time', { ...SKY, now: new Date('2026-11-13T00:30') });
    expect(ids(sections[0].rows)).toEqual(['rises-soon', 'rises-late', 'faint-high']);
  });

  it('leaves out headings with nothing under them', () => {
    const up = ROWS.filter((row) => row.altDeg > 0);
    expect(arrange(up, 'highest', SKY).map((s) => s.title)).toEqual(['Up now']);
    expect(arrange([], 'list', SKY)).toEqual([]);
  });
});

describe('firstRows', () => {
  it('cuts across sections, and drops those past the limit', () => {
    const shown = firstRows(arrange(ROWS, 'highest', SKY), 3);
    expect(shown.map((s) => s.rows.length)).toEqual([2, 1]);
    expect(shown[1].title).toBe('Rises later');
  });
});

describe('bestMatch', () => {
  it('puts an exact designation first, then what is up, then the brightest', () => {
    const order = bestMatch(
      ROWS,
      (row) => row.id === 'never',
      (row) => row.altDeg > 0,
    );
    expect(ids(order)).toEqual(['never', 'bright-low', 'faint-high', 'rises-late', 'rises-soon']);
  });
});

describe('bestOfNight', () => {
  const times = [new Date('2026-11-12T19:00'), new Date('2026-11-12T23:00'), new Date('2026-11-13T03:00')];

  it('finds the highest moment in full night, at least 30° up', () => {
    // Highest at the first check, but the Sun is still up then.
    expect(bestOfNight(times, [80, 40, 35], [5, -20, -25])).toEqual({ time: times[1], altDeg: 40, good: true });
    // Higher in twilight than in full night: full night counts.
    expect(bestOfNight(times, [70, 40, 20], [-8, -20, -25])).toEqual({ time: times[1], altDeg: 40, good: true });
  });

  it('falls back to the highest moment while the Sun is down, for a low target', () => {
    expect(bestOfNight(times, [20, 25, 10], [-5, -20, -25])).toEqual({ time: times[1], altDeg: 25, good: false });
    // Only well up in twilight.
    expect(bestOfNight(times, [45, 10, -5], [-8, -20, -25])).toEqual({ time: times[0], altDeg: 45, good: false });
  });

  it('is null for a target that stays below the horizon all night', () => {
    expect(bestOfNight(times, [-10, -5, -30], [-20, -20, -20])).toBeNull();
  });
});

describe('matchesType', () => {
  it('counts both kinds of cluster, and named doubles as doubles', () => {
    expect(matchesType({ kind: 'Globular cluster' }, 'Cluster')).toBe(true);
    expect(matchesType({ kind: 'Star', double: {} as never }, 'Double star')).toBe(true);
    expect(matchesType({ kind: 'Star' }, 'Double star')).toBe(false);
    expect(matchesType({ kind: 'Planet', body: 'Mars' }, 'Solar system')).toBe(true);
    expect(matchesType({ kind: 'Galaxy' }, 'All')).toBe(true);
  });
});

describe('currentFirst', () => {
  const seasons = ['autumn', 'winter', 'spring', 'summer'];
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  it('starts the seasons at the current one', () => {
    expect(currentFirst(seasons, new Date(2026, 10, 12))).toEqual(seasons);
    expect(currentFirst(seasons, new Date(2026, 11, 1))[0]).toBe('winter');
    expect(currentFirst(seasons, new Date(2026, 1, 20))[0]).toBe('winter');
    expect(currentFirst(seasons, new Date(2026, 4, 1))).toEqual(['spring', 'summer', 'autumn', 'winter']);
    expect(currentFirst(seasons, new Date(2026, 7, 31))[0]).toBe('summer');
  });

  it('starts the months at the current one', () => {
    expect(currentFirst(months, new Date(2026, 10, 12)).slice(0, 3)).toEqual(['nov', 'dec', 'jan']);
  });

  it('leaves other lists as they are', () => {
    expect(currentFirst(['a', 'b'], new Date(2026, 10, 12))).toEqual(['a', 'b']);
  });
});
