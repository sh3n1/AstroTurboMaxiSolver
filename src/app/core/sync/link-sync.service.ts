// Runs link sync (link-sync.ts): the user's log, lists and kit, synced straight between two
// phones linked for Two phones, when both have "Sync over Two phones link" on in Settings.
// The link itself is RemoteService's; this only uses its data hooks.

import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { liveQuery } from 'dexie';

import { AppState } from '../app-state.service';
import { RemoteService } from '../remote/remote.service';
import { LocalDb } from '../storage/local-db';
import { revId } from '../storage/sync-record';

import type { DataMessage } from './link-sync';
import { manifestMessages, receivedChanges, recordKey, recordMessages, recordsToSend } from './link-sync';
import type { Change } from './sync-engine';
import { RECORD_TYPES } from './sync-engine';
import { DexieSyncLocal } from './sync-local-db';

@Injectable({ providedIn: 'root' })
export class LinkSyncService {
  private readonly remote = inject(RemoteService);
  private readonly state = inject(AppState);
  private readonly localDb = inject(LocalDb);

  /** Whether the other phone has link sync on, as it last said. */
  private readonly peerOn = signal(false);

  /** Whether the phones are syncing: linked, and both have it on. */
  readonly active = computed(
    () => this.remote.status() === 'connected' && this.state.settings().linkSync && this.peerOn(),
  );

  /** Every record here, as last read, deleted ones too. */
  private records: Change[] = [];
  /** The revision the other phone has of each record, by key, as far as is known. */
  private readonly peerHas = new Map<string, string>();
  /** The other phone's manifest, as it arrives in parts. */
  private incoming: [string, string][] = [];
  /** Whether the other phone's whole manifest has come, so changes can go one by one. */
  private exchanged = false;

  constructor() {
    this.remote.dataHandler = (message) => this.receive(message);

    // Tells the other phone whether this one has it on: once linked, and on every change.
    effect(() => {
      const linked = this.remote.status() === 'connected';
      const on = this.state.settings().linkSync;
      untracked(() => {
        if (!linked) {
          this.peerOn.set(false);
          this.reset();
          return;
        }
        this.remote.sendData({ t: 'dataOn', on });
        if (!on) this.reset();
        else if (this.peerOn()) this.startExchange();
      });
    });

    void this.watchRecords();
  }

  private receive(message: DataMessage): void {
    switch (message.t) {
      case 'dataOn': {
        this.peerOn.set(message.on);
        if (this.active()) this.startExchange();
        else this.reset();
        break;
      }
      case 'dataManifest': {
        if (!this.active()) return;
        for (const [type, id, rev] of message.entries) this.incoming.push([recordKey(type, id), rev]);
        if (message.last) {
          for (const [key, rev] of this.incoming) this.peerHas.set(key, rev);
          this.incoming = [];
          this.exchanged = true;
          this.sendNews();
        }
        break;
      }
      case 'dataRecords': {
        if (!this.active()) return;
        void this.merge(receivedChanges(message));
        break;
      }
    }
  }

  /** Starts over: sends this phone's manifest, so the other one can tell what to send. */
  private startExchange(): void {
    this.reset();
    for (const part of manifestMessages(this.records)) this.remote.sendData(part);
  }

  /** Forgets what the other phone has, for a new exchange or once sync stops. */
  private reset(): void {
    this.peerHas.clear();
    this.incoming = [];
    this.exchanged = false;
  }

  /** Sends the records the other phone doesn't have in their latest revision here. */
  private sendNews(): void {
    if (!this.active() || !this.exchanged) return;
    const news = recordsToSend(this.records, this.peerHas);
    for (const { type, record } of news) this.peerHas.set(recordKey(type, record.id), revId(record));
    for (const part of recordMessages(news)) this.remote.sendData(part);
  }

  /** Merges records from the other phone, as a drive sync would. */
  private async merge(changes: Change[]): Promise<void> {
    // The other phone has these revisions, whatever this one keeps.
    for (const { type, record } of changes) this.peerHas.set(recordKey(type, record.id), revId(record));
    const db = await this.localDb.open();
    if (!db) return;
    const local = new DexieSyncLocal(db, this.localDb.deviceId);
    for (const type of RECORD_TYPES) {
      const records = changes.filter((c) => c.type === type).map((c) => c.record);
      if (records.length > 0) await local.apply(type, records);
    }
  }

  /** Keeps the records read, and sends each change to the other phone as it happens. */
  private async watchRecords(): Promise<void> {
    const db = await this.localDb.open();
    if (!db) return;
    const tables = { logEntry: db.logEntries, list: db.lists, listItem: db.listItems, kit: db.kit } as const;
    liveQuery(async () => {
      const all: Change[] = [];
      for (const type of RECORD_TYPES) {
        const rows = (await tables[type].toArray()) as unknown as Change['record'][];
        all.push(...rows.map((record) => ({ type, record })));
      }
      return all;
    }).subscribe((all) => {
      this.records = all;
      this.sendNews();
    });
  }
}
