// Syncing the user's log, lists and kit through their cloud drive, for the whole app: when to
// sync, and how it went, for Settings and the map. The sync itself is sync-engine.ts; the
// drive is a SyncProvider, Google Drive for now. The design is in docs/sync-plan.md.
//
// When: on connecting, on a tap, a little after each change, when the app comes back into
// view, and every few minutes while it is open, all only while the drive's access is valid.
// When it has run out (Google's after an hour, or once the app restarts), the next sync
// waits for a tap.

import { computed, inject, Injectable, signal } from '@angular/core';
import { liveQuery } from 'dexie';

import { LocalDb } from '../storage/local-db';

import { GoogleDriveProvider } from './google-drive-provider';
import { GOOGLE_CLIENT_ID } from './sync-config';
import type { SyncResult } from './sync-engine';
import { runSync } from './sync-engine';
import { DexieSyncLocal } from './sync-local-db';
import type { SyncProvider, SyncProviderId } from './sync-provider';
import { NeedsSignInError } from './sync-provider';

/** What this device remembers about sync, in localStorage: which drive, and the last sync. */
const STORAGE_KEY = 'astroturbomaxisolver.sync';
interface SavedSync {
  provider: SyncProviderId;
  lastSyncAt: number | null;
}

/** How long after a change the sync waits, so a burst of edits goes in one change file. */
const AFTER_CHANGE_MS = 20_000;
/** How often an open app looks for other devices' changes. */
const EVERY_MS = 10 * 60_000;
/** After this long without a sync, the map offers one with a tap. */
const STALE_MS = 6 * 3_600_000;

/** Where sync stands. */
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'needs-tap' | 'error';

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly localDb = inject(LocalDb);
  private readonly provider: SyncProvider = new GoogleDriveProvider(GOOGLE_CLIENT_ID);

  readonly status = signal<SyncStatus>('off');
  /** When the last sync finished, by this device's clock. */
  readonly lastSyncAt = signal<number | null>(null);
  /** What the last sync did. */
  readonly lastResult = signal<SyncResult | null>(null);
  /** How many records changed here and aren't sent yet. */
  readonly pending = signal(0);

  /** The drive's name, as shown in Settings. */
  readonly providerName = this.provider.name;
  readonly connected = computed(() => this.status() !== 'off');

  /**
   * Whether the map offers a sync: connected, the access has run out, and there is something
   * to send or it has been a while.
   */
  readonly offerTap = computed(() => {
    if (this.status() !== 'needs-tap') return false;
    const last = this.lastSyncAt();
    return this.pending() > 0 || last === null || Date.now() - last > STALE_MS;
  });

  private changeTimer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;

  constructor() {
    const saved = readSaved();
    if (saved) {
      this.lastSyncAt.set(saved.lastSyncAt);
      // The access doesn't survive a restart: the first sync needs a tap.
      this.status.set('needs-tap');
      this.provider.preload();
    }
    void this.watchPending();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.syncIfReady();
    });
    window.addEventListener('online', () => this.syncIfReady());
    setInterval(() => this.syncIfReady(), EVERY_MS);
  }

  /** Connects the drive, from a tap: signs in, then syncs. Rejects if the user says no. */
  async connect(): Promise<void> {
    await this.provider.connect();
    writeSaved({ provider: this.provider.id, lastSyncAt: this.lastSyncAt() });
    this.status.set('idle');
    await this.syncNow();
  }

  /** Stops syncing on this device and forgets the access. What is on the drive stays. */
  async disconnect(): Promise<void> {
    clearTimeout(this.changeTimer);
    await this.provider.disconnect();
    writeSaved(null);
    this.lastSyncAt.set(null);
    this.lastResult.set(null);
    this.status.set('off');
  }

  /**
   * Syncs now. From a tap, an access that has run out is renewed first, which may open the
   * drive's window for a moment. Never rejects: how it went is in `status`.
   */
  syncNow(fromTap = false): Promise<void> {
    if (this.status() === 'off') return Promise.resolve();
    return (this.running ??= this.run(fromTap).finally(() => (this.running = null)));
  }

  private async run(fromTap: boolean): Promise<void> {
    if (!this.provider.ready()) {
      if (!fromTap) {
        this.status.set('needs-tap');
        return;
      }
      try {
        await this.provider.connect();
      } catch {
        this.status.set('needs-tap');
        return;
      }
    }
    this.status.set('syncing');
    try {
      const db = await this.localDb.open();
      if (!db) throw new Error('The database is not available');
      const result = await runSync(this.provider.storage, new DexieSyncLocal(db, this.localDb.deviceId));
      const now = Date.now();
      this.lastResult.set(result);
      this.lastSyncAt.set(now);
      writeSaved({ provider: this.provider.id, lastSyncAt: now });
      this.status.set('idle');
    } catch (error) {
      if (error instanceof NeedsSignInError) {
        this.status.set('needs-tap');
      } else {
        console.error('Sync failed', error);
        this.status.set('error');
      }
    }
  }

  /** Syncs if connected and the access is still valid; otherwise leaves it for a tap. */
  private syncIfReady(): void {
    if (this.connected() && this.provider.ready()) void this.syncNow();
  }

  /** Counts the records waiting to be sent, and syncs a little after each change. */
  private async watchPending(): Promise<void> {
    const db = await this.localDb.open();
    if (!db) return;
    const tables = [db.logEntries, db.lists, db.listItems, db.kit];
    liveQuery(async () => {
      let count = 0;
      for (const table of tables) count += await table.where('pending').equals(1).count();
      return count;
    }).subscribe((count) => {
      this.pending.set(count);
      if (count > 0 && this.connected() && this.provider.ready()) {
        clearTimeout(this.changeTimer);
        this.changeTimer = setTimeout(() => this.syncIfReady(), AFTER_CHANGE_MS);
      }
    });
  }
}

function readSaved(): SavedSync | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SavedSync | null;
    return saved?.provider === 'google' ? saved : null;
  } catch {
    return null;
  }
}

function writeSaved(saved: SavedSync | null): void {
  try {
    if (saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage: sync works until the app closes.
  }
}
