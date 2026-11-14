// The database on the device, in IndexedDB through Dexie (Apache-2.0). It keeps what
// belongs to the user and will sync between their devices: the observing log, their lists
// and their equipment kit. Settings for this device stay in localStorage: they are small
// and read before anything else starts. The design is in docs/local-data.md.

import { Injectable } from '@angular/core';
import Dexie from 'dexie';
import type { Table, Transaction } from 'dexie';

import type { KitRecord, KitSelection } from './equipment';
import type { LogEntry } from './observing-log';
import type { OldData } from './storage-migration';
import { OLD_KEYS, recordsFromOldStorage, withUuids } from './storage-migration';
import { newUuid } from './sync-record';
import type { Synced } from './sync-record';
import type { ListItem, ListRecord } from './target-lists';

/** A setting of the database itself, such as this device's id. */
interface MetaRow {
  key: string;
  value: unknown;
}

/** How long opening may take before the app starts without the database, rather than hang. */
const OPEN_TIMEOUT_MS = 4000;

/** The tables, and the fields each is indexed by. The first field is the primary key. */
export class AstroFinderDb extends Dexie {
  meta!: Table<MetaRow, string>;
  logEntries!: Table<Synced<LogEntry>, string>;
  lists!: Table<Synced<ListRecord>, string>;
  listItems!: Table<Synced<ListItem>, string>;
  kit!: Table<Synced<KitRecord>, string>;

  constructor() {
    super('astrofinder');
    // A change to the tables or indexes needs a new version here, with an upgrade if data
    // must change. Never edit a version that has been released.
    this.version(1).stores({
      meta: 'key',
      logEntries: 'id, targetId, time, updatedAt, pending',
      lists: 'id, updatedAt, pending',
      listItems: 'id, listId, targetId, updatedAt, pending',
    });
    // The equipment kit joins, and every id becomes a UUID.
    this.version(2)
      .stores({ kit: 'id, kind, updatedAt, pending' })
      .upgrade((tx) => upgradeToUuids(tx));
  }
}

/** Gives every record in version 1's tables a UUID id, replacing those with older ids. */
async function upgradeToUuids(tx: Transaction): Promise<void> {
  const tables = ['logEntries', 'lists', 'listItems'] as const;
  const before = {
    logEntries: await tx.table('logEntries').toArray(),
    lists: await tx.table('lists').toArray(),
    listItems: await tx.table('listItems').toArray(),
  };
  const after = withUuids(before);
  for (const name of tables) {
    const table = tx.table(name);
    await table.bulkDelete(before[name].map((r: { id: string }) => r.id));
    await table.bulkPut(after[name]);
  }
}

/** Gives the promise's result, or the fallback if it takes too long. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/** Reads localStorage, which can be blocked. */
function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Opens the database once, for every store that uses it. Where IndexedDB is missing or
 * broken, the app still runs, keeping changes in memory until it closes.
 */
@Injectable({ providedIn: 'root' })
export class LocalDb {
  /**
   * This device's id, written in each record it changes, so a sync can tell devices apart.
   * Made on the first start and kept in the database. Until it opens, a temporary one.
   */
  deviceId = newUuid();

  /**
   * The kit selection with the kit's new ids, when the kit has just moved out of the
   * settings. AppState puts it in the settings, and drops the kit from them.
   */
  movedKitSelection: KitSelection | null = null;

  private opening?: Promise<AstroFinderDb | null>;
  private lastTime = 0;
  private persistAsked = false;

  /** The database, or null when it can't be used. Opens it on the first call. */
  open(): Promise<AstroFinderDb | null> {
    return (this.opening ??= withTimeout(this.start(), OPEN_TIMEOUT_MS, null));
  }

  /**
   * The time for a change, in milliseconds. Always later than the one before, even within
   * one millisecond, so records made together keep their order and a sync sees every change.
   */
  now(): number {
    this.lastTime = Math.max(Date.now(), this.lastTime + 1);
    return this.lastTime;
  }

  /** What localStorage held from before the database, for when the database can't be used. */
  oldData(): OldData {
    return recordsFromOldStorage(readLocalStorage, this.deviceId, this.now());
  }

  /**
   * Asks the browser not to clear the app's data when the phone runs short of space, since
   * a log is worth keeping. Once, on the first change. Browsers may say no, and Safari
   * clears a site's data after weeks unused unless it is installed on the home screen.
   */
  async keepData(): Promise<void> {
    if (this.persistAsked) return;
    this.persistAsked = true;
    try {
      if (!(await navigator.storage?.persisted?.())) await navigator.storage?.persist?.();
    } catch {
      // Not available in this browser.
    }
  }

  private async start(): Promise<AstroFinderDb | null> {
    if (typeof indexedDB === 'undefined') return null;
    const db = new AstroFinderDb();
    // A newer version of the app, open in another tab, needs this one to let go before it
    // can change the tables. This version's code wouldn't understand them, so it reloads.
    db.on('versionchange', () => {
      db.close();
      location.reload();
      return false;
    });
    let moved: { logAndLists: boolean; kit: boolean };
    try {
      await db.open();
      moved = await db.transaction('rw', db.tables, () => this.moveOldData(db));
    } catch (error) {
      console.error('The database could not be opened. Changes will not be saved.', error);
      return null;
    }
    // Only once the database has them for sure.
    try {
      if (moved.logAndLists) for (const key of OLD_KEYS) localStorage.removeItem(key);
    } catch {
      // Blocked: they are only read again if the database is lost.
    }
    return db;
  }

  /**
   * Moves what localStorage held into the database, each part once: the log and lists, and
   * the kit from the settings. Says which parts moved now.
   */
  private async moveOldData(db: AstroFinderDb): Promise<{ logAndLists: boolean; kit: boolean }> {
    const device = await db.meta.get('deviceId');
    if (device) this.deviceId = device.value as string;
    else await db.meta.put({ key: 'deviceId', value: this.deviceId });

    const moved = { logAndLists: false, kit: false };
    const needLogAndLists = !(await db.meta.get('migratedFromLocalStorage'));
    const needKit = !(await db.meta.get('migratedKit'));
    if (!needLogAndLists && !needKit) return moved;

    const old = this.oldData();
    if (needLogAndLists) {
      await db.logEntries.bulkPut(old.logEntries);
      await db.lists.bulkPut(old.lists);
      await db.listItems.bulkPut(old.listItems);
      await db.meta.put({ key: 'migratedFromLocalStorage', value: Date.now() });
      moved.logAndLists = true;
    }
    if (needKit) {
      await db.kit.bulkPut(old.kit);
      await db.meta.put({ key: 'migratedKit', value: Date.now() });
      this.movedKitSelection = old.kitSelection;
      moved.kit = true;
    }
    return moved;
  }
}
