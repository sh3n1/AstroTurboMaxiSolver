import type { ElementRef } from '@angular/core';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  ActionSheetController,
  AlertController,
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
  ToastController,
} from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { folderOpenOutline, saveOutline, swapVerticalOutline } from 'ionicons/icons';

import { normalizeSearch } from '../core/catalog/search';
import { equipmentLabel } from '../core/equipment/equipment';
import { t } from '../core/i18n/t';
import { LocalTimePipe } from '../core/local-time.pipe';
import type { LogEntry, LogNight } from '../core/log/observing-log';
import { entryMatches, groupByNight, logTotals, ratingText, tagText, wasSeen } from '../core/log/observing-log';
import { ObservingLogService } from '../core/log/observing-log.service';
import { SeenActionsService } from '../core/log/seen-actions.service';

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
    TranslatePipe,
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
          <ion-back-button
            defaultHref="/tabs/lists"
            text=""
            [attr.aria-label]="'common.back' | translate"
          ></ion-back-button>
        </ion-buttons>
        <ion-title>{{ 'lists.observingLog' | translate }}</ion-title>
        <ion-buttons slot="end">
          <ion-button [attr.aria-label]="'log.transfer' | translate" data-testid="log-transfer" (click)="transfer()">
            <ion-icon slot="icon-only" name="swap-vertical-outline" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      @if (log.entries().length > 0) {
        <ion-toolbar>
          <ion-searchbar
            [placeholder]="'log.search' | translate"
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
            {{ 'log.empty' | translate }}
          </p>
        </ion-text>
      } @else {
        <p class="totals" data-testid="log-totals">
          <strong>{{ totals().objects }}</strong>
          {{ (totals().objects === 1 ? 'log.objectSeen' : 'log.objectsSeen') | translate }} ·
          <strong>{{ totals().nights }}</strong> {{ (totals().nights === 1 ? 'log.night' : 'log.nights') | translate }}
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
                        · {{ tagsText(entry.tags) }}
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
              <p class="ion-padding">{{ 'log.noMatch' | translate }}</p>
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
  private readonly seenActions = inject(SeenActionsService);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly alerts = inject(AlertController);
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
    return ratingText(entry.rating);
  }

  /** The entry's quick tags, in the user's language. */
  protected tagsText(tags: readonly string[]): string {
    return tags.map(tagText).join(', ');
  }

  protected nightDate(night: LogNight): string {
    return (night.date.getFullYear() === new Date().getFullYear() ? NIGHT_DATE : NIGHT_DATE_YEAR).format(night.date);
  }

  /** The night's sky and telescope, from its first entry: "Bortle 8 · Moon 12% · 130/650 · 25 mm". */
  protected nightConditions(night: LogNight): string {
    const first = night.entries[night.entries.length - 1].conditions;
    const moon = first.moonAltDeg > 0 ? t('log.moon', { percent: Math.round(first.moonLitPercent) }) : t('log.noMoon');
    return `${t('log.bortle', { bortle: first.bortle })} · ${moon} · ${equipmentLabel(first.equipment)}`;
  }

  /** Opens the entry, among the target's other observations. */
  protected openEntry(entry: LogEntry): Promise<void> {
    return this.seenActions.openLog(entry.targetId, entry.id);
  }

  /**
   * Saves the log as OpenAstronomyLog, after asking for the observer's name, which other
   * programs such as DeepskyLog use to match the observations to their account.
   */
  private async exportOal(): Promise<void> {
    const last = this.log.lastObserver();
    const alert = await this.alerts.create({
      header: t('log.yourName'),
      message: t('log.yourNameWhy'),
      inputs: [
        { name: 'name', type: 'text', placeholder: t('log.firstName'), value: last.name },
        { name: 'surname', type: 'text', placeholder: t('log.surname'), value: last.surname },
      ],
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('common.save'),
          handler: ({ name, surname }: { name: string; surname: string }) =>
            this.log.exportOal({ name: name.trim(), surname: surname.trim() }),
        },
      ],
      htmlAttributes: { 'data-testid': 'oal-name' },
    });
    await alert.present();
  }

  /** Export as a spreadsheet or a backup, or import a backup. */
  protected async transfer(): Promise<void> {
    const hasEntries = this.log.entries().length > 0;
    const sheet = await this.actionSheets.create({
      header: t('lists.importExport'),
      buttons: [
        ...(hasEntries
          ? [
              { text: t('log.saveCsv'), icon: 'save-outline', handler: () => this.log.exportCsv() },
              { text: t('log.saveBackup'), icon: 'save-outline', handler: () => this.log.exportJson() },
              {
                text: t('log.saveOal'),
                icon: 'save-outline',
                handler: () => void this.exportOal(),
              },
            ]
          : []),
        {
          text: t('log.importBackup'),
          icon: 'folder-open-outline',
          handler: () => this.fileInput().nativeElement.click(),
        },
        { text: t('common.cancel'), role: 'cancel' },
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
      const count = await this.log.import(await file.text());
      void this.toast(count === 1 ? t('log.importedOne') : t('log.importedMany', { count }));
    } catch (error) {
      void this.toast(error instanceof Error ? error.message : t('lists.importFailed'));
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
