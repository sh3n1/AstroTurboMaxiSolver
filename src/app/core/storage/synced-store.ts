// One database table, kept in a signal for the pages. Changes show at once and are then
// written to the table in the background. The table is also watched, so a change made
// elsewhere, in another tab or, later, by a sync, reaches the pages too.

import { computed, signal } from '@angular/core';
import { liveQuery } from 'dexie';
import type { Table } from 'dexie';

import type { AstroTurboMaxiSolverDb, LocalDb } from './local-db';
import type { LocalRecords } from './storage-migration';
import { changeRecord, contentOf, createRecord, deleteRecord, settleConflict } from './sync-record';
import type { Synced } from './sync-record';

/** How long the first reading of a table may take before the app starts without it. */
const LOAD_TIMEOUT_MS = 4000;

export class SyncedStore<T extends { id: string }> {
  /** Every record by id, deleted ones too, which are needed to delete and restore. */
  private readonly all = signal<ReadonlyMap<string, Synced<T>>>(new Map());

  /** The records in use, deleted ones left out, with their bookkeeping. */
  readonly records = computed(() => [...this.all().values()].filter((r) => r.deletedAt === null));

  /** The content of the records in use, as the app works with it. */
  readonly items = computed(() => this.records().map(contentOf));

  /** Writes not finished yet. Until they are, what the table holds is older than the signal. */
  private writing = 0;

  /**
   * @param localDb The database.
   * @param tableOf Picks this store's table.
   * @param oldOf Picks this store's records from what localStorage held, used only when the
   *   database can't be opened, so the user still sees what they had.
   */
  constructor(
    private readonly localDb: LocalDb,
    private readonly tableOf: (db: AstroTurboMaxiSolverDb) => Table<Synced<T>, string>,
    private readonly oldOf: (old: LocalRecords) => Synced<T>[],
  ) {}

  /** Reads the table and starts watching it. Resolves once the saved records are in. */
  async load(): Promise<void> {
    const db = await this.localDb.open();
    if (!db) {
      this.merge(this.oldOf(this.localDb.oldData()));
      return;
    }
    const table = this.tableOf(db);
    let first = true;
    const loaded = new Promise<void>((resolve) => {
      liveQuery(() => table.toArray()).subscribe({
        next: (rows) => {
          if (first) {
            // Anything changed before the table was read is newer, so it is kept.
            first = false;
            this.all.set(new Map([...rows.map((r) => [r.id, r] as const), ...this.all()]));
          } else if (this.writing === 0) {
            // While this tab is writing, the table may not have its own changes yet.
            this.all.set(new Map(rows.map((r) => [r.id, r])));
          }
          resolve();
        },
        error: (error) => {
          console.error('Could not read the saved data', error);
          resolve();
        },
      });
    });
    return Promise.race([loaded, new Promise<void>((resolve) => setTimeout(resolve, LOAD_TIMEOUT_MS))]);
  }

  /** The item in use with this id, or undefined. */
  get(id: string): T | undefined {
    const record = this.all().get(id);
    return record && record.deletedAt === null ? contentOf(record) : undefined;
  }

  /**
   * Adds or changes items. A deleted item saved again comes back. An item saved unchanged
   * writes nothing, so it doesn't count as a change to sync. The items show at once; the
   * promise settles once they are on the device, for callers that must not leave before.
   */
  save(items: readonly T[]): Promise<void> {
    const now = this.localDb.now();
    const device = this.localDb.deviceId;
    return this.write(
      items.map((item) => {
        const known = this.all().get(item.id);
        return known ? changeRecord(known, item, device, now) : createRecord(item, device, now);
      }),
    );
  }

  /** Marks items deleted. They stay in the table for a sync, and for Undo, which saves them again. */
  remove(ids: readonly string[]): Promise<void> {
    const now = this.localDb.now();
    const device = this.localDb.deviceId;
    return this.write(
      ids.map((id) => {
        const known = this.all().get(id);
        return known ? deleteRecord(known, device, now) : null;
      }),
    );
  }

  /**
   * Settles a sync conflict on a record: keeps this device's version or the other one, as a
   * new revision descending from both, so every device takes it (see settleConflict).
   */
  settle(id: string, other: Synced<T>, keep: 'current' | 'other'): Promise<void> {
    const known = this.all().get(id);
    const settled = known ? settleConflict(known, other, keep, this.localDb.deviceId, this.localDb.now()) : null;
    // With no version here any more, the other one is all there is.
    return this.write([settled ?? { ...other, pending: 1 }]);
  }

  /** Puts records in the signal, as loaded rather than changed. */
  private merge(records: readonly Synced<T>[]): void {
    this.all.update((all) => new Map([...all, ...records.map((r) => [r.id, r] as const)]));
  }

  /**
   * Shows the changes at once, then saves them, settling once saved. A failed save keeps
   * them until the app closes.
   */
  private write(changes: readonly (Synced<T> | null)[]): Promise<void> {
    const changed = changes.filter((c): c is Synced<T> => c !== null);
    if (changed.length === 0) return Promise.resolve();
    this.merge(changed);
    return this.persist(changed);
  }

  private async persist(records: readonly Synced<T>[]): Promise<void> {
    this.writing++;
    try {
      const db = await this.localDb.open();
      if (!db) return;
      await this.tableOf(db).bulkPut([...records]);
      void this.localDb.keepData();
    } catch (error) {
      console.error('Could not save a change', error);
    } finally {
      this.writing--;
    }
  }
}
