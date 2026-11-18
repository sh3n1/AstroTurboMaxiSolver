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
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowBack,
  bluetoothOutline,
  cameraOutline,
  globeOutline,
  gridOutline,
  locateOutline,
  locationOutline,
  lockOpenOutline,
  moonOutline,
  navigateOutline,
  phonePortraitOutline,
  phoneLandscapeOutline,
  volumeLowOutline,
  telescopeOutline,
  textOutline,
} from 'ionicons/icons';

import { APP_ICONS } from '../core/app-icons';
import { AppState } from '../core/app-state.service';
import type { Settings } from '../core/app-state.service';
import { formatLocation } from '../core/astronomy';
import { PermissionsService } from '../core/permissions.service';
import { RemoteService } from '../core/remote.service';
import { ScreenWakeService } from '../core/screen-wake.service';
import { SettingsAboutComponent } from '../core/settings/settings-about.component';
import { SETTINGS_ROW_STYLES } from '../core/settings/settings-styles';
import { SettingsSyncComponent } from '../core/settings/settings-sync.component';
import { SettingsTestingComponent } from '../core/settings/settings-testing.component';
import { SkyBrightnessService } from '../core/sky-brightness.service';
import { BORTLE_CLASSES } from '../core/sky-quality';
import { SoundService } from '../core/sound.service';
import { SyncService } from '../core/sync/sync.service';

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
    SettingsAboutComponent,
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
    IonSegment,
    IonSegmentButton,
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
      /* The text size choice: a label above three sample letters of growing size. */
      .text-size {
        width: 100%;
        padding: 10px 0 12px;
      }
      .text-size ion-segment {
        margin-top: 8px;
      }
      .text-size ion-segment-button {
        min-height: 44px;
        /* Ionic shows segment text in capitals. These are samples of the text, so keep them as typed. */
        text-transform: none;
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
      .sample-standard {
        font-size: 16px;
      }
      .sample-large {
        font-size: 19px;
      }
      .sample-extra-large {
        font-size: 23px;
      }
    `,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button aria-label="Back to the map" data-testid="back-to-map" (click)="backToMap()">
            <ion-icon slot="icon-only" name="arrow-back" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
        <!-- Five quick taps show sync, hidden while it is tried out. -->
        <ion-title data-testid="settings-title" (click)="titleTapped()">Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- The sections go in two columns on a phone on its side: see .af-columns in global.scss. -->
      <div class="af-columns">
        <!-- Where the observer is, which everything on the sky depends on. Its note stays with it. -->
        <div>
          <ion-list inset="true">
            <ion-list-header>Location and sky</ion-list-header>
            <ion-item data-testid="location-status">
              <ion-icon slot="start" name="location-outline" aria-hidden="true"></ion-icon>
              <ion-label class="ion-text-wrap">
                <h2>Your location</h2>
                <p [class.warn]="!settings().locationSet">{{ gpsMessage() || locationText() }}</p>
              </ion-label>
              <ion-button slot="end" size="small" data-testid="use-gps" (click)="useGps()">
                <ion-icon slot="start" name="navigate-outline" aria-hidden="true"></ion-icon>
                GPS
              </ion-button>
            </ion-item>
            <!-- Typing the location instead: both numbers side by side, in degrees. -->
            <ion-item>
              <ion-icon slot="start" name="globe-outline" aria-hidden="true"></ion-icon>
              <div class="coordinates">
                <ion-input
                  label="Latitude"
                  labelPlacement="stacked"
                  type="number"
                  inputmode="decimal"
                  placeholder="40.42"
                  helperText="North is +"
                  data-testid="latitude"
                  [value]="settings().locationSet ? settings().latitudeDeg : null"
                  (ionChange)="setNumber('latitudeDeg', $event, -90, 90)"
                ></ion-input>
                <ion-input
                  label="Longitude"
                  labelPlacement="stacked"
                  type="number"
                  inputmode="decimal"
                  placeholder="-3.70"
                  helperText="East is +"
                  data-testid="longitude"
                  [value]="settings().locationSet ? settings().longitudeDeg : null"
                  (ionChange)="setNumber('longitudeDeg', $event, -180, 180)"
                ></ion-input>
              </div>
            </ion-item>
            <ion-item lines="none">
              <ion-icon slot="start" [src]="appIcons.skyDarkness" aria-hidden="true"></ion-icon>
              <ion-select
                label="Sky darkness"
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
                  <ion-select-option [value]="option.value">{{ option.label }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          </ion-list>
          <p class="section-note">Bortle: 1 dark site · 5 suburbs · 9 city centre</p>
          @if (skyBrightness.reading(); as reading) {
            <p class="section-note" data-testid="sky-brightness">
              Light pollution atlas: {{ reading.magnitude.toFixed(1) }} mag/arcsec²
            </p>
          }
        </div>

        <!-- The user's equipment, which the eyepiece view picks from, on a page of its own. -->
        <ion-list inset="true">
          <ion-item button detail="true" data-testid="open-equipment" routerLink="/tabs/settings/equipment">
            <ion-icon slot="start" name="telescope-outline" aria-hidden="true"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h2>Equipment</h2>
              <p>Telescopes, eyepieces, Barlows and filters</p>
            </ion-label>
          </ion-item>
        </ion-list>

        <!-- The log, lists and kit, the same on all the user's devices. Hidden for now. -->
        @if (sync.visible()) {
          <app-settings-sync />
        }

        <!-- How the phone sits on the telescope, and how it finds where it points. -->
        <ion-list inset="true">
          <ion-list-header>Telescope and alignment</ion-list-header>
          <ion-item button detail="true" data-testid="open-alignment" (click)="openAlignment()">
            <ion-icon slot="start" name="locate-outline" aria-hidden="true"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h2>Telescope alignment</h2>
              @if (state.alignment(); as alignment) {
                <p class="good">Aligned on {{ alignment.starId }}</p>
              } @else {
                <p class="warn">Not aligned</p>
              }
            </ion-label>
          </ion-item>
          <!-- One phone on the telescope as the finder, another in the hand as the screen. -->
          <ion-item button detail="true" data-testid="open-remote" (click)="openRemote()">
            <ion-icon slot="start" name="phone-landscape-outline" aria-hidden="true"></ion-icon>
            <ion-label class="ion-text-wrap">
              <h2>Two phones</h2>
              @switch (remote.status()) {
                @case ('connected') {
                  <p class="good">
                    {{ remote.role() === 'finder' ? 'This phone is the finder' : 'Linked to the finder' }}
                  </p>
                }
                @case ('paused') {
                  <p>Link paused</p>
                }
                @case ('lost') {
                  <p class="warn">Link lost</p>
                }
                @default {
                  <p>Finder on the telescope, screen in your hand</p>
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
              Plate solve when still
            </ion-toggle>
          </ion-item>
          <ion-item>
            <ion-icon slot="start" name="volume-low-outline" aria-hidden="true"></ion-icon>
            <ion-toggle
              data-testid="solve-sound"
              [checked]="settings().solveSound"
              (ionChange)="setSolveSound($any($event).detail.checked)"
            >
              Shutter sound on solve
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
              Shutter remote aligns and solves
            </ion-toggle>
          </ion-item>
        </ion-list>

        <!-- How the app looks. -->
        <ion-list inset="true">
          <ion-list-header>Display</ion-list-header>
          <ion-item>
            <ion-icon slot="start" name="text-outline" aria-hidden="true"></ion-icon>
            <div class="text-size">
              <ion-label id="text-size-label">Text size</ion-label>
              <ion-segment
                aria-labelledby="text-size-label"
                data-testid="text-size"
                [value]="settings().textSize"
                (ionChange)="state.updateSettings({ textSize: $any($event).detail.value })"
              >
                <ion-segment-button value="standard" aria-label="Standard">
                  <ion-label class="sample-standard">Aa</ion-label>
                </ion-segment-button>
                <ion-segment-button value="large" aria-label="Large">
                  <ion-label class="sample-large">Aa</ion-label>
                </ion-segment-button>
                <ion-segment-button value="extra-large" aria-label="Extra large">
                  <ion-label class="sample-extra-large">Aa</ion-label>
                </ion-segment-button>
              </ion-segment>
            </div>
          </ion-item>
          <ion-item>
            <ion-icon slot="start" name="moon-outline" aria-hidden="true"></ion-icon>
            <ion-toggle
              data-testid="night-mode"
              [checked]="settings().nightMode"
              (ionChange)="state.updateSettings({ nightMode: $any($event).detail.checked })"
            >
              Red night mode
            </ion-toggle>
          </ion-item>
          <ion-item>
            <ion-icon slot="start" name="lock-open-outline" aria-hidden="true"></ion-icon>
            <ion-toggle
              data-testid="keep-screen-on"
              [helperText]="screenWake.supported ? '' : 'Not supported in this browser'"
              [disabled]="!screenWake.supported"
              [checked]="settings().keepScreenOn && screenWake.supported"
              (ionChange)="state.updateSettings({ keepScreenOn: $any($event).detail.checked })"
            >
              Keep screen on
            </ion-toggle>
          </ion-item>
          <ion-item lines="none">
            <ion-icon slot="start" name="grid-outline" aria-hidden="true"></ion-icon>
            <ion-toggle
              data-testid="show-equatorial"
              [checked]="settings().showEquatorial"
              (ionChange)="state.updateSettings({ showEquatorial: $any($event).detail.checked })"
            >
              Show RA and Dec
            </ion-toggle>
          </ion-item>
        </ion-list>

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

  protected readonly sync = inject(SyncService);
  /** Taps on the title in a row, and when the last one was. */
  private titleTaps = { count: 0, at: 0 };

  protected backToMap(): void {
    void this.router.navigateByUrl('/tabs/sky');
  }

  /** Five taps on the title, each within a second of the one before, show sync. */
  protected titleTapped(): void {
    const now = Date.now();
    this.titleTaps = { count: now - this.titleTaps.at < 1000 ? this.titleTaps.count + 1 : 1, at: now };
    if (this.titleTaps.count >= 5) this.sync.unlock();
  }
  protected readonly settings = this.state.settings;
  protected readonly screenWake = inject(ScreenWakeService);
  private readonly sound = inject(SoundService);
  protected readonly appIcons = APP_ICONS;
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
    return reading ? `Auto · ${BORTLE_CLASSES[reading.bortle - 1].label}` : 'Auto, from location';
  });

  /** The location in words, or a warning that the sky is shown for a neutral place. */
  protected readonly locationText = computed(() => {
    const { latitudeDeg, longitudeDeg, locationSet } = this.settings();
    return locationSet ? formatLocation(latitudeDeg, longitudeDeg) : 'Not set. Use GPS or enter it below.';
  });

  constructor() {
    addIcons({
      phoneLandscapeOutline,
      arrowBack,
      bluetoothOutline,
      cameraOutline,
      globeOutline,
      gridOutline,
      locateOutline,
      locationOutline,
      lockOpenOutline,
      moonOutline,
      navigateOutline,
      phonePortraitOutline,
      volumeLowOutline,
      telescopeOutline,
      textOutline,
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
    this.gpsMessage.set('Finding location…');
    const message = await this.permissions.locate();
    // On success the row shows the new location, so only a problem needs saying.
    this.gpsMessage.set(this.settings().locationSet && message === 'Location updated' ? '' : message);
  }
}
