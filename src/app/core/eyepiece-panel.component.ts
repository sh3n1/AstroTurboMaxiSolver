import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonChip, IonIcon, IonRange } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowUndoOutline, settingsOutline } from 'ionicons/icons';

import { AppState } from './app-state.service';
import { equipmentLabel, eyepieceLabel, modifierLabel, telescopeLabel } from './equipment';

/** The slider's range for the faintest stars shown. */
const MIN_STAR_LIMIT = 2;
const MAX_STAR_LIMIT = 13;

/**
 * The eyepiece view's panel: how faint the stars shown go, and the eyepiece and the rest of
 * the kit in use, which set the view's field. The sky page places it and gives it its box.
 */
@Component({
  selector: 'app-eyepiece-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, IonButton, IonChip, IonIcon, IonRange],
  styles: `
    /* The sky page's rules for the panel's box, and its size on a phone on its side, win over this. */
    :host {
      display: block;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .bar-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    /* A button at the row's right end: the star limit's reset. */
    .bar-row .end {
      margin-left: auto;
    }
    ion-range {
      padding: 0 8px 0 0;
      --bar-background: var(--af-edge);
    }
    .equipment-toggle {
      margin: 2px 0 4px;
      padding: 6px 10px;
      border: 1px solid var(--af-edge);
      border-radius: 14px;
      background: transparent;
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
    }
    .recent {
      display: flex;
      gap: 2px;
      overflow-x: auto;
    }
    .recent ion-chip {
      flex-shrink: 0;
      font-size: calc(14px * var(--af-scale, 1));
    }
  `,
  template: `
    <div class="bar-row">
      <span data-testid="star-limit-label">
        Stars to magnitude {{ state.starLimit() | number: '1.1-1' }}{{ isAutoStarLimit() ? ', your sky' : '' }}
      </span>
      <ion-button
        class="end"
        fill="clear"
        size="small"
        data-testid="reset-star-limit"
        [disabled]="isAutoStarLimit()"
        (click)="resetStarLimit()"
      >
        <ion-icon slot="icon-only" name="arrow-undo-outline" aria-hidden="true"></ion-icon>
        <span class="visually-hidden">Reset to my sky</span>
      </ion-button>
    </div>
    <ion-range
      data-testid="star-limit"
      aria-label="Faintest stars shown"
      [min]="minStarLimit"
      [max]="maxStarLimit"
      [step]="0.1"
      [value]="state.starLimit()"
      (ionInput)="setStarLimit($event)"
    ></ion-range>

    <button
      type="button"
      class="equipment-toggle"
      data-testid="equipment-toggle"
      (click)="showEquipment.set(!showEquipment())"
    >
      {{ equipmentLabel(state.equipment()) }} · {{ power() | number: '1.0-0' }}× ·
      {{ eyepieceField() | number: '1.1-2' }}° {{ showEquipment() ? '▴' : '▾' }}
    </button>
    <!-- The eyepieces always show, since changing eyepiece is what happens most at the
       telescope. The rest of the kit shows when opened. All of it is set in Settings. -->
    @let kit = state.kit();
    @let ids = state.equipmentIds();
    @if (showEquipment() && kit.telescopes.length > 1) {
      <div class="recent" role="radiogroup" aria-label="Telescope">
        @for (item of kit.telescopes; track item.id) {
          <ion-chip
            data-testid="pick-telescope"
            role="radio"
            [attr.aria-checked]="item.id === ids.telescopeId"
            [outline]="item.id !== ids.telescopeId"
            [color]="item.id === ids.telescopeId ? 'primary' : 'medium'"
            (click)="state.selectKit({ telescopeId: item.id })"
            >{{ telescopeLabel(item) }}</ion-chip
          >
        }
      </div>
    }
    <div class="recent" role="radiogroup" aria-label="Eyepiece">
      @for (item of kit.eyepieces; track item.id) {
        <ion-chip
          data-testid="pick-eyepiece"
          role="radio"
          [attr.aria-checked]="item.id === ids.eyepieceId"
          [outline]="item.id !== ids.eyepieceId"
          [color]="item.id === ids.eyepieceId ? 'primary' : 'medium'"
          (click)="state.selectKit({ eyepieceId: item.id })"
          >{{ eyepieceLabel(item) }}</ion-chip
        >
      }
    </div>
    @if (showEquipment()) {
      @if (kit.modifiers.length > 0) {
        <div class="recent" role="radiogroup" aria-label="Barlow or reducer">
          <ion-chip
            data-testid="pick-modifier"
            role="radio"
            [attr.aria-checked]="!ids.modifierId"
            [outline]="!!ids.modifierId"
            [color]="!ids.modifierId ? 'primary' : 'medium'"
            (click)="state.selectKit({ modifierId: null })"
            >No Barlow</ion-chip
          >
          @for (item of kit.modifiers; track item.id) {
            <ion-chip
              data-testid="pick-modifier"
              role="radio"
              [attr.aria-checked]="item.id === ids.modifierId"
              [outline]="item.id !== ids.modifierId"
              [color]="item.id === ids.modifierId ? 'primary' : 'medium'"
              (click)="state.selectKit({ modifierId: item.id })"
              >{{ modifierLabel(item) }}</ion-chip
            >
          }
        </div>
      }
      @if (kit.filters.length > 0) {
        <div class="recent" role="radiogroup" aria-label="Filter">
          <ion-chip
            data-testid="pick-filter"
            role="radio"
            [attr.aria-checked]="!ids.filterId"
            [outline]="!!ids.filterId"
            [color]="!ids.filterId ? 'primary' : 'medium'"
            (click)="state.selectKit({ filterId: null })"
            >No filter</ion-chip
          >
          @for (item of kit.filters; track item.id) {
            <ion-chip
              data-testid="pick-filter"
              role="radio"
              [attr.aria-checked]="item.id === ids.filterId"
              [outline]="item.id !== ids.filterId"
              [color]="item.id === ids.filterId ? 'primary' : 'medium'"
              (click)="state.selectKit({ filterId: item.id })"
              >{{ item.name }}</ion-chip
            >
          }
        </div>
      }
      <ion-button fill="clear" size="small" data-testid="edit-equipment" (click)="editEquipment()">
        <ion-icon slot="start" name="settings-outline" aria-hidden="true"></ion-icon>
        Edit equipment
      </ion-button>
    }
  `,
})
export class EyepiecePanelComponent {
  protected readonly state = inject(AppState);
  private readonly router = inject(Router);

  protected readonly equipmentLabel = equipmentLabel;
  protected readonly telescopeLabel = telescopeLabel;
  protected readonly eyepieceLabel = eyepieceLabel;
  protected readonly modifierLabel = modifierLabel;
  protected readonly minStarLimit = MIN_STAR_LIMIT;
  protected readonly maxStarLimit = MAX_STAR_LIMIT;
  protected readonly power = this.state.power;
  protected readonly eyepieceField = this.state.trueField;
  /** Whether the star limit is the one worked out from the user's sky, not one they set. */
  protected readonly isAutoStarLimit = computed(() => this.state.settings().eyepieceStarLimit === null);
  /** Whether the whole kit shows, or only the eyepieces. */
  protected readonly showEquipment = signal(false);

  constructor() {
    addIcons({ arrowUndoOutline, settingsOutline });
  }

  protected setStarLimit(event: Event): void {
    const value = Number((event as CustomEvent<{ value: number }>).detail.value);
    // The slider also reports a change when the app moves it, such as after a reset. Only
    // a real change by the user should replace the value worked out from their sky.
    if (!Number.isFinite(value) || Math.abs(value - this.state.starLimit()) < 0.05) return;
    this.state.updateSettings({ eyepieceStarLimit: value });
  }

  /** Goes back to the limit worked out from the user's sky and telescope. */
  protected resetStarLimit(): void {
    this.state.updateSettings({ eyepieceStarLimit: null });
  }

  /** Opens Settings at the equipment, to add or change what the eyepiece view picks from. */
  protected editEquipment(): void {
    void this.router.navigate(['/tabs/settings'], { fragment: 'equipment' });
  }
}
