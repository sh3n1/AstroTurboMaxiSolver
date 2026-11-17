// The sync's view of this device's database (see sync-engine.ts for the SyncLocal it
// implements). Every read and write that must not be interleaved with the user's own edits
// runs in one Dexie transaction, so an edit made while a sync is running is never lost.

import type { Table } from 'dexie';

import type { AstroTurboMaxiSolverDb } from '../local-db';
import { revId } from '../sync-record';

import type { Change, RecordType, SyncLocal } from './sync-engine';
import { RECORD_TYPES } from './sync-engine';
import { mergeBatch } from './sync-merge';
import type { AnyRecord } from './sync-merge';

/** The record types whose losing versions are kept: losing someone's notes is the worst. */
const KEEP_LOSERS: readonly RecordType[] = ['logEntry'];

export class DexieSyncLocal implements SyncLocal {
  constructor(
    private readonly db: AstroTurboMaxiSolverDb,
    readonly deviceId: string,
    private readonly now: () => number = Date.now,
  ) {}

  async pending(): Promise<Change[]> {
    const changes: Change[] = [];
    for (const type of RECORD_TYPES) {
      const records = await this.table(type).where('pending').equals(1).toArray();
      changes.push(...records.map((record) => ({ type, record })));
    }
    return changes;
  }

  async markSent(changes: readonly Change[]): Promise<void> {
    const tables = RECORD_TYPES.map((type) => this.table(type));
    await this.db.transaction('rw', tables, async () => {
      for (const { type, record } of changes) {
        const current = await this.table(type).get(record.id);
        // Changed again since it was read: it still has to be sent.
        if (current && current.pending === 1 && revId(current) === revId(record)) {
          await this.table(type).update(record.id, { pending: 0 });
        }
      }
    });
  }

  async apply(type: RecordType, records: readonly AnyRecord[]): Promise<{ changed: number; conflicts: number }> {
    const table = this.table(type);
    return this.db.transaction('rw', table, this.db.conflicts, async () => {
      const ids = [...new Set(records.map((r) => r.id))];
      const found = await table.bulkGet(ids);
      const locals = new Map(found.filter((r): r is AnyRecord => !!r).map((r) => [r.id, r]));
      const { writes, losers } = mergeBatch(locals, records);
      await table.bulkPut(writes);
      if (KEEP_LOSERS.includes(type)) {
        const foundAt = this.now();
        await this.db.conflicts.bulkPut(
          losers.map((record) => ({
            key: `${type}/${record.id}/${revId(record)}`,
            type,
            recordId: record.id,
            record,
            foundAt,
          })),
        );
      }
      return { changed: writes.length, conflicts: losers.length };
    });
  }

  async readMeta(key: string): Promise<unknown> {
    return (await this.db.meta.get(key))?.value;
  }

  async writeMeta(key: string, value: unknown): Promise<void> {
    await this.db.meta.put({ key, value });
  }

  /** The table that holds a record type. */
  private table(type: RecordType): Table<AnyRecord, string> {
    const tables: Record<RecordType, Table<AnyRecord, string>> = {
      logEntry: this.db.logEntries as unknown as Table<AnyRecord, string>,
      list: this.db.lists as unknown as Table<AnyRecord, string>,
      listItem: this.db.listItems as unknown as Table<AnyRecord, string>,
      kit: this.db.kit as unknown as Table<AnyRecord, string>,
    };
    return tables[type];
  }
}
