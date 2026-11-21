import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { Component, computed, effect, inject, input, model, output, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AppState } from '../app-state.service';
import type { Horizontal } from '../astronomy/astronomy';
import {
  equatorialToHorizontal,
  horizontalVector,
  rotateInView,
  separationDeg,
  stereographic,
  stereographicRadius,
  toViewCoordinates,
  viewBasis,
} from '../astronomy/astronomy';
import type { Target } from '../catalog/targets';
import { sideways } from '../sensors/sideways';
import {
  EYEPIECE_SMOOTHING_MS,
  SKY_MAP_SMOOTHING_MS,
  smoothPointing,
  smoothingFactor,
} from '../sensors/view-smoothing';
import { RETICLE_RINGS_DEG, guideAngleDeg, pulseOpacity } from '../sky-page/reticle';
import { TargetGuidanceService } from '../sky-page/target-guidance.service';
import type { ClearSpan } from '../sky-page/view-layout';
import { EYEPIECE_VIEW_SCALE, viewLayout } from '../sky-page/view-layout';

import type { Frame } from './draw-sky';
import {
  drawConstellationLines,
  drawConstellationNames,
  drawEyepieceMask,
  drawGrid,
  drawHorizon,
  drawStars,
} from './draw-sky';
import { drawChevrons, drawPointer, drawReticle, drawTargets } from './draw-targets';
import { MapGestures } from './map-gestures';
import { MapViewService } from './map-view.service';
import type { Point, Project, ViewMode } from './sky-style';
import {
  COLOR,
  DEFAULT_FIELD_DEG,
  MAX_ALTITUDE_DEG,
  MIN_ALTITUDE_DEG,
  clampField,
  magnitudeLimit,
  useColors,
} from './sky-style';
import { StarFieldService } from './star-field.service';

/** The gap kept between the eyepiece's circle and what lies beside it, on a phone on its side. */
const CLEAR_MARGIN_PX = 10;
/** How fast the sky turns, in degrees a second: a full turn in a sidereal day. */
const SKY_TURN_DEG_PER_S = 360 / 86_164;
// Limits on how often the map redraws just to follow the sky's turning.
const MIN_SKY_TURN_WAIT_MS = 100;
const MAX_SKY_TURN_WAIT_MS = 10_000;
/** Rings smaller than this on screen still take a tap this far from their centre, for a finger. */
const MIN_TAP_RADIUS_PX = 48;

/**
 * The map's canvas: it draws the sky, the reticle and the guidance, follows the sensors
 * smoothly, and takes drags, pinches and taps. The sky page lays its buttons and panels over
 * it, and the canvas places its centre in the part they leave clear.
 */
@Component({
  selector: 'app-sky-canvas',
  imports: [TranslatePipe],
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      /* Stops the browser scrolling the page while the user drags or pinches the map. */
      touch-action: none;
      cursor: grab;
    }
  `,
  template: `
    <canvas
      #canvas
      [attr.aria-label]="'sky.mapLabel' | translate"
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
  `,
})
export class SkyCanvasComponent implements AfterViewInit, OnDestroy {
  /** Which view is drawn: the sky map, the eyepiece view or the field ring. */
  readonly mode = input.required<ViewMode>();
  /** The sky map's width in degrees. A pinch or the mouse wheel changes it, as the page's zoom buttons do. */
  readonly fieldDeg = model(DEFAULT_FIELD_DEG);
  /** A tap on the rings, which plate solves there. */
  readonly ringsTap = output<void>();
  /** A tap anywhere else on the map. */
  readonly mapTap = output<void>();

  protected readonly state = inject(AppState);
  /** The map's background stars and constellations: see StarFieldService. */
  private readonly starField = inject(StarFieldService);
  /** Where the last frame's view is kept for the puck. */
  private readonly mapView = inject(MapViewService);
  protected readonly stars = this.starField.stars;
  protected readonly constellations = this.starField.constellations;
  private readonly eyepieceField = this.state.trueField;
  /** How far the selected target is, and whether it would be in the eyepiece. */
  private readonly guidance = inject(TargetGuidanceService);
  private readonly targetDistance = this.guidance.distanceDeg;
  private readonly isOnTarget = this.guidance.isOnTarget;

  /** Width of sky shown, in degrees. The eyepiece shows a little around its circle. */
  protected readonly viewField = computed(() =>
    this.mode() === 'eyepiece' ? this.eyepieceField() * EYEPIECE_VIEW_SCALE : this.fieldDeg(),
  );

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  /** Redraws when the canvas changes size, as when the phone rotates. It has none until layout finishes. */
  private readonly resizeObserver = new ResizeObserver(() => this.queueDraw());
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
    // A tap on the rings plate solves there. Anywhere else is the page's, for its menu.
    tap: (event) => (this.isOnReticle(event) ? this.ringsTap.emit() : this.mapTap.emit()),
  });
  /** The largest ring's radius on screen, in CSS pixels, so a tap on the rings can be found. */
  private reticleRadiusPx = 0;

  constructor() {
    // The faint stars are a large file, so they only load once the eyepiece view opens.
    effect(() => {
      if (this.mode() === 'eyepiece') void this.starField.loadDeepStars();
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
      // The map draws nothing behind another page, so it catches up when it is back on show.
      this.state.mapOnShow();
      this.mode();
      this.fieldDeg();
      this.starField.allStars();
      this.constellations();
      this.queueDraw();
    });
  }

  ngAfterViewInit(): void {
    this.resizeObserver.observe(this.canvasRef().nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
    clearTimeout(this.skyTurnTimer);
  }

  /** Draws again soon, for the page, when what it lays over the map changes size. */
  redraw(): void {
    this.queueDraw();
  }

  protected wheel(event: WheelEvent): void {
    if (this.mode() !== 'eyepiece' && !this.state.finderMode())
      this.setField(this.fieldDeg() * (event.deltaY > 0 ? 1.1 : 1 / 1.1));
  }

  protected pointerDown(event: PointerEvent): void {
    // A finder phone's map takes no touches while linked: the screen phone is for that.
    if (!this.state.finderMode()) this.gestures.down(event);
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
    this.fieldDeg.set(clampField(fieldDeg));
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
  private queueDraw(): void {
    if (!this.state.mapOnShow() || this.drawQueued) return;
    this.drawQueued = true;
    requestAnimationFrame(() => {
      this.drawQueued = false;
      this.draw();
    });
  }

  /** The page's stage, which holds this map and the buttons and panels laid over it. */
  private stage(canvas: HTMLCanvasElement): HTMLElement | null {
    return canvas.parentElement?.parentElement ?? null;
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
    const box = this.stage(canvas)?.querySelector('.bar')?.getBoundingClientRect();
    if (!box || box.height === 0) return undefined;
    return box.top - canvas.getBoundingClientRect().top - CLEAR_MARGIN_PX;
  }

  private clearSpan(canvas: HTMLCanvasElement, isEyepiece: boolean): ClearSpan | undefined {
    const stage = this.stage(canvas);
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
    const pointing = this.steadyPointing(isEyepiece);
    const basis = viewBasis(pointing);
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
    const starLimitMag = isEyepiece ? this.state.starLimit() : magnitudeLimit(this.fieldDeg());
    // What this frame shows, for the puck to mirror (docs/puck.md).
    this.mapView.publish({
      pointing,
      rollDeg,
      fieldDeg: this.viewField(),
      flipX: flip.x,
      flipY: flip.y,
      eyepiece: isEyepiece,
      ring: this.mode() === 'ring',
      starLimitMag,
      rotation: this.frameRotation,
    });

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
    if (isEyepiece) drawStars(frame, this.starField.starsNear(this.viewField()), starLimitMag);
    else drawStars(frame, this.starField.allStars(), starLimitMag);
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
   * The reticle's rings at the view's centre, the three rings of 0.5°, 2° and 4° or one the
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
