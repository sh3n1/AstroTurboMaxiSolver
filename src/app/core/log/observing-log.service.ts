import { Injectable, computed, inject } from '@angular/core';

import { AppState } from '../app-state.service';
import { skyConditions } from '../astronomy/astronomy';
import type { Target } from '../catalog/targets';
import { LocalDb } from '../storage/local-db';
import { logEntryUuid } from '../storage/storage-migration';
import { SyncedStore } from '../storage/synced-store';

import type { OalObserver } from './oal-export';
import { exportLogOal, oalFileName } from './oal-export';
import type { LogConditions, LogEntry } from './observing-log';
import {
  carriedDetails,
  exportLogCsv,
  exportLogJson,
  logFileName,
  mergeEntries,
  newEntry,
  nightKey,
  parseLogJson,
  seenCounts,
  seenStates,
} from './observing-log';

/**
 * The observing log, saved on this device in its database, one record per entry. Each
 * entry also records the sky and the telescope at that moment, so the user only taps
 * "seen", and adds a note if they like.
 */
@Injectable({ providedIn: 'root' })
export class ObservingLogService {
  private readonly state = inject(AppState);

  private readonly store = new SyncedStore<LogEntry>(
    inject(LocalDb),
    (db) => db.logEntries,
    (old) => old.logEntries,
  );

  /** Resolves once the saved log is read. The app waits for it before it starts. */
  readonly ready = this.store.load();

  /** Every entry, oldest first. */
  readonly entries = computed(() => [...this.store.items()].sort((a, b) => a.time.localeCompare(b.time)));

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
    const entry = newEntry(target, now, this.conditionsAt(target, now));
    // The night's seeing and sky readings carry over, so they needn't be typed again.
    const details = carriedDetails(this.entries(), now);
    const saved = details ? { ...entry, details } : entry;
    this.store.save([saved]);
    return saved;
  }

  /**
   * The sky and telescope for a target at a time, as an entry records them. A blank form
   * shows them before anything is saved.
   */
  conditionsAt(target: Target, time: Date): LogConditions {
    const settings = this.state.settings();
    const { latitudeDeg, longitudeDeg, bortle } = settings;
    const sky = skyConditions(time, latitudeDeg, longitudeDeg);
    return {
      latitudeDeg,
      longitudeDeg,
      altDeg: this.state.positionAt(target, time).altDeg,
      bortle,
      moonLitPercent: sky.moonIlluminatedPercent,
      moonAltDeg: sky.moonAltDeg,
      equipment: this.state.equipment(),
      kitIds: this.state.equipmentIds(),
    };
  }

  /** A target's entries, oldest first, as the note sheet pages through them. */
  entriesFor(targetId: string): LogEntry[] {
    return this.entries().filter((e) => e.targetId === targetId);
  }

  /** Changes an entry's rating, tags or note. */
  update(id: string, changes: Partial<Pick<LogEntry, 'rating' | 'tags' | 'note' | 'details'>>): void {
    const entry = this.store.get(id);
    if (entry) this.store.save([{ ...entry, ...changes }]);
  }

  /** Deletes an entry. It is kept marked deleted, so Undo can bring it back. */
  remove(id: string): void {
    this.store.remove([id]);
  }

  /** Puts a removed entry back, for Undo. */
  restore(entry: LogEntry): void {
    this.store.save([entry]);
  }

  /**
   * Adds the entries in a backup file, skipping those the log already has, so importing
   * twice is safe. Returns how many were new, once they are saved on the device, so the
   * app can't be closed between "Imported" and the entries being kept. Throws a readable
   * error for a bad file.
   */
  async import(text: string): Promise<number> {
    // A backup made before ids were UUIDs gets the same UUIDs as the log got, so it still matches.
    const imported = parseLogJson(text).map((entry) => ({ ...entry, id: logEntryUuid(entry.id) }));
    const fresh = mergeEntries(this.entries(), imported).slice(this.entries().length);
    await this.store.save(fresh);
    return fresh.length;
  }

  /** Saves the log as a spreadsheet file in the phone's downloads. */
  exportCsv(): void {
    this.download(exportLogCsv(this.entries()), logFileName('csv'), 'text/csv');
  }

  /** Saves the whole log as a backup file, which Import reads back. */
  exportJson(): void {
    this.download(exportLogJson(this.entries()), logFileName('json'), 'application/json');
  }

  /**
   * Saves the log as OpenAstronomyLog, for other observing programs and DeepskyLog. The
   * observer's name goes in the file, since those programs match observations by it, and
   * is remembered on this phone for next time.
   */
  exportOal(observer: OalObserver): void {
    saveObserver(observer);
    const targets = new Map(this.state.targets().map((target) => [target.id, target]));
    this.download(exportLogOal(this.entries(), targets, observer, this.state.kit()), oalFileName(), 'application/xml');
  }

  /** The observer's name used for the last OAL export, to fill in next time. */
  lastObserver(): OalObserver {
    try {
      const saved = JSON.parse(localStorage.getItem(OBSERVER_KEY) ?? '{}') as Partial<OalObserver>;
      return { name: saved.name ?? '', surname: saved.surname ?? '' };
    } catch {
      return { name: '', surname: '' };
    }
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
}

/** Where the observer's name for OAL files is remembered. This phone only, like the settings. */
const OBSERVER_KEY = 'astroturbomaxisolver.observer';

function saveObserver(observer: OalObserver): void {
  try {
    localStorage.setItem(OBSERVER_KEY, JSON.stringify(observer));
  } catch {
    // Storage may be blocked: the name is then asked for again next time.
  }
}
