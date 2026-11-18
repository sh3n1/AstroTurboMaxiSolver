import type { OnInit } from '@angular/core';
import { Component, Input, signal, inject } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmark, close } from 'ionicons/icons';

import type { Eyepiece, Filter, KitItem, KitKind, Modifier, Telescope } from './equipment';
import { TELESCOPE_TYPES, newKitId } from './equipment';

/** Each kind's title, for "New telescope" and "Telescope". */
const TITLES: Record<KitKind, string> = {
  telescopes: 'Telescope',
  eyepieces: 'Eyepiece',
  modifiers: 'Barlow or reducer',
  filters: 'Filter',
};

/** A new item's values, before the user changes them: common ones, to change as needed. */
function blankItem(kind: KitKind): KitItem {
  const id = newKitId();
  switch (kind) {
    case 'telescopes':
      return { id, name: '', type: 'newtonian', apertureMm: 130, focalMm: 650 } satisfies Telescope;
    case 'eyepieces':
      return { id, name: '', focalMm: 25, fieldDeg: 52 } satisfies Eyepiece;
    case 'modifiers':
      return { id, name: '', factor: 2 } satisfies Modifier;
    case 'filters':
      return { id, name: '' } satisfies Filter;
  }
}

/** The sensible range of each number, so a typing slip can't break the views. */
const RANGES: Record<string, [number, number]> = {
  apertureMm: [20, 2000],
  focalMm: [50, 10000],
  eyepieceFocalMm: [2, 60],
  fieldDeg: [20, 120],
  factor: [0.2, 6],
};

/**
 * Adds or changes one item of the user's equipment. Nothing is saved until the tick is
 * tapped, and only when every number makes sense.
 */
@Component({
  selector: 'app-equipment-editor',
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonList,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToolbar,
  ],
  styles: `
    .error {
      margin: 8px 16px;
      color: var(--ion-color-danger);
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button aria-label="Cancel" data-testid="kit-cancel" (click)="modals.dismiss()">
            <ion-icon slot="icon-only" name="close" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Save" data-testid="kit-save" (click)="save()">
            <ion-icon slot="icon-only" name="checkmark" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        <ion-item>
          <ion-input
            label="Name"
            labelPlacement="stacked"
            data-testid="kit-name"
            autocapitalize="words"
            [placeholder]="kind === 'filters' ? 'UHC' : 'Optional'"
            [value]="value('name')"
            (ionInput)="set('name', $event)"
          ></ion-input>
        </ion-item>
        @switch (kind) {
          @case ('telescopes') {
            <ion-item>
              <ion-select
                label="Type"
                labelPlacement="stacked"
                interface="popover"
                data-testid="kit-type"
                [value]="value('type')"
                (ionChange)="set('type', $event)"
              >
                @for (type of telescopeTypes; track type[0]) {
                  <ion-select-option [value]="type[0]">{{ type[1] }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-input
                label="Aperture (mm)"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                data-testid="kit-aperture"
                [value]="value('apertureMm')"
                (ionInput)="set('apertureMm', $event)"
              ></ion-input>
            </ion-item>
            <ion-item>
              <ion-input
                label="Focal length (mm)"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                data-testid="kit-focal"
                [value]="value('focalMm')"
                (ionInput)="set('focalMm', $event)"
              ></ion-input>
            </ion-item>
          }
          @case ('eyepieces') {
            <ion-item>
              <ion-input
                label="Focal length (mm)"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                data-testid="kit-focal"
                [value]="value('focalMm')"
                (ionInput)="set('focalMm', $event)"
              ></ion-input>
            </ion-item>
            <ion-item>
              <ion-input
                label="Apparent field (°)"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                data-testid="kit-field"
                [value]="value('fieldDeg')"
                (ionInput)="set('fieldDeg', $event)"
              ></ion-input>
            </ion-item>
          }
          @case ('modifiers') {
            <ion-item>
              <ion-input
                label="Factor (×)"
                labelPlacement="stacked"
                type="number"
                inputmode="decimal"
                helperText="2 for a 2× Barlow · 0.63 for a reducer"
                data-testid="kit-factor"
                [value]="value('factor')"
                (ionInput)="set('factor', $event)"
              ></ion-input>
            </ion-item>
          }
        }
      </ion-list>
      @if (error()) {
        <p class="error" role="alert" data-testid="kit-error">{{ error() }}</p>
      }
    </ion-content>
  `,
})
export class EquipmentEditorComponent implements OnInit {
  /** Which kind of item, and the item to change, or none to add a new one. */
  @Input() kind: KitKind = 'telescopes';
  @Input() item?: KitItem;

  protected readonly modals = inject(ModalController);
  protected readonly telescopeTypes = Object.entries(TELESCOPE_TYPES);
  protected title = '';
  protected readonly error = signal('');
  /** The values being edited, as typed: numbers are checked on saving. */
  private readonly draft = signal<Record<string, unknown>>({});

  constructor() {
    addIcons({ checkmark, close });
  }

  ngOnInit(): void {
    this.draft.set({ ...(this.item ?? blankItem(this.kind)) });
    this.title = this.item ? TITLES[this.kind] : `New ${TITLES[this.kind].toLowerCase()}`;
  }

  protected value(key: string): unknown {
    return this.draft()[key];
  }

  protected set(key: string, event: Event): void {
    const value = (event as CustomEvent<{ value?: unknown }>).detail.value;
    this.draft.update((draft) => ({ ...draft, [key]: value }));
    this.error.set('');
  }

  /** Checks the numbers and returns the item, or shows what is wrong. */
  protected save(): void {
    const draft: Record<string, unknown> = { ...this.draft(), name: String(this.draft()['name'] ?? '').trim() };
    if (this.kind === 'filters' && !draft['name']) {
      this.error.set('Give the filter a name');
      return;
    }
    for (const key of Object.keys(RANGES)) {
      if (!(key in draft) || key === 'eyepieceFocalMm') continue;
      // An eyepiece's focal length has its own, shorter range.
      const [min, max] = key === 'focalMm' && this.kind === 'eyepieces' ? RANGES['eyepieceFocalMm'] : RANGES[key];
      const number = Number(draft[key]);
      if (draft[key] === '' || draft[key] === null || !Number.isFinite(number) || number < min || number > max) {
        this.error.set(`Use a number from ${min} to ${max}`);
        return;
      }
      draft[key] = number;
    }
    void this.modals.dismiss(draft as unknown as KitItem, 'save');
  }
}
