import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  arrowBack,
  bluetoothOutline,
  cameraOutline,
  globeOutline,
  locateOutline,
  locationOutline,
  navigateOutline,
  phonePortraitOutline,
  phoneLandscapeOutline,
  volumeLowOutline,
  telescopeOutline,
} from 'ionicons/icons';

import { APP_ICONS } from '../core/app-icons';
import { AppState } from '../core/app-state.service';
import type { Settings } from '../core/app-state.service';
import { formatLocation } from '../core/astronomy/astronomy';
import { LOCATION_UPDATED } from '../core/platform/permission-help';
import { PermissionsService } from '../core/platform/permissions.service';
import { SoundService } from '../core/platform/sound.service';
import { RemoteService } from '../core/remote/remote.service';
import { SettingsAboutComponent } from '../core/settings/settings-about.component';
import { SettingsDisplayComponent } from '../core/settings/settings-display.component';
import { SETTINGS_ROW_STYLES } from '../core/settings/settings-styles';
import { SettingsSyncComponent } from '../core/settings/settings-sync.component';
import { SettingsTestingComponent } from '../core/settings/settings-testing.component';
import { SkyBrightnessService } from '../core/sky-conditions/sky-brightness.service';
import { BORTLE_CLASSES } from '../core/sky-conditions/sky-quality';

type NumericSetting = 'latitudeDeg' | 'longitudeDeg';

/**
 * Settings, in sections ordered by how often an observer needs them: where they are,
 * their telescope, how the app looks, then testing tools and credits. Each row has an
 * icon, and its explanation sits in the row itself rather than in a separate one.
 */
@Component({
  selector: 'app-settings',
  imports: [
    RouterLink,
    TranslatePipe,
    SettingsAboutComponent,
    SettingsDisplayComponent,
    SettingsSyncComponent,
    SettingsTestingComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToggle,
    IonToolbar,
  ],
  styles: [
    SETTINGS_ROW_STYLES,
    `
      /* Text under a section, like the explanations under iOS settings groups. */
      .section-note {
        margin: 0 28px 12px;
        color: var(--af-muted);
        font-size: calc(14px * var(--af-scale, 1));
        line-height: 1.4;
      }
      /* Latitude and longitude side by side, each taking half the row. */
      .coordinates {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        width: 100%;
        padding-bottom: 8px;
      }
      ion-input::part(supporting-text) {
        color: var(--af-muted);
        font-size: calc(14px * var(--af-scale, 1));
      }
    `,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button
            [attr.aria-label]="'common.backToMap' | translate"
            data-testid="back-to-map"
            (click)="backToMap()"
          >
            <ion-icon slot="icon-only" name="arrow-back" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title data-testid="settings-title">{{ 'settings.title' | translate }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- The sections go in two columns on a phone on its side: see .af-columns in global.scss. -->
      <div class="af-columns">
        <!-- Where the observer is, which everything on the sky depends on. Its note stays with it. -->
        <div>
          <ion-list inset="true">
            <ion-list-header>{{ 'settings.locationAndSky' | translate }}</ion-list-header>
            <ion-item data-testid="location-status">
              <ion-icon slot="start" name="location-outline" aria-hidden="true"></ion-icon>
              <ion-label class="ion-text-wrap">
                <h2>{{ 'settings.yourLocation' | translate }}</h2>
                <p [class.warn]="!settings().locationSet">
                  {{ gpsMessage() ? (gpsMessage() | translate) : locationText() }}
                </p>
              </ion-label>
              <ion-button slot="end" size="small" data-testid="use-gps" (click)="useGps()">
                <ion-icon slot="start" name="navigate-outline" aria-hidden="true"></ion-icon>
                {{ 'settings.gps' | translate }}
              </ion-button>
            </ion-item>
            <!-- Typing the location instead: both numbers side by side, in degrees. -->
            <ion-item>
              <ion-icon slot="start" name="globe-outline" aria-hidden="true"></ion-icon>
              <div class="coordinates">
                <ion-input
                  [label]="'settings.latitude' | translate"
                  labelPlacement="stacked"
                  type="number"
                  inputmode="decimal"
                  placeholder="40.42"
                  [helperText]="'settings.northIsPlus' | translate"
                  data-testid="latitude"
                  [value]="settings().locationSet ? settings().latitudeDeg : null"
                  (ionChange)="setNumber('latitudeDeg', $event, -90, 90)"
                ></ion-input>
                <ion-input
                  [label]="'settings.longitude' | translate"
                  labelPlacement="stacked"
                  type="number"
                  inputmode="decimal"
                  placeholder="-3.70"
                  [helperText]="'settings.eastIsPlus' | translate"
                  data-testid="longitude"
                  [value]="settings().locationSet ? settings().longitudeDeg : null"
                  (ionChange)="setNumber('longitudeDeg', $event, -180, 180)"
                ></ion-input>
              </div>
            </ion-item>
            <ion-item lines="none">
              <ion-icon slot="start" [src]="appIcons.skyDarkness" aria-hidden="true"></ion-icon>
              <ion-select
                [label]="'settings.skyDarkness' | translate"
                interface="popover"
                data-testid="bortle"
                [value]="bortleValue()"
                (ionChange)="setBortle($any($event).detail.value)"
              >
                <!-- Auto, from the light pollution atlas, where the app has it: see sky-brightness.service.ts. -->
                @if (skyBrightness.available()) {
                  <ion-select-option value="auto" data-testid="bortle-auto">{{ autoLabel() }}</ion-select-option>
                }
                @for (option of bortleClasses; track option.value) {
                  <ion-select-option [value]="option.value">{{ option.label | translate }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          </ion-list>
          <p class="section-note">{{ 'settings.bortleScale' | translate }}</p>
          @if (skyBrightness.reading(); as reading) {
            <p class="section-note" data-testid="sky-brightness">
              {{ 'settings.lightPollution' | translate: { magnitude: reading.magnitude.toFixed(1) } }}
            </p>
          }
        </div>

        <!-- The user's equipment, which the eyepiece view picks from, on a page of its own. -->
        <ion-list inset="true">
          <ion-item button detail="true" data-testid="open-equipment" routerLink="/tabs/settings/equipment">
            <ion-icon slot="start" name="telescope-outline" aria-hidden="true"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h2>{{ 'settings.equipment' | translate }}</h2>
              <p>{{ 'settings.equipmentNote' | translate }}</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <!-- The log, lists and kit, the same on all the user's devices. -->
        <app-settings-sync />

        <!-- How the phone sits on the telescope, and how it finds where it points. -->
        <ion-list inset="true">
          <ion-list-header>{{ 'settings.telescopeAndAlignment' | translate }}</ion-list-header>
          <ion-item button detail="true" data-testid="open-alignment" (click)="openAlignment()">
            <ion-icon slot="start" name="locate-outline" aria-hidden="true"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h2>{{ 'settings.alignment' | translate }}</h2>
              @if (state.alignment(); as alignment) {
                <p class="good">{{ 'settings.alignedOn' | translate: { star: alignment.starId } }}</p>
              } @else {
                <p class="warn">{{ 'settings.notAligned' | translate }}</p>
              }
            </ion-label>
          </ion-item>
          <!-- One phone on the telescope as the finder, another in the hand as the screen. -->
          <ion-item button detail="true" data-testid="open-remote" (click)="openRemote()">
            <ion-icon slot="start" name="phone-landscape-outline" aria-hidden="true"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h2>{{ 'settings.twoPhones' | translate }}</h2>
              @switch (remote.status()) {
                @case ('connected') {
                  <p class="good">
                    {{ (remote.role() === 'finder' ? 'settings.thisIsFinder' : 'settings.linkedToFinder') | translate }}
                  </p>
                }
                @case ('paused') {
                  <p>{{ 'settings.linkPaused' | translate }}</p>
                }
                @case ('lost') {
                  <p class="warn">{{ 'settings.linkLost' | translate }}</p>
                }
                @default {
                  <p>{{ 'settings.twoPhonesNote' | translate }}</p>
                }
              }
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-icon slot="start" name="camera-outline" aria-hidden="true"></ion-icon>
            <ion-toggle
              data-testid="auto-solve"
              [checked]="settings().autoSolve"
              (ionChange)="state.updateSettings({ autoSolve: $any($event).detail.checked })"
            >
              {{ 'settings.autoSolve' | translate }}
            </ion-toggle>
          </ion-item>
          <ion-item>
            <ion-icon slot="start" name="volume-low-outline" aria-hidden="true"></ion-icon>
            <ion-toggle
              data-testid="solve-sound"
              [checked]="settings().solveSound"
              (ionChange)="setSolveSound($any($event).detail.checked)"
            >
              {{ 'settings.solveSound' | translate }}
            </ion-toggle>
          </ion-item>
          <!--
            A Bluetooth camera shutter remote, so the phone needn't be touched: it aligns on the
            Align page, and plate solves on the sky map.
          -->
          <ion-item>
            <ion-icon slot="start" name="bluetooth-outline" aria-hidden="true"></ion-icon>
            <ion-toggle
              data-testid="shutter-aligns"
              [checked]="settings().shutterAligns"
              (ionChange)="state.updateSettings({ shutterAligns: $any($event).detail.checked })"
            >
              {{ 'settings.shutterAligns' | translate }}
            </ion-toggle>
          </ion-item>
        </ion-list>

        <!-- How the app looks: language, text size, night mode and more. -->
        <app-settings-display />

        <!-- For checking the app on a real phone and a real sky. -->
        <app-settings-testing />

        <!-- The data credits, on a page of their own, and the privacy policy and terms. -->
        <app-settings-about />
      </div>
    </ion-content>
  `,
})
export class SettingsPage {
  protected readonly state = inject(AppState);
  protected readonly remote = inject(RemoteService);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionsService);

  protected backToMap(): void {
    void this.router.navigateByUrl('/tabs/sky');
  }
  protected readonly settings = this.state.settings;
  private readonly sound = inject(SoundService);
  protected readonly appIcons = APP_ICONS;
  private readonly translate = inject(TranslateService);
  /** The key of the GPS's last message, while finding or after a problem. */
  protected readonly gpsMessage = signal('');
  protected readonly bortleClasses = BORTLE_CLASSES;
  protected readonly skyBrightness = inject(SkyBrightnessService);

  /** The sky darkness chosen: "auto" while it follows the atlas, otherwise the class. */
  protected readonly bortleValue = computed(() =>
    this.settings().bortleAuto && this.skyBrightness.available() ? 'auto' : this.settings().bortle,
  );

  /** Auto with the class the atlas gives here, once known: "Auto · 9: inner city sky". */
  protected readonly autoLabel = computed(() => {
    const reading = this.skyBrightness.reading();
    if (!reading) return this.translate.instant('settings.autoFromLocation') as string;
    const label = this.translate.instant(BORTLE_CLASSES[reading.bortle - 1].label) as string;
    return this.translate.instant('settings.autoWithClass', { label }) as string;
  });

  /** The location in words, or a warning that the sky is shown for a neutral place. */
  protected readonly locationText = computed(() => {
    const { latitudeDeg, longitudeDeg, locationSet } = this.settings();
    return locationSet
      ? formatLocation(latitudeDeg, longitudeDeg)
      : (this.translate.instant('settings.locationNotSet') as string);
  });

  constructor() {
    addIcons({
      phoneLandscapeOutline,
      arrowBack,
      bluetoothOutline,
      cameraOutline,
      globeOutline,
      locateOutline,
      locationOutline,
      navigateOutline,
      phonePortraitOutline,
      volumeLowOutline,
      telescopeOutline,
    });
  }

  /** Saves a number, ignoring values that are empty or outside the sensible range. */
  protected setNumber(key: NumericSetting, event: Event, min: number, max: number): void {
    const raw = (event as CustomEvent<{ value?: string | null }>).detail.value;
    const value = Number(raw);
    if (raw !== '' && raw != null && Number.isFinite(value) && value >= min && value <= max) {
      // A typed location counts as set, just like one from GPS.
      this.state.updateSettings({ [key]: value, locationSet: true } as Partial<Settings>);
    }
  }

  /** Auto follows the atlas again; a class chosen by hand stops it. */
  protected setBortle(value: number | 'auto'): void {
    this.state.updateSettings(value === 'auto' ? { bortleAuto: true } : { bortle: value, bortleAuto: false });
  }

  /** Turning the shutter sound on plays it once, so it can be heard without a solve. */
  protected setSolveSound(on: boolean): void {
    this.state.updateSettings({ solveSound: on });
    if (on) this.sound.shutter();
  }

  protected openAlignment(): void {
    void this.router.navigateByUrl('/align');
  }

  protected openRemote(): void {
    void this.router.navigateByUrl('/remote');
  }

  protected async useGps(): Promise<void> {
    this.gpsMessage.set('location.finding');
    const message = await this.permissions.locate();
    // On success the row shows the new location, so only a problem needs saying.
    this.gpsMessage.set(this.settings().locationSet && message === LOCATION_UPDATED ? '' : message);
  }
}
