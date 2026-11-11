import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AL_URBAN } from './al-urban';
import { apparentMagnitude } from './alignment';
import { AppState } from './app-state.service';
import { ASSA_TOP_100 } from './assa-top-100';
import { equatorialVector } from './astronomy';
import { HERSCHEL_400, HERSCHEL_II } from './herschel';
import type { Month } from './hubble-night-sky-challenge';
import { HUBBLE_NIGHT_SKY_CHALLENGE } from './hubble-night-sky-challenge';
import { LocalTimePipe } from './local-time.pipe';
import { RASC_DEEP_SKY_GEMS } from './rasc-deep-sky-gems';
import { RASC_EXPLORE_THE_UNIVERSE } from './rasc-explore-universe';
import { RASC_FINEST_NGC } from './rasc-finest-ngc';
import { insideReticle } from './reticle';
import type { SkyItem } from './reticle';
import { SAC_110 } from './sac-110';
import { recommendationLimit } from './sky-quality';
import type { FixedListId, ListedTarget, TargetList } from './target-lists';
import {
  FIXED_LISTS,
  UNCATEGORIZED_ID,
  catalogueTargets,
  designationIndex,
  listRows,
  exportFileName,
  exportLists,
  newListId,
  parseImport,
  startingLists,
  uniqueName,
} from './target-lists';
import type { Target } from './targets';

const LISTS_KEY = 'astrofinder.lists';
/** Where the old session plan kept its bookmarks. They move into Uncategorized. */
const OLD_PLAN_KEY = 'astrofinder.plan';

// The best right now: objects well up in the sky at this moment, brightest first.
const GOOD_ALTITUDE_DEG = 30;
const BEST_NOW_COUNT = 20;
/** Formats the planned time for the list's name, as the pages do. */
const TIME_PIPE = new LocalTimePipe();
/** The weekday, short, in the phone's language: "Tue". */
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' });

/** A list as the pages show it, whether the app made it or the user did. */
export interface ListView {
  id: string;
  name: string;
  /** Fixed lists are made by the app. Uncategorized can't be renamed or deleted, only filled. */
  kind: 'fixed' | 'uncategorized' | 'custom';
  /** Its rows. A catalogue can list one target twice, under two numbers: see ListedTarget. */
  targets: ListedTarget[];
}

/** Loads the saved lists, or starts new ones from the old session plan. */
function loadLists(): TargetList[] {
  try {
    const stored = localStorage.getItem(LISTS_KEY);
    if (stored) {
      const lists = JSON.parse(stored) as TargetList[];
      // Uncategorized must always exist, even if the saved data lost it.
      return lists.some((l) => l.id === UNCATEGORIZED_ID) ? lists : [...startingLists(), ...lists];
    }
    const oldPlan = localStorage.getItem(OLD_PLAN_KEY);
    return startingLists(oldPlan ? (JSON.parse(oldPlan) as { ids: string[] }).ids : []);
  } catch {
    // Browser storage can be blocked or damaged. The app still works, just without saving.
    return startingLists();
  }
}

/** The bookmark lists: the app's fixed ones, and the user's own, saved on this device. */
@Injectable({ providedIn: 'root' })
export class ListsService {
  private readonly state = inject(AppState);

  /** The lists the user can edit, Uncategorized first. */
  readonly editableLists = signal<TargetList[]>(loadLists());

  // Stars are mainly useful for alignment, so they are left out. The brightest first,
  // counting the dimming near the horizon, because faint objects are hard to see from a city.
  // It follows the sky minute by minute, by day or night, as the app's clock moves on.
  private readonly bestNow = computed(() => {
    const time = this.state.now();
    // As faint as the user's sky and telescope can show, so a dark site gets more.
    const { bortle, telescopeApertureMm } = this.state.settings();
    const limit = recommendationLimit(bortle, telescopeApertureMm);
    return this.state
      .targets()
      .filter((target) => target.kind !== 'Star' && target.mag <= limit)
      .map((target) => ({ target, altDeg: this.state.positionAt(target, time).altDeg }))
      .filter(({ altDeg }) => altDeg >= GOOD_ALTITUDE_DEG)
      .sort((a, b) => apparentMagnitude(a.target.mag, a.altDeg) - apparentMagnitude(b.target.mag, b.altDeg))
      .slice(0, BEST_NOW_COUNT)
      .map(({ target }) => target);
  });

  /**
   * Each target's direction, worked out once each time the targets change (each minute,
   * as the planets move), so following the telescope is only a quick check per target.
   * Constellations are left out: their position is only a label spot, not something to aim at.
   */
  private readonly targetVectors = computed<SkyItem<Target>[]>(() =>
    this.state
      .targets()
      .filter((target) => target.kind !== 'Constellation')
      .map((target) => ({ item: target, vector: equatorialVector(target.raDeg, target.decDeg) })),
  );

  /**
   * What is inside the reticle's rings right now. It follows the telescope as it moves,
   * but only tells the pages when the targets in it change, not at every small movement.
   */
  private readonly inReticle = computed(
    () => {
      const { raDeg, decDeg } = this.state.pointingEquatorial();
      return insideReticle(this.targetVectors(), equatorialVector(raDeg, decDeg));
    },
    { equal: (a, b) => a.length === b.length && a.every((target, i) => target === b[i]) },
  );

  private readonly messier = computed(() => catalogueTargets(this.state.targets(), 'M'));
  private readonly caldwell = computed(() => catalogueTargets(this.state.targets(), 'C'));

  /** Every target by its designations, shared by the catalogue lists below. */
  private readonly byDesignation = computed(() => designationIndex(this.state.targets()));

  /** The Hubble Night Sky Challenge has a list for each hemisphere: the user's. */
  private readonly hemisphere = computed(() => (this.state.settings().latitudeDeg < 0 ? 'south' : 'north'));

  /** The observing programmes' lists, each by the designations it names. */
  private readonly programmeLists = computed(() => {
    const index = this.byDesignation();
    const rows = (wanted: readonly string[]): ListedTarget[] => listRows(index, wanted);
    const ngc = (numbers: readonly number[]): ListedTarget[] => rows(numbers.map((n) => `NGC ${n}`));
    const hubble = (month: Month): ListedTarget[] => rows(HUBBLE_NIGHT_SKY_CHALLENGE[month][this.hemisphere()]);
    return {
      herschel400: ngc(HERSCHEL_400),
      herschel2: ngc(HERSCHEL_II),
      sac110: ngc(SAC_110),
      'explore-universe': rows(RASC_EXPLORE_THE_UNIVERSE),
      urban: rows(AL_URBAN),
      assa100: rows(ASSA_TOP_100),
      'rasc-autumn': rows(RASC_FINEST_NGC.autumn),
      'rasc-winter': rows(RASC_FINEST_NGC.winter),
      'rasc-spring': rows(RASC_FINEST_NGC.spring),
      'rasc-summer': rows(RASC_FINEST_NGC.summer),
      'gems-autumn': rows(RASC_DEEP_SKY_GEMS.autumn),
      'gems-winter': rows(RASC_DEEP_SKY_GEMS.winter),
      'gems-spring': rows(RASC_DEEP_SKY_GEMS.spring),
      'gems-summer': rows(RASC_DEEP_SKY_GEMS.summer),
      'hubble-january': hubble('january'),
      'hubble-february': hubble('february'),
      'hubble-march': hubble('march'),
      'hubble-april': hubble('april'),
      'hubble-may': hubble('may'),
      'hubble-june': hubble('june'),
      'hubble-july': hubble('july'),
      'hubble-august': hubble('august'),
      'hubble-september': hubble('september'),
      'hubble-october': hubble('october'),
      'hubble-november': hubble('november'),
      'hubble-december': hubble('december'),
    } satisfies Record<Exclude<FixedListId, 'now' | 'reticle' | 'messier' | 'caldwell'>, ListedTarget[]>;
  });

  /**
   * "Best right now", or while planning the time it is for: "Best at 23:30" today,
   * "Best Tue 23:30" in the coming week, or "Best 14 Nov 23:30" further away.
   */
  private readonly bestNowName = computed(() => {
    const planned = this.state.plannedTime();
    if (!planned) return 'Best right now';
    const time = TIME_PIPE.transform(planned);
    if (planned.toDateString() === new Date().toDateString()) return `Best at ${time}`;
    const withinWeek = Math.abs(planned.getTime() - Date.now()) < 6 * 24 * 3_600_000;
    const day = withinWeek ? WEEKDAY.format(planned) : TIME_PIPE.transform(planned, 'day');
    return `Best ${day} ${time}`;
  });

  /** The app's own lists, which can't be changed. */
  readonly fixedLists = computed<ListView[]>(() => {
    const targets: Record<FixedListId, ListedTarget[]> = {
      now: this.bestNow(),
      reticle: this.inReticle(),
      messier: this.messier(),
      caldwell: this.caldwell(),
      ...this.programmeLists(),
    };
    return FIXED_LISTS.map(({ id, name }) => ({
      id,
      name: id === 'now' ? this.bestNowName() : name,
      kind: 'fixed',
      targets: targets[id],
    }));
  });

  /** The user's lists, with their targets looked up. Targets not in the catalogue are skipped. */
  readonly userLists = computed<ListView[]>(() => {
    const byId = new Map(this.state.targets().map((t) => [t.id, t]));
    return this.editableLists().map(({ id, name, targetIds }) => ({
      id,
      name,
      kind: id === UNCATEGORIZED_ID ? 'uncategorized' : 'custom',
      targets: targetIds.map((targetId) => byId.get(targetId)).filter((t): t is Target => !!t),
    }));
  });

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(LISTS_KEY, JSON.stringify(this.editableLists()));
      } catch {
        // Not saving is acceptable. The lists still work until the app closes.
      }
    });
  }

  /** Any list, fixed or the user's, by id. */
  list(id: string): ListView | undefined {
    return [...this.fixedLists(), ...this.userLists()].find((l) => l.id === id);
  }

  /** Whether a target is in any of the user's lists, which fills in its bookmark icon. */
  isBookmarked(targetId: string): boolean {
    return this.editableLists().some((l) => l.targetIds.includes(targetId));
  }

  contains(listId: string, targetId: string): boolean {
    return !!this.editableLists()
      .find((l) => l.id === listId)
      ?.targetIds.includes(targetId);
  }

  /** Adds a target to a list, or takes it out if it is already there. */
  toggle(listId: string, targetId: string): void {
    this.update(listId, (ids) => (ids.includes(targetId) ? ids.filter((i) => i !== targetId) : [...ids, targetId]));
  }

  /** Makes a new, empty list and returns its id. Names are kept unique. */
  create(name: string): string {
    const id = newListId();
    this.editableLists.update((lists) => [...lists, { id, name: this.freeName(name), targetIds: [] }]);
    return id;
  }

  /** Renames one of the user's lists. Uncategorized always keeps its name. */
  rename(listId: string, name: string): void {
    if (listId === UNCATEGORIZED_ID) return;
    const others = this.editableLists().filter((l) => l.id !== listId);
    const unique = uniqueName(
      name,
      others.map((l) => l.name),
    );
    this.editableLists.update((lists) => lists.map((l) => (l.id === listId ? { ...l, name: unique } : l)));
  }

  /** Deletes one of the user's lists. Uncategorized always stays. */
  delete(listId: string): void {
    if (listId === UNCATEGORIZED_ID) return;
    this.editableLists.update((lists) => lists.filter((l) => l.id !== listId));
  }

  /**
   * Adds the lists in an exported file as new lists, so nothing the user has is
   * overwritten. Returns how many lists were added. Throws a readable error for a bad file.
   */
  import(text: string): number {
    const imported = parseImport(text);
    for (const { name, targetIds } of imported) {
      const id = newListId();
      this.editableLists.update((lists) => [...lists, { id, name: this.freeName(name), targetIds }]);
    }
    return imported.length;
  }

  /**
   * Shares a list with the phone's share sheet, or saves it as a file where sharing
   * isn't available. Returns what happened, for a message to the user.
   */
  async share(list: ListView): Promise<'shared' | 'saved' | 'cancelled'> {
    const text = exportLists([{ name: list.name, targetIds: list.targets.map((t) => t.id) }]);
    const fileName = exportFileName(list.name);
    const file = new File([text], fileName, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: list.name });
        return 'shared';
      }
      // Some browsers can share text but not this kind of file. Importing accepts it pasted.
      if (navigator.share) {
        await navigator.share({ title: list.name, text });
        return 'shared';
      }
    } catch (error) {
      // Closing the share sheet isn't a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
    this.download(text, fileName);
    return 'saved';
  }

  /** Saves every list the user made as one file, for a backup or another phone. */
  exportAll(): void {
    this.download(exportLists(this.editableLists()), exportFileName('all lists'));
  }

  /** Saves text as a file in the phone's downloads. */
  download(text: string, fileName: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    // Give the browser a moment to start the download before freeing the file.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  private update(listId: string, change: (ids: string[]) => string[]): void {
    this.editableLists.update((lists) =>
      lists.map((l) => (l.id === listId ? { ...l, targetIds: change(l.targetIds) } : l)),
    );
  }

  private freeName(name: string): string {
    return uniqueName(
      name,
      this.editableLists().map((l) => l.name),
    );
  }
}
