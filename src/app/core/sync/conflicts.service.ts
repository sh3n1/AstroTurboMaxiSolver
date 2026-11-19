// Log entries edited on two devices before they synced. The sync keeps one version and sets
// the other aside, so nothing the user wrote is lost silently (see sync-merge.ts); here the
// user sees them, marked in the log, and chooses one on the Conflicts page of Settings.
// Choosing syncs, so the other devices settle the same conflict by themselves.

import { Injectable, computed, inject, signal } from '@angular/core';
import { liveQuery } from 'dexie';

import type { LogEntry } from '../log/observing-log';
import { ObservingLogService } from '../log/observing-log.service';
import type { ConflictRow } from '../storage/local-db';
import { LocalDb } from '../storage/local-db';
import type { Synced } from '../storage/sync-record';

/** A log entry's version set aside by a sync, beside the one in use. */
export interface LogConflict {
  /** The row it is kept in, to remove once settled. */
  key: string;
  entryId: string;
  /** The version in use on this device, or null if it was deleted here. */
  current: LogEntry | null;
  /** The version set aside. */
  other: Synced<LogEntry>;
}

@Injectable({ providedIn: 'root' })
export class ConflictsService {
  private readonly localDb = inject(LocalDb);
  private readonly log = inject(ObservingLogService);

  private readonly rows = signal<readonly ConflictRow[]>([]);

  /** Each conflict, with the version in use beside the one set aside, oldest first. */
  readonly conflicts = computed<LogConflict[]>(() => {
    const entries = new Map(this.log.entries().map((entry) => [entry.id, entry]));
    return this.rows()
      .filter((row) => row.type === 'logEntry')
      .sort((a, b) => a.foundAt - b.foundAt)
      .map((row) => ({
        key: row.key,
        entryId: row.recordId,
        current: entries.get(row.recordId) ?? null,
        other: row.record as Synced<LogEntry>,
      }));
  });

  /** The entries with a version set aside, for the "edited on two phones" mark. */
  readonly entryIds = computed(() => new Set(this.conflicts().map((conflict) => conflict.entryId)));

  constructor() {
    void this.watch();
  }

  /** Keeps this device's version, or uses the other one, and drops the one not chosen. */
  async settle(conflict: LogConflict, keep: 'current' | 'other'): Promise<void> {
    await this.log.settleConflict(conflict.entryId, conflict.other, keep);
    const db = await this.localDb.open();
    await db?.conflicts.delete(conflict.key);
  }

  /** Follows the conflicts table, which syncs add to and settling empties. */
  private async watch(): Promise<void> {
    const db = await this.localDb.open();
    if (!db) return;
    liveQuery(() => db.conflicts.toArray()).subscribe({
      next: (rows) => this.rows.set(rows),
      error: (error) => console.error('Could not read the sync conflicts', error),
    });
  }
}
