import { DecimalPipe } from '@angular/common';
import type { OnInit } from '@angular/core';
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
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, chevronBack, chevronForward, close, telescopeOutline, trashOutline } from 'ionicons/icons';

import { APP_ICONS } from './app-icons';
import { AppState } from './app-state.service';
import { equipmentLabel } from './equipment';
import { LocalTimePipe } from './local-time.pipe';
import { LOG_TAGS, RATINGS, ordinal, wasSeen } from './observing-log';
import type { LogConditions, LogEntry, Rating } from './observing-log';
import { ObservingLogService } from './observing-log.service';
import { iconDataUrl, phaseIcon } from './target-icons';

/** Long enough to reach Undo after deleting by mistake. */
const DELETED_TOAST_MS = 5000;

/**
 * A target's observations, one at a time: how well it was seen, quick tags and a note.
 * It opens on the newest, or on a blank form if there is none yet, and pages back through
 * the older ones. The blank form saves nothing until something in it is chosen, so
 * opening and closing it logs nothing. The sky and the telescope are filled in by the
 * app. Every change saves at once.
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
    /* Older, which one of how many, newer, and a new observation at the end. */
    .pager {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: -8px 0 4px;
    }
    .pager .position {
      min-width: 4.5em;
      text-align: center;
      font-size: calc(15px * var(--af-scale, 1));
      font-variant-numeric: tabular-nums;
    }
    .pager .add {
      margin-left: auto;
    }
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
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title data-testid="log-sheet-title">{{ title() }}</ion-title>
        <ion-buttons slot="end">
          <!-- In plain sight, since a deleted entry can be brought back from the message. -->
          @if (entry()) {
            <ion-button color="danger" aria-label="Delete" data-testid="log-delete" (click)="deleteEntry()">
              <ion-icon slot="icon-only" name="trash-outline" aria-hidden="true"></ion-icon>
            </ion-button>
          }
          <ion-button aria-label="Close" data-testid="log-sheet-close" (click)="close()">
            <ion-icon slot="icon-only" name="close" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div class="pager" data-testid="log-pager">
        @if (entries().length > 0) {
          <ion-button
            fill="clear"
            aria-label="Older"
            data-testid="log-older"
            [disabled]="position() <= 1"
            (click)="step(-1)"
          >
            <ion-icon slot="icon-only" name="chevron-back" aria-hidden="true"></ion-icon>
          </ion-button>
          <span class="position" data-testid="log-position">
            @if (entry()) {
              {{ position() }} of {{ entries().length }}
            } @else {
              New
            }
          </span>
          <ion-button
            fill="clear"
            aria-label="Newer"
            data-testid="log-newer"
            [disabled]="!entry() || position() >= entries().length"
            (click)="step(1)"
          >
            <ion-icon slot="icon-only" name="chevron-forward" aria-hidden="true"></ion-icon>
          </ion-button>
        }
        @if (entry()) {
          <ion-button class="add" fill="outline" size="small" data-testid="log-add" (click)="startNew()">
            <ion-icon slot="start" name="add" aria-hidden="true"></ion-icon>
            New
          </ion-button>
        }
      </div>

      @if (conditions(); as c) {
        <p class="when" data-testid="log-sheet-when">
          {{ shownTargetId() }} ·
          @if (entry(); as e) {
            <!-- With the date, since paging goes back through earlier nights. -->
            {{ e.time | localTime: 'date-time' }}
            @if (seenCount() > 0) {
              · {{ seenOrdinal() }} time
            }
          } @else {
            Now
          }
        </p>
        <div class="conditions" data-testid="log-conditions">
          <span class="condition">
            @if (c.altDeg >= 0) {
              {{ c.altDeg | number: '1.0-0' }}° up
            } @else {
              {{ -c.altDeg | number: '1.0-0' }}° below
            }
          </span>
          <span class="condition"
            ><ion-icon [src]="appIcons.skyDarkness" aria-hidden="true"></ion-icon>Bortle {{ c.bortle }}</span
          >
          <span class="condition"
            ><ion-icon [src]="moonIcon()" aria-hidden="true"></ion-icon>
            @if (c.moonAltDeg > 0) {
              Moon {{ c.moonLitPercent | number: '1.0-0' }}%
            } @else {
              Moon down
            }
          </span>
          <span class="condition"
            ><ion-icon name="telescope-outline" aria-hidden="true"></ion-icon>{{ equipmentLabel(c.equipment) }}</span
          >
        </div>

        <h3 id="rating-label">How well</h3>
        <!-- Chips that wrap, like the tags, so every word shows in full at large text sizes. -->
        <div class="tags" role="radiogroup" aria-labelledby="rating-label" data-testid="log-rating">
          @for (rating of ratings; track rating.value) {
            @let on = entry()?.rating === rating.value;
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
            @let on = !!entry()?.tags?.includes(tag);
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
          [value]="entry()?.note ?? ''"
          (ionInput)="setNote($any($event).detail.value ?? '')"
        ></ion-textarea>
      }
    </ion-content>
  `,
})
export class LogEntrySheetComponent implements OnInit {
  /** The target whose observations are shown. Set when the sheet opens. */
  @Input() set targetId(id: string) {
    this.target.set(id);
  }
  /** The entry to open on. Without one, the newest, or a blank form if there are none. */
  @Input() entryId?: string;

  private readonly target = signal('');
  /** The entry shown, or null for the blank form of a new observation. */
  protected readonly currentId = signal<string | null>(null);
  /** When the blank form was opened: the time, sky and telescope it shows until saved. */
  private readonly draftTime = signal(new Date());

  protected readonly log = inject(ObservingLogService);
  private readonly state = inject(AppState);
  private readonly modals = inject(ModalController);
  private readonly toasts = inject(ToastController);

  protected readonly ratings = RATINGS;
  protected readonly tags = LOG_TAGS;
  protected readonly appIcons = APP_ICONS;
  protected readonly equipmentLabel = equipmentLabel;

  /** The target's id, for the template, since the input above can only be set. */
  protected readonly shownTargetId = computed(() => this.target());
  /** The target's entries, oldest first. */
  protected readonly entries = computed(() => this.log.entriesFor(this.target()));
  /** The entry shown, read from the log so the sheet shows every change at once. */
  protected readonly entry = computed(() => this.entries().find((e) => e.id === this.currentId()));
  /** Which entry this is, counting from the oldest as 1. */
  protected readonly position = computed(() => this.entries().findIndex((e) => e.id === this.currentId()) + 1);
  /** The target in the catalogue, needed to log a new observation. */
  private readonly catalogueTarget = computed(() => this.state.targets().find((t) => t.id === this.target()));

  protected readonly title = computed(
    () => this.catalogueTarget()?.name ?? this.entries().at(-1)?.targetName ?? this.target(),
  );

  /** The sky and telescope shown: the entry's, or for a new one, as they are now. */
  protected readonly conditions = computed<LogConditions | undefined>(() => {
    const entry = this.entry();
    if (entry) return entry.conditions;
    const target = this.catalogueTarget();
    return target && this.log.conditionsAt(target, this.draftTime());
  });

  /** Which sighting of the target this is: the entries up to this one that saw it. */
  protected readonly seenCount = computed(() => {
    const entry = this.entry();
    if (!entry || !wasSeen(entry)) return 0;
    return this.entries().filter((e) => wasSeen(e) && e.time <= entry.time).length;
  });
  protected readonly seenOrdinal = computed(() => ordinal(this.seenCount()));
  /** The Moon as it was, lit as much as then: the moon icon alone means night mode. */
  protected readonly moonIcon = computed(() =>
    iconDataUrl(phaseIcon((this.conditions()?.moonLitPercent ?? 100) / 100, true)),
  );

  constructor() {
    addIcons({ add, chevronBack, chevronForward, close, telescopeOutline, trashOutline });
  }

  ngOnInit(): void {
    this.currentId.set(this.entryId ?? this.entries().at(-1)?.id ?? null);
  }

  /** Moves to the older (-1) or newer (+1) entry. */
  protected step(direction: -1 | 1): void {
    const next = this.entries()[this.position() - 1 + direction];
    if (next) this.currentId.set(next.id);
  }

  /** Opens a blank form for another observation, saved once something is chosen. */
  protected startNew(): void {
    this.draftTime.set(new Date());
    this.currentId.set(null);
  }

  protected setRating(value: string | number): void {
    const id = this.ensureEntry();
    if (id) this.log.update(id, { rating: Number(value) as Rating });
  }

  protected toggleTag(tag: string): void {
    const id = this.ensureEntry();
    const tags = this.entry()?.tags ?? [];
    if (id) this.log.update(id, { tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag] });
  }

  protected setNote(note: string): void {
    // Typing nothing into a blank form leaves it unsaved.
    if (!this.entry() && !note.trim()) return;
    const id = this.ensureEntry();
    if (id) this.log.update(id, { note });
  }

  /**
   * Deletes the entry shown, then shows the one before it, or the next, or a blank form.
   * The message offers Undo, which brings it back and shows it again.
   */
  protected async deleteEntry(): Promise<void> {
    const entry = this.entry();
    if (!entry) return;
    const index = this.position() - 1;
    this.log.remove(entry.id);
    const left = this.entries();
    this.draftTime.set(new Date());
    this.currentId.set((left[index - 1] ?? left[index])?.id ?? null);

    const toast = await this.toasts.create({
      message: 'Deleted',
      duration: DELETED_TOAST_MS,
      position: 'top',
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': 'log-deleted-toast' },
      buttons: [{ text: 'Undo', handler: () => this.restore(entry) }],
    });
    await toast.present();
  }

  protected close(): Promise<boolean> {
    return this.modals.dismiss();
  }

  private restore(entry: LogEntry): void {
    this.log.restore(entry);
    this.currentId.set(entry.id);
  }

  /** The entry shown, logging it first if this is the blank form. Null if it can't be. */
  private ensureEntry(): string | null {
    const shown = this.entry();
    if (shown) return shown.id;
    const target = this.catalogueTarget();
    if (!target) return null;
    const entry = this.log.log(target);
    this.currentId.set(entry.id);
    return entry.id;
  }
}
