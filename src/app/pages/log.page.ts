import type { ElementRef } from '@angular/core';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  ActionSheetController,
  IonBackButton,
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
  IonSearchbar,
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { folderOpenOutline, saveOutline, swapVerticalOutline } from 'ionicons/icons';

import { equipmentLabel } from '../core/equipment';
import { LocalTimePipe } from '../core/local-time.pipe';
import { LogEntrySheetComponent } from '../core/log-entry-sheet.component';
import type { LogEntry, LogNight } from '../core/observing-log';
import { RATINGS, entryMatches, groupByNight, logTotals, wasSeen } from '../core/observing-log';
import { ObservingLogService } from '../core/observing-log.service';
import { normalizeSearch } from '../core/search';

/** A night's date, short, in the phone's language: "Thu 12 Nov". */
const NIGHT_DATE = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
/** The year too, for nights in another year. */
const NIGHT_DATE_YEAR = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * The observing log: every target logged, one card per night, newest first, with the
 * night's conditions. Tapping an entry opens its note. Exports as a spreadsheet or a backup.
 */
@Component({
  selector: 'app-log',
  imports: [
    LocalTimePipe,
    IonBackButton,
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
    IonSearchbar,
    IonText,
    IonTitle,
    IonToolbar,
  ],
  styles: `
    .totals {
      margin: 12px 20px 0;
      font-size: calc(16px * var(--af-scale, 1));
    }
    /* The night's date as the header, and its conditions on a line below. */
    .night-header {
      display: block;
      padding-top: 8px;
    }
    .night-conditions {
      display: block;
      margin-top: 2px;
      font-size: calc(14px * var(--af-scale, 1));
      font-weight: 400;
      letter-spacing: 0;
      text-transform: none;
    }
    ion-label p {
      color: var(--af-muted);
    }
    .time {
      font-variant-numeric: tabular-nums;
    }
    .note {
      white-space: normal;
    }
    .hidden-input {
      display: none;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/lists" text="" aria-label="Back"></ion-back-button>
        </ion-buttons>
        <ion-title>Observing log</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Import or export the log" data-testid="log-transfer" (click)="transfer()">
            <ion-icon slot="icon-only" name="swap-vertical-outline" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      @if (log.entries().length > 0) {
        <ion-toolbar>
          <ion-searchbar
            placeholder="Search the log"
            data-testid="log-search"
            [debounce]="100"
            (ionInput)="query.set($any($event).detail.value ?? '')"
          ></ion-searchbar>
        </ion-toolbar>
      }
    </ion-header>

    <ion-content>
      @if (log.entries().length === 0) {
        <ion-text color="medium">
          <p class="ion-padding" data-testid="log-empty">
            Nothing logged yet. Tap the eye on the sky map when you see a target.
          </p>
        </ion-text>
      } @else {
        <p class="totals" data-testid="log-totals">
          <strong>{{ totals().objects }}</strong> {{ totals().objects === 1 ? 'object' : 'objects' }} seen ·
          <strong>{{ totals().nights }}</strong> {{ totals().nights === 1 ? 'night' : 'nights' }}
        </p>
        <!-- The nights go in two columns on a phone on its side: see .af-columns in global.scss. -->
        <div class="af-columns">
          @for (night of nights(); track night.key) {
            <ion-list inset="true" data-testid="log-night">
              <ion-list-header>
                <ion-label class="night-header">
                  {{ nightDate(night) }}
                  <span class="night-conditions">{{ nightConditions(night) }}</span>
                </ion-label>
              </ion-list-header>
              @for (entry of night.entries; track entry.id) {
                <ion-item button detail="false" data-testid="log-entry" (click)="openEntry(entry)">
                  <ion-label>
                    <h2>{{ entry.targetId }}</h2>
                    <p>
                      <span class="time">{{ entry.time | localTime }}</span> · {{ entry.targetName }}
                      @if (entry.tags.length > 0) {
                        · {{ entry.tags.join(', ') }}
                      }
                    </p>
                    @if (entry.note) {
                      <p class="note">{{ entry.note }}</p>
                    }
                  </ion-label>
                  <ion-badge slot="end" [color]="seen(entry) ? 'success' : 'warning'">{{
                    ratingLabel(entry)
                  }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          } @empty {
            <ion-text color="medium">
              <p class="ion-padding">Nothing in the log matches your search.</p>
            </ion-text>
          }
        </div>
      }

      <!-- Opened by Import, to pick a log backup on the phone. -->
      <input
        #fileInput
        class="hidden-input"
        type="file"
        accept=".json,application/json"
        data-testid="log-import-file"
        (change)="importFile($event)"
      />
    </ion-content>
  `,
})
export class LogPage {
  protected readonly log = inject(ObservingLogService);
  private readonly modals = inject(ModalController);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly toasts = inject(ToastController);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly query = signal('');
  protected readonly totals = computed(() => logTotals(this.log.entries()));

  /** The nights with entries matching the search. */
  protected readonly nights = computed(() => {
    const term = normalizeSearch(this.query());
    const entries = this.log.entries().filter((e) => !term || entryMatches(e, term, normalizeSearch(e.targetId)));
    return groupByNight(entries);
  });

  constructor() {
    addIcons({ folderOpenOutline, saveOutline, swapVerticalOutline });
  }

  protected readonly seen = wasSeen;

  protected ratingLabel(entry: LogEntry): string {
    return RATINGS[entry.rating].label;
  }

  protected nightDate(night: LogNight): string {
    return (night.date.getFullYear() === new Date().getFullYear() ? NIGHT_DATE : NIGHT_DATE_YEAR).format(night.date);
  }

  /** The night's sky and telescope, from its first entry: "Bortle 8 · Moon 12% · 130/650 · 25 mm". */
  protected nightConditions(night: LogNight): string {
    const first = night.entries[night.entries.length - 1].conditions;
    const moon = first.moonAltDeg > 0 ? `Moon ${Math.round(first.moonLitPercent)}%` : 'No Moon';
    return `Bortle ${first.bortle} · ${moon} · ${equipmentLabel(first.equipment)}`;
  }

  protected async openEntry(entry: LogEntry): Promise<void> {
    const sheet = await this.modals.create({
      component: LogEntrySheetComponent,
      componentProps: { entryId: entry.id },
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await sheet.present();
  }

  /** Export as a spreadsheet or a backup, or import a backup. */
  protected async transfer(): Promise<void> {
    const hasEntries = this.log.entries().length > 0;
    const sheet = await this.actionSheets.create({
      header: 'Import and export',
      buttons: [
        ...(hasEntries
          ? [
              { text: 'Save as a spreadsheet', icon: 'save-outline', handler: () => this.log.exportCsv() },
              { text: 'Save a backup', icon: 'save-outline', handler: () => this.log.exportJson() },
            ]
          : []),
        {
          text: 'Import a backup',
          icon: 'folder-open-outline',
          handler: () => this.fileInput().nativeElement.click(),
        },
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
    if (!file) return;
    try {
      const count = this.log.import(await file.text());
      void this.toast(count === 1 ? 'Imported 1 entry' : `Imported ${count} entries`);
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
      htmlAttributes: { 'data-testid': 'log-toast' },
    });
    await toast.present();
  }
}
