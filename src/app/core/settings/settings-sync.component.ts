import { Component, computed, inject } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonToggle, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudOutline, logOutOutline, phonePortraitOutline, syncOutline } from 'ionicons/icons';

import { AppState } from '../app-state.service';
import { listToastPlace } from '../lists/list-toast';
import { LinkSyncService } from '../sync/link-sync.service';
import { SyncService } from '../sync/sync.service';

import { SETTINGS_SECTION_STYLES } from './settings-styles';

/** Syncing the log, lists and kit through the user's Google Drive, as a section of Settings. */
@Component({
  selector: 'app-settings-sync',
  imports: [IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonToggle],
  styles: [SETTINGS_SECTION_STYLES],
  template: `
    <ion-list inset="true" id="sync" data-testid="sync">
      <ion-list-header>Sync</ion-list-header>
      @if (!sync.connected()) {
        <ion-item button detail="false" data-testid="sync-connect" (click)="connect()">
          <ion-icon slot="start" name="cloud-outline" aria-hidden="true"></ion-icon>
          <ion-label class="ion-text-wrap">
            <h2>Connect {{ sync.providerName }}</h2>
            <p>Your log, lists and kit on all your devices</p>
          </ion-label>
        </ion-item>
      } @else {
        <ion-item
          button
          detail="false"
          data-testid="sync-now"
          [disabled]="sync.status() === 'syncing'"
          (click)="sync.syncNow(true)"
        >
          <ion-icon slot="start" name="sync-outline" aria-hidden="true"></ion-icon>
          <ion-label class="ion-text-wrap">
            <h2>Sync now</h2>
            <p data-testid="sync-status" [class.warn]="sync.status() === 'error'">{{ statusText() }}</p>
          </ion-label>
        </ion-item>
        <ion-item button detail="false" data-testid="sync-disconnect" (click)="sync.disconnect()">
          <ion-icon slot="start" name="log-out-outline" aria-hidden="true"></ion-icon>
          <ion-label class="ion-text-wrap">
            <h2>Disconnect {{ sync.providerName }}</h2>
            <p>What is there stays there</p>
          </ion-label>
        </ion-item>
      }
      <!-- Straight between two phones linked in Two phones, with no drive. Both must have it on. -->
      <ion-item>
        <ion-icon slot="start" name="phone-portrait-outline" aria-hidden="true"></ion-icon>
        <ion-toggle
          data-testid="link-sync"
          [checked]="state.settings().linkSync"
          (ionChange)="state.updateSettings({ linkSync: $any($event).detail.checked })"
        >
          Sync over Two phones link
        </ion-toggle>
      </ion-item>
      @if (linkSync.active()) {
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">
            <p class="good" data-testid="link-sync-active">Syncing over Two phones link</p>
          </ion-label>
        </ion-item>
      }
    </ion-list>
  `,
})
export class SettingsSyncComponent {
  protected readonly sync = inject(SyncService);
  protected readonly linkSync = inject(LinkSyncService);
  protected readonly state = inject(AppState);
  private readonly toasts = inject(ToastController);

  /** Where sync stands, in a few words. */
  protected readonly statusText = computed(() => {
    switch (this.sync.status()) {
      case 'syncing':
        return 'Syncing…';
      case 'needs-tap':
        return 'Tap to sync';
      case 'error':
        return 'Couldn’t sync. Check the connection.';
      default: {
        const last = this.sync.lastSyncAt();
        return last ? `Synced ${formatWhen(last)}` : 'Not synced yet';
      }
    }
  });

  /** Signs in to the drive, from this tap, then syncs. Says so if it didn't work. */
  protected async connect(): Promise<void> {
    try {
      await this.sync.connect();
    } catch {
      const toast = await this.toasts.create({
        message: `Couldn’t connect ${this.sync.providerName}`,
        duration: 4000,
        ...listToastPlace(),
        cssClass: 'af-toast',
        htmlAttributes: { 'data-testid': 'sync-failed-toast' },
      });
      await toast.present();
    }
  }

  constructor() {
    addIcons({ cloudOutline, logOutOutline, phonePortraitOutline, syncOutline });
  }
}

/** A time as "at 21:30" today, or with its date on an earlier day. */
function formatWhen(time: number): string {
  const date = new Date(time);
  const clock = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return `at ${clock}`;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${clock}`;
}
