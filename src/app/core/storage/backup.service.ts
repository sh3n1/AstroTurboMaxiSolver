// Saving and restoring a full backup, from Settings: see backup.ts for what it holds.

import { Injectable, inject } from '@angular/core';

import { RECORD_TYPES } from '../sync/sync-engine';
import type { RecordType } from '../sync/sync-engine';
import { DexieSyncLocal } from '../sync/sync-local-db';
import type { AnyRecord } from '../sync/sync-merge';

import type { BackupContent } from './backup';
import { BACKUP_PREFERENCES, backupFileName, buildBackup, readBackup } from './backup';
import type { AstroTurboMaxiSolverDb } from './local-db';
import { LocalDb } from './local-db';

/** What a restore did, for its message. */
export interface RestoreResult {
  /** Records added or changed, of every kind. */
  changed: number;
  /** Versions set aside, where the backup and this device differ. */
  conflicts: number;
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly localDb = inject(LocalDb);

  /** Saves every record and this device's preferences as one zip file, downloaded. */
  async save(): Promise<void> {
    const db = await this.database();
    const records = {} as Record<RecordType, AnyRecord[]>;
    for (const type of RECORD_TYPES) records[type] = (await tableOf(db, type).toArray()) as AnyRecord[];
    const content: BackupContent = {
      createdAt: Date.now(),
      app: await appVersion(),
      records,
      conflicts: await db.conflicts.toArray(),
      preferences: readPreferences(),
    };
    download(buildBackup(content), backupFileName(new Date()));
  }

  /** Reads a backup file, without changing anything yet, so the user can confirm first. */
  async read(file: Blob): Promise<BackupContent> {
    return readBackup(new Uint8Array(await file.arrayBuffer()));
  }

  /**
   * Restores a backup: its records merge with this device's, as a sync would, so nothing newer
   * here is lost, and its preferences replace this device's. The app reloads afterwards, so
   * every page starts from what was restored.
   */
  async restore(content: BackupContent): Promise<RestoreResult> {
    const db = await this.database();
    const local = new DexieSyncLocal(db, this.localDb.deviceId);
    const result: RestoreResult = { changed: 0, conflicts: 0 };
    for (const type of RECORD_TYPES) {
      if (content.records[type].length === 0) continue;
      const done = await local.restore(type, content.records[type]);
      result.changed += done.changed;
      result.conflicts += done.conflicts;
    }
    // The versions a sync set aside on the backed-up device, which the user hasn't settled.
    await db.conflicts.bulkPut(content.conflicts);
    for (const [key, value] of Object.entries(content.preferences)) localStorage.setItem(key, value);
    return result;
  }

  private async database(): Promise<AstroTurboMaxiSolverDb> {
    const db = await this.localDb.open();
    if (!db) throw new Error('The database is not available');
    return db;
  }
}

/** A table, by the kind of record it holds. */
function tableOf(db: AstroTurboMaxiSolverDb, type: RecordType): { toArray(): Promise<unknown[]> } {
  return { logEntry: db.logEntries, list: db.lists, listItem: db.listItems, kit: db.kit }[type];
}

/** The preferences a backup keeps, as localStorage holds them. */
function readPreferences(): Record<string, string> {
  const preferences: Record<string, string> = {};
  for (const key of BACKUP_PREFERENCES) {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) preferences[key] = value;
    } catch {
      // Blocked storage: nothing to keep.
    }
  }
  return preferences;
}

/** This build's version and commit, or "development" under the dev server. */
async function appVersion(): Promise<string> {
  try {
    const response = await fetch('assets/build-info.json');
    if (!response.ok) return 'development';
    const info = (await response.json()) as { version: string; commit: string };
    return `${info.version} · ${info.commit}`;
  } catch {
    return 'development';
  }
}

/** Saves bytes as a file, as the browser downloads one. */
function download(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Give the browser a moment to start the download before freeing the file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
