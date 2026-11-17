import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { IonContent, IonFabButton, IonIcon, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, locationOutline, mapOutline, radioButtonOffOutline, remove } from 'ionicons/icons';

import { APP_ICONS } from '../core/app-icons';
import { AppState } from '../core/app-state.service';
import type { Horizontal } from '../core/astronomy';
import {
  equatorialToHorizontal,
  formatLocation,
  horizontalVector,
  rotateInView,
  separationDeg,
  stereographic,
  stereographicRadius,
  toViewCoordinates,
  viewBasis,
} from '../core/astronomy';
import { EyepiecePanelComponent } from '../core/eyepiece-panel.component';
import { LiveSolverService } from '../core/live-solver.service';
import { MoreSheetComponent } from '../core/more-sheet.component';
import { PointingReadoutComponent } from '../core/pointing-readout.component';
import { RETICLE_RINGS_DEG, guideAngleDeg, pulseOpacity } from '../core/reticle';
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
import type { Point, Project, ViewMode } from '../core/sky-map/sky-style';
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
import { TargetBarComponent } from '../core/target-bar.component';
import { TargetGuidanceService } from '../core/target-guidance.service';
import type { Target } from '../core/targets';
import type { ClearSpan } from '../core/view-layout';
import { EYEPIECE_VIEW_SCALE, viewLayout } from '../core/view-layout';
import { EYEPIECE_SMOOTHING_MS, SKY_MAP_SMOOTHING_MS, smoothPointing, smoothingFactor } from '../core/view-smoothing';

/** The view each view comes before, as the view tile steps through them: see ViewMode. */
const NEXT_VIEW: Record<ViewMode, ViewMode> = { sky: 'eyepiece', eyepiece: 'ring', ring: 'sky' };
/** The button shows the view it switches to: its icon, and its name for screen readers. */
const VIEW_BUTTONS: Record<ViewMode, { icon: string; label: string }> = {
  sky: { icon: 'map-outline', label: 'Sky map' },
  eyepiece: { icon: APP_ICONS.eyepiece, label: 'Eyepiece view' },
  ring: { icon: 'radio-button-off-outline', label: 'Field ring' },
};
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
    IonContent,
    IonFabButton,
    IonIcon,
    EyepiecePanelComponent,
    MoreSheetComponent,
    PointingReadoutComponent,
    TargetBarComponent,
  ],
  // In a file of its own, to keep this one short: see sky.page.css.
  styleUrl: './sky.page.css',
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

        <!-- Where the telescope points, and how wide the view is. -->
        <app-pointing-readout
          class="readout"
          data-testid="pointing"
          [attr.data-still]="sensors.isStill()"
          [mode]="mode()"
          [fieldDeg]="fieldDeg()"
        ></app-pointing-readout>

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
              <!-- The faintest stars shown, and the eyepiece and the rest of the kit in use. -->
              <app-eyepiece-panel class="eyepiece-panel" data-testid="eyepiece-panel"></app-eyepiece-panel>
            }

            @if (state.selectedTarget()) {
              <!-- The target: which way to move, its name, and its buttons. -->
              <app-target-bar class="bar" data-testid="target-bar"></app-target-bar>
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
  private readonly sound = inject(SoundService);
  private readonly toasts = inject(ToastController);
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
  /** The map's background stars and constellations: see StarFieldService. */
  private readonly starField = inject(StarFieldService);
  protected readonly stars = this.starField.stars;
  protected readonly constellations = this.starField.constellations;
  private readonly eyepieceField = this.state.trueField;

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
  /** How far the selected target is, and whether it would be in the eyepiece. */
  private readonly guidance = inject(TargetGuidanceService);
  private readonly targetDistance = this.guidance.distanceDeg;
  private readonly isOnTarget = this.guidance.isOnTarget;

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
    // Its own icons, and the two the menu's view tile is given by name.
    addIcons({ add, locationOutline, mapOutline, radioButtonOffOutline, remove });
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
