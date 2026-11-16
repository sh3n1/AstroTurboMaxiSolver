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
  IonInput,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  chevronBack,
  chevronDown,
  chevronForward,
  chevronUp,
  close,
  telescopeOutline,
  trashOutline,
} from 'ionicons/icons';

import { APP_ICONS } from './app-icons';
import { AppState } from './app-state.service';
import { equipmentLabel } from './equipment';
import { LocalTimePipe } from './local-time.pipe';
import {
  APPEARANCE_LABELS,
  LOG_TAGS,
  RATINGS,
  SEEING,
  STAR_COLOURS,
  appearanceChoices,
  cleanDetails,
  ordinal,
  wasSeen,
} from './observing-log';
import type { Appearance, DetailKind, LogConditions, LogDetails, LogEntry, Rating, StarColour } from './observing-log';
import { ObservingLogService } from './observing-log.service';
import { nakedEyeLimit } from './sky-quality';
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
    IonInput,
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
    /* Folds the details that most observations don't need, to keep the form quick. */
    .more {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 16px 0 0;
      padding: 8px 0;
      min-height: 44px;
      border: none;
      background: none;
      color: var(--ion-color-primary);
      font: inherit;
      font-size: calc(16px * var(--af-scale, 1));
      font-weight: 600;
    }
    .fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 12px;
    }
    /* Large enough to read at arm's length, the label too, which Ionic shows smaller. */
    .fields ion-input {
      font-size: calc(18px * var(--af-scale, 1));
    }
    /* Colours are stored in OpenAstronomyLog's lower case words, but read as names. */
    .colour-row ion-chip {
      text-transform: capitalize;
    }
    .colour-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0 4px;
    }
    .colour-row > span {
      min-width: 6.5em;
      font-size: calc(15px * var(--af-scale, 1));
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

        <!--
          What OpenAstronomyLog can record beyond the rating and note: the sky, and what the
          object looked like. Folded, since most observations need none of it at the telescope.
        -->
        <button
          type="button"
          class="more"
          data-testid="log-more"
          [attr.aria-expanded]="showMore()"
          (click)="showMore.set(!showMore())"
        >
          More details
          <ion-icon [name]="showMore() ? 'chevron-up' : 'chevron-down'" aria-hidden="true"></ion-icon>
        </button>
        @if (showMore()) {
          @let d = details();
          <div data-testid="log-details">
            <h3 id="seeing-label">Seeing</h3>
            <div class="tags" role="radiogroup" aria-labelledby="seeing-label" data-testid="log-seeing">
              @for (option of seeingChoices; track option.value) {
                @let on = d.seeing === option.value;
                <ion-chip
                  role="radio"
                  [attr.aria-checked]="on"
                  [outline]="!on"
                  [color]="on ? 'primary' : 'medium'"
                  (click)="setDetails({ seeing: on ? undefined : option.value })"
                  >{{ option.label }}</ion-chip
                >
              }
            </div>

            <h3>Sky</h3>
            <div class="fields">
              <!-- The naked-eye limit, estimated from the Bortle class until the user gives it. -->
              <ion-input
                data-testid="log-faintest"
                label="Naked-eye limit"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                [debounce]="400"
                [placeholder]="'≈ ' + (estimatedLimit() | number: '1.1-1')"
                [value]="d.faintestStar ?? ''"
                (ionInput)="setNumber('faintestStar', $any($event).detail.value, 0, 8.5)"
              ></ion-input>
              <ion-input
                data-testid="log-sqm"
                label="SQM reading"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                placeholder="mag/arcsec²"
                [debounce]="400"
                [value]="d.sqm ?? ''"
                (ionInput)="setNumber('sqm', $any($event).detail.value, 10, 23)"
              ></ion-input>
            </div>

            @if (appearance().length > 0) {
              <h3>Appearance</h3>
              <div class="tags" data-testid="log-appearance">
                @for (option of appearance(); track option) {
                  @let on = !!d.appearance?.includes(option);
                  <ion-chip
                    role="checkbox"
                    [attr.aria-checked]="on"
                    [outline]="!on"
                    [color]="on ? 'primary' : 'medium'"
                    (click)="toggleAppearance(option)"
                    >{{ appearanceLabels[option] }}</ion-chip
                  >
                }
              </div>
            }

            @if (kind() === 'double') {
              <h3>Colours</h3>
              @for (star of colourStars; track star.key) {
                <div
                  class="colour-row"
                  role="radiogroup"
                  [attr.aria-label]="star.label"
                  [attr.data-testid]="star.testId"
                >
                  <span>{{ star.label }}</span>
                  @for (colour of starColours; track colour) {
                    @let on = d[star.key] === colour;
                    <ion-chip
                      role="radio"
                      [attr.aria-checked]="on"
                      [outline]="!on"
                      [color]="on ? 'primary' : 'medium'"
                      (click)="setColour(star.key, on ? undefined : colour)"
                      >{{ colour }}</ion-chip
                    >
                  }
                </div>
              }
            }

            @if (kind() === 'deepSky' || kind() === 'openCluster') {
              <h3>Size seen</h3>
              <div class="fields">
                <ion-input
                  data-testid="log-size"
                  label="Long side (′)"
                  labelPlacement="stacked"
                  type="number"
                  inputmode="decimal"
                  [debounce]="400"
                  [value]="d.sizeArcmin ?? ''"
                  (ionInput)="setNumber('sizeArcmin', $any($event).detail.value, 0.01, 600)"
                ></ion-input>
                <ion-input
                  data-testid="log-minor"
                  label="Short side (′)"
                  labelPlacement="stacked"
                  type="number"
                  inputmode="decimal"
                  [debounce]="400"
                  [value]="d.minorArcmin ?? ''"
                  (ionInput)="setNumber('minorArcmin', $any($event).detail.value, 0.01, 600)"
                ></ion-input>
              </div>
            }
          </div>
        }
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
  protected readonly seeingChoices = SEEING;
  protected readonly starColours = STAR_COLOURS;
  protected readonly appearanceLabels = APPEARANCE_LABELS;
  protected readonly colourStars = [
    { key: 'colourMain', label: 'Main star', testId: 'log-colour-main' },
    { key: 'colourCompanion', label: 'Companion', testId: 'log-colour-companion' },
  ] as const;
  /** Whether the extra details are unfolded. */
  protected readonly showMore = signal(false);
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

  /** The details of the entry shown, or none yet. */
  protected readonly details = computed<LogDetails>(() => this.entry()?.details ?? {});

  /** Which details fit the target: double stars and open clusters have their own. */
  protected readonly kind = computed<DetailKind>(() => {
    const target = this.catalogueTarget();
    if (!target) return 'other';
    if (target.kind === 'Double star' || target.double) return 'double';
    if (target.kind === 'Open cluster') return 'openCluster';
    return ['Galaxy', 'Nebula', 'Globular cluster', 'Other'].includes(target.kind) ? 'deepSky' : 'other';
  });
  protected readonly appearance = computed(() => appearanceChoices(this.kind()));

  /** The naked-eye limit the Bortle class suggests, shown until the user gives one. */
  protected readonly estimatedLimit = computed(() => nakedEyeLimit(this.conditions()?.bortle ?? 5));

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
    addIcons({ add, chevronBack, chevronForward, close, telescopeOutline, trashOutline, chevronDown, chevronUp });
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

  /** Changes some of the details, logging a blank form first. Empty ones are dropped. */
  protected setDetails(changes: Partial<LogDetails>): void {
    const id = this.ensureEntry();
    if (id) this.log.update(id, { details: cleanDetails({ ...this.details(), ...changes }) });
  }

  /** A double star's colour, for one of its two stars, or none. */
  protected setColour(star: 'colourMain' | 'colourCompanion', colour: StarColour | undefined): void {
    this.setDetails({ [star]: colour });
  }

  protected toggleAppearance(option: Appearance): void {
    const current = this.details().appearance ?? [];
    this.setDetails({
      appearance: current.includes(option) ? current.filter((a) => a !== option) : [...current, option],
    });
  }

  /**
   * A number typed into a field. Blank clears it; a number outside the sensible range for
   * that field, such as a half-typed one, is left unsaved.
   */
  protected setNumber(
    key: 'faintestStar' | 'sqm' | 'sizeArcmin' | 'minorArcmin',
    text: string | null | undefined,
    min: number,
    max: number,
  ): void {
    const value = Number(String(text ?? '').replace(',', '.'));
    if (String(text ?? '').trim() === '') {
      if (this.details()[key] !== undefined) this.setDetails({ [key]: undefined });
      return;
    }
    if (Number.isFinite(value) && value >= min && value <= max) this.setDetails({ [key]: value });
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
