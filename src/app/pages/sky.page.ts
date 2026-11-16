import { DecimalPipe } from '@angular/common';
import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonChip, IonContent, IonFabButton, IonIcon, IonRange, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  ellipsisHorizontal,
  listOutline,
  eye,
  eyeOutline,
  compassOutline,
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
import type { Horizontal, Vector3 } from '../core/astronomy';
import {
  toApparent,
  azimuthChangeDeg,
  equatorialToHorizontal,
  equatorialVector,
  formatDec,
  formatLocation,
  formatRa,
  horizontalVector,
  normalize,
  rotateInView,
  separationDeg,
  stereographic,
  stereographicRadius,
  toViewCoordinates,
  viewBasis,
} from '../core/astronomy';
import type { ConstellationRow } from '../core/constellations';
import { designationText, designations } from '../core/designations';
import type { ComponentStar } from '../core/double-stars';
import { doubleComponents, withoutDoubleCopies } from '../core/double-stars';
import { equipmentLabel, eyepieceLabel, modifierLabel, telescopeLabel } from '../core/equipment';
import { LiveSolverService } from '../core/live-solver.service';
import { MoreSheetComponent } from '../core/more-sheet.component';
import { countLabel } from '../core/observing-log';
import { ObservingLogService } from '../core/observing-log.service';
import { PlaylistBarComponent } from '../core/playlist-bar.component';
import { PlaylistService } from '../core/playlist.service';
import { RemoteService } from '../core/remote.service';
import { RETICLE_RINGS_DEG, chevronSpacingPx, guideAngleDeg, pulseOpacity } from '../core/reticle';
import { SeenActionsService } from '../core/seen-actions.service';
import { SensorService } from '../core/sensor.service';
import { isShutterPress } from '../core/shutter-remote';
import { sideways } from '../core/sideways';
import { SoundService } from '../core/sound.service';
import { TargetDetailsComponent } from '../core/target-details.component';
import type { IconPath } from '../core/target-icons';
import { DISC_RADIUS, ICON_DASH, ICON_GRID, iconDataUrl, phaseIcon, targetIcon } from '../core/target-icons';
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
  ring: { icon: 'radio-button-off-outline', label: 'Sky map with the eyepiece field' },
};
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

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The slider's range for the faintest stars shown. */
const MIN_STAR_LIMIT = 2;
const MAX_STAR_LIMIT = 13;
/** Size of the grid cells that let the eyepiece view find nearby stars quickly. */
const STAR_CELL_DEG = 4;
/** Objects this far beyond the screen edge are skipped, though their size circle could reach in. */
const OFF_SCREEN_MARGIN_PX = 200;
/** The gap kept between the eyepiece's circle and what lies beside it, on a phone on its side. */
const CLEAR_MARGIN_PX = 10;
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
/**
 * How strongly the sky map draws what is below the horizon: still there, to plan what
 * comes up next, but clearly faded so it isn't mistaken for something visible now.
 */
const BELOW_HORIZON_OPACITY = 0.35;

/** How fast the sky turns, in degrees a second: a full turn in a sidereal day. */
const SKY_TURN_DEG_PER_S = 360 / 86_164;
// Limits on how often the map redraws just to follow the sky's turning.
const MIN_SKY_TURN_WAIT_MS = 100;
const MAX_SKY_TURN_WAIT_MS = 10_000;
/** The guidance chevrons, from the one nearest the reticle outwards. */
const CHEVRON_FADE = [0.35, 0.65, 1];
const CHEVRON_HEIGHT_PX = 8;
const CHEVRON_HALF_WIDTH_PX = 11;
/** Rings smaller than this have no room for a size label. */
const MIN_LABELLED_RING_PX = 30;
/** A tap moves less than this, and is over sooner than this. Anything else is a drag. */
const TAP_MAX_MOVE_PX = 10;
const TAP_MAX_MS = 500;
/** Rings smaller than this on screen still take a tap this far from their centre, for a finger. */
const MIN_TAP_RADIUS_PX = 48;
/**
 * With the sensors steering and no touch for this long, the round buttons fade away and
 * leave the sky clear, as a car's navigation screen does. Any touch brings them back.
 */
const RAIL_IDLE_MS = 10_000;

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
  // The Moon and planets always show. Pluto and the asteroids are faint, so they follow
  // the same rules as other faint objects below.
  if (target.kind === 'Moon' || target.kind === 'Planet') return true;
  // The map already writes each constellation's name among its lines.
  if (target.kind === 'Constellation') return false;
  if (target.kind === 'Star') return target.mag <= (fieldDeg >= 60 ? 1.5 : fieldDeg >= 25 ? 3 : 5);
  // There are some 1,400 doubles without a name, so they wait until zoomed in.
  if (target.kind === 'Double star') return fieldDeg < 25 && (fieldDeg < 8 || target.mag <= 6);
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
    /* A column of round buttons in the top right corner. */
    .controls {
      position: absolute;
      top: calc(4px + var(--ion-safe-area-top, 0px));
      right: 4px;
      display: flex;
      flex-direction: column;
    }
    /* Fades away while idle, and takes no taps then: a touch on the map brings it back. */
    .controls,
    .zoom {
      transition: opacity 0.2s;
    }
    .controls.faded,
    .zoom.faded {
      opacity: 0;
      transition: opacity 0.8s;
    }
    .controls.faded ion-fab-button,
    .zoom.faded ion-fab-button {
      pointer-events: none;
    }
    /* Big enough to hit in the dark at arm's length, and set a little apart. */
    .controls ion-fab-button,
    .zoom ion-fab-button {
      margin: 4px;
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
      --color: var(--ion-color-warning);
    }
    .controls ion-fab-button.good {
      --color: var(--ion-color-success);
    }
    /*
     * At night every colour becomes red by its brightness, so the green of a button that
     * is on would turn a weaker red than the white of one that is off. Buttons that are
     * on get a full-strength icon and a lit ring and fill instead, so they stand out.
     */
    :host-context(html.night) .controls ion-fab-button.on {
      --color: #ffffff;
      --background: #6b6b6b;
      --border-color: #ffffff;
      --border-width: 2px;
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
      /* The empty space beside the zoom buttons still lets the map be dragged. */
      pointer-events: none;
    }
    .dock > * {
      pointer-events: auto;
    }
    /*
     * A row along the bottom: location on the left, zoom on the right. Only what is in it
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
    .zoom {
      margin-left: auto;
      display: flex;
      flex-direction: column;
      margin-right: -6px;
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
     * and the round buttons to the right edge, so the reticle in the middle stays clear.
     */
    @media (orientation: landscape) and (max-height: 520px) {
      /*
       * The round buttons fill the right edge from the top, and start a second column
       * beside the first when the screen is too short for all of them in one.
       */
      .controls {
        top: calc(4px + var(--ion-safe-area-top, 0px));
        bottom: calc(4px + var(--af-tab-bar-height, 0px));
        right: calc(4px + var(--ion-safe-area-right, 0px));
        display: grid;
        grid-auto-flow: column;
        grid-template-rows: repeat(auto-fill, 64px);
        direction: rtl;
        /* Only the buttons take taps: the map can be dragged between and under them. */
        pointer-events: none;
      }
      .controls ion-fab-button {
        pointer-events: auto;
      }
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
      /* Zoom lies in a row at the bottom, beside the column of buttons instead of under it. */
      .zoom {
        position: absolute;
        right: 64px;
        bottom: 0;
        flex-direction: row;
        margin: 0;
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
      <!-- Any touch brings back the round buttons, after they fade away while idle. -->
      <div class="stage" (pointerdown)="wake()">
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
            The big round buttons, down the right edge: only what is used all the time at the
            telescope. Everything else is under More. They fade while idle: see RAIL_IDLE_MS.
          -->
          <div class="controls" data-testid="controls" [class.faded]="railHidden()">
            <!--
              Green while the motion sensors steer the view. On a screen phone, the finder phone
              on the telescope steers it, and this opens the link.
            -->
            @if (state.remoteFinder()) {
              <ion-fab-button data-testid="sensor-toggle" class="good on" (click)="openRemote()">
                <ion-icon name="phone-landscape-outline" aria-hidden="true"></ion-icon>
                <span class="visually-hidden">Steered by the finder phone</span>
              </ion-fab-button>
            } @else {
              <ion-fab-button
                data-testid="sensor-toggle"
                [class.good]="state.sensorsActive()"
                [class.on]="state.sensorsActive()"
                (click)="toggleSensors()"
              >
                <ion-icon name="compass-outline" aria-hidden="true"></ion-icon>
                <span class="visually-hidden">{{ state.sensorsActive() ? 'Sensors on' : 'Use sensors' }}</span>
              </ion-fab-button>
            }
            <!-- Steps through the sky map, the eyepiece view and the eyepiece ring, showing the view it switches to. -->
            <ion-fab-button data-testid="view-mode" [attr.data-mode]="mode()" (click)="mode.set(nextView())">
              <ion-icon
                aria-hidden="true"
                [name]="isIconUrl(viewButtons[nextView()].icon) ? undefined : viewButtons[nextView()].icon"
                [src]="isIconUrl(viewButtons[nextView()].icon) ? viewButtons[nextView()].icon : undefined"
              ></ion-icon>
              <span class="visually-hidden">{{ viewButtons[nextView()].label }}</span>
            </ion-fab-button>
            <!--
              Amber while something under it needs seeing to: the telescope isn't aligned, or
              the map shows another time.
            -->
            <ion-fab-button
              data-testid="more"
              [class.warn]="state.planning() || !state.alignment()"
              [attr.aria-expanded]="moreOpen()"
              (click)="moreOpen.set(!moreOpen())"
            >
              <ion-icon name="ellipsis-horizontal" aria-hidden="true"></ion-icon>
              <span class="visually-hidden">More</span>
            </ion-fab-button>
          </div>

          <!-- What is needed less at the telescope: big tiles with words, over the map. -->
          @if (moreOpen()) {
            <app-more-sheet (closed)="moreOpen.set(false)"></app-more-sheet>
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
              @if (mode() !== 'eyepiece') {
                <div class="zoom" [class.faded]="railHidden()">
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
                    <ion-button fill="clear" size="small" aria-label="Clear target" (click)="clearTarget()">
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
  protected readonly stars = signal<Star[]>([]);
  protected readonly constellations = signal<Constellation[]>([]);
  protected readonly showDetails = signal(false);
  protected readonly isIconUrl = isIconUrl;
  /** AstroTurboMaxiSolver's own icon for the selected target, or null for kinds without one. */
  protected readonly targetIconUrl = computed(() => {
    const target = this.state.selectedTarget();
    const paths = target ? targetIcon(target) : null;
    return paths ? iconDataUrl(paths) : null;
  });

  protected readonly showEquipment = signal(false);

  /**
   * The double stars' own stars. Only changes when the doubles load, not each minute as
   * the planets move, so the stars below aren't sorted again for nothing.
   */
  private readonly doubleStars = computed(() => doubleComponents(this.state.targets().filter((t) => t.double)), {
    equal: (a, b) => a.length === b.length,
  });

  /**
   * Every star to draw, brightest first: the map's stars, with each double star's stars
   * at their precise places instead of the map's rounded or blended copies.
   */
  private readonly allStars = computed(() => {
    const components = this.doubleStars();
    if (components.length === 0) return this.stars();
    const toStar = ({ raDeg, decDeg, mag, bv }: ComponentStar): Star => ({
      raDeg,
      decDeg,
      vector: equatorialVector(raDeg, decDeg),
      mag,
      colorIndex: starTintIndex(bv),
    });
    return [...withoutDoubleCopies(this.stars(), components), ...components.map(toStar)].sort((a, b) => a.mag - b.mag);
  });

  /** Stars grouped into cells of right ascension and declination. */
  private readonly starGrid = computed(() => {
    const grid = new Map<number, Star[]>();
    for (const star of this.allStars()) {
      const key = this.cellKey(star.raDeg, star.decDeg);
      const cell = grid.get(key);
      if (cell) cell.push(star);
      else grid.set(key, [star]);
    }
    return grid;
  });
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
  private baseStarsLoaded: Promise<void> = Promise.resolve();
  private deepStarsRequested = false;

  // Fingers currently on the screen. One drags and two pinch.
  private readonly pointers = new Map<number, Point>();
  private dragStart?: Point & { altDeg: number; azDeg: number };
  /** Where and when a single finger went down, to tell a tap from a drag. */
  private tapStart?: Point & { time: number };
  /** The largest ring's radius on screen, in CSS pixels, so a tap on the rings can be found. */
  private reticleRadiusPx = 0;
  /** True while a tap's plate solve runs, so a second tap does nothing. */
  protected readonly solvingHere = signal(false);
  /** Whether the More sheet is open. */
  protected readonly moreOpen = signal(false);
  /** No touch for a while: see RAIL_IDLE_MS. */
  private readonly idle = signal(false);
  private idleTimer?: ReturnType<typeof setTimeout>;
  /**
   * The round buttons fade only while the sensors steer, since then the hands are on the
   * telescope. Not while the More sheet or the time control is open.
   */
  protected readonly railHidden = computed(
    () => this.idle() && this.state.sensorsActive() && !this.moreOpen() && !this.state.timeControlOpen(),
  );
  /** A shutter remote's press plate solves: see shutterPressed. */
  private readonly onKey = (event: KeyboardEvent): void => this.shutterPressed(event);
  private pinchStart?: { distance: number; fieldDeg: number };

  constructor() {
    addIcons({
      add,
      eye,
      eyeOutline,
      compassOutline,
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
      ellipsisHorizontal,
      listOutline,
    });
    this.baseStarsLoaded = this.loadStars();
    // The faint stars are a large file, so they only load once the eyepiece view opens.
    effect(() => {
      if (this.mode() === 'eyepiece') void this.loadDeepStars();
    });
    void this.loadConstellations();

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
      this.allStars();
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

  /** A touch: the round buttons come back, until the next while without one. */
  protected wake(): void {
    this.idle.set(false);
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.idle.set(true), RAIL_IDLE_MS);
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

  protected toggleSensors(): void {
    if (this.state.sensorsActive()) this.sensors.stop();
    else void this.sensors.start();
  }

  protected openRemote(): void {
    void this.router.navigateByUrl('/remote');
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
    if (this.state.finderMode()) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Only a single finger can tap. A second one makes it a pinch.
    this.tapStart =
      this.pointers.size === 1 ? { x: event.clientX, y: event.clientY, time: performance.now() } : undefined;
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
    const start = this.tapStart;
    const isTap =
      event.type === 'pointerup' &&
      !!start &&
      this.pointers.size === 1 &&
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < TAP_MAX_MOVE_PX &&
      performance.now() - start.time < TAP_MAX_MS;
    this.tapStart = undefined;
    this.pointers.delete(event.pointerId);
    this.restartGesture();
    if (isTap && this.isOnReticle(event)) void this.solveHere();
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

  /** Starts a drag or pinch from the current fingers, so the map doesn't jump. */
  private restartGesture(): void {
    const fingers = [...this.pointers.values()];
    this.dragStart = fingers.length === 1 ? { ...fingers[0], ...this.state.pointing() } : undefined;
    this.pinchStart =
      fingers.length === 2 && this.mode() !== 'eyepiece'
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
    const degPerPixel = this.viewField() / Math.max(this.viewSpanPx || this.canvasRef().nativeElement.clientWidth, 1);
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
    return { x: -1, y: this.state.equipment().telescopeType === 'newtonian' ? -1 : 1 };
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
    const right = edge('.controls', 'left');
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
    Object.assign(COLOR, this.state.settings().nightMode ? NIGHT_COLOR : DAY_COLOR);
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
    const toLocal = this.frameRotation;
    // Two paths, so each is stroked once: above the horizon, and below it, faded.
    const above = new Path2D();
    const below = new Path2D();
    const addSegment = (path: Path2D, a: Vector3, b: Vector3): void => {
      const [pa, pb] = [project(a), project(b)];
      if (!pa || !pb) return;
      path.moveTo(pa.x, pa.y);
      path.lineTo(pb.x, pb.y);
    };
    for (const { lines } of this.constellations()) {
      for (const line of lines) {
        const points = line.map((vector) => toApparent(toLocal, vector));
        for (let i = 1; i < points.length; i++) {
          const [a, b] = [points[i - 1], points[i]];
          if (a[2] >= 0 && b[2] >= 0) addSegment(above, a, b);
          else if (a[2] < 0 && b[2] < 0) addSegment(below, a, b);
          else {
            // The segment crosses the horizon: split it where it meets the horizon.
            const t = a[2] / (a[2] - b[2]);
            const crossing = normalize([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), 0]);
            addSegment(a[2] >= 0 ? above : below, a, crossing);
            addSegment(b[2] >= 0 ? above : below, crossing, b);
          }
        }
      }
    }
    ctx.strokeStyle = COLOR.constellationLine;
    ctx.lineWidth = 1.5;
    ctx.stroke(above);
    ctx.globalAlpha = BELOW_HORIZON_OPACITY;
    ctx.stroke(below);
    ctx.globalAlpha = 1;
  }

  /** Constellation names go last and give way to anything already labelled. */
  private drawConstellationNames(ctx: CanvasRenderingContext2D, project: Project, labels: Box[]): void {
    const toLocal = this.frameRotation;
    ctx.fillStyle = COLOR.constellationName;
    ctx.font = this.font(14, 'italic');
    ctx.textAlign = 'center';
    for (const { name, label } of this.constellations()) {
      const local = toApparent(toLocal, label);
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
      ctx.globalAlpha = local[2] < 0 ? BELOW_HORIZON_OPACITY : 1;
      this.drawLabel(ctx, name, point.x, point.y + 5 * this.textScale());
    }
    ctx.globalAlpha = 1;
  }

  private overlaps(a: Box, b: Box): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  private drawStars(ctx: CanvasRenderingContext2D, project: Project, width: number, height: number): void {
    const toLocal = this.frameRotation;
    const isEyepiece = this.mode() === 'eyepiece';
    const limit = isEyepiece ? this.state.starLimit() : magnitudeLimit(this.fieldDeg());

    // Filling stars of a similar brightness and colour as one shape is far faster than
    // filling each on its own, which matters most on older phones.
    const shapes = new Map<number, { path: Path2D; magGroup: number; tint: number; below: boolean }>();
    // The eyepiece only needs stars near where it points, which the grid finds quickly.
    // The full list is sorted brightest first, so the sky map can stop at its limit.
    const candidates = isEyepiece ? this.starsNear(this.viewField()) : this.allStars();
    for (const star of candidates) {
      if (star.mag > limit) {
        if (isEyepiece) continue;
        break;
      }
      const local = toApparent(toLocal, star.vector);
      // The sky map fades what is below the horizon. The eyepiece view also serves for
      // planning ahead, so it shows those stars in full.
      const below = local[2] < 0 && !isEyepiece;
      const point = project(local);
      if (!point || point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue;

      const magGroup = Math.floor(star.mag);
      const key = (magGroup * 10 + star.colorIndex) * 2 + (below ? 1 : 0);
      let shape = shapes.get(key);
      if (!shape) {
        shape = { path: new Path2D(), magGroup, tint: star.colorIndex, below };
        shapes.set(key, shape);
      }
      const radius = Math.max(0.8, 3.4 - star.mag * 0.42);
      shape.path.moveTo(point.x + radius, point.y);
      shape.path.arc(point.x, point.y, radius, 0, 2 * Math.PI);
    }

    for (const { path, magGroup, tint, below } of shapes.values()) {
      // Faint stars fade as well as shrink.
      ctx.globalAlpha = Math.min(1, Math.max(0.55, 1.15 - magGroup * 0.1)) * (below ? BELOW_HORIZON_OPACITY : 1);
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
    const toLocal = this.frameRotation;
    const selected = this.state.selectedTarget();
    const fieldDeg = this.viewField();
    const labels: Box[] = [];
    const { clientWidth: screenWidth, clientHeight: screenHeight } = this.canvasRef().nativeElement;
    ctx.font = this.font(15);
    ctx.textAlign = 'left';
    const sun = this.state.sunEquatorial();
    const sunLocal = toApparent(toLocal, equatorialVector(sun.raDeg, sun.decDeg));

    // The selected target goes first, so its label always wins a clash.
    // Then those above the horizon, so their labels win a clash with faded ones below.
    const others = this.state
      .targets()
      .filter((t) => t.id !== selected?.id && isShownAtField(t, fieldDeg))
      .map((target) => ({ target, local: toApparent(toLocal, equatorialVector(target.raDeg, target.decDeg)) }))
      .sort((a, b) => Number(a.local[2] < 0) - Number(b.local[2] < 0));
    const ordered = selected
      ? [{ target: selected, local: toApparent(toLocal, equatorialVector(selected.raDeg, selected.decDeg)) }, ...others]
      : others;
    for (const { target, local } of ordered) {
      const isSelected = target === selected;
      // The selected target always shows in full. The eyepiece view shows everything in full.
      ctx.globalAlpha = local[2] < 0 && !isSelected && this.mode() !== 'eyepiece' ? BELOW_HORIZON_OPACITY : 1;
      const point = project(local);
      // Drawing markers and labels that are off screen wastes most of the frame's time.
      if (!point || point.x < -OFF_SCREEN_MARGIN_PX || point.x > screenWidth + OFF_SCREEN_MARGIN_PX) continue;
      if (point.y < -OFF_SCREEN_MARGIN_PX || point.y > screenHeight + OFF_SCREEN_MARGIN_PX) continue;

      // A selected object keeps its own colour, so its kind stays clear. The crosshair marks it.
      const isStar = target.kind === 'Star' || target.kind === 'Double star';
      const color = target.body ? COLOR.solarSystem : isStar ? COLOR.starLabel : COLOR.deepSky;

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
      } else if (!isSelected && !isStar) {
        // Stars are already drawn as dots, so only other objects need a small marker.
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
        ctx.stroke();
      }
      if (isSelected) this.drawTargetMarker(ctx, point, Math.max(6, markerRadius + 3));

      // A constellation's name is already written there, with its lines.
      if (target.kind === 'Constellation') continue;
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
    ctx.globalAlpha = 1;
    return labels;
  }

  /**
   * Draws one of AstroTurboMaxiSolver's line icons centred on a point, sized so its disc has the
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
   * AstroTurboMaxiSolver's reticle: three rings at the sizes observers know from a Telrad finder.
   */
  private drawReticle(
    ctx: CanvasRenderingContext2D,
    project: Project,
    width: number,
    height: number,
    scale: number,
  ): void {
    // The view's centre: right of the screen's middle on a phone on its side, and above it
    // on an upright phone while the target's box takes the bottom of the screen.
    const cx = this.viewCentreX || width / 2;
    const cy = this.viewCentreY || height / 2;
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

    const rings = this.mode() === 'ring' ? [this.eyepieceField()] : RETICLE_RINGS_DEG;
    for (const diameterDeg of rings) {
      const radius = stereographicRadius(diameterDeg / 2) * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.stroke();
      // Small rings have no room for a label until zoomed in.
      if (radius >= MIN_LABELLED_RING_PX) {
        // Eyepiece fields such as 0.8333° read better rounded: "0.83°".
        this.drawLabel(ctx, `${Number(diameterDeg.toFixed(2))}°`, cx + radius * 0.72 + 4, cy - radius * 0.72 - 4);
      }
    }

    // The guide starts just outside the largest ring.
    const outerRadius = stereographicRadius(Math.max(...rings) / 2) * scale;
    this.reticleRadiusPx = outerRadius;

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
    const position = this.framePositionOf(target);

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
   * of the telescope on purpose, so they point the way to move the tube, like the bottom bar
   * says. They turn with the phone, as the view does, so up stays towards the real sky.
   */
  private drawEyepieceGuide(ctx: CanvasRenderingContext2D, width: number, centreY: number, scale: number): void {
    const target = this.state.selectedTarget();
    const canvas = this.canvasRef().nativeElement;
    if (!target) return;
    const position = this.framePositionOf(target);
    const pointing = this.shownPointing ?? this.state.pointing();
    if (separationDeg(pointing, position) < this.eyepieceField() / 2) {
      delete canvas.dataset['guideAngle'];
      return;
    }
    const [x, y] = toViewCoordinates(viewBasis(pointing), horizontalVector(position));
    const angle = (guideAngleDeg(x, y, 1, 1, this.state.viewRollDeg()) * Math.PI) / 180;
    canvas.dataset['guideAngle'] = String(Math.round((angle * 180) / Math.PI));

    const radius = stereographicRadius(this.eyepieceField() / 2) * scale + 8;
    this.drawChevrons(ctx, this.viewCentreX + Math.sin(angle) * radius, centreY - Math.cos(angle) * radius, angle);
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
    ctx.arc(this.viewCentreX, centreY, radius, 0, 2 * Math.PI, true);
    ctx.fill();
    ctx.strokeStyle = '#3a4158';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.viewCentreX, centreY, radius, 0, 2 * Math.PI);
    ctx.stroke();
  }
}
