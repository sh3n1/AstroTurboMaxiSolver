// How every list of targets is ordered, filtered and split into sections: the search,
// the catalogues and the user's own lists all work the same way. Plain functions, with no
// Angular dependency, so they can be unit tested.

import type { Target } from './targets';

/**
 * The orders a list can be shown in. "list" is the list's own: the catalogue's numbers,
 * the order the user gave their list, or the best match in the search.
 */
export const SORTS = ['list', 'best-time', 'highest', 'brightest', 'nearest'] as const;
export type SortId = (typeof SORTS)[number];

/** The orders' names, as the sort menu shows them. Each list names its own order itself. */
export const SORT_LABELS: Record<Exclude<SortId, 'list'>, string> = {
  'best-time': 'Best time tonight',
  highest: 'Highest now',
  brightest: 'Brightest',
  nearest: 'Nearest to the reticle',
};

/** Target types the user can filter by. Clusters combine open and globular. */
export const TYPE_FILTERS = [
  'All',
  'Solar system',
  'Galaxy',
  'Nebula',
  'Cluster',
  'Star',
  'Double star',
  'Constellation',
] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

/** Which rows to show by the observing log: all, those still to see, or those seen. */
export type SeenFilter = 'all' | 'todo' | 'seen';

/**
 * How many rows a list shows at first, and how many more each time the user reaches its
 * end. Each row is a dozen components, which a phone is slow to build, and two dozen rows
 * already fill the screen more than twice over.
 */
export const PAGE_SIZE = 24;

export function matchesType(target: Pick<Target, 'kind' | 'body' | 'double'>, filter: TypeFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Solar system') return !!target.body;
  if (filter === 'Cluster') return target.kind.includes('cluster');
  // Named stars that are doubles, such as Albireo, are stars and doubles both.
  if (filter === 'Double star') return !!target.double;
  return target.kind === filter;
}

/** A target's best moment tonight: when it is highest while the Sun is down. */
export interface BestTonight {
  time: Date;
  altDeg: number;
}

/**
 * What ordering needs to know about a row's place in the sky. Each is asked for only by
 * the orders that use it, since some are slow to work out for thousands of targets.
 */
export interface SkyFacts<T> {
  /** Its height now, in degrees. */
  altDeg: (row: T) => number;
  /** When it next rises, for a row below the horizon, or null if it doesn't within a day. */
  rise: (row: T) => Date | null;
  /** Its best moment tonight, or null if it stays down all night. */
  best: (row: T) => BestTonight | null;
  /** How far it is from where the telescope points, in degrees. */
  awayDeg: (row: T) => number;
}

/** A run of rows under a heading, or with no heading when the order needs none. */
export interface Section<T> {
  title: string | null;
  rows: T[];
}

/** Sorts by a number worked out once per row. Rows with the same number keep their order. */
function sortedBy<T>(rows: readonly T[], key: (row: T) => number): T[] {
  return rows
    .map((row, index) => ({ row, index, key: key(row) }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map(({ row }) => row);
}

/** Leaves out sections with no rows, so no heading stands alone. */
const filled = <T>(sections: Section<T>[]): Section<T>[] => sections.filter((section) => section.rows.length > 0);

/**
 * Puts a list's rows in the chosen order. The orders that follow the sky split the rows
 * under headings, matching what each row shows: a height, a rise time, or neither.
 */
export function arrange<T extends Pick<Target, 'mag'>>(
  rows: readonly T[],
  sort: SortId,
  sky: SkyFacts<T>,
): Section<T>[] {
  switch (sort) {
    case 'list':
      return filled([{ title: null, rows: [...rows] }]);
    case 'brightest':
      return filled([{ title: null, rows: sortedBy(rows, (row) => row.mag) }]);
    case 'nearest':
      return filled([{ title: null, rows: sortedBy(rows, sky.awayDeg) }]);
    case 'highest': {
      const up: { row: T; altDeg: number }[] = [];
      const later: { row: T; rise: number }[] = [];
      const never: T[] = [];
      for (const row of rows) {
        const altDeg = sky.altDeg(row);
        if (altDeg > 0) {
          up.push({ row, altDeg });
          continue;
        }
        const rise = sky.rise(row);
        if (rise) later.push({ row, rise: rise.getTime() });
        else never.push(row);
      }
      return filled([
        { title: 'Up now', rows: sortedBy(up, (entry) => -entry.altDeg).map(({ row }) => row) },
        { title: 'Rises later', rows: sortedBy(later, (entry) => entry.rise).map(({ row }) => row) },
        { title: 'Not up today', rows: sortedBy(never, (row) => row.mag) },
      ]);
    }
    case 'best-time': {
      const tonight: { row: T; time: number }[] = [];
      const down: T[] = [];
      for (const row of rows) {
        const best = sky.best(row);
        if (best) tonight.push({ row, time: best.time.getTime() });
        else down.push(row);
      }
      return filled([
        { title: 'Tonight', rows: sortedBy(tonight, (entry) => entry.time).map(({ row }) => row) },
        { title: 'Not up tonight', rows: sortedBy(down, (row) => row.mag) },
      ]);
    }
  }
}

/** The first `limit` rows of the sections, for showing a long list a part at a time. */
export function firstRows<T>(sections: readonly Section<T>[], limit: number): Section<T>[] {
  const shown: Section<T>[] = [];
  let left = limit;
  for (const section of sections) {
    if (left <= 0) break;
    shown.push({ title: section.title, rows: section.rows.slice(0, left) });
    left -= section.rows.length;
  }
  return shown;
}

/**
 * The search's own order, the best match: targets whose designation is exactly what
 * was typed, then whatever is up, then the brightest.
 */
export function bestMatch<T extends Pick<Target, 'mag'>>(
  rows: readonly T[],
  isExact: (row: T) => boolean,
  isUp: (row: T) => boolean,
): T[] {
  return sortedBy(rows, (row) => (isExact(row) ? 0 : 2000) + (isUp(row) ? 0 : 1000) + row.mag);
}

/**
 * A target's best moment in a night, from its height at each check of that night: the
 * highest one above the horizon while the Sun is down, or null if there is none.
 */
export function bestOfNight(
  times: readonly Date[],
  altitudes: readonly number[],
  dark: readonly boolean[],
): BestTonight | null {
  let best: BestTonight | null = null;
  times.forEach((time, i) => {
    const altDeg = altitudes[i];
    if (dark[i] && altDeg > 0 && (!best || altDeg > best.altDeg)) best = { time, altDeg };
  });
  return best;
}

/**
 * A catalogue's seasons or months, turned so the current one comes first and the rest
 * follow in the year's order. Seasons run autumn, winter, spring, summer, as the evening
 * sky from September on, and months from January.
 */
export function currentFirst<T>(lists: readonly T[], date: Date): T[] {
  if (lists.length !== 4 && lists.length !== 12) return [...lists];
  const month = date.getMonth();
  // September, October and November are the autumn sky, the first of the four.
  const start = lists.length === 12 ? month : Math.floor(((month + 4) % 12) / 3);
  return [...lists.slice(start), ...lists.slice(0, start)];
}
