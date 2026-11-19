import { describe, expect, it } from 'vitest';

import {
  changeRecord,
  contentOf,
  createRecord,
  deleteRecord,
  newUuid,
  revId,
  settleConflict,
} from '../storage/sync-record';
import type { Synced } from '../storage/sync-record';

import { MemorySyncStorage } from './memory-sync-storage';
import { changeFileName, parseChangeFile, RECORD_TYPES, runSync } from './sync-engine';
import type { Change, RecordType, SyncLocal } from './sync-engine';
import { mergeBatch } from './sync-merge';
import type { AnyRecord } from './sync-merge';
import { COMPACT_AFTER, snapshotFileName, TOMBSTONE_KEEP_MS } from './sync-snapshots';

/** A small log-entry-like record. */
interface Note {
  id: string;
  note: string;
}

/** A record's note. */
function noteOf(record: AnyRecord): string {
  return (contentOf(record) as unknown as Note).note;
}

/** A device's database kept in memory, merging as the real one does (sync-local-db.ts). */
class MemoryDevice implements SyncLocal {
  readonly deviceId = newUuid();
  readonly tables = new Map<RecordType, Map<string, AnyRecord>>(RECORD_TYPES.map((t) => [t, new Map()]));
  readonly meta = new Map<string, unknown>();
  readonly losers: AnyRecord[] = [];
  private time = 1000;

  /** Saves a log entry's note, as the app would. */
  write(id: string, note: string): void {
    const table = this.tables.get('logEntry')!;
    const known = table.get(id);
    const now = this.time++;
    const record = known
      ? changeRecord(known as Synced<Note>, { id, note }, this.deviceId, now)
      : createRecord({ id, note }, this.deviceId, now);
    if (record) table.set(id, record);
  }

  delete(id: string): void {
    const table = this.tables.get('logEntry')!;
    table.set(id, deleteRecord(table.get(id)!, this.deviceId, this.time++)!);
  }

  /** A log entry's note, or undefined if it is missing or deleted. */
  note(id: string): string | undefined {
    const record = this.tables.get('logEntry')!.get(id);
    return record && record.deletedAt === null ? noteOf(record) : undefined;
  }

  async pending(): Promise<Change[]> {
    return RECORD_TYPES.flatMap((type) =>
      [...this.tables.get(type)!.values()].filter((r) => r.pending === 1).map((record) => ({ type, record })),
    );
  }

  async markSent(changes: readonly Change[]): Promise<void> {
    for (const { type, record } of changes) {
      const current = this.tables.get(type)!.get(record.id);
      if (current && revId(current) === revId(record))
        this.tables.get(type)!.set(record.id, { ...current, pending: 0 });
    }
  }

  async apply(type: RecordType, records: readonly AnyRecord[]): Promise<{ changed: number; conflicts: number }> {
    const table = this.tables.get(type)!;
    const { writes, losers } = mergeBatch(table, records);
    for (const record of writes) table.set(record.id, record);
    this.losers.push(...losers);
    return { changed: writes.length, conflicts: losers.length };
  }

  async readMeta(key: string): Promise<unknown> {
    return this.meta.get(key);
  }

  async writeMeta(key: string, value: unknown): Promise<void> {
    this.meta.set(key, value);
  }

  async current(type: RecordType, ids: readonly string[]): Promise<Map<string, AnyRecord>> {
    const table = this.tables.get(type)!;
    return new Map(ids.filter((id) => table.has(id)).map((id) => [id, table.get(id)!]));
  }

  async purgeDeleted(before: number): Promise<number> {
    let purged = 0;
    for (const table of this.tables.values()) {
      for (const [id, record] of table) {
        if (record.deletedAt !== null && record.deletedAt < before && record.pending === 0) {
          table.delete(id);
          purged++;
        }
      }
    }
    return purged;
  }
}

const ENTRY = newUuid();

describe('sync engine', () => {
  it('carries a new entry, then an edit, then a deletion, between two devices', async () => {
    const drive = new MemorySyncStorage();
    const phone = new MemoryDevice();
    const tablet = new MemoryDevice();

    phone.write(ENTRY, 'M31 at last');
    expect(await runSync(drive, phone)).toEqual({ sent: 1, received: 0, conflicts: 0 });
    expect(await runSync(drive, tablet)).toEqual({ sent: 0, received: 1, conflicts: 0 });
    expect(tablet.note(ENTRY)).toBe('M31 at last');

    // What the tablet received is not sent back.
    tablet.write(ENTRY, 'M31 and M32');
    expect(await runSync(drive, tablet)).toEqual({ sent: 1, received: 0, conflicts: 0 });
    expect(await runSync(drive, phone)).toEqual({ sent: 0, received: 1, conflicts: 0 });
    expect(phone.note(ENTRY)).toBe('M31 and M32');

    phone.delete(ENTRY);
    await runSync(drive, phone);
    await runSync(drive, tablet);
    expect(tablet.note(ENTRY)).toBeUndefined();
  });

  it('writes only into its own files, numbered in order, and reads each file once', async () => {
    const drive = new MemorySyncStorage();
    const phone = new MemoryDevice();
    const tablet = new MemoryDevice();
    phone.write(ENTRY, 'one');
    await runSync(drive, phone);
    phone.write(ENTRY, 'two');
    await runSync(drive, phone);
    await runSync(drive, phone); // Nothing new: no new file.

    expect([...drive.files.keys()].sort()).toEqual(
      [changeFileName(phone.deviceId, 1), changeFileName(phone.deviceId, 2), `${phone.deviceId}.device.json`].sort(),
    );
    // One write per change file read: the entry, then its edit.
    expect(await runSync(drive, tablet)).toMatchObject({ received: 2 });
    expect(tablet.note(ENTRY)).toBe('two');
    expect(await runSync(drive, tablet)).toMatchObject({ received: 0 });
    expect(tablet.meta.get(`syncRead:${phone.deviceId}`)).toBe(2);
  });

  it('settles an entry edited on two devices the same way on both, keeping the other version', async () => {
    const drive = new MemorySyncStorage();
    const phone = new MemoryDevice();
    const tablet = new MemoryDevice();
    phone.write(ENTRY, 'start');
    await runSync(drive, phone);
    await runSync(drive, tablet);

    phone.write(ENTRY, 'from the garden');
    tablet.write(ENTRY, 'from the roof');
    await runSync(drive, phone);
    expect(await runSync(drive, tablet)).toMatchObject({ sent: 1, conflicts: 1 });
    expect(await runSync(drive, phone)).toMatchObject({ conflicts: 1 });

    expect(phone.note(ENTRY)).toBe(tablet.note(ENTRY));
    const kept = (r: AnyRecord): string => noteOf(r);
    expect(phone.losers.map(kept)).toEqual(tablet.losers.map(kept));
    expect([phone.note(ENTRY), kept(phone.losers[0])].sort()).toEqual(['from the garden', 'from the roof']);
  });

  it('skips damaged files and records whose hash does not match, and leaves newer formats alone', async () => {
    const good = createRecord({ id: ENTRY, note: 'fine' }, 'd', 1);
    const tampered = { ...createRecord({ id: newUuid(), note: 'fine' }, 'd', 1), note: 'changed by hand' };
    const file = (format: number, records: object[]): string =>
      JSON.stringify({ format, changes: records.map((record) => ({ type: 'logEntry', record })) });

    expect(parseChangeFile('{ not json')).toEqual([]);
    expect(parseChangeFile(file(1, [good, tampered, { id: 'x' }]))!.map((c) => c.record.id)).toEqual([ENTRY]);
    expect(parseChangeFile(file(2, [good]))).toBeNull();

    // A newer file stops reading that device, without moving its checkpoint on.
    const drive = new MemorySyncStorage();
    const tablet = new MemoryDevice();
    const other = newUuid();
    drive.files.set(changeFileName(other, 1), file(2, [good]));
    await runSync(drive, tablet);
    expect(tablet.note(ENTRY)).toBeUndefined();
    expect(tablet.meta.get(`syncRead:${other}`)).toBeUndefined();
  });

  it("folds a device's change files into a snapshot, which a new device reads instead", async () => {
    const drive = new MemorySyncStorage();
    const phone = new MemoryDevice();
    const tablet = new MemoryDevice();
    const ids = Array.from({ length: COMPACT_AFTER + 1 }, () => newUuid());
    // One sync per entry, one change file each: one more than are kept.
    for (const [index, id] of ids.entries()) {
      phone.write(id, `entry ${index}`);
      await runSync(drive, phone);
      // The tablet reads along for the first few, then stops.
      if (index === 9) await runSync(drive, tablet);
    }
    phone.delete(ids[0]);
    await runSync(drive, phone);

    // Folded at the file one over the limit; the deletion came in a new file after it.
    const names = [...drive.files.keys()];
    expect(names).toContain(snapshotFileName(phone.deviceId, COMPACT_AFTER + 1));
    expect(names.filter((name) => name.endsWith('.changes.json'))).toEqual([
      changeFileName(phone.deviceId, COMPACT_AFTER + 2),
    ]);

    // A new device gets everything from the snapshot alone.
    const laptop = new MemoryDevice();
    await runSync(drive, laptop);
    expect(laptop.note(ids[1])).toBe('entry 1');
    expect(laptop.note(ids[COMPACT_AFTER])).toBe(`entry ${COMPACT_AFTER}`);
    expect(laptop.note(ids[0])).toBeUndefined();
    // The tablet, part way through the removed files, catches up from it too.
    await runSync(drive, tablet);
    expect(tablet.note(ids[COMPACT_AFTER])).toBe(`entry ${COMPACT_AFTER}`);
    expect(tablet.note(ids[0])).toBeUndefined();
    expect(tablet.meta.get(`syncRead:${phone.deviceId}`)).toBe(COMPACT_AFTER + 2);
  });

  it('reads a listed file that has gone again next time, rather than skip it', async () => {
    const drive = new MemorySyncStorage();
    const phone = new MemoryDevice();
    const tablet = new MemoryDevice();
    phone.write(ENTRY, 'M13');
    await runSync(drive, phone);
    // The file is listed, but reading it finds nothing, as when it is removed meanwhile.
    const read = drive.read.bind(drive);
    drive.read = async (name) => (name.endsWith('.changes.json') ? null : read(name));
    await runSync(drive, tablet);
    expect(tablet.note(ENTRY)).toBeUndefined();
    expect(tablet.meta.get(`syncRead:${phone.deviceId}`)).toBeUndefined();
    drive.read = read;
    await runSync(drive, tablet);
    expect(tablet.note(ENTRY)).toBe('M13');
  });

  it('purges a deletion sent over six months ago, and no sooner', async () => {
    const drive = new MemorySyncStorage();
    const phone = new MemoryDevice();
    phone.write(ENTRY, 'M57');
    phone.delete(ENTRY);
    const deletedAt = phone.tables.get('logEntry')!.get(ENTRY)!.deletedAt!;
    await runSync(drive, phone, deletedAt + 1000);
    await runSync(drive, phone, deletedAt + TOMBSTONE_KEEP_MS - 1000);
    expect(phone.tables.get('logEntry')!.has(ENTRY)).toBe(true);
    // Looked for again a day later, by then old enough.
    await runSync(drive, phone, deletedAt + TOMBSTONE_KEEP_MS + 2 * 24 * 3_600_000);
    expect(phone.tables.get('logEntry')!.has(ENTRY)).toBe(false);
  });

  it('carries a conflict settled on one device to the other, with the version chosen', async () => {
    const drive = new MemorySyncStorage();
    const phone = new MemoryDevice();
    const tablet = new MemoryDevice();
    phone.write(ENTRY, 'start');
    await runSync(drive, phone);
    await runSync(drive, tablet);
    phone.write(ENTRY, 'from the phone');
    tablet.write(ENTRY, 'from the tablet');
    await runSync(drive, phone);
    await runSync(drive, tablet);
    await runSync(drive, phone);
    const table = phone.tables.get('logEntry')!;
    const kept = table.get(ENTRY)!;
    const other = [...phone.losers, ...tablet.losers].find((r) => r.hash !== kept.hash)!;

    // The phone keeps the other version: a new revision descending from both.
    const settled = settleConflict(kept, other, 'other', phone.deviceId, 5000);
    table.set(ENTRY, settled);
    expect(settled.history).toEqual(expect.arrayContaining([revId(kept), revId(other)]));
    await runSync(drive, phone);
    await runSync(drive, tablet);
    expect(tablet.note(ENTRY)).toBe(noteOf(other));
    expect(phone.note(ENTRY)).toBe(noteOf(other));
  });
});
