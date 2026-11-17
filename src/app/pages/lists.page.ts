import type { ElementRef } from '@angular/core';
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
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
  arrowBack,
  bookmarkOutline,
  documentTextOutline,
  folderOpenOutline,
  folderOutline,
  journalOutline,
  libraryOutline,
  ribbonOutline,
  saveOutline,
  searchOutline,
  swapVerticalOutline,
} from 'ionicons/icons';

import { isIconUrl } from '../core/app-icons';
import { ListsService } from '../core/lists.service';
import { ObservingLogService } from '../core/observing-log.service';
import { fixedListEntries } from '../core/target-lists';

/**
 * Lists, opened from the sky map: a search of every target first, then tonight's
 * collections (Best right now and In the reticle), then the user's own lists, which they
 * can make, import and export, then the catalogues and the observing log. Tapping a target
 * in any of them plays that list on the map, from that target.
 */
@Component({
  selector: 'app-lists',
  // Everything shown comes from signals, so the page is checked only when one changes,
  // not each time the sky map behind it updates.
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    /* Looks like a search field, and opens the search, where the typing happens. */
    .search {
      display: flex;
      align-items: center;
      gap: 10px;
      box-sizing: border-box;
      width: calc(100% - 32px);
      margin: 12px 16px 0;
      min-height: 48px;
      padding: 0 14px;
      border: 1px solid var(--af-edge);
      border-radius: 12px;
      background: var(--af-surface);
      color: var(--af-muted);
      font: inherit;
      font-size: calc(16px * var(--af-scale, 1));
      text-align: start;
    }
    .search ion-icon {
      flex: none;
      font-size: 22px;
      color: var(--ion-color-primary);
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button aria-label="Back to the map" data-testid="back-to-map" (click)="backToMap()">
            <ion-icon slot="icon-only" name="arrow-back" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>Lists</ion-title>
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
      <button type="button" class="search" data-testid="search-all" (click)="openSearch()">
        <ion-icon name="search-outline" aria-hidden="true"></ion-icon>
        Search all targets
      </button>
      <!-- The sections go in two columns on a phone on its side: see .af-columns in global.scss. -->
      <div class="af-columns">
        <!-- The lists that follow the sky and the telescope. -->
        <ion-list inset="true">
          <ion-list-header>Tonight</ion-list-header>
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
        </ion-list>

        <!-- The user's lists. Saved for later is always first and can't be deleted. -->
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
              <!-- How many are seen, once any is: "3/12". -->
              <ion-badge slot="end" color="medium">{{ log.progressLabel(list.targets) }}</ion-badge>
            </ion-item>
          }
          <ion-item button detail="false" data-testid="new-list-item" (click)="newList()">
            <ion-icon slot="start" name="add" aria-hidden="true"></ion-icon>
            <ion-label>New list</ion-label>
          </ion-item>
        </ion-list>

        <!-- The app's catalogues, on their own page, and everything seen, night by night. -->
        <ion-list inset="true">
          <ion-item button detail="true" data-testid="catalogues-link" (click)="openCatalogues()">
            <ion-icon slot="start" aria-hidden="true" name="library-outline"></ion-icon>
            <ion-label>
              <h2>Catalogues</h2>
            </ion-label>
          </ion-item>
          <ion-item button detail="true" data-testid="log-link" (click)="openLog()">
            <ion-icon slot="start" aria-hidden="true" name="journal-outline"></ion-icon>
            <ion-label>
              <h2>Observing log</h2>
            </ion-label>
            <ion-badge slot="end" color="medium">{{ log.entries().length }}</ion-badge>
          </ion-item>
        </ion-list>
      </div>

      <!-- Opened by the Import action, to pick a list file on the phone. -->
      <input
        #fileInput
        class="hidden-input"
        type="file"
        accept=".json,.txt,.skylist,.csv,application/json,text/plain,text/csv"
        data-testid="import-file"
        (change)="importFile($event)"
      />
    </ion-content>
  `,
})
export class ListsPage {
  protected readonly lists = inject(ListsService);
  protected readonly log = inject(ObservingLogService);
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
      arrowBack,
      bookmarkOutline,
      documentTextOutline,
      folderOpenOutline,
      folderOutline,
      journalOutline,
      libraryOutline,
      ribbonOutline,
      saveOutline,
      searchOutline,
      swapVerticalOutline,
    });
  }

  protected readonly isIconUrl = isIconUrl;

  protected backToMap(): void {
    void this.router.navigateByUrl('/tabs/sky');
  }

  protected openSearch(): void {
    void this.router.navigateByUrl('/tabs/lists/search');
  }

  protected open(id: string): void {
    void this.router.navigateByUrl(`/tabs/lists/${id}`);
  }

  protected openCatalogues(): void {
    void this.router.navigateByUrl('/tabs/lists/catalogues');
  }

  protected openLog(): void {
    void this.router.navigateByUrl('/tabs/lists/log');
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
    if (file) this.importText(await file.text(), file.name);
  }

  /** For lists shared as text, which some phones do instead of sharing a file. */
  private async importPasted(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Import pasted text',
      message: 'Paste a shared list, or a list of objects, one per line.',
      inputs: [{ name: 'text', type: 'textarea', placeholder: '{ "format": "astroturbomaxisolver-lists", … }' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Import', handler: ({ text }: { text: string }) => this.importText(text) },
      ],
    });
    await alert.present();
  }

  /**
   * Imports the app's own list files, SkySafari .skylist files, and CSV or plain text from
   * other apps. Objects the app doesn't know are named, so the user knows what is missing.
   */
  private importText(text: string, fileName = 'Pasted list'): void {
    try {
      const { lists, missing } = this.lists.import(text, fileName);
      const imported = lists === 1 ? 'Imported 1 list' : `Imported ${lists} lists`;
      // Longer when it names what is missing, to give time to read it.
      if (missing.length === 0) void this.toast(imported);
      else void this.toast(`${imported}. ${notFoundText(missing)}`, 6000);
    } catch (error) {
      void this.toast(error instanceof Error ? error.message : 'Import failed');
    }
  }

  private async toast(message: string, duration = 3000): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration,
      position: 'top',
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': 'lists-toast' },
    });
    await toast.present();
  }
}

/** The objects an import left out, briefly: "2 not found: PGC 1, Sh2-101". */
function notFoundText(missing: readonly string[]): string {
  const shown = missing.slice(0, 3).join(', ');
  return `${missing.length} not found: ${shown}${missing.length > 3 ? '…' : ''}`;
}
