// A full backup of what the user keeps in the app, as one zip file to save and restore:
// the log, lists and kit from the database, with their sync bookkeeping, and this device's
// preferences. Plain code with no Angular, so it can be tested; backup.service.ts reads and
// writes the database and the preferences.
//
// The zip holds:
//   backup.json      what the file is: its format and version, when and by which app
//   logEntry.json    one file per kind of record, as the database keeps them,
//   list.json        deleted ones too, so a deletion isn't undone by a restore
//   listItem.json
//   kit.json
//   conflicts.json   log entry versions a sync set aside, so none is lost
//   preferences.json this device's choices, by localStorage key
// Zipped with fflate (MIT).

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { t } from '../i18n/t';
import type { RecordType } from '../sync/sync-engine';
import { isValidChange, RECORD_TYPES } from '../sync/sync-engine';
import type { AnyRecord } from '../sync/sync-merge';

import type { ConflictRow } from './local-db';

/** Marks a backup as ours, so restoring something else fails clearly. */
const FORMAT = 'astroturbomaxisolver-backup';
/** This version's backups. A newer one is refused rather than half read. */
export const BACKUP_VERSION = 1;

/**
 * The preferences a backup keeps: this device's settings and view choices. Not the weather
 * cache, the drive connection, tonight's alignment, or data from before the database.
 */
export const BACKUP_PREFERENCES = [
  'astroturbomaxisolver.settings',
  'astroturbomaxisolver.listSorts',
  'astroturbomaxisolver.listChart',
  'astroturbomaxisolver.programsRead',
  'astroturbomaxisolver.observer',
] as const;

/** What a backup holds. */
export interface BackupContent {
  /** When it was made, in milliseconds. */
  createdAt: number;
  /** The app version that made it, such as "0.0.1 · 7e07fbd". */
  app: string;
  records: Record<RecordType, AnyRecord[]>;
  conflicts: ConflictRow[];
  /** Each preference's saved text, by localStorage key. */
  preferences: Record<string, string>;
}

/** The backup's file name, with its date: "astroturbomaxisolver-backup-2026-11-19.zip". */
export function backupFileName(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `astroturbomaxisolver-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.zip`;
}

/** The zip file of a backup. */
export function buildBackup(content: BackupContent): Uint8Array {
  const json = (value: unknown): Uint8Array => strToU8(JSON.stringify(value, null, 1));
  const files: Record<string, Uint8Array> = {
    'backup.json': json({ format: FORMAT, version: BACKUP_VERSION, createdAt: content.createdAt, app: content.app }),
    'conflicts.json': json(content.conflicts),
    'preferences.json': json(content.preferences),
  };
  for (const type of RECORD_TYPES) files[`${type}.json`] = json(content.records[type]);
  return zipSync(files);
}

/**
 * Reads a backup's zip file. Throws, with a message for the user, if it isn't one of ours or
 * is from a newer version. Records whose hash doesn't match their content are left out, so a
 * damaged or edited file can't spoil the tables.
 */
export function readBackup(bytes: Uint8Array): BackupContent {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error(t('backup.notOurs'));
  }
  const json = (name: string): unknown => {
    const file = files[name];
    if (!file) return undefined;
    try {
      return JSON.parse(strFromU8(file));
    } catch {
      throw new Error(t('backup.damaged'));
    }
  };
  const header = json('backup.json') as { format?: unknown; version?: unknown; createdAt?: unknown; app?: unknown };
  if (!header || header.format !== FORMAT) throw new Error(t('backup.notOurs'));
  if (typeof header.version !== 'number' || header.version > BACKUP_VERSION) throw new Error(t('backup.newer'));

  const records = {} as Record<RecordType, AnyRecord[]>;
  for (const type of RECORD_TYPES) {
    const list = json(`${type}.json`);
    records[type] = (Array.isArray(list) ? list : [])
      .filter((record) => isValidChange({ type, record }))
      // Restored on this device: to send through sync like any change made here.
      .map((record: AnyRecord) => ({ ...record, pending: 1 }));
  }
  const conflicts = json('conflicts.json');
  const preferences = json('preferences.json');
  return {
    createdAt: typeof header.createdAt === 'number' ? header.createdAt : 0,
    app: typeof header.app === 'string' ? header.app : '',
    records,
    conflicts: Array.isArray(conflicts) ? (conflicts as ConflictRow[]) : [],
    // Only the preferences a backup keeps, and only as text, as localStorage holds them.
    preferences: Object.fromEntries(
      Object.entries(isObject(preferences) ? preferences : {}).filter(
        ([key, value]) => (BACKUP_PREFERENCES as readonly string[]).includes(key) && typeof value === 'string',
      ),
    ) as Record<string, string>,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
