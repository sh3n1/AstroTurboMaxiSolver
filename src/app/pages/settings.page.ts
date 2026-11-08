import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBadge,
  IonButton,
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
  chatbubbleEllipsesOutline,
  chevronDown,
  chevronUp,
  contrastOutline,
  flaskOutline,
  globeOutline,
  gridOutline,
  listOutline,
  locateOutline,
  locationOutline,
  moonOutline,
  navigateOutline,
  openOutline,
  phonePortraitOutline,
  scanOutline,
  sunnyOutline,
  telescopeOutline,
  textOutline,
} from 'ionicons/icons';

import { AppState } from '../core/app-state.service';
import type { Settings } from '../core/app-state.service';
import { formatLocation } from '../core/astronomy';
import { LiveSolverService } from '../core/live-solver.service';
import { LocalTimePipe } from '../core/local-time.pipe';
import { ScreenWakeService } from '../core/screen-wake.service';
import { BORTLE_CLASSES } from '../core/sky-quality';

type NumericSetting = 'latitudeDeg' | 'longitudeDeg';

/**
 * Settings, in sections ordered by how often an observer needs them: where they are,
 * their telescope, how the app looks, then testing tools and credits. Each row has an
 * icon, and its explanation sits in the row itself rather than in a separate one.
 */
@Component({
  selector: 'app-settings',
  imports: [
    LocalTimePipe,
    DecimalPipe,
    IonBadge,
    IonButton,
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
  styles: `
    /* Section titles: small, bold and spaced, so the sections are easy to tell apart. */
    ion-list-header {
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      min-height: 32px;
    }
    ion-list {
      margin-bottom: 4px;
    }
    /* Icons lead each row, in the app's light blue. */
    ion-item > ion-icon[slot='start'] {
      color: var(--ion-color-primary);
      margin-inline-end: 16px;
    }
    /* Labels and hints wrap instead of being cut off, at the readable text sizes. */
    ion-toggle::part(label),
    ion-select::part(label) {
      white-space: normal;
      overflow: visible;
    }
    ion-toggle::part(supporting-text) {
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
      line-height: 1.35;
    }
    ion-label p {
      color: var(--af-muted);
    }
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
    .good {
      color: #6fcf9f;
    }
    .warn {
      color: #ffb454;
    }
    /* Green has little red in it, so at night it would turn dark red. Full-strength there. */
    :host-context(html.night) .good {
      color: var(--af-text);
    }
    .credit {
      font-size: calc(14px * var(--af-scale, 1));
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Where the observer is, which everything on the sky depends on. -->
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
          <ion-icon slot="start" name="contrast-outline" aria-hidden="true"></ion-icon>
          <ion-select
            label="Sky darkness"
            interface="popover"
            data-testid="bortle"
            [value]="settings().bortle"
            (ionChange)="state.updateSettings({ bortle: $any($event).detail.value })"
          >
            @for (option of bortleClasses; track option.value) {
              <ion-select-option [value]="option.value">{{ option.label }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </ion-list>
      <p class="section-note">
        Sky darkness, on the Bortle scale, sets how faint the eyepiece view shows stars. Class 1 is a remote dark site,
        4 to 5 is countryside near a town or the suburbs, and 8 to 9 is a city centre.
      </p>

      <!-- How the phone sits on the telescope, and how it finds where it points. -->
      <ion-list inset="true">
        <ion-list-header>Telescope and alignment</ion-list-header>
        <ion-item>
          <ion-icon slot="start" name="phone-portrait-outline" aria-hidden="true"></ion-icon>
          <ion-select
            label="Phone mount"
            interface="popover"
            data-testid="mount"
            [value]="settings().mount"
            (ionChange)="state.updateSettings({ mount: $any($event).detail.value })"
          >
            <ion-select-option value="direct">Camera at the sky</ion-select-option>
            <ion-select-option value="clip-on">Camera with small telescope</ion-select-option>
            <ion-select-option value="mirror">Parallel with mirror</ion-select-option>
          </ion-select>
        </ion-item>
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
        <ion-item>
          <ion-icon slot="start" name="scan-outline" aria-hidden="true"></ion-icon>
          <ion-toggle
            data-testid="auto-solve"
            helperText="Uses the camera while sensors are on. For now, only with the camera pointing straight at the sky."
            [checked]="settings().autoSolve"
            (ionChange)="state.updateSettings({ autoSolve: $any($event).detail.checked })"
          >
            Plate solve when still
          </ion-toggle>
        </ion-item>
        <ion-item lines="none" data-testid="equipment-moved">
          <ion-icon slot="start" name="telescope-outline" aria-hidden="true"></ion-icon>
          <ion-label class="ion-text-wrap">
            <h2>Telescope and eyepiece</h2>
            <p>Set them in the Eyepiece view on the Sky tab, where you see the result straight away.</p>
          </ion-label>
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
            helperText="Keeps your eyes used to the dark. Also on the moon button on the sky map."
            [checked]="settings().nightMode"
            (ionChange)="state.updateSettings({ nightMode: $any($event).detail.checked })"
          >
            Red night mode
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" name="sunny-outline" aria-hidden="true"></ion-icon>
          <ion-toggle
            data-testid="keep-screen-on"
            [helperText]="
              screenWake.supported
                ? 'Stops the phone sleeping while the app is open, so the map stays ready at the eyepiece.'
                : 'This browser can’t keep the screen on. The phone’s own sleep setting applies.'
            "
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
            helperText="Right ascension and declination of the view, top left on the sky map."
            [checked]="settings().showEquatorial"
            (ionChange)="state.updateSettings({ showEquatorial: $any($event).detail.checked })"
          >
            Show RA and Dec
          </ion-toggle>
        </ion-item>
      </ion-list>

      <!-- For checking the app on a real phone and a real sky. -->
      <ion-list inset="true">
        <ion-list-header>Testing tools</ion-list-header>
        <ion-item button detail="true" data-testid="open-device-test" (click)="openDeviceTest()">
          <ion-icon slot="start" name="flask-outline" aria-hidden="true"></ion-icon>
          <ion-label class="ion-text-wrap">
            <h2>Device test</h2>
            <p>Camera, sensors and plate solving</p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-icon slot="start" name="chatbubble-ellipses-outline" aria-hidden="true"></ion-icon>
          <ion-toggle
            data-testid="success-toast"
            helperText="Failures always show one. This adds one for each success, with the stars matched."
            [checked]="settings().solveSuccessToast"
            (ionChange)="state.updateSettings({ solveSuccessToast: $any($event).detail.checked })"
          >
            Toast on successful solves
          </ion-toggle>
        </ion-item>
        <ion-item
          button
          detail="false"
          data-testid="open-solve-log"
          [attr.aria-expanded]="showSolveLog()"
          (click)="showSolveLog.set(!showSolveLog())"
        >
          <ion-icon slot="start" name="list-outline" aria-hidden="true"></ion-icon>
          <ion-label>Plate solving log</ion-label>
          <ion-badge slot="end" color="medium">{{ liveSolver.log().length }}</ion-badge>
          <ion-icon slot="end" aria-hidden="true" [name]="showSolveLog() ? 'chevron-up' : 'chevron-down'"></ion-icon>
        </ion-item>
        @if (showSolveLog()) {
          <!-- The latest attempts in this session, newest first, for checking on a real sky. -->
          @for (entry of liveSolver.log(); track entry.id) {
            <ion-item data-testid="solve-log-entry">
              <ion-label class="ion-text-wrap">
                <h3 [class.good]="entry.outcome === 'solved'">{{ entry.message }}</h3>
                <p>
                  {{ entry.at | localTime: 'time-seconds' }} ·
                  {{ entry.trigger === 'auto' ? 'Automatic' : 'Alignment' }} ·
                  {{ entry.durationMs / 1000 | number: '1.1-1' }} s · ISO {{ entry.iso }}
                  @if (entry.starCount > 0) {
                    · {{ entry.starCount }} stars found
                  }
                  @if (entry.sensorErrorDeg !== null) {
                    · sensors were {{ entry.sensorErrorDeg | number: '1.1-1' }}° off
                  }
                </p>
              </ion-label>
            </ion-item>
          } @empty {
            <ion-item data-testid="solve-log-empty">
              <ion-label class="ion-text-wrap">
                <p>No plate solves yet. Turn sensors on and hold the phone still.</p>
              </ion-label>
            </ion-item>
          }
        }
      </ion-list>

      <!-- The licences of the data require these credits. -->
      <ion-list inset="true">
        <ion-list-header>Data credits</ion-list-header>
        <ion-item
          data-testid="credit-openngc"
          href="https://github.com/mattiaverga/OpenNGC"
          target="_blank"
          rel="noopener"
          detail="false"
        >
          <ion-label class="ion-text-wrap credit">
            NGC and IC objects from OpenNGC by Mattia Verga, CC BY-SA 4.0. Converted and filtered for this app.
          </ion-label>
          <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap credit"
            >Stars, star names and constellation lines from XHIP and the IAU, via d3-celestial.</ion-label
          >
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap credit">Messier data by H. Frommert, seds.org, via d3-celestial.</ion-label>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap credit">Caldwell catalogue compiled by Sir Patrick Moore.</ion-label>
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap credit" data-testid="credit-wds"
            >Double stars from the Washington Double Star Catalog, maintained at the U.S. Naval Observatory.</ion-label
          >
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap credit"
            >Compass correction from the World Magnetic Model, NOAA and the British Geological Survey, via geomagnetism
            by Natural Atlas, Apache License 2.0.</ion-label
          >
        </ion-item>
        <ion-item>
          <ion-label class="ion-text-wrap credit"
            >Planets, Pluto, Moon and sky positions by Astronomy Engine, Don Cross.</ion-label
          >
        </ion-item>
        <ion-item lines="none" data-testid="credit-jpl">
          <ion-label class="ion-text-wrap credit"
            >Orbits of Ceres, Vesta, Pallas and Juno from the NASA/JPL Small-Body Database.</ion-label
          >
        </ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class SettingsPage {
  protected readonly state = inject(AppState);
  private readonly router = inject(Router);
  protected readonly settings = this.state.settings;
  protected readonly liveSolver = inject(LiveSolverService);
  protected readonly screenWake = inject(ScreenWakeService);
  protected readonly showSolveLog = signal(false);
  protected readonly gpsMessage = signal('');
  protected readonly bortleClasses = BORTLE_CLASSES;

  /** The location in words, or a warning that the sky is shown for a neutral place. */
  protected readonly locationText = computed(() => {
    const { latitudeDeg, longitudeDeg, locationSet } = this.settings();
    return locationSet ? formatLocation(latitudeDeg, longitudeDeg) : 'Not set. Use GPS or enter it below.';
  });

  constructor() {
    addIcons({
      chatbubbleEllipsesOutline,
      chevronDown,
      chevronUp,
      contrastOutline,
      flaskOutline,
      globeOutline,
      gridOutline,
      listOutline,
      locateOutline,
      locationOutline,
      moonOutline,
      navigateOutline,
      openOutline,
      phonePortraitOutline,
      scanOutline,
      sunnyOutline,
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

  protected openDeviceTest(): void {
    void this.router.navigateByUrl('/device-test');
  }

  protected openAlignment(): void {
    void this.router.navigateByUrl('/align');
  }

  protected async useGps(): Promise<void> {
    this.gpsMessage.set('Finding location…');
    const message = await this.state.locateWithGps();
    // On success the row shows the new location, so only a problem needs saying.
    this.gpsMessage.set(this.settings().locationSet && message === 'Location updated' ? '' : message);
  }
}
