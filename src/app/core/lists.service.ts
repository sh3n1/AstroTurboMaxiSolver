import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { apparentMagnitude } from './alignment';
import { AppState } from './app-state.service';
import { recommendationLimit } from './sky-quality';
import type { FixedListId, TargetList } from './target-lists';
import {
  FIXED_LISTS,
  UNCATEGORIZED_ID,
  catalogueTargets,
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

// Tonight's recommendations: objects well up in the sky when it gets dark, brightest first.
const GOOD_ALTITUDE_DEG = 30;
const TONIGHT_COUNT = 20;

/** A list as the pages show it, whether the app made it or the user did. */
export interface ListView {
  id: string;
  name: string;
  /** Fixed lists are made by the app. Uncategorized can't be renamed or deleted, only filled. */
  kind: 'fixed' | 'uncategorized' | 'custom';
  targets: Target[];
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

  /** Suggestions are for when it gets dark, or for now if it is already dark. */
  readonly tonightTime = computed(() => this.state.conditions().darkFrom ?? this.state.now());

  // Stars are mainly useful for alignment, so they are left out. The brightest first,
  // counting the dimming near the horizon, because faint objects are hard to see from a city.
  private readonly tonight = computed(() => {
    const time = this.tonightTime();
    // As faint as the user's sky and telescope can show, so a dark site gets more.
    const { bortle, telescopeApertureMm } = this.state.settings();
    const limit = recommendationLimit(bortle, telescopeApertureMm);
    return this.state
      .targets()
      .filter((target) => target.kind !== 'Star' && target.mag <= limit)
      .map((target) => ({ target, altDeg: this.state.positionAt(target, time).altDeg }))
      .filter(({ altDeg }) => altDeg >= GOOD_ALTITUDE_DEG)
      .sort((a, b) => apparentMagnitude(a.target.mag, a.altDeg) - apparentMagnitude(b.target.mag, b.altDeg))
      .slice(0, TONIGHT_COUNT)
      .map(({ target }) => target);
  });

  private readonly messier = computed(() => catalogueTargets(this.state.targets(), 'M'));
  private readonly caldwell = computed(() => catalogueTargets(this.state.targets(), 'C'));

  /** The app's own lists, which can't be changed. */
  readonly fixedLists = computed<ListView[]>(() => {
    const targets: Record<FixedListId, Target[]> = {
      tonight: this.tonight(),
      messier: this.messier(),
      caldwell: this.caldwell(),
    };
    return FIXED_LISTS.map(({ id, name }) => ({ id, name, kind: 'fixed', targets: targets[id] }));
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
