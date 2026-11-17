import { DecimalPipe } from '@angular/common';
import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonChip, IonContent, IonFabButton, IonIcon, IonRange, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  listOutline,
  eye,
  eyeOutline,
  close,
  contractOutline,
  expandOutline,
  informationCircle,
  informationCircleOutline,
  locateOutline,
  mapOutline,
  arrowUndoOutline,
  radioButtonOffOutline,
  moonOutline,
  remove,
  scanOutline,
  timeOutline,
  eyeOffOutline,
  locationOutline,
  settingsOutline,
  phoneLandscapeOutline,
} from 'ionicons/icons';

import { APP_ICONS, isIconUrl } from '../core/app-icons';
import { AppState } from '../core/app-state.service';
import type { Horizontal } from '../core/astronomy';
import {
  azimuthChangeDeg,
  equatorialToHorizontal,
  formatDec,
  formatLocation,
  formatRa,
  horizontalVector,
  rotateInView,
  separationDeg,
  stereographic,
  stereographicRadius,
  toViewCoordinates,
  viewBasis,
} from '../core/astronomy';
import { designationText } from '../core/designations';
import { equipmentLabel, eyepieceLabel, modifierLabel, telescopeLabel } from '../core/equipment';
import { LiveSolverService } from '../core/live-solver.service';
import { MoreSheetComponent } from '../core/more-sheet.component';
import { countLabel } from '../core/observing-log';
import { ObservingLogService } from '../core/observing-log.service';
import { PlaylistBarComponent } from '../core/playlist-bar.component';
import { PlaylistService } from '../core/playlist.service';
import { RemoteService } from '../core/remote.service';
import { RETICLE_RINGS_DEG, guideAngleDeg, pulseOpacity } from '../core/reticle';
import { SeenActionsService } from '../core/seen-actions.service';
import { SensorService } from '../core/sensor.service';
import { isShutterPress } from '../core/shutter-remote';
import { sideways } from '../core/sideways';
import type { Frame } from '../core/sky-map/draw-sky';
import {
  drawConstellationLines,
  drawConstellationNames,
  drawEyepieceMask,
  drawGrid,
  drawHorizon,
  drawStars,
} from '../core/sky-map/draw-sky';
import { drawChevrons, drawPointer, drawReticle, drawTargets } from '../core/sky-map/draw-targets';
import { MapGestures } from '../core/sky-map/map-gestures';
import type { Point, Project } from '../core/sky-map/sky-style';
import {
  COLOR,
  DEFAULT_FIELD_DEG,
  MAX_ALTITUDE_DEG,
  MAX_FIELD_DEG,
  MIN_ALTITUDE_DEG,
  MIN_FIELD_DEG,
  ZOOM_STEP,
  magnitudeLimit,
  useColors,
} from '../core/sky-map/sky-style';
import { StarFieldService } from '../core/sky-map/star-field.service';
import { SoundService } from '../core/sound.service';
import { TargetDetailsComponent } from '../core/target-details.component';
import { iconDataUrl, targetIcon } from '../core/target-icons';
import type { Target } from '../core/targets';
import type { ClearSpan } from '../core/view-layout';
import { EYEPIECE_VIEW_SCALE, viewLayout } from '../core/view-layout';
import { EYEPIECE_SMOOTHING_MS, SKY_MAP_SMOOTHING_MS, smoothPointing, smoothingFactor } from '../core/view-smoothing';

/**
 * The three views the view button steps through, in this order: the sky map with the
 * Telrad rings, the eyepiece view, and the sky map with one ring the size of the
 * eyepiece's field, to see what will fit in the eyepiece while finding the way there.
 */
type ViewMode = 'sky' | 'eyepiece' | 'ring';
const NEXT_VIEW: Record<ViewMode, ViewMode> = { sky: 'eyepiece', eyepiece: 'ring', ring: 'sky' };
/** The button shows the view it switches to: its icon, and its name for screen readers. */
const VIEW_BUTTONS: Record<ViewMode, { icon: string; label: string }> = {
  sky: { icon: 'map-outline', label: 'Sky map' },
  eyepiece: { icon: APP_ICONS.eyepiece, label: 'Eyepiece view' },
  ring: { icon: 'radio-button-off-outline', label: 'Field ring' },
};
/** The slider's range for the faintest stars shown. */
const MIN_STAR_LIMIT = 2;
const MAX_STAR_LIMIT = 13;
/** The gap kept between the eyepiece's circle and what lies beside it, on a phone on its side. */
const CLEAR_MARGIN_PX = 10;
/** How long a toast message stays, long enough to read at arm's length. */
const TOAST_MS = 3500;
/** How fast the sky turns, in degrees a second: a full turn in a sidereal day. */
const SKY_TURN_DEG_PER_S = 360 / 86_164;
// Limits on how often the map redraws just to follow the sky's turning.
const MIN_SKY_TURN_WAIT_MS = 100;
const MAX_SKY_TURN_WAIT_MS = 10_000;
/** Rings smaller than this on screen still take a tap this far from their centre, for a finger. */
const MIN_TAP_RADIUS_PX = 48;
/**
 * The menu and the zoom buttons go away after this long without a touch, and leave the sky
 * clear, as a car's navigation screen does. A tap on the map brings them back.
 */
const MENU_IDLE_MS = 10_000;

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
    IonRange,
    MoreSheetComponent,
    PlaylistBarComponent,
    TargetDetailsComponent,
  ],
  styles: `
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
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
    /* A warning in the readout, such as the finder phone's sensors being off. */
    .readout .warn {
      color: var(--ion-color-warning);
      font-weight: 600;
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
    /* Zoom: a column of two round buttons in the top right corner. */
    .zoom {
      position: absolute;
      top: calc(4px + var(--ion-safe-area-top, 0px));
      right: calc(4px + var(--ion-safe-area-right, 0px));
      display: flex;
      flex-direction: column;
      transition: opacity 0.2s;
    }
    /* Comes and goes with the menu, and takes no taps while hidden: a tap on the map brings both. */
    .zoom.faded {
      opacity: 0;
      transition: opacity 0.8s;
    }
    .zoom.faded ion-fab-button {
      pointer-events: none;
    }
    /* Big enough to hit in the dark at arm's length, and set a little apart. */
    .zoom ion-fab-button {
      margin: 4px;
      --background: rgb(10 14 28 / 85%);
      --background-activated: #232a3d;
      --color: var(--af-text);
      --border-color: #232a3d;
      --border-width: 1px;
      --border-style: solid;
      --box-shadow: none;
    }
    /* A sensor problem, in a small box at the bottom of the map. */
    .message {
      margin-top: 6px;
      padding: 6px 10px;
      border-radius: 10px;
      background: rgb(10 14 28 / 92%);
      color: var(--ion-color-warning);
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
    .recent {
      display: flex;
      gap: 2px;
      overflow-x: auto;
    }
    .recent ion-chip {
      flex-shrink: 0;
      font-size: calc(14px * var(--af-scale, 1));
    }
    /* Above the time control, which lies over the bottom of the map when it shows. */
    .dock {
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: calc(10px + var(--af-tab-bar-height, 0px));
      display: flex;
      flex-direction: column;
      /* The empty space beside the location still lets the map be dragged. */
      pointer-events: none;
    }
    .dock > * {
      pointer-events: auto;
    }
    /*
     * A row along the bottom, with the location on the left. Only what is in it
     * takes taps. Named with the dock, to win over the dock's own rule above: the bare row
     * once took every tap across its width, and so covered the round buttons beside it.
     */
    .dock > .corner {
      display: flex;
      align-items: flex-end;
      pointer-events: none;
    }
    .dock > .corner > * {
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
      border: 1px solid var(--ion-color-warning);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .readout.location.unset ion-icon {
      flex: none;
      font-size: 20px;
      color: var(--ion-color-warning);
    }
    /* Nearly solid, like the readout at the top, so map labels behind it barely show. */
    .bar {
      padding: 6px 4px 6px 12px;
      border: 1px solid #232a3d;
      border-radius: 12px;
      background: rgb(10 14 28 / 92%);
      color: var(--af-text);
      font-size: calc(18px * var(--af-scale, 1));
    }
    /* The text takes what room is left, and the buttons stay together on one line beside it. */
    .bar-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    /*
     * The directions and distance, under the name and the buttons, the box's full width.
     * "Down 15° · Left 24°" is read as one thing, so it never breaks over two lines.
     */
    .guide {
      flex: 1 0 100%;
      order: 1;
    }
    .directions {
      white-space: nowrap;
    }
    /* A button at the row's right end, such as the star limit's reset. */
    .bar-row .end {
      margin-left: auto;
    }
    .bar-text {
      flex: 1 1 0;
      min-width: 0;
    }
    .target-icon {
      flex: none;
      font-size: calc(24px * var(--af-scale, 1));
      margin-right: 4px;
      color: var(--ion-color-primary);
    }
    .bar-buttons {
      flex: none;
      display: flex;
      align-items: center;
    }
    /* Seen tonight: the eye fills in, in the green that means done and on target. */
    .bar-buttons .seen {
      --color: var(--ion-color-success);
    }
    /* At night the green would turn a dull dark red: white turns full-strength red instead. */
    :host-context(html.night) .bar-buttons .seen {
      --color: #ffffff;
    }
    /*
     * The eye's count sits on the eye's bottom right corner, as in the lists, so the button
     * keeps the same size and the target's name keeps its room beside it. It lies outside
     * the button, which would clip it, and lets taps through to the button underneath.
     */
    .eye {
      position: relative;
      display: inline-flex;
    }
    .eye .af-count {
      left: calc(50% + 6px);
      top: calc(50% + 1px);
      --af-count-edge: #0a0e1c;
    }
    /* Each part of a line wraps as a whole, never in the middle, like "below the horizon". */
    .keep {
      white-space: nowrap;
    }
    .muted {
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
    }
    .directions {
      color: var(--af-guidance);
      font-size: calc(17px * var(--af-scale, 1));
      font-weight: 600;
    }
    /*
     * A phone on its side: the map is wide and short. The boxes keep to the bottom left,
     * and zoom to the top right corner, so the reticle in the middle stays clear.
     */
    @media (orientation: landscape) and (max-height: 520px) {
      /* Clear of a notch or camera hole at the left edge. */
      .readout {
        left: calc(10px + var(--ion-safe-area-left, 0px));
      }
      /* Never taller than the map: the box of the target shrinks and scrolls inside itself. */
      .dock {
        left: calc(10px + var(--ion-safe-area-left, 0px));
        right: calc(10px + var(--ion-safe-area-right, 0px));
        bottom: calc(8px + var(--af-tab-bar-height, 0px));
        max-height: calc(100vh - 16px - var(--af-time-control-height, 0px));
        align-items: flex-start;
      }
      .corner {
        align-self: stretch;
      }
      /*
       * The boxes keep to the bottom left corner, narrow enough to leave the reticle in
       * the middle of the map clear at the usual zoom.
       */
      .bar,
      .eyepiece-panel,
      .message {
        box-sizing: border-box;
        width: min(42%, 320px);
        flex-shrink: 0;
      }
      .bar,
      .eyepiece-panel {
        flex-shrink: 1;
        min-height: 0;
        overflow-y: auto;
      }
      .bar-buttons {
        justify-content: space-between;
      }
      .eyepiece-panel {
        width: min(46%, 360px);
      }
      /*
       * With a target, its box is a panel down the left edge, the map's full height, like
       * the card of a car's navigation app: the list being played at the top, as upright,
       * then which way to move, first and largest, then the target, and the buttons at the
       * foot. The map's centre moves into the clear part beside it
       * (see clearSpan), so the panel never lies over the reticle or the guidance.
       */
      .stage {
        --af-panel-width: min(38vw, 300px);
      }
      .dock:has(.bar) {
        top: calc(8px + var(--ion-safe-area-top, 0px));
      }
      .dock:has(.bar) .bar,
      .dock:has(.bar) .eyepiece-panel,
      .dock:has(.bar) .message {
        width: var(--af-panel-width);
      }
      .dock:has(.bar) .bar {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
      }
      .bar > .bar-row {
        flex: 1 0 auto;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-rows: auto auto 1fr;
        grid-template-areas:
          'guide guide'
          'icon text'
          'buttons buttons';
        align-items: center;
      }
      .bar > .bar-row .guide {
        grid-area: guide;
        margin-bottom: 6px;
      }
      .bar > .bar-row .target-icon {
        grid-area: icon;
      }
      .bar > .bar-row .bar-text {
        grid-area: text;
      }
      .bar > .bar-row .bar-buttons {
        grid-area: buttons;
        align-self: end;
      }
      /* The instruction, read first and from furthest away. */
      .bar .directions {
        font-size: calc(22px * var(--af-scale, 1));
      }
      /*
       * The list being played stays at the top, as with the phone upright, and stays in
       * view while the details scroll under it.
       */
      .bar app-playlist-bar {
        position: sticky;
        /* The panel's own padding, so nothing scrolls into view above the row. */
        top: -6px;
        z-index: 1;
        margin-top: -6px;
        padding-top: 4px;
        background: #0a0e1c;
      }
      /* Open, the details take the room the panel has, and scroll inside it. */
      .bar.detailed {
        width: min(46vw, 360px);
      }
      .bar.detailed > .bar-row {
        flex: none;
      }
      /* The pointing readout moves beside the panel. */
      .stage:has(.bar) .readout {
        left: calc(20px + var(--ion-safe-area-left, 0px) + var(--af-panel-width));
      }
      .stage:has(.bar.detailed) .readout {
        left: calc(20px + var(--ion-safe-area-left, 0px) + min(46vw, 360px));
      }
    }
  `,
  template: `
    <!-- No header, so the map fills the whole screen. -->
    <ion-content [scrollY]="false" [fullscreen]="true">
      <!-- Any touch keeps the menu and zoom open a while longer: see wake. -->
      <div class="stage" (pointerdown)="wake()">
        <canvas
          #canvas
          aria-label="Sky map. Drag to aim, pinch to zoom."
          [attr.data-star-count]="stars().length"
          [attr.data-constellation-count]="constellations().length"
          [attr.data-field]="viewField()"
          [attr.data-target]="state.selectedTargetId()"
          (pointerdown)="pointerDown($event)"
          (pointermove)="gestures.move($event)"
          (pointerup)="gestures.up($event)"
          (pointercancel)="gestures.up($event)"
          (wheel)="wheel($event)"
        ></canvas>
        <!-- Tapping the rings, red or green, plate solves there. This hidden button does the same for screen readers. -->
        @if (!solvingHere() && !state.finderMode()) {
          <button class="visually-hidden" type="button" data-testid="solve-here" (click)="solveHere()">
            Plate solve here
          </button>
        }

        <div class="readout" data-testid="pointing" [attr.data-still]="sensors.isStill()">
          <!-- The sensor button shows whether sensors are on, so only a missing compass is worth a line. -->
          @if (state.sensorsActive() && !sensors.hasCompass()) {
            No compass<br />
          }
          <!-- On a screen phone, the finder's position only follows the telescope while its sensors run. -->
          @if (state.remoteFinder() && !remote.finderSteering()) {
            <span class="warn" data-testid="finder-sensors-off">Finder sensors off</span><br />
          }
          Alt {{ state.pointing().altDeg | number: '1.0-0' }}° Az {{ state.pointing().azDeg | number: '1.0-0' }}°<br />
          <!-- Hidden unless chosen in Settings, since most observers steer by the map, not coordinates. -->
          @if (state.settings().showEquatorial) {
            <span data-testid="equatorial">RA {{ pointingRa() }}, Dec {{ pointingDec() }}</span>
            <br />
          }
          @if (mode() === 'eyepiece') {
            {{ power() | number: '1.0-0' }}× · FOV {{ eyepieceField() | number: '1.1-2' }}°
          } @else {
            FOV {{ fieldDeg() | number: '1.0-0' }}°
            @if (mode() === 'ring') {
              <br /><span data-testid="ring-readout"
                >Ring {{ eyepieceField() | number: '1.1-2' }}° · {{ power() | number: '1.0-0' }}×</span
              >
            }
          }
        </div>

        <!-- A finder phone linked to a screen phone shows only the map: nothing to tap by accident. -->
        @if (!state.finderMode()) {
          <!--
            Zoom, top right, shown with the menu. Not in the eyepiece view, where the eyepiece
            sets the field. Pinching zooms too.
          -->
          @if (mode() !== 'eyepiece') {
            <div class="zoom" [class.faded]="!moreOpen()">
              <ion-fab-button
                aria-label="Zoom in"
                data-testid="zoom-in"
                [disabled]="fieldDeg() <= minField"
                (click)="zoomBy(1 / zoomStep)"
              >
                <ion-icon name="add" aria-hidden="true"></ion-icon>
              </ion-fab-button>
              <ion-fab-button
                aria-label="Zoom out"
                data-testid="zoom-out"
                [disabled]="fieldDeg() >= maxField"
                (click)="zoomBy(zoomStep)"
              >
                <ion-icon name="remove" aria-hidden="true"></ion-icon>
              </ion-fab-button>
            </div>
          }
          <!--
            The menu: big tiles with words over the bottom of the map. A tap on the map opens
            it, and it goes after a while without a touch: see MENU_IDLE_MS. This hidden
            button opens it for screen readers.
          -->
          <button class="visually-hidden" type="button" data-testid="open-menu" (click)="openMenu()">Menu</button>
          @if (moreOpen()) {
            <app-more-sheet
              [mode]="mode()"
              [view]="viewButtons[nextView()]"
              (nextView)="mode.set(nextView())"
              (closed)="moreOpen.set(false)"
            ></app-more-sheet>
          }
        }

        @if (!state.finderMode()) {
          <div class="dock" #dock>
            <!-- Location sits bottom left and zoom bottom right, just above whatever boxes are open below. -->
            <div class="corner">
              @if (!state.selectedTarget()) {
                <!-- Where the sky is calculated for, like the pointing readout at the top. -->
                @if (state.settings().locationSet) {
                  <div class="readout location" data-testid="location">{{ location() }}</div>
                } @else {
                  <!-- Until a location is set, the sky shown is for a neutral place, so ask for one. -->
                  <button type="button" class="readout location unset" data-testid="location" (click)="locate()">
                    <ion-icon name="location-outline" aria-hidden="true"></ion-icon>
                    {{ locating() || 'Set location' }}
                  </button>
                }
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
              </div>
            }

            @if (state.selectedTarget(); as target) {
              <div class="bar" data-testid="target-bar" [class.detailed]="showDetails()">
                <!--
                  Observing through a list: back and forward through it, like a music playlist.
                  The middle says where in the list, and opens it.
                -->
                @if (playlist.playing()) {
                  <app-playlist-bar data-testid="playlist"></app-playlist-bar>
                }
                <div class="bar-row">
                  <!-- The target's own icon, as in the lists. -->
                  @if (targetIconUrl(); as icon) {
                    <ion-icon class="target-icon" aria-hidden="true" [src]="icon"></ion-icon>
                  }
                  <div class="bar-text">
                    <strong data-testid="target-designations">{{ designationText(target) }}</strong> {{ target.name }}
                  </div>
                  <!-- Which way to move, on a line of its own the box's full width, never broken. -->
                  <div class="guide">
                    <div class="directions" data-testid="directions">{{ directions() }}</div>
                    <div class="muted" data-testid="guidance">
                      <span class="keep">{{ targetDistance() | number: '1.1-1' }}° away</span>
                      @if (targetBelowHorizon()) {
                        · <span class="keep">below the horizon</span>
                      }
                    </div>
                  </div>
                  <div class="bar-buttons">
                    <!-- Opens the target's observations, or a blank one. Filled in green once there is any. -->
                    <span class="eye" data-testid="mark-seen-wrap">
                      <ion-button
                        fill="clear"
                        size="small"
                        data-testid="mark-seen"
                        [class.seen]="observed()"
                        [attr.aria-label]="
                          (observed() ? 'Observations' : 'Log an observation') +
                          (seenCount() > 1 ? ', seen ' + seenCount() + ' times' : '')
                        "
                        (click)="openLog(target)"
                      >
                        <ion-icon
                          slot="icon-only"
                          aria-hidden="true"
                          [name]="observed() ? 'eye' : 'eye-outline'"
                        ></ion-icon>
                      </ion-button>
                      <!-- Seen more than once, on any night: how many times, on the eye's corner. -->
                      @if (seenCount() > 1) {
                        <span class="af-count" data-testid="seen-count" aria-hidden="true">{{
                          countLabel(seenCount())
                        }}</span>
                      }
                    </span>
                    <!-- Turns the map to the target: a frame closing in on it. -->
                    <ion-button
                      fill="clear"
                      size="small"
                      aria-label="Aim at the target"
                      data-testid="aim-at-target"
                      (click)="aimAtTarget()"
                    >
                      <ion-icon slot="icon-only" name="scan-outline" aria-hidden="true"></ion-icon>
                    </ion-button>
                    <ion-button
                      fill="clear"
                      size="small"
                      aria-label="Target details"
                      data-testid="target-info"
                      [attr.aria-pressed]="showDetails()"
                      (click)="showDetails.set(!showDetails())"
                    >
                      <!-- Filled while the details are open, as the cloud on the time control. -->
                      <ion-icon
                        slot="icon-only"
                        aria-hidden="true"
                        [name]="showDetails() ? 'information-circle' : 'information-circle-outline'"
                      ></ion-icon>
                    </ion-button>
                    <ion-button
                      fill="clear"
                      size="small"
                      aria-label="Clear target"
                      data-testid="clear-target"
                      (click)="clearTarget()"
                    >
                      <ion-icon slot="icon-only" name="close" aria-hidden="true"></ion-icon>
                    </ion-button>
                  </div>
                </div>
                @if (showDetails()) {
                  <app-target-details data-testid="target-details" [target]="target"></app-target-details>
                }
              </div>
            }
            <!-- Last, at the bottom, so it is seen without covering the sky. -->
            @if (sensors.error(); as message) {
              <div class="message" data-testid="sensor-error">{{ message }}</div>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
})
export class SkyPage implements AfterViewInit, OnDestroy {
  protected readonly state = inject(AppState);
  protected readonly sensors = inject(SensorService);
  protected readonly liveSolver = inject(LiveSolverService);
  protected readonly remote = inject(RemoteService);
  protected readonly playlist = inject(PlaylistService);
  private readonly sound = inject(SoundService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastController);
  private readonly seenActions = inject(SeenActionsService);
  private readonly log = inject(ObservingLogService);
  /** How many times the selected target has been seen, on any night, failed tries left out. */
  protected readonly seenCount = computed(() => {
    const target = this.state.selectedTarget();
    return target ? this.log.timesSeen(target.id) : 0;
  });
  protected readonly countLabel = countLabel;
  /** Whether the selected target has any observation, on any night, which fills in the eye. */
  protected readonly observed = computed(() => {
    const target = this.state.selectedTarget();
    return !!target && this.log.states().has(target.id);
  });
  /** The newest plate solve already given a toast, so each attempt gets at most one. */
  private lastToastedSolveId = this.liveSolver.log()[0]?.id ?? 0;
  /** When the alignment shown last was made, or undefined before the first check. */
  private shownAlignedAt?: string | null;

  protected readonly mode = signal<ViewMode>('sky');
  protected readonly nextView = computed(() => NEXT_VIEW[this.mode()]);
  protected readonly viewButtons = VIEW_BUTTONS;
  protected readonly fieldDeg = signal(DEFAULT_FIELD_DEG);
  protected readonly minField = MIN_FIELD_DEG;
  protected readonly maxField = MAX_FIELD_DEG;
  protected readonly zoomStep = ZOOM_STEP;
  protected readonly designationText = designationText;
  /** The map's background stars and constellations: see StarFieldService. */
  private readonly starField = inject(StarFieldService);
  protected readonly stars = this.starField.stars;
  protected readonly constellations = this.starField.constellations;
  protected readonly showDetails = signal(false);
  protected readonly isIconUrl = isIconUrl;
  /** AstroTurboMaxiSolver's own icon for the selected target, or null for kinds without one. */
  protected readonly targetIconUrl = computed(() => {
    const target = this.state.selectedTarget();
    const paths = target ? targetIcon(target) : null;
    return paths ? iconDataUrl(paths) : null;
  });

  protected readonly showEquipment = signal(false);

  protected readonly equipmentLabel = equipmentLabel;
  protected readonly telescopeLabel = telescopeLabel;
  protected readonly eyepieceLabel = eyepieceLabel;
  protected readonly modifierLabel = modifierLabel;
  protected readonly minStarLimit = MIN_STAR_LIMIT;
  protected readonly maxStarLimit = MAX_STAR_LIMIT;
  protected readonly isAutoStarLimit = computed(() => this.state.settings().eyepieceStarLimit === null);

  protected readonly power = this.state.power;
  protected readonly eyepieceField = this.state.trueField;

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
  /**
   * Redraws when the canvas changes size, as when the phone rotates, and when the boxes at
   * the bottom do, as when a target is chosen or its details open: the reticle moves into
   * the part of the map they leave clear.
   */
  private readonly resizeObserver = new ResizeObserver(() => this.queueDraw());
  private readonly dockRef = viewChild<ElementRef<HTMLElement>>('dock');
  private observedDock?: HTMLElement;
  /** The sky's rotation at the frame being drawn. */
  private frameRotation = this.state.rotationAt(this.state.frameTime());
  private skyTurnTimer?: ReturnType<typeof setTimeout>;
  private drawQueued = false;
  /** The pointing the view shows, which follows the sensors smoothly. */
  private shownPointing: Horizontal | null = null;
  private lastFrameTime = 0;
  private viewCentreY = 0;
  /** The view's centre across the screen, and the pixels its field of view spans: see viewLayout. */
  private viewCentreX = 0;
  private viewSpanPx = 0;

  /** Where the map pointed, and how wide it was, when the drag or pinch in progress started. */
  private gestureStart = { altDeg: 0, azDeg: 0, fieldDeg: DEFAULT_FIELD_DEG };
  /** One finger drags or taps, two pinch: see MapGestures. */
  protected readonly gestures = new MapGestures({
    start: () => (this.gestureStart = { ...this.state.pointing(), fieldDeg: this.fieldDeg() }),
    drag: (dx, dy) => this.dragBy(dx, dy),
    // The eyepiece sets its own field, so a pinch does nothing there.
    pinch: (spread) => {
      if (this.mode() !== 'eyepiece') this.setField(this.gestureStart.fieldDeg / spread);
    },
    tap: (event) => this.tapped(event),
  });
  /** The largest ring's radius on screen, in CSS pixels, so a tap on the rings can be found. */
  private reticleRadiusPx = 0;
  /** True while a tap's plate solve runs, so a second tap does nothing. */
  protected readonly solvingHere = signal(false);
  /** Whether the menu is open. */
  protected readonly moreOpen = signal(false);
  /** Closes the menu after a while without a touch: see MENU_IDLE_MS. */
  private idleTimer?: ReturnType<typeof setTimeout>;
  /** A shutter remote's press plate solves: see shutterPressed. */
  private readonly onKey = (event: KeyboardEvent): void => this.shutterPressed(event);

  constructor() {
    addIcons({
      add,
      eye,
      eyeOutline,
      close,
      contractOutline,
      expandOutline,
      informationCircle,
      informationCircleOutline,
      locateOutline,
      mapOutline,
      arrowUndoOutline,
      radioButtonOffOutline,
      moonOutline,
      remove,
      scanOutline,
      timeOutline,
      eyeOffOutline,
      locationOutline,
      settingsOutline,
      phoneLandscapeOutline,
      listOutline,
    });
    // The faint stars are a large file, so they only load once the eyepiece view opens.
    effect(() => {
      if (this.mode() === 'eyepiece') void this.starField.loadDeepStars();
    });

    // Every failed automatic plate solve, or one started by tapping the rings, is told
    // with a toast. Successes only when the debugging setting asks for them, and with a soft
    // shutter sound if chosen in Settings. Alignment shows its own results, so it is left out.
    effect(() => {
      const newest = this.liveSolver.log()[0];
      if (!newest || newest.id <= this.lastToastedSolveId) return;
      this.lastToastedSolveId = newest.id;
      if (newest.trigger === 'alignment') return;
      const { solveSuccessToast: showSuccess, solveSound } = untracked(() => this.state.settings());
      if (newest.outcome === 'solved' && solveSound) this.sound.shutter();
      // Only over the map. On another tab the message would cover that page's header,
      // and its buttons with it, each time the phone lay still.
      if (
        untracked(() => this.state.mapOnShow()) &&
        (newest.outcome === 'failed' || (newest.outcome === 'solved' && showSuccess))
      ) {
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

    // The boxes at the bottom are watched for size whenever they are on screen.
    effect(() => {
      const dock = this.dockRef()?.nativeElement;
      if (dock === this.observedDock) return;
      if (this.observedDock) this.resizeObserver.unobserve(this.observedDock);
      if (dock) this.resizeObserver.observe(dock);
      this.observedDock = dock;
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
      this.starField.allStars();
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
    this.resizeObserver.observe(this.canvasRef().nativeElement);
    window.addEventListener('keydown', this.onKey);
    this.wake();
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
    clearTimeout(this.skyTurnTimer);
    clearTimeout(this.idleTimer);
    window.removeEventListener('keydown', this.onKey);
  }

  /**
   * A touch: the menu, if open, stays until the next while without one. Then it goes away
   * with the zoom buttons, leaving the sky clear.
   */
  protected wake(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.moreOpen.set(false), MENU_IDLE_MS);
  }

  /** Opens the menu, for its while: see wake. */
  protected openMenu(): void {
    this.moreOpen.set(true);
    this.wake();
  }

  /**
   * A Bluetooth shutter remote, when the setting is on, plate solves on the map, as a tap
   * on the rings does. The Align page has its own use for it, aligning. Not on a finder
   * phone, whose screen phone asks for its solves.
   */
  private shutterPressed(event: KeyboardEvent): void {
    if (!this.state.settings().shutterAligns || !this.state.mapOnShow() || this.state.finderMode()) return;
    if (!isShutterPress(event)) return;
    event.preventDefault();
    void this.solveHere();
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

  /** Opens the target's observations: the newest, or a blank form for the first. */
  protected openLog(target: Target): Promise<void> {
    return this.seenActions.openLog(target.id);
  }

  /** Clears the target, and stops observing through a list. */
  protected clearTarget(): void {
    this.state.selectedTargetId.set(null);
    this.showDetails.set(false);
    this.playlist.stop();
  }

  /**
   * Turns the map straight to the target, since dragging across the sky is impractical in
   * the eyepiece's narrow field. The sensors would turn it back to where the phone points,
   * so they are switched off first.
   */
  protected aimAtTarget(): void {
    const target = this.state.selectedTarget();
    // Steered by a finder phone, the map follows the telescope, wherever the map is turned.
    if (!target || this.state.remoteFinder()) return;
    if (this.state.sensorsActive()) this.sensors.stop();
    const { altDeg, azDeg } = this.state.positionOf(target);
    this.state.pointing.set({ altDeg: Math.min(altDeg, MAX_ALTITUDE_DEG), azDeg });
  }

  protected zoomBy(factor: number): void {
    this.setField(this.fieldDeg() * factor);
  }

  protected wheel(event: WheelEvent): void {
    if (this.mode() !== 'eyepiece' && !this.state.finderMode()) this.zoomBy(event.deltaY > 0 ? 1.1 : 1 / 1.1);
  }

  protected pointerDown(event: PointerEvent): void {
    // A finder phone's map takes no touches while linked: the screen phone is for that.
    if (!this.state.finderMode()) this.gestures.down(event);
  }

  /** A tap on the rings plate solves there. Anywhere else it opens or closes the menu. */
  private tapped(event: PointerEvent): void {
    if (this.isOnReticle(event)) void this.solveHere();
    else if (this.moreOpen()) this.moreOpen.set(false);
    else this.openMenu();
  }

  /** Whether a tap landed on the rings, or close enough to them for a finger. */
  private isOnReticle(event: PointerEvent): boolean {
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    const cx = this.viewCentreX || canvas.clientWidth / 2;
    const cy = this.viewCentreY || canvas.clientHeight / 2;
    const distance = Math.hypot(event.clientX - rect.left - cx, event.clientY - rect.top - cy);
    return distance <= Math.max(this.reticleRadiusPx, MIN_TAP_RADIUS_PX);
  }

  /**
   * Plate solves now, when the user taps the rings, rather than waiting for the
   * phone to be still. The sky map moves to the solved position, and the sensors, if on,
   * are corrected. The alignment with the telescope stays as it is. The result is told as
   * an automatic solve's is.
   */
  protected async solveHere(): Promise<void> {
    if (this.solvingHere()) return;
    this.solvingHere.set(true);
    try {
      await this.liveSolver.solveNow('tap');
    } finally {
      this.solvingHere.set(false);
    }
  }

  /** Dragging moves the sky with the finger, so aiming moves the opposite way. */
  private dragBy(dx: number, dy: number): void {
    if (this.state.sensorsActive()) return; // The sensors are steering
    const { x: flipX, y: flipY } = this.imageFlip();
    const degPerPixel = this.viewField() / Math.max(this.viewSpanPx || this.canvasRef().nativeElement.clientWidth, 1);
    const altDeg = this.gestureStart.altDeg + flipY * dy * degPerPixel;
    const clampedAlt = Math.max(MIN_ALTITUDE_DEG, Math.min(MAX_ALTITUDE_DEG, altDeg));
    // A sideways drag covers more azimuth high in the sky, where its circles are smaller.
    const azScale = 1 / Math.max(Math.cos((clampedAlt * Math.PI) / 180), 0.1);
    const azDeg = this.gestureStart.azDeg - flipX * dx * degPerPixel * azScale;
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
    return { x: -1, y: this.state.equipment().telescopeType === 'newtonian' ? -1 : 1 };
  }

  /** Where a target is at the frame being drawn, the same moment as the stars around it. */
  private framePositionOf(target: Target): Horizontal {
    return equatorialToHorizontal(this.frameRotation, target.raDeg, target.decDeg);
  }

  /**
   * Redraws once the sky has turned about half a pixel, so it moves smoothly even when
   * nothing else changes, such as when the phone lies still. Zoomed out, that takes a few
   * seconds. Zoomed in on an eyepiece view, it is several times a second.
   */
  private queueSkyTurn(widthPx: number): void {
    clearTimeout(this.skyTurnTimer);
    const pixelsPerDegree = widthPx / this.viewField();
    const waitMs = (0.5 / (pixelsPerDegree * SKY_TURN_DEG_PER_S)) * 1000;
    this.skyTurnTimer = setTimeout(
      () => this.queueDraw(),
      Math.min(MAX_SKY_TURN_WAIT_MS, Math.max(MIN_SKY_TURN_WAIT_MS, waitMs)),
    );
  }

  /** Draws at most once per screen refresh, however many changes arrive. */
  /**
   * The Sky tab came into view: draw the sky as it is now. The page stays alive behind
   * the other tabs, where it draws nothing and shows no plate-solve messages, and the
   * live solver rests, so they take nothing from the list the user is reading.
   */
  ionViewDidEnter(): void {
    this.state.mapOnShow.set(true);
    this.queueDraw();
  }

  /** Another tab is taking over. */
  ionViewWillLeave(): void {
    this.state.mapOnShow.set(false);
  }

  private queueDraw(): void {
    if (!this.state.mapOnShow() || this.drawQueued) return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      this.draw();
    });
  }

  /**
   * With the phone on its side, the part of the map's width that nothing covers: from the
   * boxes at the left, or the eyepiece's panel, to the column of round buttons. Measured from what
   * is on screen, so it follows a notch, the text size and the panel's own width. With the
   * phone upright there is none to measure, as the boxes sit below the view instead.
   */
  /**
   * With the phone upright, how far down the map is clear: to the top of the target's box,
   * which grows when its details open. Measured from what is on screen. The eyepiece view
   * places its circle above its own panel instead.
   */
  private clearBottom(canvas: HTMLCanvasElement, isEyepiece: boolean): number | undefined {
    if (sideways() || isEyepiece) return undefined;
    const box = canvas.parentElement?.querySelector('.bar')?.getBoundingClientRect();
    if (!box || box.height === 0) return undefined;
    return box.top - canvas.getBoundingClientRect().top - CLEAR_MARGIN_PX;
  }

  private clearSpan(canvas: HTMLCanvasElement, isEyepiece: boolean): ClearSpan | undefined {
    const stage = canvas.parentElement;
    if (!sideways() || !stage) return undefined;
    const origin = canvas.getBoundingClientRect().left;
    const edge = (selector: string, side: 'left' | 'right'): number | undefined => {
      const box = stage.querySelector(selector)?.getBoundingClientRect();
      return box && box.width > 0 ? box[side] - origin : undefined;
    };
    // The clear part starts beside the target's panel or the eyepiece's, if one is open.
    const panels = ['.bar', isEyepiece ? '.eyepiece-panel' : null]
      .map((selector) => (selector ? edge(selector, 'right') : undefined))
      .filter((right): right is number => right !== undefined);
    const left = panels.length > 0 ? Math.max(...panels) : edge('.dock', 'left');
    const right = edge('.zoom', 'left') ?? canvas.clientWidth;
    if (left === undefined || right === undefined) return undefined;
    return { left: left + CLEAR_MARGIN_PX, right: right - CLEAR_MARGIN_PX };
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
    useColors(this.state.settings().nightMode);
    ctx.fillStyle = COLOR.sky;
    ctx.fillRect(0, 0, width, height);

    const isEyepiece = this.mode() === 'eyepiece';
    // The sky as it is at this very frame, so it turns smoothly rather than in steps.
    this.frameRotation = this.state.rotationAt(this.state.frameTime());
    const basis = viewBasis(this.steadyPointing(isEyepiece));
    // The eyepiece's circle fits the screen whichever way up the phone is held.
    const { centreX, centreY, spanPx } = viewLayout(
      width,
      height,
      isEyepiece,
      this.clearSpan(canvas, isEyepiece),
      this.clearBottom(canvas, isEyepiece),
    );
    this.viewCentreX = centreX;
    this.viewCentreY = centreY;
    // Where the reticle is on the canvas, for tests that tap it.
    canvas.dataset['centre'] = `${Math.round(centreX)},${Math.round(centreY)}`;
    this.viewSpanPx = spanPx;
    this.queueSkyTurn(spanPx);
    const flip = this.imageFlip();
    // Both views turn with the phone, so the horizon stays level with the real one. With
    // the phone fixed to the tube, its turn is the tube's, which turns the eyepiece's image.
    const rollDeg = this.state.viewRollDeg();

    // Pixels per projected unit, so the chosen field fits the span laid out for it.
    const scale = spanPx / 2 / stereographicRadius(this.viewField() / 2);
    const project: Project = (v) => {
      const view = toViewCoordinates(basis, v);
      if (view[2] < -0.2) return null; // Too far behind the viewer to draw
      const flat = stereographic(view);
      const { x, y } = rotateInView(flat.x, flat.y, rollDeg);
      return { x: centreX + flip.x * x * scale, y: centreY - flip.y * y * scale };
    };

    const frame: Frame = {
      ctx,
      width,
      height,
      project,
      scale,
      centreX,
      centreY,
      toLocal: this.frameRotation,
      textScale: this.state.textScale(),
      isEyepiece,
    };
    if (!isEyepiece) {
      drawGrid(frame);
      drawConstellationLines(frame, this.constellations());
    }
    // The eyepiece only needs stars near where it points, which the star field finds quickly.
    // The full list is sorted brightest first, so the sky map can stop at its limit.
    if (isEyepiece) drawStars(frame, this.starField.starsNear(this.viewField()), this.state.starLimit());
    else drawStars(frame, this.starField.allStars(), magnitudeLimit(this.fieldDeg()));
    drawHorizon(frame);
    const labels = drawTargets(frame, {
      targets: this.state.targets(),
      selected: this.state.selectedTarget(),
      fieldDeg: this.viewField(),
      sun: this.state.sunEquatorial(),
    });
    if (isEyepiece) {
      drawEyepieceMask(frame, stereographicRadius(this.eyepieceField() / 2) * scale);
      this.drawEyepieceGuide(frame);
    } else {
      drawConstellationNames(frame, this.constellations(), labels);
      this.drawReticle(frame);
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

  /**
   * The reticle's rings at the view's centre, the three sizes of a Telrad finder or one the
   * size of the eyepiece's field, and the guidance from them to the selected target.
   */
  private drawReticle(frame: Frame): void {
    // While plate solving, the reticle fades in and out, and keeps redrawing itself to do so.
    const opacity = this.state.plateSolving() ? pulseOpacity(performance.now()) : 1;
    this.canvasRef().nativeElement.dataset['reticleOpacity'] = opacity.toFixed(2);
    if (this.state.plateSolving()) this.queueDraw();
    const rings = this.mode() === 'ring' ? [this.eyepieceField()] : RETICLE_RINGS_DEG;
    this.reticleRadiusPx = drawReticle(frame, rings, this.isOnTarget(), opacity);

    // Points from the rings to the selected target, with a guide line if it is in view.
    const target = this.state.selectedTarget();
    if (!target || this.isOnTarget()) return;
    const position = this.framePositionOf(target);
    drawPointer(
      frame,
      this.reticleRadiusPx + 24,
      this.guideAngle(position),
      frame.project(horizontalVector(position)),
      this.targetDistance(),
    );
  }

  /**
   * Which way on screen the target lies from the view's centre, in radians from straight
   * up, also noted on the canvas for tests.
   */
  private guideAngle(position: Horizontal): number {
    // Work in the view's own axes, which stay valid for a target behind the viewer.
    const [x, y] = toViewCoordinates(
      viewBasis(this.shownPointing ?? this.state.pointing()),
      horizontalVector(position),
    );
    const angle = (guideAngleDeg(x, y, 1, 1, this.state.viewRollDeg()) * Math.PI) / 180;
    this.canvasRef().nativeElement.dataset['guideAngle'] = String(Math.round((angle * 180) / Math.PI));
    return angle;
  }

  /**
   * In the eyepiece view, chevrons just outside the eyepiece circle show which way to move
   * the tube, until the target comes into the field. They ignore the image turn or mirror
   * of the telescope on purpose, so they point the way to move the tube, like the bottom bar
   * says. They turn with the phone, as the view does, so up stays towards the real sky.
   */
  private drawEyepieceGuide(frame: Frame): void {
    const target = this.state.selectedTarget();
    if (!target) return;
    const position = this.framePositionOf(target);
    const pointing = this.shownPointing ?? this.state.pointing();
    if (separationDeg(pointing, position) < this.eyepieceField() / 2) {
      delete this.canvasRef().nativeElement.dataset['guideAngle'];
      return;
    }
    const angle = this.guideAngle(position);
    const radius = stereographicRadius(this.eyepieceField() / 2) * frame.scale + 8;
    drawChevrons(
      frame.ctx,
      frame.centreX + Math.sin(angle) * radius,
      frame.centreY - Math.cos(angle) * radius,
      angle,
      this.targetDistance(),
    );
  }
}
