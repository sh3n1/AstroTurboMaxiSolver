import type { ElementRef } from '@angular/core';
import { Component, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  bookmarkOutline,
  cloudDownloadOutline,
  cloudUploadOutline,
  documentTextOutline,
  folderOutline,
  moonOutline,
  sparklesOutline,
} from 'ionicons/icons';

import { ListsService } from '../core/lists.service';
import { FIXED_LISTS } from '../core/target-lists';

/**
 * The Bookmarks tab: the app's own lists (Tonight, Messier and Caldwell), then the
 * user's lists, which they can make, import and export.
 */
@Component({
  selector: 'app-lists',
  imports: [
    IonBadge,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonTitle,
    IonToolbar,
  ],
  styles: `
    ion-list-header {
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      min-height: 32px;
    }
    ion-item > ion-icon[slot='start'] {
      color: var(--ion-color-primary);
      margin-inline-end: 16px;
    }
    ion-label p {
      color: var(--af-muted);
    }
    .hidden-input {
      display: none;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Bookmarks</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Import or export lists" data-testid="lists-transfer" (click)="transfer()">
            <ion-icon slot="icon-only" name="cloud-download-outline" aria-hidden="true"></ion-icon>
          </ion-button>
          <ion-button aria-label="New list" data-testid="new-list" (click)="newList()">
            <ion-icon slot="icon-only" name="add" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- The app's own lists, which always stay as they are. -->
      <ion-list inset="true">
        <ion-list-header>Collections</ion-list-header>
        @for (list of lists.fixedLists(); track list.id; let i = $index) {
          <ion-item button detail="true" data-testid="list-link" (click)="open(list.id)">
            <ion-icon slot="start" aria-hidden="true" [name]="fixed[i].icon"></ion-icon>
            <ion-label>
              <h2>{{ list.name }}</h2>
              <p>{{ fixed[i].description }}</p>
            </ion-label>
            <ion-badge slot="end" color="medium">{{ list.targets.length }}</ion-badge>
          </ion-item>
        }
      </ion-list>

      <!-- The user's lists. Uncategorized is always first and can't be deleted. -->
      <ion-list inset="true">
        <ion-list-header>My lists</ion-list-header>
        @for (list of lists.userLists(); track list.id) {
          <ion-item button detail="true" data-testid="list-link" (click)="open(list.id)">
            <ion-icon
              slot="start"
              aria-hidden="true"
              [name]="list.kind === 'uncategorized' ? 'bookmark-outline' : 'folder-outline'"
            ></ion-icon>
            <ion-label>
              <h2>{{ list.name }}</h2>
            </ion-label>
            <ion-badge slot="end" color="medium">{{ list.targets.length }}</ion-badge>
          </ion-item>
        }
        <ion-item button detail="false" data-testid="new-list-item" (click)="newList()">
          <ion-icon slot="start" name="add" aria-hidden="true"></ion-icon>
          <ion-label>New list…</ion-label>
        </ion-item>
      </ion-list>

      <!-- Opened by the Import action, to pick a list file on the phone. -->
      <input
        #fileInput
        class="hidden-input"
        type="file"
        accept=".json,.txt,application/json,text/plain"
        data-testid="import-file"
        (change)="importFile($event)"
      />
    </ion-content>
  `,
})
export class ListsPage {
  protected readonly lists = inject(ListsService);
  protected readonly fixed = FIXED_LISTS;
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly toasts = inject(ToastController);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  constructor() {
    addIcons({
      add,
      bookmarkOutline,
      cloudDownloadOutline,
      cloudUploadOutline,
      documentTextOutline,
      folderOutline,
      moonOutline,
      sparklesOutline,
    });
  }

  protected open(id: string): void {
    void this.router.navigateByUrl(`/tabs/lists/${id}`);
  }

  protected async newList(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'New list',
      inputs: [{ name: 'name', type: 'text', placeholder: 'For example, Spring galaxies' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Create', handler: ({ name }: { name: string }) => this.open(this.lists.create(name)) },
      ],
    });
    await alert.present();
  }

  /** Import from a file or pasted text, or save every list as a file. */
  protected async transfer(): Promise<void> {
    const sheet = await this.actionSheets.create({
      header: 'Import and export',
      buttons: [
        {
          text: 'Import a list file',
          icon: 'cloud-download-outline',
          handler: () => this.fileInput().nativeElement.click(),
        },
        { text: 'Import pasted text', icon: 'document-text-outline', handler: () => void this.importPasted() },
        { text: 'Export all my lists', icon: 'cloud-upload-outline', handler: () => this.lists.exportAll() },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  protected async importFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Clear the choice, so picking the same file again still imports it.
    input.value = '';
    if (file) this.importText(await file.text());
  }

  /** For lists shared as text, which some phones do instead of sharing a file. */
  private async importPasted(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Import pasted text',
      message: 'Paste the text of a shared AstroFinder list.',
      inputs: [{ name: 'text', type: 'textarea', placeholder: '{ "format": "astrofinder-lists", … }' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Import', handler: ({ text }: { text: string }) => this.importText(text) },
      ],
    });
    await alert.present();
  }

  private importText(text: string): void {
    try {
      const count = this.lists.import(text);
      void this.toast(count === 1 ? 'Imported 1 list' : `Imported ${count} lists`);
    } catch (error) {
      void this.toast(error instanceof Error ? error.message : 'Import failed');
    }
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: 3000,
      position: 'top',
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': 'lists-toast' },
    });
    await toast.present();
  }
}
