import { DecimalPipe } from '@angular/common';
import type { AfterViewInit, ElementRef, OnDestroy } from '@angular/core';
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, closeCircle, remove } from 'ionicons/icons';

import { AppState } from '../core/app-state.service';
import type { Vector3 } from '../core/astronomy';
import {
  applyMatrix,
  bearingInViewDeg,
  equatorialToLocalMatrix,
  equatorialVector,
  horizontalVector,
  localSiderealDeg,
  magnification,
  separationDeg,
  stereographic,
  stereographicRadius,
  toViewCoordinates,
  trueFieldDeg,
  viewBasis,
} from '../core/astronomy';
import { TARGETS } from '../core/targets';

type ViewMode = 'sky' | 'eyepiece';

interface Star {
  vector: Vector3;
  mag: number;
}

const ZOOM_LEVELS_DEG = [120, 90, 60, 40, 25, 15, 8];
const AIM_CIRCLE_FRACTION = 0.13; // Aiming circle radius, as a share of the screen's short side
const MAX_ALTITUDE_DEG = 89; // Looking exactly straight up has no defined "right"
const CARDINALS = [
  { label: 'N', azDeg: 0 },
  { label: 'E', azDeg: 90 },
  { label: 'S', azDeg: 180 },
  { label: 'W', azDeg: 270 },
];

/**
 * The sky map, aiming circle, guidance arrow and eyepiece view. Until real sensors
 * are connected, the user aims by dragging, and the page says so.
 */
@Component({
  selector: 'app-sky',
  imports: [
    DecimalPipe,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonLabel,
    IonSegment,
    IonSegmentButton,
    IonTitle,
    IonToolbar,
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
      /* Stops the browser scrolling the page while the user drags the map. */
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
    .zoom {
      position: absolute;
      right: 12px;
      top: 76px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>AstroFinder</ion-title>
        <ion-buttons slot="end"></ion-buttons>
      </ion-toolbar>
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
          aria-label="Sky map. Drag to aim."
          [attr.data-star-count]="stars().length"
          (pointerdown)="startDrag($event)"
          (pointermove)="drag($event)"
          (pointerup)="endDrag($event)"
          (pointercancel)="endDrag($event)"
        ></canvas>

        <div class="panel status">
          <div>Preview: drag to aim</div>
          <div class="muted">
            Pointing alt {{ state.pointing().altDeg | number: '1.0-0' }}°, az
            {{ state.pointing().azDeg | number: '1.0-0' }}°
            @if (mode() === 'eyepiece') {
              · {{ power() | number: '1.0-0' }}× · {{ eyepieceField() | number: '1.1-2' }}° field
            }
          </div>
        </div>

        @if (mode() === 'sky') {
          <div class="zoom">
            <ion-button
              size="small"
              aria-label="Zoom in"
              [disabled]="zoomIndex() === zoomLevels.length - 1"
              (click)="zoom(1)"
            >
              <ion-icon slot="icon-only" name="add"></ion-icon>
            </ion-button>
            <ion-button size="small" aria-label="Zoom out" [disabled]="zoomIndex() === 0" (click)="zoom(-1)">
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
              <div class="muted" data-testid="guidance">
                {{ targetDistance() | number: '1.1-1' }}° away
                @if (targetBelowHorizon()) {
                  · below the horizon
                }
              </div>
            </div>
            <ion-button fill="clear" size="small" data-testid="aim-at-target" (click)="aimAtTarget()">Aim</ion-button>
            <ion-button fill="clear" size="small" aria-label="Clear target" (click)="state.selectedTargetId.set(null)">
              <ion-icon slot="icon-only" name="close-circle"></ion-icon>
            </ion-button>
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
  protected readonly mode = signal<ViewMode>('sky');
  protected readonly zoomLevels = ZOOM_LEVELS_DEG;
  protected readonly zoomIndex = signal(1);
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

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private resizeObserver?: ResizeObserver;
  private drawQueued = false;
  private dragStart?: { x: number; y: number; altDeg: number; azDeg: number };

  constructor() {
    addIcons({ add, closeCircle, remove });
    void this.loadStars();
    // Redraw whenever anything shown on the map changes.
    effect(() => {
      this.state.pointing();
      this.state.settings();
      this.state.selectedTarget();
      this.state.now();
      this.mode();
      this.zoomIndex();
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

  protected zoom(step: number): void {
    this.zoomIndex.update((i) => Math.min(ZOOM_LEVELS_DEG.length - 1, Math.max(0, i + step)));
  }

  protected startDrag(event: PointerEvent): void {
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    this.dragStart = { x: event.clientX, y: event.clientY, ...this.state.pointing() };
  }

  /** Dragging moves the sky with the finger, so aiming moves the opposite way. */
  protected drag(event: PointerEvent): void {
    if (!this.dragStart) return;
    const width = this.canvasRef().nativeElement.clientWidth;
    const degPerPixel = this.viewFieldDeg() / Math.max(width, 1);
    const altDeg = this.dragStart.altDeg + (event.clientY - this.dragStart.y) * degPerPixel;
    const clampedAlt = Math.max(-20, Math.min(MAX_ALTITUDE_DEG, altDeg));
    // A sideways drag covers more azimuth high in the sky, where its circles are smaller.
    const azScale = 1 / Math.max(Math.cos((clampedAlt * Math.PI) / 180), 0.1);
    const azDeg = this.dragStart.azDeg - (event.clientX - this.dragStart.x) * degPerPixel * azScale;
    this.state.pointing.set({ altDeg: clampedAlt, azDeg: ((azDeg % 360) + 360) % 360 });
  }

  protected endDrag(event: PointerEvent): void {
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.dragStart = undefined;
  }

  /** Width of sky shown, in degrees. The eyepiece shows a little around its circle. */
  private viewFieldDeg(): number {
    return this.mode() === 'eyepiece' ? this.eyepieceField() * 1.25 : ZOOM_LEVELS_DEG[this.zoomIndex()];
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
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(pixelRatio, pixelRatio);
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, width, height);

    const { latitudeDeg, longitudeDeg, telescopeType } = this.state.settings();
    const toLocal = equatorialToLocalMatrix(latitudeDeg, localSiderealDeg(this.state.now(), longitudeDeg));
    const basis = viewBasis(this.state.pointing());
    const isEyepiece = this.mode() === 'eyepiece';

    // Telescopes change the image. A Newtonian turns it upside down, and a
    // diagonal mirrors it. The sky map always shows the sky as seen by eye.
    const flipX = isEyepiece ? -1 : 1;
    const flipY = isEyepiece && telescopeType === 'newtonian' ? -1 : 1;

    // Pixels per projected unit, so the chosen field fits the screen's width.
    const scale = width / 2 / stereographicRadius(this.viewFieldDeg() / 2);
    const project = (v: Vector3) => {
      const view = toViewCoordinates(basis, v);
      if (view[2] < -0.2) return null; // Too far behind the viewer to draw
      const { x, y } = stereographic(view);
      return { x: width / 2 + flipX * x * scale, y: height / 2 - flipY * y * scale };
    };

    this.drawStars(ctx, toLocal, project, width, height);
    this.drawHorizon(ctx, project);
    this.drawTargets(ctx, toLocal, project);
    if (isEyepiece) this.drawEyepieceMask(ctx, width, height, scale);
    else this.drawAimingCircle(ctx, width, height, basis);
  }

  private drawStars(
    ctx: CanvasRenderingContext2D,
    toLocal: ReturnType<typeof equatorialToLocalMatrix>,
    project: (v: Vector3) => { x: number; y: number } | null,
    width: number,
    height: number,
  ): void {
    const scale = width / 2 / stereographicRadius(this.viewFieldDeg() / 2);
    const eyepieceRadius = stereographicRadius(this.eyepieceField() / 2) * scale;
    let inEyepiece = 0;

    ctx.fillStyle = '#ffffff';
    for (const star of this.stars()) {
      const local = applyMatrix(toLocal, star.vector);
      if (local[2] < 0) continue; // Below the horizon
      const point = project(local);
      if (!point || point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue;
      // Brighter stars are larger, and faint ones also fade.
      if (Math.hypot(point.x - width / 2, point.y - height / 2) <= eyepieceRadius) inEyepiece++;
      ctx.globalAlpha = Math.min(1, Math.max(0.35, 1.1 - star.mag * 0.11));
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(0.6, 2.8 - star.mag * 0.38), 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.starsInEyepiece.set(inEyepiece);
  }

  private drawHorizon(ctx: CanvasRenderingContext2D, project: (v: Vector3) => { x: number; y: number } | null): void {
    ctx.strokeStyle = '#3f8f6a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let penDown = false;
    for (let azDeg = 0; azDeg <= 360; azDeg += 2) {
      const point = project(horizontalVector({ altDeg: 0, azDeg }));
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

    ctx.fillStyle = '#6fcf9f';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    for (const { label, azDeg } of CARDINALS) {
      const point = project(horizontalVector({ altDeg: 0, azDeg }));
      if (point) ctx.fillText(label, point.x, point.y + 18);
    }
  }

  private drawTargets(
    ctx: CanvasRenderingContext2D,
    toLocal: ReturnType<typeof equatorialToLocalMatrix>,
    project: (v: Vector3) => { x: number; y: number } | null,
  ): void {
    const selectedId = this.state.selectedTargetId();
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    for (const target of TARGETS) {
      const local = applyMatrix(toLocal, equatorialVector(target.raDeg, target.decDeg));
      const isSelected = target.id === selectedId;
      if (local[2] < 0 && !isSelected) continue;
      const point = project(local);
      if (!point) continue;
      const color = isSelected ? '#ffb454' : '#8fb7ff';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.arc(point.x, point.y, isSelected ? 9 : 5, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.fillText(target.id, point.x + 11, point.y + 4);
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
    ctx.strokeStyle = '#e5484d';
    ctx.fillStyle = '#e5484d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();

    const target = this.state.selectedTarget();
    if (!target) return;

    // No arrow once the target is inside the aiming circle.
    const position = this.state.positionOf(target);
    const fieldPerRadius = (this.viewFieldDeg() / width) * radius;
    if (separationDeg(this.state.pointing(), position) < fieldPerRadius) return;

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
