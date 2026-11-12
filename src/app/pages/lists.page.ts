import type { ElementRef } from '@angular/core';
import { Component, computed, inject, viewChild } from '@angular/core';
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
  documentTextOutline,
  folderOpenOutline,
  folderOutline,
  libraryOutline,
  ribbonOutline,
  saveOutline,
  swapVerticalOutline,
} from 'ionicons/icons';

import { isIconUrl } from '../core/app-icons';
import { ListsService } from '../core/lists.service';
import { fixedListEntries } from '../core/target-lists';

/**
 * The Bookmarks tab: the app's own collections (Best right now, In the reticle, and the
 * Catalogues page), then the user's lists, which they can make,
 * import and export.
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
            <ion-icon slot="icon-only" name="swap-vertical-outline" aria-hidden="true"></ion-icon>
          </ion-button>
          <ion-button aria-label="New list" data-testid="new-list" (click)="newList()">
            <ion-icon slot="icon-only" name="add" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- The app's own lists, which always stay as they are. The catalogues have their own page. -->
      <ion-list inset="true">
        <ion-list-header>Collections</ion-list-header>
        @for (entry of collections(); track entry.list.id) {
          <ion-item button detail="true" data-testid="list-link" (click)="open(entry.list.id)">
            <ion-icon
              slot="start"
              aria-hidden="true"
              [name]="isIconUrl(entry.icon) ? undefined : entry.icon"
              [src]="isIconUrl(entry.icon) ? entry.icon : undefined"
            ></ion-icon>
            <ion-label>
              <h2>{{ entry.list.name }}</h2>
              @if (entry.description) {
                <p>{{ entry.description }}</p>
              }
            </ion-label>
            <ion-badge slot="end" color="medium">{{ entry.list.targets.length }}</ion-badge>
          </ion-item>
        }
        <ion-item button detail="true" data-testid="catalogues-link" (click)="openCatalogues()">
          <ion-icon slot="start" aria-hidden="true" name="library-outline"></ion-icon>
          <ion-label>
            <h2>Catalogues</h2>
          </ion-label>
        </ion-item>
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
          <ion-label>New list</ion-label>
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
  /** The collections that change with the sky and the telescope. */
  protected readonly collections = computed(() => fixedListEntries(this.lists.fixedLists(), 'collections'));
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly toasts = inject(ToastController);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  constructor() {
    addIcons({
      add,
      bookmarkOutline,
      documentTextOutline,
      folderOpenOutline,
      folderOutline,
      libraryOutline,
      ribbonOutline,
      saveOutline,
      swapVerticalOutline,
    });
  }

  protected readonly isIconUrl = isIconUrl;

  protected open(id: string): void {
    void this.router.navigateByUrl(`/tabs/lists/${id}`);
  }

  protected openCatalogues(): void {
    void this.router.navigateByUrl('/tabs/lists/catalogues');
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
          icon: 'folder-open-outline',
          handler: () => this.fileInput().nativeElement.click(),
        },
        { text: 'Import pasted text', icon: 'document-text-outline', handler: () => void this.importPasted() },
        { text: 'Export all my lists', icon: 'save-outline', handler: () => this.lists.exportAll() },
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
