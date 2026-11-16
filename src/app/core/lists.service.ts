import { Injectable, computed, inject } from '@angular/core';

import { AL_URBAN } from './al-urban';
import { apparentMagnitude } from './alignment';
import { AppState } from './app-state.service';
import { ASSA_TOP_100 } from './assa-top-100';
import { equatorialVector } from './astronomy';
import { HERSCHEL_400, HERSCHEL_II } from './herschel';
import type { Month } from './hubble-night-sky-challenge';
import { HUBBLE_NIGHT_SKY_CHALLENGE } from './hubble-night-sky-challenge';
import { readListFile } from './list-files';
import { LocalDb } from './local-db';
import { LocalTimePipe } from './local-time.pipe';
import { RASC_DEEP_SKY_GEMS } from './rasc-deep-sky-gems';
import { RASC_EXPLORE_THE_UNIVERSE } from './rasc-explore-universe';
import { RASC_FINEST_NGC } from './rasc-finest-ngc';
import { insideReticle } from './reticle';
import type { SkyItem } from './reticle';
import { SAC_110 } from './sac-110';
import { recommendationLimit } from './sky-quality';
import { SyncedStore } from './synced-store';
import type { FixedListId, ListItem, ListRecord, ListedTarget, TargetList } from './target-lists';
import {
  catalogueTargets,
  designationIndex,
  exportFileName,
  exportLists,
  FIXED_LISTS,
  listItemId,
  listRows,
  newListId,
  parseImport,
  UNCATEGORIZED_ID,
  UNCATEGORIZED_NAME,
  uniqueName,
} from './target-lists';
import type { Target } from './targets';

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
  /** Fixed lists are made by the app. Saved for later can't be renamed or deleted, only filled. */
  kind: 'fixed' | 'uncategorized' | 'custom';
  /** Its rows. A catalogue can list one target twice, under two numbers: see ListedTarget. */
  targets: ListedTarget[];
}

/**
 * The bookmark lists: the app's fixed ones, and the user's own, saved in the device's
 * database. A list's name is one record, and each of its targets another.
 */
@Injectable({ providedIn: 'root' })
export class ListsService {
  private readonly state = inject(AppState);
  private readonly localDb = inject(LocalDb);

  private readonly listStore = new SyncedStore<ListRecord>(
    this.localDb,
    (db) => db.lists,
    (old) => old.lists,
  );
  private readonly itemStore = new SyncedStore<ListItem>(
    this.localDb,
    (db) => db.listItems,
    (old) => old.listItems,
  );

  /** Resolves once the saved lists are read. The app waits for it before it starts. */
  readonly ready = Promise.all([this.listStore.load(), this.itemStore.load()]).then(() => {
    // Saved for later must always exist, even if the saved data lost it.
    if (!this.listStore.get(UNCATEGORIZED_ID))
      this.listStore.save([{ id: UNCATEGORIZED_ID, name: UNCATEGORIZED_NAME }]);
  });

  /** Each list's items, in their order. */
  private readonly itemsByList = computed(() => {
    const byList = new Map<string, ListItem[]>();
    for (const item of this.itemStore.items()) byList.set(item.listId, [...(byList.get(item.listId) ?? []), item]);
    for (const items of byList.values()) items.sort((a, b) => a.position - b.position);
    return byList;
  });

  /**
   * The lists the user can edit, Saved for later first, then in the order they were made.
   * Saved for later always takes its current name: it was once called Uncategorized.
   */
  readonly editableLists = computed<TargetList[]>(() => {
    const itemsByList = this.itemsByList();
    return [...this.listStore.records()]
      .sort(
        (a, b) => Number(b.id === UNCATEGORIZED_ID) - Number(a.id === UNCATEGORIZED_ID) || a.createdAt - b.createdAt,
      )
      .map(({ id, name }) => ({
        id,
        name: id === UNCATEGORIZED_ID ? UNCATEGORIZED_NAME : name,
        targetIds: (itemsByList.get(id) ?? []).map((item) => item.targetId),
      }));
  });

  // Stars are mainly useful for alignment, so they are left out. The brightest first,
  // counting the dimming near the horizon, because faint objects are hard to see from a city.
  // It follows the sky minute by minute, by day or night, as the app's clock moves on.
  private readonly bestNow = computed(() => {
    const time = this.state.now();
    // As faint as the user's sky and telescope can show, so a dark site gets more.
    const limit = recommendationLimit(this.state.settings().bortle, this.state.equipment().telescopeApertureMm);
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

  /** Adds a target to the end of a list, or takes it out if it is already there. */
  toggle(listId: string, targetId: string): void {
    const items = this.itemsByList().get(listId) ?? [];
    const id = listItemId(listId, targetId);
    if (items.some((item) => item.id === id)) {
      this.itemStore.remove([id]);
    } else {
      const position = Math.max(-1, ...items.map((item) => item.position)) + 1;
      this.itemStore.save([{ id, listId, targetId, position }]);
    }
  }

  /** A list's target ids as saved, in order, to put back after a change is undone. */
  targetIds(listId: string): string[] {
    return [...(this.editableLists().find((l) => l.id === listId)?.targetIds ?? [])];
  }

  /**
   * Sets a list's targets, in order: for reordering by hand, and for undoing a removal.
   * Only the targets that come, go or move are written.
   */
  setTargets(listId: string, targetIds: readonly string[]): void {
    const wanted = [...new Set(targetIds)];
    const gone = (this.itemsByList().get(listId) ?? []).filter((item) => !wanted.includes(item.targetId));
    this.itemStore.remove(gone.map((item) => item.id));
    this.itemStore.save(
      wanted.map((targetId, position) => ({ id: listItemId(listId, targetId), listId, targetId, position })),
    );
  }

  /** Makes a new list and returns its id. Names are kept unique. */
  create(name: string, targetIds: readonly string[] = []): string {
    const id = newListId();
    this.listStore.save([{ id, name: this.freeName(name) }]);
    this.setTargets(id, targetIds);
    return id;
  }

  /** Renames one of the user's lists. Saved for later always keeps its name. */
  rename(listId: string, name: string): void {
    if (listId === UNCATEGORIZED_ID) return;
    const others = this.editableLists().filter((l) => l.id !== listId);
    const unique = uniqueName(
      name,
      others.map((l) => l.name),
    );
    if (this.listStore.get(listId)) this.listStore.save([{ id: listId, name: unique }]);
  }

  /** Deletes one of the user's lists and its targets. Saved for later always stays. */
  delete(listId: string): void {
    if (listId === UNCATEGORIZED_ID) return;
    this.itemStore.remove((this.itemsByList().get(listId) ?? []).map((item) => item.id));
    this.listStore.remove([listId]);
  }

  /**
   * Adds the lists in a file as new lists, so nothing the user has is overwritten: the
   * app's own list files, SkySafari .skylist files, and CSV or plain text from other apps.
   * Returns how many lists were added, and the objects of other apps' files that the app
   * doesn't know. Throws a readable error for a file it can't use.
   */
  import(text: string, fileName = ''): { lists: number; missing: string[] } {
    // JSON is only ever the app's own format, which says clearly when a file isn't one.
    if (/^\s*[{[]/.test(text)) {
      const imported = parseImport(text);
      for (const { name, targetIds } of imported) this.create(name, targetIds);
      return { lists: imported.length, missing: [] };
    }
    const { name, targetIds, missing } = readListFile(text, fileName, this.state.targets());
    this.create(name, targetIds);
    return { lists: 1, missing };
  }

  /**
   * Shares a list with the phone's share sheet, to send by chat, mail or any other app.
   * It never saves a file by itself: that is "Save as a file" in the list's menu. It goes
   * as a text file, since share sheets refuse JSON files, and importing reads it the same.
   * Where files can't be shared, it goes as plain text, and where nothing can, the text
   * is copied, to paste wherever the user likes. Returns what happened, for a message.
   */
  async share(list: ListView): Promise<'shared' | 'copied' | 'cancelled' | 'unavailable'> {
    // A target listed twice, under two numbers, is shared once.
    const text = exportLists([{ name: list.name, targetIds: [...new Set(list.targets.map((t) => t.id))] }]);
    const file = new File([text], exportFileName(list.name).replace(/\.json$/, '.txt'), { type: 'text/plain' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: list.name });
        return 'shared';
      }
      if (navigator.share) {
        await navigator.share({ title: list.name, text });
        return 'shared';
      }
    } catch (error) {
      // Closing the share sheet isn't a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
    try {
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      // No share sheet and no clipboard: only saving a file is left, from the menu.
      return 'unavailable';
    }
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

  private freeName(name: string): string {
    return uniqueName(
      name,
      this.editableLists().map((l) => l.name),
    );
  }
}
