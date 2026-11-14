import { Injectable, computed, inject, linkedSignal, signal } from '@angular/core';

import { AppState } from './app-state.service';
import type { Horizontal, Vector3 } from './astronomy';
import { equatorialVector, hoursUntilRise } from './astronomy';
import type { Section, SeenFilter, SkyFacts, SortId, TypeFilter } from './list-order';
import { PAGE_SIZE, SORTS, SORT_LABELS, arrange, bestMatch, firstRows, matchesType } from './list-order';
import { LocalTimePipe } from './local-time.pipe';
import { ObservingLogService } from './observing-log.service';
import { isExactDesignation, normalizeSearch, targetSearchText } from './search';
import { listUuid } from './storage-migration';
import type { ListedTarget } from './target-lists';
import { TonightService } from './tonight.service';

/** Where each list's chosen order is remembered, by the list's key. */
const SORTS_KEY = 'astrofinder.listSorts';
/** The telescope's direction is followed in steps this size, so "nearest" doesn't re-sort at every tremble. */
const POINTING_STEP_DEG = 0.5;
const RAD = Math.PI / 180;
const TIME = new LocalTimePipe();

/** What a page tells the list view about its list. Each is read again whenever it changes. */
export interface ListViewConfig {
  /** Names the list, for remembering its order: a list's id, or "targets". */
  key: () => string;
  /** The list's rows, in its own order. */
  rows: () => readonly ListedTarget[];
  /** What the list's own order is called in the sort menu, such as "Catalogue order". */
  ownOrder: () => string;
  /** On the Targets tab, the list's own order is the best match for what was typed. */
  bestMatch?: boolean;
  /** Orders that make no sense for this list, such as "nearest" inside the reticle. */
  withoutSorts?: () => readonly SortId[];
  /** Whether the chart starts open. The user's own lists do. */
  chartOpen?: () => boolean;
}

/** A filter that is on, as a chip the user can tap to take it off. */
export interface ActiveFilter {
  id: 'type' | 'seen' | 'up';
  label: string;
}

/**
 * The order chosen for each list, by the list's id. The user's lists had other ids before
 * they were UUIDs, so those are turned into theirs. The app's own lists keep their names.
 */
function loadSorts(): Record<string, SortId> {
  try {
    const saved = JSON.parse(localStorage.getItem(SORTS_KEY) ?? '{}') as Record<string, SortId>;
    return Object.fromEntries(
      Object.entries(saved).map(([key, sort]) => [
        key === 'uncategorized' || key.startsWith('list-') ? listUuid(key) : key,
        sort,
      ]),
    );
  } catch {
    // Browser storage can be blocked or damaged. Every list then starts in its own order.
    return {};
  }
}

/**
 * One list of targets on show: its search, order and filters, and the rows that result.
 * The Targets tab and every list page have their own, so all behave alike. The tools in
 * the header (ListToolsComponent) and the rows below (ListRowsComponent) both use it.
 */
@Injectable()
export class ListViewService {
  private readonly state = inject(AppState);
  private readonly log = inject(ObservingLogService);
  private readonly tonight = inject(TonightService);

  private readonly config = signal<ListViewConfig | null>(null);

  /** Set once by the page, when it is made. */
  configure(config: ListViewConfig): void {
    this.config.set(config);
  }

  // ---- What the user chose ----

  readonly query = signal('');
  readonly type = signal<TypeFilter>('All');
  readonly seen = signal<SeenFilter>('all');
  /** Only what rises above the horizon at some point tonight. */
  readonly upTonight = signal(false);
  /** Whether the filter sheet is open. */
  readonly filtersOpen = signal(false);
  /** Reordering one of the user's own lists by hand: everything shows, in the list's own order. */
  readonly editing = signal(false);

  /** The chart, open or closed: the user's choice, or else how the list starts. */
  private readonly chartChoice = signal<boolean | null>(null);
  readonly chartOpen = computed(() => this.chartChoice() ?? this.config()?.chartOpen?.() ?? false);
  toggleChart(): void {
    this.chartChoice.set(!this.chartOpen());
  }

  private readonly savedSorts = signal(loadSorts());

  /** The orders this list offers, with their names. */
  readonly sorts = computed(() => {
    const config = this.config();
    const without = config?.withoutSorts?.() ?? [];
    return SORTS.filter((id) => !without.includes(id)).map((id) => ({
      id,
      label: id === 'list' ? (config?.ownOrder() ?? 'List order') : SORT_LABELS[id],
    }));
  });

  /** The order on show: the one chosen for this list before, or its own. */
  readonly sort = computed<SortId>(() => {
    if (this.editing()) return 'list';
    const saved = this.savedSorts()[this.config()?.key() ?? ''];
    return this.sorts().some((sort) => sort.id === saved) ? saved : 'list';
  });

  setSort(sort: SortId): void {
    const key = this.config()?.key();
    if (!key) return;
    this.savedSorts.update((sorts) => ({ ...sorts, [key]: sort }));
    try {
      localStorage.setItem(SORTS_KEY, JSON.stringify(this.savedSorts()));
    } catch {
      // Not saving is acceptable. The order still holds until the app closes.
    }
  }

  /** The filters that are on, for the chips that take them off. */
  readonly activeFilters = computed<ActiveFilter[]>(() => {
    const active: ActiveFilter[] = [];
    if (this.type() !== 'All') active.push({ id: 'type', label: this.type() });
    if (this.seen() !== 'all') active.push({ id: 'seen', label: this.seen() === 'seen' ? 'Seen' : 'To see' });
    if (this.upTonight()) active.push({ id: 'up', label: 'Up tonight' });
    return active;
  });

  clearFilter(id: ActiveFilter['id']): void {
    if (id === 'type') this.type.set('All');
    if (id === 'seen') this.seen.set('all');
    if (id === 'up') this.upTonight.set(false);
  }

  // ---- The rows that result ----

  /** The rows that pass the search and the filters, still in the list's own order. */
  private readonly filtered = computed(() => {
    const rows = this.config()?.rows() ?? [];
    if (this.editing()) return rows;
    // Typing "ngc224" or "NGC 224" finds the same object.
    const term = normalizeSearch(this.query());
    const type = this.type();
    const seen = this.seen();
    const upTonight = this.upTonight();
    const states = this.log.states();
    return rows.filter(
      (row) =>
        (!term || targetSearchText(row).includes(term)) &&
        matchesType(row, type) &&
        (seen === 'all' || (states.get(row.id) === 'seen') === (seen === 'seen')) &&
        (!upTonight || this.tonight.best(row) !== null),
    );
  });

  /** Where the telescope points, in coarse steps, as a direction to measure from. */
  private readonly pointing = computed<Vector3>(
    () => {
      const { raDeg, decDeg } = this.state.pointingEquatorial();
      const step = (deg: number): number => Math.round(deg / POINTING_STEP_DEG) * POINTING_STEP_DEG;
      return equatorialVector(step(raDeg), step(decDeg));
    },
    { equal: (a, b) => a.every((value, i) => value === b[i]) },
  );

  /** Each row's place in the sky, for the orders that follow it. Positions are kept per pass. */
  private skyFacts(now: Date): SkyFacts<ListedTarget> & { position: (row: ListedTarget) => Horizontal } {
    const positions = new Map<string, Horizontal>();
    const position = (row: ListedTarget): Horizontal => {
      let found = positions.get(row.id);
      if (!found) {
        // The minute clock is enough for ordering, and saves re-sorting every second.
        found = this.state.positionAt(row, now);
        positions.set(row.id, found);
      }
      return found;
    };
    return {
      position,
      altDeg: (row) => position(row).altDeg,
      rise: (row) => {
        // Planets and the Moon need a search. The rest rise by the sky's steady turn.
        if (row.body) return this.state.nextRise(row, now);
        const hours = hoursUntilRise(position(row), this.state.settings().latitudeDeg);
        return hours === null ? null : new Date(now.getTime() + hours * 3_600_000);
      },
      best: (row) => this.tonight.best(row),
      awayDeg: (row) => this.awayDeg(row),
    };
  }

  private awayDeg(row: ListedTarget): number {
    const [x, y, z] = equatorialVector(row.raDeg, row.decDeg);
    const [px, py, pz] = this.pointing();
    return Math.acos(Math.max(-1, Math.min(1, x * px + y * py + z * pz))) / RAD;
  }

  /** Every row that passes, in the chosen order, under its headings. */
  readonly sections = computed<Section<ListedTarget>[]>(() => {
    const rows = this.filtered();
    const sort = this.sort();
    const sky = this.skyFacts(this.state.now());
    if (sort === 'list' && this.config()?.bestMatch && !this.editing()) {
      const term = normalizeSearch(this.query());
      const matched = bestMatch(
        rows,
        (row) => !!term && isExactDesignation(row, term),
        (row) => sky.altDeg(row) > 0,
      );
      return matched.length > 0 ? [{ title: null, rows: matched }] : [];
    }
    return arrange(rows, sort, sky);
  });

  /** How many rows pass the search and the filters. */
  readonly total = computed(() => this.sections().reduce((sum, section) => sum + section.rows.length, 0));

  /** Every row in order, without the headings: what the chart draws its first lines from. */
  readonly ordered = computed(() => this.sections().flatMap((section) => section.rows));

  /**
   * How many rows are on show. Thousands of rows would freeze a phone, so a list shows a
   * part and adds to it as the user reaches its end. Any new search, order or filter
   * starts again from the top.
   */
  readonly limit = linkedSignal({
    source: () =>
      `${this.config()?.key()}|${this.query()}|${this.sort()}|${this.type()}|${this.seen()}|${this.upTonight()}`,
    computation: () => PAGE_SIZE,
  });

  showMore(): void {
    this.limit.update((limit) => limit + PAGE_SIZE);
  }

  /** The rows on show. While reordering, all of them, so any row can be dragged anywhere. */
  readonly visible = computed(() => (this.editing() ? this.sections() : firstRows(this.sections(), this.limit())));

  readonly allShown = computed(() => this.editing() || this.limit() >= this.total());

  /**
   * A few words for each row on show, about the order it is in: its best time tonight, or
   * how far it is from the reticle. The other orders need none, as the row shows its height.
   */
  readonly notes = computed<ReadonlyMap<string, string>>(() => {
    const sort = this.sort();
    const notes = new Map<string, string>();
    if (sort !== 'best-time' && sort !== 'nearest') return notes;
    for (const row of this.visible().flatMap((section) => section.rows)) {
      if (sort === 'nearest') {
        notes.set(row.id, `${Math.round(this.awayDeg(row))}° away`);
        continue;
      }
      const best = this.tonight.best(row);
      if (best) notes.set(row.id, `best ${TIME.transform(best.time)}, ${Math.round(best.altDeg)}° up`);
    }
    return notes;
  });
}
