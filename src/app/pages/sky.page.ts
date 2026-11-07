import { DecimalPipe } from '@angular/common';
import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonChip,
  IonContent,
  IonFabButton,
  IonIcon,
  IonInput,
  IonRange,
  IonSelect,
  IonSelectOption,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  closeCircle,
  compassOutline,
  eyeOutline,
  informationCircleOutline,
  locateOutline,
  mapOutline,
  moonOutline,
  remove,
} from 'ionicons/icons';

import { AppState } from '../core/app-state.service';
import type { Settings } from '../core/app-state.service';
import type { Horizontal, Vector3 } from '../core/astronomy';
import {
  applyMatrix,
  azimuthChangeDeg,
  equatorialVector,
  formatDec,
  formatLocation,
  formatRa,
  horizontalVector,
  magnification,
  rotateInView,
  separationDeg,
  stereographic,
  stereographicRadius,
  toViewCoordinates,
  trueFieldDeg,
  viewBasis,
} from '../core/astronomy';
import { designationText, designations } from '../core/designations';
import type { Equipment } from '../core/equipment';
import { equipmentLabel, sameEquipment } from '../core/equipment';
import { LiveSolverService } from '../core/live-solver.service';
import { chevronSpacingPx, guideAngleDeg, pulseOpacity } from '../core/reticle';
import { SensorService } from '../core/sensor.service';
import type { IconPath } from '../core/target-icons';
import { DISC_RADIUS, ICON_DASH, ICON_GRID, phaseIcon, targetIcon } from '../core/target-icons';
import type { Target } from '../core/targets';
import { EYEPIECE_SMOOTHING_MS, SKY_MAP_SMOOTHING_MS, smoothPointing, smoothingFactor } from '../core/view-smoothing';

type ViewMode = 'sky' | 'eyepiece';
type Point = { x: number; y: number };
type Project = (v: Vector3) => Point | null;

interface Star {
  raDeg: number;
  decDeg: number;
  vector: Vector3;
  mag: number;
  colorIndex: number;
}

interface Constellation {
  name: string;
  label: Vector3;
  lines: Vector3[][];
}

/** How the data file stores a constellation, as [right ascension, declination] pairs. */
interface ConstellationRow {
  name: string;
  label: [number, number];
  lines: [number, number][][];
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The slider's range for the faintest stars shown. */
const MIN_STAR_LIMIT = 2;
const MAX_STAR_LIMIT = 13;
/** The eyepiece view shows this much more sky than its circle, and sits this high up. */
const EYEPIECE_VIEW_SCALE = 1.6;
const EYEPIECE_CENTRE_SHARE = 0.34;
/** Size of the grid cells that let the eyepiece view find nearby stars quickly. */
const STAR_CELL_DEG = 4;
/** Objects this far beyond the screen edge are skipped, though their size circle could reach in. */
const OFF_SCREEN_MARGIN_PX = 200;
/** How long a toast message stays, long enough to read at arm's length. */
const TOAST_MS = 3500;
const DEFAULT_FIELD_DEG = 20; // Close enough to read the stars and match a finder's view
const MIN_FIELD_DEG = 5;
const MAX_FIELD_DEG = 120;
const ZOOM_STEP = 1.5;
const MAX_ALTITUDE_DEG = 89; // Looking exactly straight up has no defined "right"
const MIN_ALTITUDE_DEG = -20;
const GRID_ALTITUDES_DEG = [30, 60];
const GRID_AZIMUTH_STEP_DEG = 45;
const CARDINALS = [
  { label: 'N', azDeg: 0 },
  { label: 'E', azDeg: 90 },
  { label: 'S', azDeg: 180 },
  { label: 'W', azDeg: 270 },
];
/** Below this size on screen, an object's real outline is too small to be useful. */
const MIN_SIZE_CIRCLE_PX = 6;

/** Radius of a planet's or the Moon's icon disc on the map, at standard text size. */
const ICON_DISC_PX = 7;

/** Line width of the map's icons, in screen pixels. */
const ICON_LINE_PX = 1.6;

/** Canvas versions of the icon paths, made once each, since parsing them every frame is slow. */
const iconPaths = new Map<string, Path2D>();
function iconPath(d: string): Path2D {
  let path = iconPaths.get(d);
  if (!path) {
    // Phases change slowly, but over a long session their old shapes would pile up.
    if (iconPaths.size > 200) iconPaths.clear();
    path = new Path2D(d);
    iconPaths.set(d, path);
  }
  return path;
}
/** Fainter than this, an object's size circle only shows when it is the selected target. */
const MAX_SIZE_CIRCLE_MAG = 6;
/** The guidance chevrons, from the one nearest the reticle outwards. */
const CHEVRON_FADE = [0.35, 0.65, 1];
const CHEVRON_HEIGHT_PX = 8;
const CHEVRON_HALF_WIDTH_PX = 11;
/** Reticle ring diameters, the same as a Telrad finder's, so star hops carry over. */
const RETICLE_RINGS_DEG = [0.5, 2, 4];
/** Rings smaller than this have no room for a size label. */
const MIN_LABELLED_RING_PX = 30;

// The app's own colours for its sky map and guidance. Night mode turns everything red by
// brightness, so its faint lines and greys are brightened there to stay visible.
const DAY_COLOR = {
  sky: '#05070f',
  grid: '#141c2e',
  constellationLine: '#2a4170',
  constellationName: '#55709f',
  horizon: '#3f8f6a',
  cardinal: '#6fcf9f',
  reticle: '#e5484d',
  onTarget: '#6fcf9f',
  /** The guidance chevrons and line. The selected target itself is marked in onTarget green. */
  guide: '#a9cbff',
  deepSky: '#8fb7ff',
  solarSystem: '#ffd479',
  starLabel: '#a8b0c6',
  sizeCircle: '#4c6aa6',
};
const NIGHT_COLOR: typeof DAY_COLOR = {
  ...DAY_COLOR,
  grid: '#2a3550',
  constellationLine: '#4f6fae',
  constellationName: '#b4c6e8',
  horizon: '#6fcf9f',
  starLabel: '#e8ebf5',
  sizeCircle: '#7f9bd2',
  reticle: '#ffb3b3',
};
/** The colours in use, switched between day and night at the start of each drawing. */
const COLOR = { ...DAY_COLOR };

/** Star tints from hot blue to cool red, chosen by the star's B-V colour index. */
const STAR_TINTS = ['#b9d0ff', '#f4f6ff', '#fff3d6', '#ffd2a1', '#ffb08a'];

function starTintIndex(colorIndex: number): number {
  if (colorIndex < 0) return 0;
  if (colorIndex < 0.4) return 1;
  if (colorIndex < 0.8) return 2;
  if (colorIndex < 1.3) return 3;
  return 4;
}

/** Faint stars only clutter a wide view, so show more of them when zoomed in. */
function magnitudeLimit(fieldDeg: number): number {
  if (fieldDeg >= 90) return 5.5;
  if (fieldDeg >= 40) return 6;
  return 6.5;
}

/** Hides fainter labelled objects in wide views, where they would crowd the map. */
function isShownAtField(target: Target, fieldDeg: number): boolean {
  if (target.body) return true;
  if (target.kind === 'Star') return target.mag <= (fieldDeg >= 60 ? 1.5 : fieldDeg >= 25 ? 3 : 5);
  // Messier objects are the familiar showpieces, so they appear sooner. The thousands
  // of NGC and IC objects only appear once zoomed in on them.
  if (/^M\d/.test(target.id)) return target.mag <= (fieldDeg >= 60 ? 7 : 99);
  return target.mag <= (fieldDeg >= 60 ? 4.5 : fieldDeg >= 15 ? 7 : fieldDeg >= 8 ? 10 : 99);
}

/**
 * The sky map, reticle, guidance and eyepiece view. The user aims by moving the phone
 * with sensors on, or by dragging with them off.
 */
@Component({
  selector: 'app-sky',
  imports: [
    DecimalPipe,
    IonButton,
    IonChip,
    IonContent,
    IonFabButton,
    IonIcon,
    IonInput,
    IonRange,
    IonSelect,
    IonSelectOption,
  ],
  styles: `
    .stage {
      position: relative;
      height: 100%;
      background: #05070f;
      overflow: hidden;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      /* Stops the browser scrolling the page while the user drags or pinches the map. */
      touch-action: none;
      cursor: grab;
    }
    .readout {
      position: absolute;
      top: calc(10px + var(--ion-safe-area-top, 0px));
      left: 10px;
      font-size: calc(14px * var(--af-scale, 1));
      line-height: 1.45;
      color: var(--af-muted);
      padding: 4px 8px;
      border-radius: 8px;
      background: rgb(5 7 15 / 92%);
      pointer-events: none;
    }
    /* A column of round buttons in the top right corner. */
    .controls {
      position: absolute;
      top: calc(4px + var(--ion-safe-area-top, 0px));
      right: 4px;
      display: flex;
      flex-direction: column;
    }
    .controls ion-fab-button,
    .zoom ion-fab-button {
      --background: rgb(10 14 28 / 85%);
      --background-activated: #232a3d;
      --color: var(--af-text);
      --border-color: #232a3d;
      --border-width: 1px;
      --border-style: solid;
      --box-shadow: none;
    }
    /* A status button's colour says the state at a glance. */
    .controls ion-fab-button.warn {
      --color: #ffb454;
    }
    .controls ion-fab-button.good {
      --color: #6fcf9f;
    }
    /* Words for screen readers, since the buttons only show icons. */
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .message {
      position: absolute;
      top: 45%;
      left: 16px;
      right: 16px;
      padding: 8px 12px;
      border-radius: 10px;
      background: rgb(10 14 28 / 85%);
      color: #ffb454;
      font-size: calc(15px * var(--af-scale, 1));
      text-align: center;
      pointer-events: none;
    }
    .eyepiece-panel {
      margin-bottom: 6px;
      padding: 4px 4px 4px 12px;
      border: 1px solid #232a3d;
      border-radius: 12px;
      background: rgb(10 14 28 / 92%);
      color: var(--af-text);
      font-size: calc(15px * var(--af-scale, 1));
    }
    .eyepiece-panel ion-range {
      padding: 0 8px 0 0;
      --bar-background: #232a3d;
    }
    .equipment-toggle {
      margin: 2px 0 4px;
      padding: 6px 10px;
      border: 1px solid #232a3d;
      border-radius: 14px;
      background: transparent;
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
    }
    .fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 12px;
      padding-right: 8px;
    }
    .fields .wide {
      grid-column: 1 / -1;
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
    /* Above the tab bar, which lies over the map on this tab. */
    .dock {
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: calc(10px + var(--af-tab-bar-height, 0px));
      display: flex;
      flex-direction: column;
      /* The empty space beside the zoom buttons still lets the map be dragged. */
      pointer-events: none;
    }
    .dock > * {
      pointer-events: auto;
    }
    /* A row along the bottom: location on the left, zoom on the right. */
    .corner {
      display: flex;
      align-items: flex-end;
      pointer-events: none;
    }
    .corner > * {
      pointer-events: auto;
    }
    /* Shares the pointing readout's look, but sits in the row instead of the top corner. */
    .readout.location {
      position: static;
      margin-bottom: 6px;
    }
    /* A button, so it takes taps, with a border to show it can be tapped. */
    .readout.location.unset {
      pointer-events: auto;
      color: var(--af-text);
      font: inherit;
      font-size: calc(14px * var(--af-scale, 1));
      text-align: left;
      border: 1px solid #ffb454;
    }
    .zoom {
      margin-left: auto;
      display: flex;
      flex-direction: column;
      margin-right: -6px;
    }
    .bar {
      padding: 6px 4px 6px 12px;
      border: 1px solid #232a3d;
      border-radius: 12px;
      background: rgb(10 14 28 / 88%);
      color: var(--af-text);
      font-size: calc(16px * var(--af-scale, 1));
    }
    .bar-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .muted {
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
    }
    .directions {
      color: #a9cbff;
      font-size: calc(15px * var(--af-scale, 1));
    }
    .details {
      padding: 6px 8px 4px 0;
      border-top: 1px solid #232a3d;
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
      line-height: 1.5;
    }
  `,
  template: `
    <!-- No header, so the map fills the whole screen. -->
    <ion-content [scrollY]="false" [fullscreen]="true">
      <div class="stage">
        <canvas
          #canvas
          aria-label="Sky map. Drag to aim, pinch to zoom."
          [attr.data-star-count]="stars().length"
          [attr.data-constellation-count]="constellations().length"
          [attr.data-field]="viewField()"
          (pointerdown)="pointerDown($event)"
          (pointermove)="pointerMove($event)"
          (pointerup)="pointerUp($event)"
          (pointercancel)="pointerUp($event)"
          (wheel)="wheel($event)"
        ></canvas>

        <div class="readout" data-testid="pointing" [attr.data-still]="sensors.isStill()">
          <!-- The sensor button shows whether sensors are on, so only a missing compass is worth a line. -->
          @if (state.sensorsActive() && !sensors.hasCompass()) {
            No compass<br />
          }
          Alt {{ state.pointing().altDeg | number: '1.0-0' }}°, az {{ state.pointing().azDeg | number: '1.0-0' }}°<br />
          <!-- Hidden unless chosen in Settings, since most observers steer by the map, not coordinates. -->
          @if (state.settings().showEquatorial) {
            <span data-testid="equatorial">RA {{ pointingRa() }}, Dec {{ pointingDec() }}</span>
            <br />
          }
          @if (mode() === 'eyepiece') {
            {{ power() | number: '1.0-0' }}× · {{ eyepieceField() | number: '1.1-2' }}° field
          } @else {
            {{ fieldDeg() | number: '1.0-0' }}° wide
          }
        </div>

        <div class="controls">
          <!-- Green while the motion sensors steer the view. First, since it is used most. -->
          <ion-fab-button
            size="small"
            data-testid="sensor-toggle"
            [class.good]="state.sensorsActive()"
            (click)="toggleSensors()"
          >
            <ion-icon name="compass-outline" aria-hidden="true"></ion-icon>
            <span class="visually-hidden">{{ state.sensorsActive() ? 'Sensors on' : 'Use sensors' }}</span>
          </ion-fab-button>
          <!-- Switches between the sky map and the eyepiece view, showing the view it switches to. -->
          <ion-fab-button
            size="small"
            data-testid="view-mode"
            [attr.data-mode]="mode()"
            (click)="mode.set(mode() === 'sky' ? 'eyepiece' : 'sky')"
          >
            <ion-icon [name]="mode() === 'sky' ? 'eye-outline' : 'map-outline'" aria-hidden="true"></ion-icon>
            <span class="visually-hidden">{{ mode() === 'sky' ? 'Eyepiece view' : 'Sky map' }}</span>
          </ion-fab-button>
          <!-- Green once aligned by plate solving, amber when not aligned or only roughly. -->
          <ion-fab-button
            size="small"
            data-testid="alignment-status"
            [class.good]="state.alignment()?.method === 'plate-solve'"
            [class.warn]="state.alignment()?.method !== 'plate-solve'"
            (click)="openAlignment()"
          >
            <ion-icon name="locate-outline" aria-hidden="true"></ion-icon>
            <span class="visually-hidden">
              @if (state.alignment(); as alignment) {
                Aligned: {{ alignment.starId }}{{ alignment.method === 'plate-solve' ? '' : ', rough' }}
              } @else {
                Not aligned
              }
            </span>
          </ion-fab-button>
          <!-- Red night mode, at hand while observing. Red when on, like everything else then. -->
          <ion-fab-button
            size="small"
            data-testid="night-toggle"
            [attr.aria-pressed]="state.settings().nightMode"
            (click)="state.updateSettings({ nightMode: !state.settings().nightMode })"
          >
            <ion-icon name="moon-outline" aria-hidden="true"></ion-icon>
            <span class="visually-hidden">Red night mode</span>
          </ion-fab-button>
        </div>

        @if (sensors.error(); as message) {
          <div class="message" data-testid="sensor-error">{{ message }}</div>
        }

        <div class="dock">
          <!-- Location sits bottom left and zoom bottom right, just above whatever boxes are open below. -->
          <div class="corner">
            @if (!state.selectedTarget()) {
              <!-- Where the sky is calculated for, like the pointing readout at the top. -->
              @if (state.settings().locationSet) {
                <div class="readout location" data-testid="location">{{ location() }}</div>
              } @else {
                <!-- Until a location is set, the sky shown is for a neutral place, so ask for one. -->
                <button type="button" class="readout location unset" data-testid="location" (click)="locate()">
                  {{ locating() || 'Location not set · tap to use GPS' }}
                </button>
              }
            }
            @if (mode() === 'sky') {
              <div class="zoom">
                <ion-fab-button
                  size="small"
                  aria-label="Zoom in"
                  data-testid="zoom-in"
                  [disabled]="fieldDeg() <= minField"
                  (click)="zoomBy(1 / zoomStep)"
                >
                  <ion-icon name="add" aria-hidden="true"></ion-icon>
                </ion-fab-button>
                <ion-fab-button
                  size="small"
                  aria-label="Zoom out"
                  data-testid="zoom-out"
                  [disabled]="fieldDeg() >= maxField"
                  (click)="zoomBy(zoomStep)"
                >
                  <ion-icon name="remove" aria-hidden="true"></ion-icon>
                </ion-fab-button>
              </div>
            }
          </div>
          @if (mode() === 'eyepiece') {
            <div class="eyepiece-panel" data-testid="eyepiece-panel">
              <div class="bar-row">
                <span data-testid="star-limit-label">
                  Stars to magnitude {{ state.starLimit() | number: '1.1-1'
                  }}{{ isAutoStarLimit() ? ', your sky' : '' }}
                </span>
                <ion-button
                  fill="clear"
                  size="small"
                  data-testid="reset-star-limit"
                  [disabled]="isAutoStarLimit()"
                  (click)="resetStarLimit()"
                >
                  Reset to my sky
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
                {{ equipmentLabel(state.settings()) }} · {{ power() | number: '1.0-0' }}× ·
                {{ eyepieceField() | number: '1.1-2' }}° {{ showEquipment() ? '▴' : '▾' }}
              </button>
              @if (showEquipment()) {
                <div class="fields" data-testid="equipment-form">
                  <ion-select
                    class="wide"
                    label="Telescope type"
                    labelPlacement="stacked"
                    interface="popover"
                    [value]="state.settings().telescopeType"
                    (ionChange)="state.updateSettings({ telescopeType: $any($event).detail.value })"
                  >
                    <ion-select-option value="newtonian">Newtonian</ion-select-option>
                    <ion-select-option value="refractor">Refractor with diagonal</ion-select-option>
                    <ion-select-option value="cassegrain">Cassegrain with diagonal</ion-select-option>
                  </ion-select>
                  <ion-input
                    label="Aperture (mm)"
                    labelPlacement="stacked"
                    type="number"
                    data-testid="aperture"
                    [value]="state.settings().telescopeApertureMm"
                    (ionChange)="setEquipmentNumber('telescopeApertureMm', $event, 20, 2000)"
                  ></ion-input>
                  <ion-input
                    label="Focal length (mm)"
                    labelPlacement="stacked"
                    type="number"
                    data-testid="telescope-focal"
                    [value]="state.settings().telescopeFocalMm"
                    (ionChange)="setEquipmentNumber('telescopeFocalMm', $event, 50, 10000)"
                  ></ion-input>
                  <ion-input
                    label="Eyepiece (mm)"
                    labelPlacement="stacked"
                    type="number"
                    data-testid="eyepiece-focal"
                    [value]="state.settings().eyepieceFocalMm"
                    (ionChange)="setEquipmentNumber('eyepieceFocalMm', $event, 2, 60)"
                  ></ion-input>
                  <ion-input
                    label="Eyepiece field (°)"
                    labelPlacement="stacked"
                    type="number"
                    data-testid="eyepiece-field"
                    [value]="state.settings().eyepieceFieldDeg"
                    (ionChange)="setEquipmentNumber('eyepieceFieldDeg', $event, 20, 120)"
                  ></ion-input>
                </div>
              }
              @if (state.settings().recentEquipment.length > 0) {
                <div class="recent">
                  @for (item of state.settings().recentEquipment; track $index) {
                    <ion-chip
                      data-testid="recent-equipment"
                      [outline]="!isCurrentEquipment(item)"
                      [color]="isCurrentEquipment(item) ? 'primary' : 'medium'"
                      (click)="state.applyEquipment(item)"
                    >
                      {{ equipmentLabel(item) }}
                    </ion-chip>
                  }
                </div>
              }
            </div>
          }

          @if (state.selectedTarget(); as target) {
            <div class="bar" data-testid="target-bar">
              <div class="bar-row">
                <div>
                  <strong data-testid="target-designations">{{ designationText(target) }}</strong> {{ target.name }}
                  <div class="directions" data-testid="directions">{{ directions() }}</div>
                  <div class="muted" data-testid="guidance">
                    {{ targetDistance() | number: '1.1-1' }}° away
                    @if (targetBelowHorizon()) {
                      · below the horizon
                    }
                  </div>
                </div>
                <div>
                  @if (!state.sensorsActive()) {
                    <ion-button fill="clear" size="small" data-testid="aim-at-target" (click)="aimAtTarget()">
                      Aim
                    </ion-button>
                  }
                  <ion-button
                    fill="clear"
                    size="small"
                    aria-label="Target details"
                    data-testid="target-info"
                    (click)="showDetails.set(!showDetails())"
                  >
                    <ion-icon slot="icon-only" name="information-circle-outline"></ion-icon>
                  </ion-button>
                  <ion-button fill="clear" size="small" aria-label="Clear target" (click)="clearTarget()">
                    <ion-icon slot="icon-only" name="close-circle"></ion-icon>
                  </ion-button>
                </div>
              </div>
              @if (showDetails()) {
                <div class="details" data-testid="target-details">
                  {{ target.kind }}
                  @if (target.mag < 90) {
                    · mag {{ target.mag | number: '1.1-1' }}
                  }
                  @if (target.sizeArcmin) {
                    · {{ target.sizeArcmin | number: '1.0-1' }}′ across
                  }
                  <br />
                  RA {{ formatRa(target.raDeg) }}, Dec {{ formatDec(target.decDeg) }}
                  @if (target.aliases) {
                    <br />Also known as {{ target.aliases }}
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class SkyPage implements AfterViewInit, OnDestroy {
  protected readonly state = inject(AppState);
  protected readonly sensors = inject(SensorService);
  protected readonly liveSolver = inject(LiveSolverService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastController);
  /** The newest plate solve already given a toast, so each attempt gets at most one. */
  private lastToastedSolveId = this.liveSolver.log()[0]?.id ?? 0;
  /** When the alignment shown last was made, or undefined before the first check. */
  private shownAlignedAt?: string | null;

  protected readonly mode = signal<ViewMode>('sky');
  protected readonly fieldDeg = signal(DEFAULT_FIELD_DEG);
  protected readonly minField = MIN_FIELD_DEG;
  protected readonly maxField = MAX_FIELD_DEG;
  protected readonly zoomStep = ZOOM_STEP;
  protected readonly formatRa = formatRa;
  protected readonly designationText = designationText;
  protected readonly formatDec = formatDec;
  protected readonly stars = signal<Star[]>([]);
  protected readonly constellations = signal<Constellation[]>([]);
  protected readonly showDetails = signal(false);
  protected readonly showEquipment = signal(false);

  /** Stars grouped into cells of right ascension and declination. */
  private readonly starGrid = computed(() => {
    const grid = new Map<number, Star[]>();
    for (const star of this.stars()) {
      const key = this.cellKey(star.raDeg, star.decDeg);
      const cell = grid.get(key);
      if (cell) cell.push(star);
      else grid.set(key, [star]);
    }
    return grid;
  });
  protected readonly equipmentLabel = equipmentLabel;
  protected readonly minStarLimit = MIN_STAR_LIMIT;
  protected readonly maxStarLimit = MAX_STAR_LIMIT;
  protected readonly isAutoStarLimit = computed(() => this.state.settings().eyepieceStarLimit === null);

  protected readonly power = computed(() =>
    magnification(this.state.settings().telescopeFocalMm, this.state.settings().eyepieceFocalMm),
  );
  protected readonly eyepieceField = computed(() => {
    const { telescopeFocalMm, eyepieceFocalMm, eyepieceFieldDeg } = this.state.settings();
    return trueFieldDeg(telescopeFocalMm, eyepieceFocalMm, eyepieceFieldDeg);
  });

  /** Width of sky shown, in degrees. The eyepiece shows a little around its circle. */
  protected readonly viewField = computed(() =>
    this.mode() === 'eyepiece' ? this.eyepieceField() * EYEPIECE_VIEW_SCALE : this.fieldDeg(),
  );

  /** What the location button says while GPS is working, or after it fails. Empty otherwise. */
  protected readonly locating = signal('');

  protected async locate(): Promise<void> {
    this.locating.set('Finding location…');
    const message = await this.state.locateWithGps();
    // On success the box shows the location instead, so only a problem needs saying.
    this.locating.set(this.state.settings().locationSet ? '' : `${message} · tap to try again`);
  }

  /** The observer's location, as set in Settings or from GPS, such as "39.47° N, 0.38° W". */
  protected readonly location = computed(() =>
    formatLocation(this.state.settings().latitudeDeg, this.state.settings().longitudeDeg),
  );
  protected readonly pointingRa = computed(() => formatRa(this.state.pointingEquatorial().raDeg));
  protected readonly pointingDec = computed(() => formatDec(this.state.pointingEquatorial().decDeg));

  protected readonly targetDistance = computed(() => {
    const target = this.state.selectedTarget();
    return target ? separationDeg(this.state.pointing(), this.state.positionOf(target)) : 0;
  });
  protected readonly targetBelowHorizon = computed(() => {
    const target = this.state.selectedTarget();
    return !!target && this.state.positionOf(target).altDeg < 0;
  });

  /** On target means it would be in the eyepiece, which is what the user cares about. */
  protected readonly isOnTarget = computed(
    () => !!this.state.selectedTarget() && this.targetDistance() < this.eyepieceField() / 2,
  );

  /** Which way to move the telescope, in the terms an alt-az mount uses. */
  protected readonly directions = computed(() => {
    const target = this.state.selectedTarget();
    if (!target) return '';
    if (this.isOnTarget()) return 'On target';
    const position = this.state.positionOf(target);
    const pointing = this.state.pointing();
    const altChange = position.altDeg - pointing.altDeg;
    const azChange = azimuthChangeDeg(pointing.azDeg, position.azDeg);
    const vertical = `${altChange >= 0 ? 'Up' : 'Down'} ${Math.abs(altChange).toFixed(0)}°`;
    const horizontal = `${azChange >= 0 ? 'Right' : 'Left'} ${Math.abs(azChange).toFixed(0)}°`;
    return `${vertical} · ${horizontal}`;
  });

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private resizeObserver?: ResizeObserver;
  private drawQueued = false;
  /** The pointing the view shows, which follows the sensors smoothly. */
  private shownPointing: Horizontal | null = null;
  private lastFrameTime = 0;
  private viewCentreY = 0;
  private baseStarsLoaded: Promise<void> = Promise.resolve();
  private deepStarsRequested = false;

  // Fingers currently on the screen. One drags and two pinch.
  private readonly pointers = new Map<number, Point>();
  private dragStart?: Point & { altDeg: number; azDeg: number };
  private pinchStart?: { distance: number; fieldDeg: number };

  constructor() {
    addIcons({
      add,
      closeCircle,
      compassOutline,
      eyeOutline,
      informationCircleOutline,
      locateOutline,
      mapOutline,
      moonOutline,
      remove,
    });
    this.baseStarsLoaded = this.loadStars();
    // The faint stars are a large file, so they only load once the eyepiece view opens.
    effect(() => {
      if (this.mode() === 'eyepiece') void this.loadDeepStars();
    });
    void this.loadConstellations();

    // Every failed automatic plate solve is told with a toast. Successes only when the
    // debugging setting asks for them. Alignment shows its own results, so it is left out.
    effect(() => {
      const newest = this.liveSolver.log()[0];
      if (!newest || newest.id <= this.lastToastedSolveId) return;
      this.lastToastedSolveId = newest.id;
      if (newest.trigger !== 'auto') return;
      const showSuccess = untracked(() => this.state.settings().solveSuccessToast);
      if (newest.outcome === 'failed' || (newest.outcome === 'solved' && showSuccess)) {
        void this.toast(newest.message, 'solve-toast');
      }
    });
    // A new alignment is confirmed with a toast. The one already saved at start-up is not.
    effect(() => {
      const alignment = this.state.alignment();
      const alignedAt = alignment?.alignedAt;
      if (this.shownAlignedAt !== undefined && alignment && alignedAt !== this.shownAlignedAt) {
        void this.toast(
          `Aligned: ${alignment.starId}${alignment.method === 'plate-solve' ? '' : ', rough'}`,
          'alignment-toast',
        );
      }
      this.shownAlignedAt = alignedAt ?? null;
    });

    // Redraw whenever anything shown on the map changes.
    effect(() => {
      this.state.pointing();
      this.state.viewRollDeg();
      this.state.plateSolving();
      this.state.starLimit();
      this.state.textScale();
      this.state.settings();
      this.state.selectedTarget();
      this.state.targets();
      this.state.now();
      this.mode();
      this.fieldDeg();
      this.stars();
      this.constellations();
      this.queueDraw();
    });
  }

  /** A short message that appears near the top and goes away by itself. */
  private async toast(message: string, testId: string): Promise<void> {
    const toast = await this.toasts.create({
      message,
      duration: TOAST_MS,
      position: 'top',
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': testId },
    });
    await toast.present();
  }

  ngAfterViewInit(): void {
    // The canvas has no size until layout finishes, and changes when the phone rotates.
    this.resizeObserver = new ResizeObserver(() => this.queueDraw());
    this.resizeObserver.observe(this.canvasRef().nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
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

  protected isCurrentEquipment(item: Equipment): boolean {
    return sameEquipment(item, this.state.settings());
  }

  /** Saves a number, ignoring values that are empty or outside the sensible range. */
  protected setEquipmentNumber(
    key: keyof Pick<Settings, 'telescopeApertureMm' | 'telescopeFocalMm' | 'eyepieceFocalMm' | 'eyepieceFieldDeg'>,
    event: Event,
    min: number,
    max: number,
  ): void {
    const raw = (event as CustomEvent<{ value?: string | null }>).detail.value;
    const value = Number(raw);
    if (raw !== '' && raw != null && Number.isFinite(value) && value >= min && value <= max) {
      this.state.updateSettings({ [key]: value });
    }
  }

  protected toggleSensors(): void {
    if (this.state.sensorsActive()) this.sensors.stop();
    else void this.sensors.start();
  }

  protected openAlignment(): void {
    void this.router.navigateByUrl('/align');
  }

  protected clearTarget(): void {
    this.state.selectedTargetId.set(null);
    this.showDetails.set(false);
  }

  /**
   * Jumps straight to the target. A preview shortcut for when sensors are off, because
   * dragging across the sky is impractical in the eyepiece's narrow field.
   */
  protected aimAtTarget(): void {
    const target = this.state.selectedTarget();
    if (!target) return;
    const { altDeg, azDeg } = this.state.positionOf(target);
    this.state.pointing.set({ altDeg: Math.min(altDeg, MAX_ALTITUDE_DEG), azDeg });
  }

  protected zoomBy(factor: number): void {
    this.setField(this.fieldDeg() * factor);
  }

  protected wheel(event: WheelEvent): void {
    if (this.mode() === 'sky') this.zoomBy(event.deltaY > 0 ? 1.1 : 1 / 1.1);
  }

  protected pointerDown(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.restartGesture();
  }

  protected pointerMove(event: PointerEvent): void {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pinchStart) this.pinch();
    else if (this.dragStart) this.drag(event);
  }

  protected pointerUp(event: PointerEvent): void {
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.pointers.delete(event.pointerId);
    this.restartGesture();
  }

  /** Starts a drag or pinch from the current fingers, so the map doesn't jump. */
  private restartGesture(): void {
    const fingers = [...this.pointers.values()];
    this.dragStart = fingers.length === 1 ? { ...fingers[0], ...this.state.pointing() } : undefined;
    this.pinchStart =
      fingers.length === 2 && this.mode() === 'sky'
        ? { distance: Math.hypot(fingers[0].x - fingers[1].x, fingers[0].y - fingers[1].y), fieldDeg: this.fieldDeg() }
        : undefined;
  }

  private pinch(): void {
    const [a, b] = [...this.pointers.values()];
    if (!this.pinchStart || !a || !b) return;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    this.setField((this.pinchStart.fieldDeg * this.pinchStart.distance) / Math.max(distance, 1));
  }

  /** Dragging moves the sky with the finger, so aiming moves the opposite way. */
  private drag(event: PointerEvent): void {
    if (!this.dragStart || this.state.sensorsActive()) return; // The sensors are steering
    const { x: flipX, y: flipY } = this.imageFlip();
    const degPerPixel = this.viewField() / Math.max(this.canvasRef().nativeElement.clientWidth, 1);
    const altDeg = this.dragStart.altDeg + flipY * (event.clientY - this.dragStart.y) * degPerPixel;
    const clampedAlt = Math.max(MIN_ALTITUDE_DEG, Math.min(MAX_ALTITUDE_DEG, altDeg));
    // A sideways drag covers more azimuth high in the sky, where its circles are smaller.
    const azScale = 1 / Math.max(Math.cos((clampedAlt * Math.PI) / 180), 0.1);
    const azDeg = this.dragStart.azDeg - flipX * (event.clientX - this.dragStart.x) * degPerPixel * azScale;
    this.state.pointing.set({ altDeg: clampedAlt, azDeg: ((azDeg % 360) + 360) % 360 });
  }

  private setField(fieldDeg: number): void {
    this.fieldDeg.set(Math.max(MIN_FIELD_DEG, Math.min(MAX_FIELD_DEG, fieldDeg)));
  }

  /**
   * Telescopes change the image. A Newtonian turns it upside down, and a diagonal
   * mirrors it. The sky map always shows the sky as seen by eye.
   */
  private imageFlip(): Point {
    if (this.mode() !== 'eyepiece') return { x: 1, y: 1 };
    return { x: -1, y: this.state.settings().telescopeType === 'newtonian' ? -1 : 1 };
  }

  private async loadStars(): Promise<void> {
    try {
      const response = await fetch('assets/data/stars.json');
      const rows = (await response.json()) as [number, number, number, number][];
      this.stars.set(
        rows.map(([ra, dec, mag, colorIndex]) => ({
          raDeg: ra,
          decDeg: dec,
          vector: equatorialVector(ra, dec),
          mag,
          colorIndex: starTintIndex(colorIndex),
        })),
      );
    } catch {
      // The map still shows targets and the horizon without its background stars.
      this.stars.set([]);
    }
  }

  private cellKey(raDeg: number, decDeg: number): number {
    const row = Math.floor((decDeg + 90) / STAR_CELL_DEG);
    const column = Math.floor((((raDeg % 360) + 360) % 360) / STAR_CELL_DEG);
    return row * 1000 + column;
  }

  /** Stars within a field of where the view points, from the grid cells that can hold them. */
  private starsNear(fieldDeg: number): Star[] {
    const { raDeg, decDeg } = this.state.pointingEquatorial();
    const radius = fieldDeg * 0.75 + STAR_CELL_DEG; // Half the diagonal, plus a cell's width
    const grid = this.starGrid();
    const found: Star[] = [];
    const lowDec = Math.max(-90, decDeg - radius);
    const highDec = Math.min(90, decDeg + radius);
    // Lines of right ascension crowd together towards the poles, so cover more of them there.
    const widestDec = Math.min(89.9, Math.max(Math.abs(lowDec), Math.abs(highDec)));
    const raRadius =
      highDec >= 89.9 || lowDec <= -89.9 ? 180 : Math.min(180, radius / Math.cos((widestDec * Math.PI) / 180));
    const columns = Math.min(360 / STAR_CELL_DEG, Math.ceil((2 * raRadius) / STAR_CELL_DEG) + 1);
    const firstColumn = Math.floor((raDeg - raRadius) / STAR_CELL_DEG);
    for (let dec = lowDec; dec <= highDec + STAR_CELL_DEG; dec += STAR_CELL_DEG) {
      const clampedDec = Math.min(89.99, dec);
      for (let c = 0; c < columns; c++) {
        found.push(...(grid.get(this.cellKey((firstColumn + c) * STAR_CELL_DEG, clampedDec)) ?? []));
      }
    }
    return found;
  }

  /** Adds the faint stars after the bright ones, keeping the brightest-first order. */
  private async loadDeepStars(): Promise<void> {
    if (this.deepStarsRequested) return;
    this.deepStarsRequested = true;
    try {
      await this.baseStarsLoaded;
      const response = await fetch('assets/data/stars-deep.json');
      const rows = (await response.json()) as [number, number, number, number][];
      const deep = rows.map(([ra, dec, mag, colorIndex]) => ({
        raDeg: ra,
        decDeg: dec,
        vector: equatorialVector(ra, dec),
        mag,
        colorIndex: starTintIndex(colorIndex),
      }));
      this.stars.update((current) => [...current, ...deep]);
    } catch {
      // The eyepiece view still works with the brighter stars only.
      this.deepStarsRequested = false;
    }
  }

  private async loadConstellations(): Promise<void> {
    try {
      const response = await fetch('assets/data/constellations.json');
      const rows = (await response.json()) as ConstellationRow[];
      this.constellations.set(
        rows.map(({ name, label, lines }) => ({
          name,
          label: equatorialVector(label[0], label[1]),
          lines: lines.map((line) => line.map(([ra, dec]) => equatorialVector(ra, dec))),
        })),
      );
    } catch {
      // Constellation lines are a help, not a requirement.
      this.constellations.set([]);
    }
  }

  /** Draws at most once per screen refresh, however many changes arrive. */
  private queueDraw(): void {
    if (this.drawQueued) return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      this.draw();
    });
  }

  private draw(): void {
    const canvas = this.canvasRef().nativeElement;
    const pixelRatio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return; // This tab is hidden
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);
    // Setting a canvas's size reallocates it, so only do that when the size changes.
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    Object.assign(COLOR, this.state.settings().nightMode ? NIGHT_COLOR : DAY_COLOR);
    ctx.fillStyle = COLOR.sky;
    ctx.fillRect(0, 0, width, height);

    const isEyepiece = this.mode() === 'eyepiece';
    const basis = viewBasis(this.steadyPointing(isEyepiece));
    const centreY = isEyepiece ? height * EYEPIECE_CENTRE_SHARE : height / 2;
    this.viewCentreY = centreY;
    const flip = this.imageFlip();
    // Only the sky map turns with the phone. The eyepiece follows the telescope instead.
    const rollDeg = isEyepiece ? 0 : this.state.viewRollDeg();

    // Pixels per projected unit, so the chosen field fits the screen's width.
    const scale = width / 2 / stereographicRadius(this.viewField() / 2);
    const project: Project = (v) => {
      const view = toViewCoordinates(basis, v);
      if (view[2] < -0.2) return null; // Too far behind the viewer to draw
      const flat = stereographic(view);
      const { x, y } = rotateInView(flat.x, flat.y, rollDeg);
      return { x: width / 2 + flip.x * x * scale, y: centreY - flip.y * y * scale };
    };

    if (!isEyepiece) {
      this.drawGrid(ctx, project);
      this.drawConstellationLines(ctx, project);
    }
    this.drawStars(ctx, project, width, height);
    this.drawHorizon(ctx, project);
    const labels = this.drawTargets(ctx, project, scale);
    if (isEyepiece) {
      this.drawEyepieceMask(ctx, width, height, scale, centreY);
      this.drawEyepieceGuide(ctx, width, centreY, scale);
    } else {
      this.drawConstellationNames(ctx, project, labels);
      this.drawReticle(ctx, project, width, height, scale);
    }
  }

  /**
   * Smooths the pointing shown, so sensor jitter doesn't shake the view. The eyepiece's
   * high magnification needs much more smoothing than the sky map. Dragging needs none,
   * because a finger doesn't jitter, and should feel immediate.
   */
  private steadyPointing(isEyepiece: boolean): Horizontal {
    const now = performance.now();
    const frameMs = this.lastFrameTime ? Math.min(now - this.lastFrameTime, 100) : 0;
    this.lastFrameTime = now;
    const latest = this.state.pointing();
    if (!this.state.sensorsActive()) {
      this.shownPointing = latest;
      return latest;
    }
    const timeConstant = isEyepiece ? EYEPIECE_SMOOTHING_MS : SKY_MAP_SMOOTHING_MS;
    this.shownPointing = smoothPointing(this.shownPointing, latest, smoothingFactor(frameMs, timeConstant));
    // Keep drawing until the view has caught up with the latest reading.
    if (separationDeg(this.shownPointing, latest) > 0.0005) this.queueDraw();
    return this.shownPointing;
  }

  /** A canvas font at a size that follows the text size setting. Labels are semi-bold. */
  private font(sizePx: number, style = ''): string {
    return `${style} 600 ${Math.round(sizePx * this.textScale())}px sans-serif`.trim();
  }

  private textScale(): number {
    return this.state.textScale();
  }

  /** Draws text with a dark outline, so it stays readable over lines and stars. */
  private drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = COLOR.sky;
    ctx.strokeText(text, x, y);
    ctx.restore();
    ctx.fillText(text, x, y);
  }

  /** Draws a line through points, lifting the pen wherever a point can't be shown. */
  private drawCurve(ctx: CanvasRenderingContext2D, points: (Point | null)[]): void {
    ctx.beginPath();
    let penDown = false;
    for (const point of points) {
      if (!point) {
        penDown = false;
      } else if (penDown) {
        ctx.lineTo(point.x, point.y);
      } else {
        ctx.moveTo(point.x, point.y);
        penDown = true;
      }
    }
    ctx.stroke();
  }

  /** Faint altitude and azimuth lines, which help judge distance and direction. */
  private drawGrid(ctx: CanvasRenderingContext2D, project: Project): void {
    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    for (const altDeg of GRID_ALTITUDES_DEG) {
      const points = [];
      for (let azDeg = 0; azDeg <= 360; azDeg += 3) points.push(project(horizontalVector({ altDeg, azDeg })));
      this.drawCurve(ctx, points);
    }
    for (let azDeg = 0; azDeg < 360; azDeg += GRID_AZIMUTH_STEP_DEG) {
      const points = [];
      for (let altDeg = 0; altDeg <= 90; altDeg += 5) points.push(project(horizontalVector({ altDeg, azDeg })));
      this.drawCurve(ctx, points);
    }
  }

  private drawConstellationLines(ctx: CanvasRenderingContext2D, project: Project): void {
    const toLocal = this.state.skyRotation();
    ctx.strokeStyle = COLOR.constellationLine;
    ctx.lineWidth = 1.5;
    for (const { lines } of this.constellations()) {
      for (const line of lines) {
        this.drawCurve(
          ctx,
          line.map((vector) => {
            const local = applyMatrix(toLocal, vector);
            return local[2] < -0.05 ? null : project(local); // Below the horizon
          }),
        );
      }
    }
  }

  /** Constellation names go last and give way to anything already labelled. */
  private drawConstellationNames(ctx: CanvasRenderingContext2D, project: Project, labels: Box[]): void {
    const toLocal = this.state.skyRotation();
    ctx.fillStyle = COLOR.constellationName;
    ctx.font = this.font(14, 'italic');
    ctx.textAlign = 'center';
    for (const { name, label } of this.constellations()) {
      const local = applyMatrix(toLocal, label);
      if (local[2] < 0) continue;
      const point = project(local);
      if (!point) continue;
      const halfWidth = ctx.measureText(name).width / 2;
      const box: Box = {
        left: point.x - halfWidth,
        right: point.x + halfWidth,
        top: point.y - 10 * this.textScale(),
        bottom: point.y + 7 * this.textScale(),
      };
      if (labels.some((other) => this.overlaps(box, other))) continue;
      labels.push(box);
      this.drawLabel(ctx, name, point.x, point.y + 5 * this.textScale());
    }
  }

  private overlaps(a: Box, b: Box): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  private drawStars(ctx: CanvasRenderingContext2D, project: Project, width: number, height: number): void {
    const toLocal = this.state.skyRotation();
    const isEyepiece = this.mode() === 'eyepiece';
    const limit = isEyepiece ? this.state.starLimit() : magnitudeLimit(this.fieldDeg());

    // Filling stars of a similar brightness and colour as one shape is far faster than
    // filling each on its own, which matters most on older phones.
    const shapes = new Map<number, { path: Path2D; magGroup: number; tint: number }>();
    // The eyepiece only needs stars near where it points, which the grid finds quickly.
    // The full list is sorted brightest first, so the sky map can stop at its limit.
    const candidates = isEyepiece ? this.starsNear(this.viewField()) : this.stars();
    for (const star of candidates) {
      if (star.mag > limit) {
        if (isEyepiece) continue;
        break;
      }
      const local = applyMatrix(toLocal, star.vector);
      // The sky map hides what is below the horizon. The eyepiece view also serves for
      // planning ahead, so it shows those stars too.
      if (local[2] < 0 && !isEyepiece) continue;
      const point = project(local);
      if (!point || point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue;

      const magGroup = Math.floor(star.mag);
      const key = magGroup * 10 + star.colorIndex;
      let shape = shapes.get(key);
      if (!shape) {
        shape = { path: new Path2D(), magGroup, tint: star.colorIndex };
        shapes.set(key, shape);
      }
      const radius = Math.max(0.8, 3.4 - star.mag * 0.42);
      shape.path.moveTo(point.x + radius, point.y);
      shape.path.arc(point.x, point.y, radius, 0, 2 * Math.PI);
    }

    for (const { path, magGroup, tint } of shapes.values()) {
      // Faint stars fade as well as shrink.
      ctx.globalAlpha = Math.min(1, Math.max(0.55, 1.15 - magGroup * 0.1));
      ctx.fillStyle = STAR_TINTS[tint];
      ctx.fill(path);
    }
    ctx.globalAlpha = 1;
  }

  private drawHorizon(ctx: CanvasRenderingContext2D, project: Project): void {
    ctx.strokeStyle = COLOR.horizon;
    ctx.lineWidth = 2;
    const points = [];
    for (let azDeg = 0; azDeg <= 360; azDeg += 2) points.push(project(horizontalVector({ altDeg: 0, azDeg })));
    this.drawCurve(ctx, points);

    ctx.fillStyle = COLOR.cardinal;
    ctx.font = this.font(17, 'bold');
    ctx.textAlign = 'center';
    for (const { label, azDeg } of CARDINALS) {
      const point = project(horizontalVector({ altDeg: 0, azDeg }));
      if (point) this.drawLabel(ctx, label, point.x, point.y + 22 * this.textScale());
    }
  }

  /** Draws target markers and labels, and returns the space the labels took. */
  private drawTargets(ctx: CanvasRenderingContext2D, project: Project, scale: number): Box[] {
    const toLocal = this.state.skyRotation();
    const selected = this.state.selectedTarget();
    const fieldDeg = this.viewField();
    const labels: Box[] = [];
    const { clientWidth: screenWidth, clientHeight: screenHeight } = this.canvasRef().nativeElement;
    ctx.font = this.font(15);
    ctx.textAlign = 'left';
    const sun = this.state.sunEquatorial();
    const sunLocal = applyMatrix(toLocal, equatorialVector(sun.raDeg, sun.decDeg));

    // The selected target goes first, so its label always wins a clash.
    const others = this.state.targets().filter((t) => t.id !== selected?.id && isShownAtField(t, fieldDeg));
    for (const target of selected ? [selected, ...others] : others) {
      const local = applyMatrix(toLocal, equatorialVector(target.raDeg, target.decDeg));
      const isSelected = target === selected;
      if (local[2] < 0 && !isSelected && this.mode() !== 'eyepiece') continue;
      const point = project(local);
      // Drawing markers and labels that are off screen wastes most of the frame's time.
      if (!point || point.x < -OFF_SCREEN_MARGIN_PX || point.x > screenWidth + OFF_SCREEN_MARGIN_PX) continue;
      if (point.y < -OFF_SCREEN_MARGIN_PX || point.y > screenHeight + OFF_SCREEN_MARGIN_PX) continue;

      // A selected object keeps its own colour, so its kind stays clear. The crosshair marks it.
      const color = target.body ? COLOR.solarSystem : target.kind === 'Star' ? COLOR.starLabel : COLOR.deepSky;

      // The object's real size, when it is large enough to see at this zoom.
      // Only for the selected target and bright objects, since faint large ones crowd the view.
      const showsSize = isSelected || !!target.body || /^M\d/.test(target.id) || target.mag <= MAX_SIZE_CIRCLE_MAG;
      const sizeRadius = showsSize && target.sizeArcmin ? stereographicRadius(target.sizeArcmin / 60 / 2) * scale : 0;
      // How far the marker reaches from the centre, to keep the label and selection clear of it.
      let markerRadius = sizeRadius;
      if (target.body) {
        // Planets and the Moon show their own icon. It grows to the real size when zoomed
        // in far enough, so the Moon's phase fills the eyepiece view as it would there.
        const discPx = Math.max(sizeRadius, ICON_DISC_PX * this.textScale());
        // A phase is drawn lit on the right, then turned so the lit side faces the Sun.
        const icon = target.phase ? phaseIcon(target.phase.litFraction, true) : targetIcon(target);
        const angle = target.phase ? this.directionOnScreen(local, sunLocal, point, project) : 0;
        if (icon) this.drawIcon(ctx, icon, point, discPx, color, angle);
        markerRadius = (discPx * ICON_GRID) / 2 / DISC_RADIUS;
      } else if (sizeRadius >= MIN_SIZE_CIRCLE_PX) {
        ctx.strokeStyle = isSelected ? color : COLOR.sizeCircle;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(point.x, point.y, sizeRadius, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (!isSelected && target.kind !== 'Star') {
        // Stars are already drawn as dots, so only other objects need a small marker.
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
        ctx.stroke();
      }
      if (isSelected) this.drawTargetMarker(ctx, point, Math.max(6, markerRadius + 3));

      // The map labels each object with its best-known designation, such as C20 for NGC 7000.
      const label = designations(target)[0];
      // Skip a label that would overlap one already drawn.
      const offset = Math.max(9, markerRadius + (isSelected ? 15 : 3));
      ctx.fillStyle = color;
      const box: Box = {
        left: point.x + offset,
        right: point.x + offset + ctx.measureText(label).width,
        top: point.y - 10 * this.textScale(),
        bottom: point.y + 7 * this.textScale(),
      };
      if (labels.some((other) => this.overlaps(box, other))) continue;
      labels.push(box);
      this.drawLabel(ctx, label, box.left, point.y + 5 * this.textScale());
    }
    return labels;
  }

  /**
   * Draws one of AstroFinder's line icons centred on a point, sized so its disc has the
   * given radius, and turned by an angle in radians. A dark edge keeps it readable over
   * stars and lines, like the map's labels.
   */
  private drawIcon(
    ctx: CanvasRenderingContext2D,
    icon: readonly IconPath[],
    { x, y }: Point,
    discPx: number,
    color: string,
    angle: number,
  ): void {
    const scale = discPx / DISC_RADIUS;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.translate(-ICON_GRID / 2, -ICON_GRID / 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Lengths are in icon units here. Dividing by the scale keeps lines and dashes the
    // same on screen at any size, so a large Moon in the eyepiece still has thin lines.
    const lineWidth = ICON_LINE_PX / scale;
    for (const [edgeColor, width] of [
      [COLOR.sky, lineWidth + 3 / scale],
      [color, lineWidth],
    ] as const) {
      ctx.strokeStyle = edgeColor;
      ctx.fillStyle = edgeColor;
      ctx.lineWidth = width;
      for (const { d, fill, dashed } of icon) {
        const path = iconPath(d);
        ctx.setLineDash(dashed ? ICON_DASH.map((length) => (length * 2) / scale) : []);
        if (fill) ctx.fill(path);
        ctx.stroke(path);
      }
    }
    ctx.restore();
  }

  /**
   * The direction on screen from a point on the sky towards another, such as from the
   * Moon towards the Sun, as an angle in radians. It takes a tiny step along the sky,
   * so it works even when the Sun is far off screen or below the horizon.
   */
  private directionOnScreen(from: Vector3, towards: Vector3, point: Point, project: Project): number {
    const along = towards[0] * from[0] + towards[1] * from[1] + towards[2] * from[2];
    const nudge = (i: number): number => from[i] + 0.001 * (towards[i] - along * from[i]);
    const step: Vector3 = [nudge(0), nudge(1), nudge(2)];
    const next = project(step);
    return next ? Math.atan2(next.y - point.y, next.x - point.x) : 0;
  }

  /**
   * The selected target: a crosshair of four short rounded strokes, with a gap in the
   * middle so the object itself stays visible. It uses the green the aiming rings turn
   * when the telescope is on target.
   */
  private drawTargetMarker(ctx: CanvasRenderingContext2D, { x, y }: Point, gap: number): void {
    // Each stroke runs out from the gap, which keeps clear of the object's icon or size.
    const radius = gap + 10;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      ctx.moveTo(x + dx * gap, y + dy * gap);
      ctx.lineTo(x + dx * radius, y + dy * radius);
    }
    // A dark edge first, so the crosshair stands out over stars and lines.
    ctx.strokeStyle = COLOR.sky;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = COLOR.onTarget;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * AstroFinder's reticle: three rings at the sizes observers know from a Telrad finder.
   */
  private drawReticle(
    ctx: CanvasRenderingContext2D,
    project: Project,
    width: number,
    height: number,
    scale: number,
  ): void {
    const cx = width / 2;
    const cy = height / 2;
    const color = this.isOnTarget() ? COLOR.onTarget : COLOR.reticle;
    // While plate solving, the reticle fades in and out, and keeps redrawing itself to do so.
    const opacity = this.state.plateSolving() ? pulseOpacity(performance.now()) : 1;
    this.canvasRef().nativeElement.dataset['reticleOpacity'] = opacity.toFixed(2);
    if (this.state.plateSolving()) this.queueDraw();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.font = this.font(13);
    ctx.textAlign = 'left';

    for (const diameterDeg of RETICLE_RINGS_DEG) {
      const radius = stereographicRadius(diameterDeg / 2) * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.stroke();
      // Small rings have no room for a label until zoomed in.
      if (radius >= MIN_LABELLED_RING_PX) {
        this.drawLabel(ctx, `${diameterDeg}°`, cx + radius * 0.72 + 4, cy - radius * 0.72 - 4);
      }
    }

    const outerRadius = stereographicRadius(RETICLE_RINGS_DEG.at(-1)! / 2) * scale;

    ctx.globalAlpha = 1;

    this.drawPointer(ctx, project, cx, cy, outerRadius + 24, width, height);
  }

  /** Points from the reticle to the selected target, with a guide line if it is visible. */
  private drawPointer(
    ctx: CanvasRenderingContext2D,
    project: Project,
    cx: number,
    cy: number,
    radius: number,
    width: number,
    height: number,
  ): void {
    const target = this.state.selectedTarget();
    if (!target || this.isOnTarget()) return;
    const position = this.state.positionOf(target);

    // Work in the view's own axes, which stay valid for a target behind the viewer.
    const [x, y] = toViewCoordinates(
      viewBasis(this.shownPointing ?? this.state.pointing()),
      horizontalVector(position),
    );
    const angle = (guideAngleDeg(x, y, 1, 1, this.state.viewRollDeg()) * Math.PI) / 180;
    this.canvasRef().nativeElement.dataset['guideAngle'] = String(Math.round((angle * 180) / Math.PI));
    const [dirX, dirY] = [Math.sin(angle), -Math.cos(angle)];

    // A dashed line joins the rings to the target once it is in view.
    const point = project(horizontalVector(position));
    const isInView = !!point && point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
    if (point && isInView && Math.hypot(point.x - cx, point.y - cy) > radius + 40) {
      ctx.strokeStyle = COLOR.guide;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(cx + dirX * (radius + 34), cy + dirY * (radius + 34));
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    this.drawChevrons(ctx, cx + dirX * (radius + 4), cy + dirY * (radius + 4), angle);
  }

  /**
   * In the eyepiece view, chevrons just outside the eyepiece circle show which way to move
   * the tube, until the target comes into the field. They ignore the image turn or mirror
   * of the telescope on purpose: up always means raise the tube, like the bottom bar says.
   */
  private drawEyepieceGuide(ctx: CanvasRenderingContext2D, width: number, centreY: number, scale: number): void {
    const target = this.state.selectedTarget();
    const canvas = this.canvasRef().nativeElement;
    if (!target) return;
    const position = this.state.positionOf(target);
    const pointing = this.shownPointing ?? this.state.pointing();
    if (separationDeg(pointing, position) < this.eyepieceField() / 2) {
      delete canvas.dataset['guideAngle'];
      return;
    }
    const [x, y] = toViewCoordinates(viewBasis(pointing), horizontalVector(position));
    const angle = (guideAngleDeg(x, y, 1, 1, 0) * Math.PI) / 180;
    canvas.dataset['guideAngle'] = String(Math.round((angle * 180) / Math.PI));

    const radius = stereographicRadius(this.eyepieceField() / 2) * scale + 8;
    this.drawChevrons(ctx, width / 2 + Math.sin(angle) * radius, centreY - Math.cos(angle) * radius, angle);
  }

  /** A trail of chevrons that brightens towards the target, so the eye follows it outwards. */
  private drawChevrons(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = COLOR.guide;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Wide gaps mean the target is far away, so move quickly. Tight gaps mean slow down.
    const spacing = chevronSpacingPx(this.targetDistance());
    for (const [index, alpha] of CHEVRON_FADE.entries()) {
      const tip = -index * spacing - CHEVRON_HEIGHT_PX;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(-CHEVRON_HALF_WIDTH_PX, tip + CHEVRON_HEIGHT_PX);
      ctx.lineTo(0, tip);
      ctx.lineTo(CHEVRON_HALF_WIDTH_PX, tip + CHEVRON_HEIGHT_PX);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Blacks out everything outside the eyepiece's circular field. */
  private drawEyepieceMask(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number,
    centreY: number,
  ): void {
    const radius = stereographicRadius(this.eyepieceField() / 2) * scale;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.arc(width / 2, centreY, radius, 0, 2 * Math.PI, true);
    ctx.fill();
    ctx.strokeStyle = '#3a4158';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(width / 2, centreY, radius, 0, 2 * Math.PI);
    ctx.stroke();
  }
}
