import { DecimalPipe } from '@angular/common';
import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, closeCircle, remove } from 'ionicons/icons';

import { AppState } from '../core/app-state.service';
import type { Vector3 } from '../core/astronomy';
import {
  applyMatrix,
  azimuthChangeDeg,
  bearingInViewDeg,
  equatorialVector,
  horizontalVector,
  magnification,
  separationDeg,
  stereographic,
  stereographicRadius,
  toViewCoordinates,
  trueFieldDeg,
  viewBasis,
} from '../core/astronomy';
import { SensorService } from '../core/sensor.service';
import type { Target } from '../core/targets';

type ViewMode = 'sky' | 'eyepiece';
type Project = (v: Vector3) => { x: number; y: number } | null;

interface Star {
  vector: Vector3;
  mag: number;
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const MIN_FIELD_DEG = 5;
const MAX_FIELD_DEG = 120;
const ZOOM_STEP = 1.5;
const AIM_CIRCLE_FRACTION = 0.13; // Aiming circle radius, as a share of the screen's short side
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
  return target.mag <= (fieldDeg >= 60 ? 4.5 : fieldDeg >= 25 ? 7 : fieldDeg >= 10 ? 10 : 99);
}

/**
 * The sky map, aiming circle, guidance arrow and eyepiece view. Until real sensors
 * are connected, the user aims by dragging, and the page says so.
 */
@Component({
  selector: 'app-sky',
  imports: [DecimalPipe, IonButton, IonContent, IonHeader, IonIcon, IonLabel, IonSegment, IonSegmentButton, IonToolbar],
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
    .panel {
      position: absolute;
      left: 12px;
      right: 12px;
      padding: 8px 12px;
      border-radius: 10px;
      background: rgb(10 14 28 / 85%);
      color: #e8ebf5;
      font-size: 14px;
      pointer-events: none;
    }
    .empty-field {
      top: 45%;
      text-align: center;
    }
    .status {
      top: 12px;
      right: auto;
      font-size: 12px;
      color: #a8b0c6;
    }
    .alignment {
      position: absolute;
      top: 12px;
      right: 12px;
      padding: 8px 12px;
      border: 0;
      border-radius: 10px;
      background: rgb(10 14 28 / 85%);
      color: #ffb454;
      font-size: 12px;
    }
    .alignment.aligned {
      color: #6fcf9f;
    }
    .sensor-toggle {
      position: absolute;
      top: 56px;
      right: 12px;
      padding: 8px 12px;
      border: 0;
      border-radius: 10px;
      background: rgb(10 14 28 / 85%);
      color: #a8b0c6;
      font-size: 12px;
    }
    .sensor-toggle.on {
      color: #6fcf9f;
    }
    .sensor-error {
      top: 45%;
      color: #ffb454;
    }
    .guidance {
      bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      pointer-events: auto;
    }
    .muted {
      color: #a8b0c6;
      font-size: 12px;
    }
    .directions {
      color: #ffb454;
      font-size: 13px;
    }
    .zoom {
      position: absolute;
      right: 12px;
      top: 104px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .zoom ion-button {
      --background: rgb(10 14 28 / 85%);
      --color: #e8ebf5;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-segment [value]="mode()" (ionChange)="mode.set($any($event).detail.value)">
          <ion-segment-button value="sky"><ion-label>Sky map</ion-label></ion-segment-button>
          <ion-segment-button value="eyepiece"><ion-label>Eyepiece</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content [scrollY]="false">
      <div class="stage">
        <canvas
          #canvas
          aria-label="Sky map. Drag to aim, pinch to zoom."
          [attr.data-star-count]="stars().length"
          (pointerdown)="pointerDown($event)"
          (pointermove)="pointerMove($event)"
          (pointerup)="pointerUp($event)"
          (pointercancel)="pointerUp($event)"
          (wheel)="wheel($event)"
        ></canvas>

        <div class="panel status" data-testid="pointing">
          @if (state.sensorsActive()) {
            Sensors on{{ sensors.hasCompass() ? '' : ', no compass' }}<br />
          } @else {
            Preview: drag to aim<br />
          }
          Alt {{ state.pointing().altDeg | number: '1.0-0' }}°, az {{ state.pointing().azDeg | number: '1.0-0' }}°
          @if (mode() === 'eyepiece') {
            <br />{{ power() | number: '1.0-0' }}× · {{ eyepieceField() | number: '1.1-2' }}° field
          }
        </div>

        <button
          type="button"
          class="alignment"
          data-testid="alignment-status"
          [class.aligned]="state.alignment()"
          (click)="openAlignment()"
        >
          @if (state.alignment(); as alignment) {
            Aligned: {{ alignment.starId }}
          } @else {
            Not aligned
          }
        </button>

        <button
          type="button"
          class="sensor-toggle"
          data-testid="sensor-toggle"
          [class.on]="state.sensorsActive()"
          (click)="toggleSensors()"
        >
          {{ state.sensorsActive() ? 'Sensors on' : 'Use sensors' }}
        </button>

        @if (sensors.error(); as message) {
          <div class="panel sensor-error" data-testid="sensor-error">{{ message }}</div>
        }

        @if (mode() === 'sky') {
          <div class="zoom">
            <ion-button
              size="small"
              aria-label="Zoom in"
              [disabled]="fieldDeg() <= minField"
              (click)="zoomBy(1 / zoomStep)"
            >
              <ion-icon slot="icon-only" name="add"></ion-icon>
            </ion-button>
            <ion-button
              size="small"
              aria-label="Zoom out"
              [disabled]="fieldDeg() >= maxField"
              (click)="zoomBy(zoomStep)"
            >
              <ion-icon slot="icon-only" name="remove"></ion-icon>
            </ion-button>
          </div>
        }

        @if (mode() === 'eyepiece' && starsInEyepiece() === 0) {
          <div class="panel empty-field">No stars brighter than magnitude 6.5 in this field.</div>
        }

        <div class="panel guidance">
          @if (state.selectedTarget(); as target) {
            <div>
              <strong>{{ target.id }}</strong> {{ target.name }}
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
                <ion-button fill="clear" size="small" data-testid="aim-at-target" (click)="aimAtTarget()"
                  >Aim</ion-button
                >
              }
              <ion-button
                fill="clear"
                size="small"
                aria-label="Clear target"
                (click)="state.selectedTargetId.set(null)"
              >
                <ion-icon slot="icon-only" name="close-circle"></ion-icon>
              </ion-button>
            </div>
          } @else {
            <div class="muted">Choose a target from the Targets tab for guidance.</div>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class SkyPage implements AfterViewInit, OnDestroy {
  protected readonly state = inject(AppState);
  protected readonly sensors = inject(SensorService);
  private readonly router = inject(Router);

  protected readonly mode = signal<ViewMode>('sky');
  protected readonly fieldDeg = signal(90);
  protected readonly minField = MIN_FIELD_DEG;
  protected readonly maxField = MAX_FIELD_DEG;
  protected readonly zoomStep = ZOOM_STEP;
  protected readonly stars = signal<Star[]>([]);
  /** How many stars the eyepiece circle holds, so an empty field can be explained. */
  protected readonly starsInEyepiece = signal(0);

  protected readonly power = computed(() =>
    magnification(this.state.settings().telescopeFocalMm, this.state.settings().eyepieceFocalMm),
  );
  protected readonly eyepieceField = computed(() => {
    const { telescopeFocalMm, eyepieceFocalMm, eyepieceFieldDeg } = this.state.settings();
    return trueFieldDeg(telescopeFocalMm, eyepieceFocalMm, eyepieceFieldDeg);
  });

  protected readonly targetDistance = computed(() => {
    const target = this.state.selectedTarget();
    return target ? separationDeg(this.state.pointing(), this.state.positionOf(target)) : 0;
  });
  protected readonly targetBelowHorizon = computed(() => {
    const target = this.state.selectedTarget();
    return !!target && this.state.positionOf(target).altDeg < 0;
  });

  /** Which way to move the telescope, in the terms an alt-az mount uses. */
  protected readonly directions = computed(() => {
    const target = this.state.selectedTarget();
    if (!target) return '';
    const position = this.state.positionOf(target);
    const pointing = this.state.pointing();
    if (separationDeg(pointing, position) < 0.5) return 'On target';
    const altChange = position.altDeg - pointing.altDeg;
    const azChange = azimuthChangeDeg(pointing.azDeg, position.azDeg);
    const vertical = `${altChange >= 0 ? 'Up' : 'Down'} ${Math.abs(altChange).toFixed(0)}°`;
    const horizontal = `${azChange >= 0 ? 'Right' : 'Left'} ${Math.abs(azChange).toFixed(0)}°`;
    return `${vertical} · ${horizontal}`;
  });

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private resizeObserver?: ResizeObserver;
  private drawQueued = false;

  // Fingers currently on the screen. One drags and two pinch.
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragStart?: { x: number; y: number; altDeg: number; azDeg: number };
  private pinchStart?: { distance: number; fieldDeg: number };

  constructor() {
    addIcons({ add, closeCircle, remove });
    void this.loadStars();
    // Redraw whenever anything shown on the map changes.
    effect(() => {
      this.state.pointing();
      this.state.settings();
      this.state.selectedTarget();
      this.state.targets();
      this.state.now();
      this.mode();
      this.fieldDeg();
      this.stars();
      this.queueDraw();
    });
  }

  ngAfterViewInit(): void {
    // The canvas has no size until layout finishes, and changes when the phone rotates.
    this.resizeObserver = new ResizeObserver(() => this.queueDraw());
    this.resizeObserver.observe(this.canvasRef().nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  protected toggleSensors(): void {
    if (this.state.sensorsActive()) this.sensors.stop();
    else void this.sensors.start();
  }

  protected openAlignment(): void {
    void this.router.navigateByUrl('/align');
  }

  /**
   * Jumps straight to the target. A preview shortcut, because dragging across the
   * sky is impractical in the eyepiece's narrow field. Real aiming will use sensors.
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
    const degPerPixel = this.viewFieldDeg() / Math.max(this.canvasRef().nativeElement.clientWidth, 1);
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

  /** Width of sky shown, in degrees. The eyepiece shows a little around its circle. */
  private viewFieldDeg(): number {
    return this.mode() === 'eyepiece' ? this.eyepieceField() * 1.25 : this.fieldDeg();
  }

  /**
   * Telescopes change the image. A Newtonian turns it upside down, and a diagonal
   * mirrors it. The sky map always shows the sky as seen by eye.
   */
  private imageFlip(): { x: number; y: number } {
    if (this.mode() !== 'eyepiece') return { x: 1, y: 1 };
    return { x: -1, y: this.state.settings().telescopeType === 'newtonian' ? -1 : 1 };
  }

  private async loadStars(): Promise<void> {
    try {
      const response = await fetch('assets/data/stars.json');
      const rows = (await response.json()) as [number, number, number][];
      this.stars.set(rows.map(([ra, dec, mag]) => ({ vector: equatorialVector(ra, dec), mag })));
    } catch {
      // The map still shows targets and the horizon without its background stars.
      this.stars.set([]);
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
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, width, height);

    const basis = viewBasis(this.state.pointing());
    const isEyepiece = this.mode() === 'eyepiece';
    const flip = this.imageFlip();

    // Pixels per projected unit, so the chosen field fits the screen's width.
    const scale = width / 2 / stereographicRadius(this.viewFieldDeg() / 2);
    const project: Project = (v) => {
      const view = toViewCoordinates(basis, v);
      if (view[2] < -0.2) return null; // Too far behind the viewer to draw
      const { x, y } = stereographic(view);
      return { x: width / 2 + flip.x * x * scale, y: height / 2 - flip.y * y * scale };
    };

    if (!isEyepiece) this.drawGrid(ctx, project);
    this.drawStars(ctx, project, width, height, scale);
    this.drawHorizon(ctx, project);
    this.drawTargets(ctx, project);
    if (isEyepiece) this.drawEyepieceMask(ctx, width, height, scale);
    else this.drawAimingCircle(ctx, width, height, basis);
  }

  /** Draws a line through points, lifting the pen wherever a point can't be shown. */
  private drawCurve(ctx: CanvasRenderingContext2D, points: ({ x: number; y: number } | null)[]): void {
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
    ctx.strokeStyle = '#1b2336';
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

  private drawStars(
    ctx: CanvasRenderingContext2D,
    project: Project,
    width: number,
    height: number,
    scale: number,
  ): void {
    const toLocal = this.state.skyRotation();
    const isEyepiece = this.mode() === 'eyepiece';
    const limit = isEyepiece ? Infinity : magnitudeLimit(this.fieldDeg());
    const eyepieceRadius = stereographicRadius(this.eyepieceField() / 2) * scale;
    let inEyepiece = 0;

    ctx.fillStyle = '#ffffff';
    // Filling every star of a similar brightness as one shape is far faster than
    // filling each on its own. The file is sorted brightest first, so they are adjacent.
    let group = Number.NEGATIVE_INFINITY;
    ctx.beginPath();
    for (const star of this.stars()) {
      if (star.mag > limit) break;
      if (Math.floor(star.mag) !== group) {
        ctx.fill();
        ctx.beginPath();
        group = Math.floor(star.mag);
        // Faint stars fade as well as shrink.
        ctx.globalAlpha = Math.min(1, Math.max(0.35, 1.1 - group * 0.11));
      }
      const local = applyMatrix(toLocal, star.vector);
      if (local[2] < 0) continue; // Below the horizon
      const point = project(local);
      if (!point || point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue;
      if (Math.hypot(point.x - width / 2, point.y - height / 2) <= eyepieceRadius) inEyepiece++;
      const radius = Math.max(0.6, 2.8 - star.mag * 0.38);
      ctx.moveTo(point.x + radius, point.y);
      ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
    this.starsInEyepiece.set(inEyepiece);
  }

  private drawHorizon(ctx: CanvasRenderingContext2D, project: Project): void {
    ctx.strokeStyle = '#3f8f6a';
    ctx.lineWidth = 1.5;
    const points = [];
    for (let azDeg = 0; azDeg <= 360; azDeg += 2) points.push(project(horizontalVector({ altDeg: 0, azDeg })));
    this.drawCurve(ctx, points);

    ctx.fillStyle = '#6fcf9f';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    for (const { label, azDeg } of CARDINALS) {
      const point = project(horizontalVector({ altDeg: 0, azDeg }));
      if (point) ctx.fillText(label, point.x, point.y + 18);
    }
  }

  private drawTargets(ctx: CanvasRenderingContext2D, project: Project): void {
    const toLocal = this.state.skyRotation();
    const selectedId = this.state.selectedTargetId();
    const labels: Box[] = [];
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';

    // The selected target goes first, so its label always wins a clash.
    const fieldDeg = this.viewFieldDeg();
    const selected = this.state.selectedTarget();
    const others = this.state.targets().filter((t) => t.id !== selectedId && isShownAtField(t, fieldDeg));
    const ordered = selected ? [selected, ...others] : others;
    for (const target of ordered) {
      const local = applyMatrix(toLocal, equatorialVector(target.raDeg, target.decDeg));
      const isSelected = target.id === selectedId;
      if (local[2] < 0 && !isSelected) continue;
      const point = project(local);
      if (!point) continue;

      // Stars are already drawn as dots, so only deep-sky objects need a marker.
      const color = isSelected ? '#ffb454' : target.body ? '#ffd479' : target.kind === 'Star' ? '#a8b0c6' : '#8fb7ff';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = isSelected ? 2 : 1;
      if (isSelected || target.kind !== 'Star') {
        ctx.beginPath();
        ctx.arc(point.x, point.y, isSelected ? 9 : 5, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Skip a label that would overlap one already drawn.
      const box: Box = {
        left: point.x + 11,
        right: point.x + 11 + ctx.measureText(target.id).width,
        top: point.y - 8,
        bottom: point.y + 6,
      };
      const clashes = labels.some(
        (o) => box.left < o.right && box.right > o.left && box.top < o.bottom && box.bottom > o.top,
      );
      if (clashes) continue;
      labels.push(box);
      ctx.fillText(target.id, box.left, point.y + 4);
    }
  }

  /** Draws the circle at the view's centre, and the arrow towards the selected target. */
  private drawAimingCircle(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    basis: ReturnType<typeof viewBasis>,
  ): void {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * AIM_CIRCLE_FRACTION;
    const target = this.state.selectedTarget();
    const position = target ? this.state.positionOf(target) : null;

    // The circle turns green once the target is inside it.
    const fieldPerRadius = (this.viewFieldDeg() / width) * radius;
    const onTarget = !!position && separationDeg(this.state.pointing(), position) < fieldPerRadius;
    const color = onTarget ? '#6fcf9f' : '#e5484d';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();

    if (!position || onTarget) return;
    const bearing = (bearingInViewDeg(basis, position) * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bearing);
    ctx.beginPath();
    ctx.moveTo(0, -radius - 26);
    ctx.lineTo(-13, -radius - 5);
    ctx.lineTo(13, -radius - 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Blacks out everything outside the eyepiece's circular field. */
  private drawEyepieceMask(ctx: CanvasRenderingContext2D, width: number, height: number, scale: number): void {
    const radius = stereographicRadius(this.eyepieceField() / 2) * scale;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.arc(width / 2, height / 2, radius, 0, 2 * Math.PI, true);
    ctx.fill();
    ctx.strokeStyle = '#3a4158';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, radius, 0, 2 * Math.PI);
    ctx.stroke();
  }
}
