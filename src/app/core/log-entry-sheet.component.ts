import { DecimalPipe } from '@angular/common';
import { Component, Input, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, telescopeOutline, trashOutline } from 'ionicons/icons';

import { APP_ICONS } from './app-icons';
import { equipmentLabel } from './equipment';
import { LocalTimePipe } from './local-time.pipe';
import { LOG_TAGS, RATINGS, ordinal } from './observing-log';
import type { Rating } from './observing-log';
import { ObservingLogService } from './observing-log.service';
import { iconDataUrl, phaseIcon } from './target-icons';

/**
 * One log entry: how well the target was seen, quick tags and a note. The sky and the
 * telescope were filled in when it was logged. Every change saves at once.
 */
@Component({
  selector: 'app-log-entry-sheet',
  imports: [
    DecimalPipe,
    LocalTimePipe,
    IonButton,
    IonButtons,
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
  styles: `
    .when {
      margin: 0 0 8px;
      color: var(--af-muted);
    }
    /* The sky and telescope at the time, filled in by the app: quiet, not tappable. */
    .conditions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 16px;
    }
    .condition {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border: 1px solid var(--ion-border-color);
      border-radius: 12px;
      font-size: calc(14px * var(--af-scale, 1));
      font-variant-numeric: tabular-nums;
    }
    .condition ion-icon {
      font-size: 16px;
    }
    h3 {
      margin: 16px 0 6px;
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
    }
    ion-textarea {
      --background: var(--ion-color-step-50, rgba(255, 255, 255, 0.05));
      --padding-start: 10px;
      --padding-end: 10px;
      border-radius: 8px;
    }
    .delete {
      margin-top: 24px;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title data-testid="log-sheet-title">{{ entry()?.targetName ?? 'Log' }}</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Close" data-testid="log-sheet-close" (click)="close()">
            <ion-icon slot="icon-only" name="close" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      @if (entry(); as e) {
        <p class="when" data-testid="log-sheet-when">
          {{ e.targetId }} · {{ e.time | localTime }}
          @if (seenCount() > 0) {
            · {{ seenOrdinal() }} time
          }
        </p>
        <div class="conditions" data-testid="log-conditions">
          <span class="condition">
            @if (e.conditions.altDeg >= 0) {
              {{ e.conditions.altDeg | number: '1.0-0' }}° up
            } @else {
              {{ -e.conditions.altDeg | number: '1.0-0' }}° below
            }
          </span>
          <span class="condition"
            ><ion-icon [src]="appIcons.skyDarkness" aria-hidden="true"></ion-icon>Bortle {{ e.conditions.bortle }}</span
          >
          <span class="condition"
            ><ion-icon [src]="moonIcon()" aria-hidden="true"></ion-icon>
            @if (e.conditions.moonAltDeg > 0) {
              Moon {{ e.conditions.moonLitPercent | number: '1.0-0' }}%
            } @else {
              Moon down
            }
          </span>
          <span class="condition"
            ><ion-icon name="telescope-outline" aria-hidden="true"></ion-icon
            >{{ equipmentLabel(e.conditions.equipment) }}</span
          >
        </div>

        <h3 id="rating-label">How well</h3>
        <!-- Chips that wrap, like the tags, so every word shows in full at large text sizes. -->
        <div class="tags" role="radiogroup" aria-labelledby="rating-label" data-testid="log-rating">
          @for (rating of ratings; track rating.value) {
            @let on = e.rating === rating.value;
            <ion-chip
              role="radio"
              [attr.aria-checked]="on"
              [outline]="!on"
              [color]="on ? (rating.value === 0 ? 'warning' : 'success') : 'medium'"
              (click)="setRating(rating.value)"
              >{{ rating.label }}</ion-chip
            >
          }
        </div>

        <h3>Tags</h3>
        <div class="tags">
          @for (tag of tags; track tag) {
            @let on = e.tags.includes(tag);
            <ion-chip
              data-testid="log-tag"
              role="checkbox"
              [attr.aria-checked]="on"
              [outline]="!on"
              [color]="on ? 'primary' : 'medium'"
              (click)="toggleTag(tag)"
              >{{ tag }}</ion-chip
            >
          }
        </div>

        <h3 id="note-label">Note</h3>
        <ion-textarea
          aria-labelledby="note-label"
          data-testid="log-note"
          autocapitalize="sentences"
          [autoGrow]="true"
          [rows]="3"
          [debounce]="300"
          [value]="e.note"
          (ionInput)="log.update(e.id, { note: $any($event).detail.value ?? '' })"
        ></ion-textarea>

        <ion-button class="delete" fill="clear" color="danger" data-testid="log-delete" (click)="deleteEntry()">
          <ion-icon slot="start" name="trash-outline" aria-hidden="true"></ion-icon>
          Delete entry
        </ion-button>
      }
    </ion-content>
  `,
})
export class LogEntrySheetComponent {
  /** The entry's id, set when the sheet opens, as the bookmark sheet's target is. */
  @Input() set entryId(id: string) {
    this.id.set(id);
  }
  private readonly id = signal('');

  protected readonly log = inject(ObservingLogService);
  private readonly modals = inject(ModalController);

  protected readonly ratings = RATINGS;
  protected readonly tags = LOG_TAGS;
  protected readonly appIcons = APP_ICONS;
  protected readonly equipmentLabel = equipmentLabel;

  /** The entry, read from the log so the sheet shows every change at once. */
  protected readonly entry = computed(() => this.log.entries().find((e) => e.id === this.id()));

  /** Which sighting of the target this is: the entries up to this one that saw it. */
  protected readonly seenCount = computed(() => {
    const entry = this.entry();
    if (!entry || entry.rating === 0) return 0;
    return this.log.entries().filter((e) => e.targetId === entry.targetId && e.rating > 0 && e.time <= entry.time)
      .length;
  });
  /** The Moon as it was, lit as much as then: the moon icon alone means night mode. */
  protected readonly moonIcon = computed(() =>
    iconDataUrl(phaseIcon((this.entry()?.conditions.moonLitPercent ?? 100) / 100, true)),
  );
  protected readonly seenOrdinal = computed(() => ordinal(this.seenCount()));

  constructor() {
    addIcons({ close, telescopeOutline, trashOutline });
  }

  protected setRating(value: string | number): void {
    const entry = this.entry();
    if (entry) this.log.update(entry.id, { rating: Number(value) as Rating });
  }

  protected toggleTag(tag: string): void {
    const entry = this.entry();
    if (!entry) return;
    const tags = entry.tags.includes(tag) ? entry.tags.filter((t) => t !== tag) : [...entry.tags, tag];
    this.log.update(entry.id, { tags });
  }

  protected deleteEntry(): void {
    this.log.remove(this.id());
    void this.close();
  }

  protected close(): Promise<boolean> {
    return this.modals.dismiss();
  }
}
