import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AppState } from './app-state.service';
import { skyConditions } from './astronomy';
import { pickEquipment } from './equipment';
import type { LogEntry } from './observing-log';
import {
  exportLogCsv,
  exportLogJson,
  logFileName,
  mergeEntries,
  newEntry,
  nightKey,
  parseLogJson,
  seenStates,
  seenCounts,
} from './observing-log';
import type { Target } from './targets';

const LOG_KEY = 'astrofinder.log';

/** Loads the saved log. Damaged or blocked storage gives an empty log, never an error. */
function loadLog(): LogEntry[] {
  try {
    const stored = localStorage.getItem(LOG_KEY);
    return stored ? (JSON.parse(stored) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * The observing log, saved on this device. Each entry also records the sky and the
 * telescope at that moment, so the user only taps "seen", and adds a note if they like.
 */
@Injectable({ providedIn: 'root' })
export class ObservingLogService {
  private readonly state = inject(AppState);

  /** Every entry, in the order logged. */
  readonly entries = signal<LogEntry[]>(loadLog());

  /** Each target's progress: seen, or tried but not seen yet. For ticks in the lists. */
  readonly states = computed(() => seenStates(this.entries()));

  /** How many times each target has been seen, for the counts on the eye and in the lists. */
  readonly counts = computed(() => seenCounts(this.entries()));

  /** Tonight's entries by target, the newest for each. For the seen button and its chip. */
  private readonly tonightByTarget = computed(() => {
    const tonight = nightKey(this.state.realNow());
    const byTarget = new Map<string, LogEntry>();
    for (const entry of this.entries()) {
      if (nightKey(new Date(entry.time)) !== tonight) continue;
      const known = byTarget.get(entry.targetId);
      if (!known || entry.time > known.time) byTarget.set(entry.targetId, entry);
    }
    return byTarget;
  });

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(LOG_KEY, JSON.stringify(this.entries()));
      } catch {
        // Not saving is acceptable here: the entries stay until the app closes.
      }
    });
  }

  /** The target's newest entry tonight, or undefined if it hasn't been logged tonight. */
  tonightEntry(targetId: string): LogEntry | undefined {
    return this.tonightByTarget().get(targetId);
  }

  /**
   * A list's badge: how many rows it has, and once any is seen, how many of them:
   * "110", then "12/110".
   */
  progressLabel(rows: readonly { id: string }[]): string {
    const states = this.states();
    const seen = rows.filter((row) => states.get(row.id) === 'seen').length;
    return seen > 0 ? `${seen}/${rows.length}` : `${rows.length}`;
  }

  /** How many times the target has been seen in all, failed tries left out. */
  timesSeen(targetId: string): number {
    return this.counts().get(targetId) ?? 0;
  }

  /**
   * Logs a sighting of a target now, with the sky and telescope as they are. Always the
   * real time, even while planning another, since this is what was just seen.
   */
  log(target: Target): LogEntry {
    const now = new Date();
    const settings = this.state.settings();
    const { latitudeDeg, longitudeDeg, bortle } = settings;
    const sky = skyConditions(now, latitudeDeg, longitudeDeg);
    const entry = newEntry(target, now, {
      latitudeDeg,
      longitudeDeg,
      altDeg: this.state.positionAt(target, now).altDeg,
      bortle,
      moonLitPercent: sky.moonIlluminatedPercent,
      moonAltDeg: sky.moonAltDeg,
      equipment: pickEquipment(settings),
    });
    this.entries.update((entries) => [...entries, entry]);
    void this.keepStorage();
    return entry;
  }

  /** Changes an entry's rating, tags or note. */
  update(id: string, changes: Partial<Pick<LogEntry, 'rating' | 'tags' | 'note'>>): void {
    this.entries.update((entries) => entries.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  }

  remove(id: string): void {
    this.entries.update((entries) => entries.filter((e) => e.id !== id));
  }

  /** Puts a removed entry back, for Undo. */
  restore(entry: LogEntry): void {
    this.entries.update((entries) => mergeEntries(entries, [entry]));
  }

  /** Adds the entries in a backup file. Returns how many were new. Throws a readable error. */
  import(text: string): number {
    const before = this.entries().length;
    this.entries.update((entries) => mergeEntries(entries, parseLogJson(text)));
    return this.entries().length - before;
  }

  /** Saves the log as a spreadsheet file in the phone's downloads. */
  exportCsv(): void {
    this.download(exportLogCsv(this.entries()), logFileName('csv'), 'text/csv');
  }

  /** Saves the whole log as a backup file, which Import reads back. */
  exportJson(): void {
    this.download(exportLogJson(this.entries()), logFileName('json'), 'application/json');
  }

  private download(text: string, fileName: string, type: string): void {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    // Give the browser a moment to start the download before freeing the file.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /**
   * Asks the browser not to clear the app's storage when the phone runs short of space,
   * since a log is worth keeping. Browsers may say no, which changes nothing else.
   */
  private async keepStorage(): Promise<void> {
    try {
      if (!(await navigator.storage?.persisted?.())) await navigator.storage?.persist?.();
    } catch {
      // Not available in this browser.
    }
  }
}
