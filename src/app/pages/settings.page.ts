import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, isDevMode, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemDivider,
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
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  apertureOutline,
  bluetoothOutline,
  cameraOutline,
  chatbubbleEllipsesOutline,
  chevronDown,
  chevronUp,
  createOutline,
  desktopOutline,
  flaskOutline,
  globeOutline,
  gridOutline,
  listOutline,
  locateOutline,
  locationOutline,
  lockOpenOutline,
  moonOutline,
  navigateOutline,
  openOutline,
  phonePortraitOutline,
  phoneLandscapeOutline,
  volumeLowOutline,
  textOutline,
  trashOutline,
} from 'ionicons/icons';

import { APP_ICONS } from '../core/app-icons';
import { AppState } from '../core/app-state.service';
import type { Settings } from '../core/app-state.service';
import { formatLocation } from '../core/astronomy';
import type { KitItem, KitKind } from '../core/equipment';
import { kitItemDetail, kitItemLabel } from '../core/equipment';
import { EquipmentEditorComponent } from '../core/equipment-editor.component';
import { listToastPlace } from '../core/list-toast';
import { LiveSolverService } from '../core/live-solver.service';
import { LocalTimePipe } from '../core/local-time.pipe';
import { RemoteService } from '../core/remote.service';
import { ScreenWakeService } from '../core/screen-wake.service';
import { BORTLE_CLASSES } from '../core/sky-quality';
import { SoundService } from '../core/sound.service';

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
    IonItemDivider,
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
      color: var(--ion-color-success);
    }
    .warn {
      color: var(--ion-color-warning);
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
                [value]="settings().bortle"
                (ionChange)="state.updateSettings({ bortle: $any($event).detail.value })"
              >
                @for (option of bortleClasses; track option.value) {
                  <ion-select-option [value]="option.value">{{ option.label }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          </ion-list>
          <p class="section-note">Bortle: 1 dark site · 5 suburbs · 9 city centre</p>
        </div>

        <!-- The user's equipment, which the eyepiece view picks from. -->
        <ion-list inset="true" id="equipment" data-testid="equipment">
          <ion-list-header>Equipment</ion-list-header>
          @for (group of kitGroups; track group.kind) {
            <ion-item-divider>{{ group.title }}</ion-item-divider>
            @let items = kitItems(group.kind);
            @for (item of items; track item.id) {
              <ion-item data-testid="kit-item">
                <ion-label class="ion-text-wrap">
                  <h2>{{ itemLabel(group.kind, item) }}</h2>
                  @if (itemDetail(group.kind, item); as detail) {
                    <p>{{ detail }}</p>
                  }
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  data-testid="kit-edit"
                  [attr.aria-label]="'Edit ' + itemLabel(group.kind, item)"
                  (click)="editKit(group.kind, item)"
                >
                  <ion-icon slot="icon-only" name="create-outline" aria-hidden="true"></ion-icon>
                </ion-button>
                <!-- In plain sight. The last telescope or eyepiece stays: the views need one. -->
                <ion-button
                  slot="end"
                  fill="clear"
                  color="danger"
                  data-testid="kit-delete"
                  [attr.aria-label]="'Delete ' + itemLabel(group.kind, item)"
                  [disabled]="group.required && items.length === 1"
                  (click)="removeKit(group.kind, item)"
                >
                  <ion-icon slot="icon-only" name="trash-outline" aria-hidden="true"></ion-icon>
                </ion-button>
              </ion-item>
            }
            <ion-item button detail="false" [attr.data-testid]="'kit-add-' + group.kind" (click)="editKit(group.kind)">
              <ion-icon slot="start" name="add" aria-hidden="true"></ion-icon>
              <ion-label>Add</ion-label>
            </ion-item>
          }
        </ion-list>

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
          <!-- A Bluetooth camera shutter remote, to align without reaching for the phone. -->
          <ion-item>
            <ion-icon slot="start" name="bluetooth-outline" aria-hidden="true"></ion-icon>
            <ion-toggle
              data-testid="shutter-aligns"
              [checked]="settings().shutterAligns"
              (ionChange)="state.updateSettings({ shutterAligns: $any($event).detail.checked })"
            >
              Shutter remote aligns
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
              helperText="Failures always show one."
              [checked]="settings().solveSuccessToast"
              (ionChange)="state.updateSettings({ solveSuccessToast: $any($event).detail.checked })"
            >
              Toast on successful solves
            </ion-toggle>
          </ion-item>
          @if (devMode) {
            <ion-item>
              <ion-icon slot="start" name="desktop-outline" aria-hidden="true"></ion-icon>
              <ion-toggle
                data-testid="send-solves"
                [checked]="settings().sendSolves"
                (ionChange)="state.updateSettings({ sendSolves: $any($event).detail.checked })"
              >
                Send solves to this PC
              </ion-toggle>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" name="aperture-outline" aria-hidden="true"></ion-icon>
              <ion-select
                label="Camera capture"
                interface="popover"
                data-testid="capture-mode"
                [value]="settings().captureMode"
                (ionChange)="state.updateSettings({ captureMode: $any($event).detail.value })"
              >
                <ion-select-option value="normal">Normal</ion-select-option>
                <ion-select-option value="exposure">Force long exposure</ion-select-option>
                <ion-select-option value="stack">Force stacking</ion-select-option>
              </ion-select>
            </ion-item>
          }
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
                    {{ entry.trigger === 'auto' ? 'Automatic' : entry.trigger === 'tap' ? 'Tapped' : 'Alignment' }} ·
                    {{ entry.durationMs / 1000 | number: '1.1-1' }} s · ISO {{ entry.iso }}
                    @if (entry.frames > 1) {
                      · {{ entry.frames }} frames
                    }
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
            <ion-label class="ion-text-wrap credit">
              Herschel 400 selected by the Ancient City Astronomy Club, Herschel II by the Rose City Astronomers, as
              observed in the Astronomical League's programmes.
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap credit">
              110 Best NGC Objects by A. J. Crayon and Steve Coe, Saguaro Astronomy Club.
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap credit">
              Finest NGC list by Alan Dyer, Royal Astronomical Society of Canada.
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap credit">
              Deep-Sky Gems by David H. Levy and Explore the Universe, Royal Astronomical Society of Canada.
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap credit">
              Urban Observing Program, Astronomical League. Top-100 Deepsky Objects, Astronomical Society of Southern
              Africa.
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap credit">
              Monthly lists from NASA's Hubble Night Sky Challenge. NASA does not endorse this app.
            </ion-label>
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap credit" data-testid="credit-wds"
              >Double stars from the Washington Double Star Catalog, maintained at the U.S. Naval
              Observatory.</ion-label
            >
          </ion-item>
          <!-- Open-Meteo's data is CC BY 4.0, which asks for this credit. -->
          <ion-item>
            <ion-label class="ion-text-wrap credit" data-testid="credit-open-meteo"
              >Weather forecast by Open-Meteo.com, CC BY 4.0, from NOAA's GFS model. Seeing worked out with the AXP
              model of Trinquet and Vernin.</ion-label
            >
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap credit"
              >Compass correction from the World Magnetic Model, NOAA and the British Geological Survey, via
              geomagnetism by Natural Atlas, Apache License 2.0.</ion-label
            >
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap credit"
              >Planets, Pluto, Moon and sky positions by Astronomy Engine, Don Cross.</ion-label
            >
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap credit"
              >Log and lists saved with Dexie.js, David Fahlander, Apache License 2.0.</ion-label
            >
          </ion-item>
          <ion-item>
            <ion-label class="ion-text-wrap credit"
              >Pairing codes made with QR Code Generator, Kazuhiko Arase, MIT License, and read with jsQR, Cosmo Wolfe,
              Apache License 2.0. QR Code is a trademark of DENSO WAVE.</ion-label
            >
          </ion-item>
          <ion-item lines="none" data-testid="credit-jpl">
            <ion-label class="ion-text-wrap credit"
              >Orbits of Ceres, Vesta, Pallas and Juno from the NASA/JPL Small-Body Database.</ion-label
            >
          </ion-item>
        </ion-list>
      </div>
    </ion-content>
  `,
})
export class SettingsPage {
  protected readonly state = inject(AppState);
  protected readonly remote = inject(RemoteService);
  private readonly router = inject(Router);
  protected readonly settings = this.state.settings;
  protected readonly liveSolver = inject(LiveSolverService);
  protected readonly screenWake = inject(ScreenWakeService);
  private readonly sound = inject(SoundService);
  protected readonly showSolveLog = signal(false);
  /** Sending solves needs the dev server's proxy, so it is only offered in development. */
  protected readonly devMode = isDevMode();
  protected readonly appIcons = APP_ICONS;
  protected readonly gpsMessage = signal('');
  protected readonly bortleClasses = BORTLE_CLASSES;
  private readonly route = inject(ActivatedRoute);
  private readonly modals = inject(ModalController);
  private readonly toasts = inject(ToastController);

  /** The kinds of equipment, in the order a setup is put together. */
  protected readonly kitGroups: readonly { kind: KitKind; title: string; required: boolean }[] = [
    { kind: 'telescopes', title: 'Telescopes', required: true },
    { kind: 'eyepieces', title: 'Eyepieces', required: true },
    { kind: 'modifiers', title: 'Barlows and reducers', required: false },
    { kind: 'filters', title: 'Filters', required: false },
  ];
  protected readonly itemLabel = kitItemLabel;
  protected readonly itemDetail = kitItemDetail;

  /** The location in words, or a warning that the sky is shown for a neutral place. */
  protected readonly locationText = computed(() => {
    const { latitudeDeg, longitudeDeg, locationSet } = this.settings();
    return locationSet ? formatLocation(latitudeDeg, longitudeDeg) : 'Not set. Use GPS or enter it below.';
  });

  /** Opened from the eyepiece view's Edit equipment: scrolls to the equipment. */
  ionViewDidEnter(): void {
    if (this.route.snapshot.fragment === 'equipment') {
      document.getElementById('equipment')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  protected kitItems(kind: KitKind): readonly KitItem[] {
    return this.state.kit()[kind];
  }

  /** Adds an item, or changes one, in a sheet. Saved only when the sheet's tick is tapped. */
  protected async editKit(kind: KitKind, item?: KitItem): Promise<void> {
    const sheet = await this.modals.create({ component: EquipmentEditorComponent, componentProps: { kind, item } });
    await sheet.present();
    const { data, role } = await sheet.onWillDismiss<KitItem>();
    if (role === 'save' && data) this.state.saveKitItem(kind, data);
  }

  /** Deletes an item at once, with Undo in the message, which puts the kit back as it was. */
  protected async removeKit(kind: KitKind, item: KitItem): Promise<void> {
    const { kitSelection } = this.settings();
    if (!this.state.removeKitItem(kind, item.id)) return;
    const toast = await this.toasts.create({
      message: `Deleted ${kitItemLabel(kind, item)}`,
      duration: 5000,
      ...listToastPlace(),
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': 'kit-deleted-toast' },
      buttons: [{ text: 'Undo', handler: () => this.state.restoreKitItem(kind, item, kitSelection) }],
    });
    await toast.present();
  }

  constructor() {
    addIcons({
      phoneLandscapeOutline,
      add,
      createOutline,
      trashOutline,
      apertureOutline,
      bluetoothOutline,
      cameraOutline,
      chatbubbleEllipsesOutline,
      chevronDown,
      chevronUp,
      desktopOutline,
      flaskOutline,
      globeOutline,
      gridOutline,
      listOutline,
      locateOutline,
      locationOutline,
      lockOpenOutline,
      moonOutline,
      navigateOutline,
      openOutline,
      phonePortraitOutline,
      volumeLowOutline,
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

  /** Turning the shutter sound on plays it once, so it can be heard without a solve. */
  protected setSolveSound(on: boolean): void {
    this.state.updateSettings({ solveSound: on });
    if (on) this.sound.shutter();
  }

  protected openDeviceTest(): void {
    void this.router.navigateByUrl('/device-test');
  }

  protected openAlignment(): void {
    void this.router.navigateByUrl('/align');
  }

  protected openRemote(): void {
    void this.router.navigateByUrl('/remote');
  }

  protected async useGps(): Promise<void> {
    this.gpsMessage.set('Finding location…');
    const message = await this.state.locateWithGps();
    // On success the row shows the new location, so only a problem needs saying.
    this.gpsMessage.set(this.settings().locationSet && message === 'Location updated' ? '' : message);
  }
}
