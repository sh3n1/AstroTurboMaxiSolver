import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import type { RecordType } from '../sync/sync-engine';
import type { AnyRecord } from '../sync/sync-merge';

import type { BackupContent } from './backup';
import { BACKUP_VERSION, backupFileName, buildBackup, readBackup } from './backup';
import { createRecord, deleteRecord, newUuid } from './sync-record';

const DEVICE = newUuid();

/** A backup with an entry, a deleted list, and a preference. */
function content(): BackupContent {
  const entry = createRecord({ id: newUuid(), note: 'M31' }, DEVICE, 1000);
  const list = deleteRecord(createRecord({ id: newUuid(), name: 'Doubles' }, DEVICE, 1000), DEVICE, 2000)!;
  const records: Record<RecordType, AnyRecord[]> = {
    logEntry: [{ ...entry, pending: 0 }] as AnyRecord[],
    list: [{ ...list, pending: 0 }] as AnyRecord[],
    listItem: [],
    kit: [],
  };
  return {
    createdAt: 1_790_000_000_000,
    app: '0.0.1 · abc1234',
    records,
    conflicts: [],
    preferences: { 'astroturbomaxisolver.settings': '{"textSize":"large"}' },
  };
}

describe('backup', () => {
  it('names the file by its date', () => {
    expect(backupFileName(new Date(2026, 10, 19))).toBe('astroturbomaxisolver-backup-2026-11-19.zip');
  });

  it('reads back what it saved, deletions too, marked to send through sync', () => {
    const saved = content();
    const read = readBackup(buildBackup(saved));
    expect(read.createdAt).toBe(saved.createdAt);
    expect(read.app).toBe('0.0.1 · abc1234');
    expect(read.records.logEntry.map((r) => r.id)).toEqual(saved.records.logEntry.map((r) => r.id));
    expect(read.records.list[0].deletedAt).toBe(2000);
    expect(read.records.logEntry[0].pending).toBe(1);
    expect(read.preferences).toEqual(saved.preferences);
  });

  it('leaves out records whose content was changed by hand, and unknown preferences', () => {
    const saved = content();
    const tampered = { ...saved.records.logEntry[0], note: 'changed' } as AnyRecord;
    const zip = zipSync({
      'backup.json': strToU8(JSON.stringify({ format: 'astroturbomaxisolver-backup', version: 1, createdAt: 1 })),
      'logEntry.json': strToU8(JSON.stringify([tampered, saved.records.list[0]])),
      'preferences.json': strToU8(JSON.stringify({ 'astroturbomaxisolver.sync': '{}', other: 'x' })),
    });
    const read = readBackup(zip);
    // The changed one is left out; the untouched one stays.
    expect(read.records.logEntry.map((r) => r.id)).toEqual([saved.records.list[0].id]);
    expect(read.preferences).toEqual({});
  });

  it('refuses a file that is not a backup, and one from a newer version', () => {
    expect(() => readBackup(strToU8('not a zip'))).toThrow('AstroTurboMaxiSolver');
    expect(() => readBackup(zipSync({ 'other.json': strToU8('{}') }))).toThrow('AstroTurboMaxiSolver');
    const newer = zipSync({
      'backup.json': strToU8(
        JSON.stringify({ format: 'astroturbomaxisolver-backup', version: BACKUP_VERSION + 1, createdAt: 1 }),
      ),
    });
    expect(() => readBackup(newer)).toThrow('newer version');
  });
});
