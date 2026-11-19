import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, isDevMode, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { checkmark, checkmarkCircleOutline, locateOutline, refresh, timeOutline, trashOutline } from 'ionicons/icons';

import { cameraOffset, offsetAngleDeg, suggestAlignmentStars } from '../core/alignment/alignment';
import type { AlignmentMethod } from '../core/app-state.service';
import { AppState } from '../core/app-state.service';
import type { Horizontal } from '../core/astronomy/astronomy';
import { compassPoint } from '../core/astronomy/astronomy';
import type { Target } from '../core/catalog/targets';
import { t } from '../core/i18n/t';
import { LocalTimePipe } from '../core/local-time.pipe';
import { rearCameraDirection } from '../core/sensors/attitude';
import { cameraPointing } from '../core/sensors/device-orientation';
import { isShutterPress } from '../core/sensors/shutter-remote';
import { alignmentStarLimit } from '../core/sky-conditions/sky-quality';
import { LiveSolverService } from '../core/solver/live-solver.service';

type Step = 'choose' | 'centre' | 'solving' | 'failed' | 'done';

/** Above this Sun altitude, stars are hard to find, so the page warns the user. */
const BRIGHT_SKY_SUN_ALT_DEG = -6;

/**
 * A stand-in camera position for previews in development, where there are no stars to
 * solve. It places the camera slightly off the telescope, as a real mount would.
 */
const PREVIEW_CAMERA_ERROR: Horizontal = { altDeg: 2, azDeg: 3 };

/**
 * Guides the user through aligning the phone's camera with the telescope. The user
 * centres a star in the eyepiece, and a plate solve then says exactly where the camera
 * points. The difference is the alignment.
 */
@Component({
  selector: 'app-align',
  imports: [
    TranslatePipe,
    LocalTimePipe,
    DecimalPipe,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonSpinner,
    IonText,
    IonTitle,
    IonToolbar,
  ],
  styles: `
    /* While another time is on show: the amber clock, as on the sky map. */
    .showing-other-time {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
    }
    .showing-other-time ion-icon {
      font-size: 24px;
      color: var(--ion-color-warning);
    }
    /* Words as written, not in Ionic's capitals. Outlines thick enough to see at night. */
    ion-button {
      text-transform: none;
      font-size: calc(17px * var(--af-scale));
      font-weight: 600;
    }
    ion-button[fill='outline'] {
      --border-width: 2px;
      --border-color: var(--ion-color-primary);
      min-height: 52px;
    }
    /*
     * A step of the alignment: what to do at the top, a big round button in the middle,
     * and the other choices at the bottom, well apart.
     */
    .step {
      display: flex;
      flex-direction: column;
      min-height: calc(100dvh - 56px - var(--ion-safe-area-top, 0px) - var(--ion-safe-area-bottom, 0px) - 32px);
    }
    /*
     * The text at the top and the buttons at the bottom keep the same room on every step,
     * so the big circle between them never moves: the thumb finds it in the same place.
     */
    .step-head {
      min-height: calc(118px * var(--af-scale));
    }
    .step-head h2 {
      margin: 0 0 8px;
      font-size: calc(22px * var(--af-scale));
      font-weight: 700;
    }
    .step-head p {
      margin: 0 0 4px;
      font-size: calc(17px * var(--af-scale));
    }
    .warn-text {
      color: var(--ion-color-warning);
    }
    /*
     * The big round button: a filled disc inside one thin ring, like the reticle's rings.
     * Every step uses the same disc, ring, icon and words, and only the colours change:
     * light blue to act, dashed and turning while solving, an amber ring after a failure,
     * and green once aligned.
     */
    .big-round-ring {
      position: relative;
      align-self: center;
      margin: auto 0;
      padding: 10px;
      border-radius: 50%;
    }
    .big-round-ring::before {
      content: '';
      position: absolute;
      inset: 0;
      border: 2px solid var(--ring, var(--ion-color-primary));
      border-radius: 50%;
    }
    .big-round-ring.solving::before {
      border-style: dashed;
      animation: turn 6s linear infinite;
    }
    .big-round-ring.failed {
      --ring: var(--ion-color-warning);
    }
    .big-round-ring.done {
      --ring: var(--ion-color-success);
    }
    @keyframes turn {
      to {
        transform: rotate(360deg);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .big-round-ring.solving::before {
        animation: none;
      }
    }
    .big-round {
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: calc(170px * var(--af-scale));
      height: calc(170px * var(--af-scale));
      margin: 0;
      --border-radius: 50%;
      --box-shadow: none;
      --background: var(--ion-color-primary);
      --background-activated: var(--ion-color-primary-shade);
      --color: var(--af-ink);
      font-size: calc(20px * var(--af-scale));
      font-weight: 700;
      transition: transform 80ms ease-out;
    }
    /* A small give when pressed, to feel it work without looking. */
    .big-round:active {
      transform: scale(0.96);
    }
    .big-round.done {
      --background: var(--ion-color-success);
      --background-activated: #5bb98b;
    }
    /* While solving it can't be pressed: a dim disc, the words in full-strength text. */
    .big-round.solving {
      border-radius: 50%;
      background: rgba(var(--ion-color-primary-rgb), 0.16);
      color: var(--af-text);
    }
    .big-round-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .big-round ion-icon,
    .big-round ion-spinner {
      width: calc(52px * var(--af-scale));
      height: calc(52px * var(--af-scale));
      font-size: calc(52px * var(--af-scale));
    }
    .big-round ion-spinner {
      color: var(--ion-color-primary);
    }
    .step-actions {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      gap: 14px;
      /* Room for three buttons, the most any step has, filled from the bottom. */
      height: calc(3 * 52px + 2 * 14px);
    }
    .step-actions ion-button {
      margin: 0;
    }
    /* The alignment in use: an icon and one line of text. */
    .aligned-line {
      display: flex;
      align-items: center;
      gap: 10px;
      /* Full-strength text, not Ionic's card grey, which is hard to read at night. */
      color: var(--af-text);
    }
    .aligned-line > ion-icon {
      flex: none;
      font-size: 24px;
    }
    .aligned-text {
      flex: 1;
    }
    .aligned-line ion-button {
      flex: none;
      margin: -8px -8px -8px 0;
    }
    .good {
      color: var(--ion-color-success);
    }
    .warn {
      color: var(--ion-color-warning);
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button
            defaultHref="/tabs/sky"
            text=""
            [attr.aria-label]="'common.back' | translate"
          ></ion-back-button>
        </ion-buttons>
        <ion-title>{{ 'align.title' | translate }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <!-- Alignment measures the real sky, so it can't use a time chosen for planning. -->
      @if (state.planning()) {
        <p class="showing-other-time" data-testid="align-planning">
          <ion-icon name="time-outline" aria-hidden="true"></ion-icon>
          {{ 'align.otherTime' | translate }}
        </p>
        <ion-button expand="block" data-testid="align-back-to-now" (click)="backToNow()">{{
          'time.backToNow' | translate
        }}</ion-button>
      } @else {
        @switch (step()) {
          @case ('choose') {
            @if (state.alignment(); as current) {
              <!-- The alignment in use, on one line: green when plate solved, amber when rough. -->
              <ion-card data-testid="current-alignment">
                <ion-card-content class="aligned-line">
                  <ion-icon
                    name="checkmark-circle-outline"
                    aria-hidden="true"
                    [class.good]="current.method === 'plate-solve'"
                    [class.warn]="current.method !== 'plate-solve'"
                  ></ion-icon>
                  <span class="aligned-text">
                    <strong>{{ current.starId }}</strong> · {{ current.alignedAt | localTime: 'date-time' }} ·
                    {{ methodNote(current.method) }}
                  </span>
                  <!-- Removes the alignment, after asking. -->
                  <ion-button
                    fill="clear"
                    size="small"
                    [attr.aria-label]="'align.remove' | translate"
                    data-testid="remove-alignment"
                    (click)="removeAlignment()"
                  >
                    <ion-icon slot="icon-only" name="trash-outline" aria-hidden="true"></ion-icon>
                  </ion-button>
                </ion-card-content>
              </ion-card>
            }

            <p>{{ 'align.choose' | translate }}</p>

            @if (skyIsBright()) {
              <ion-text color="warning" data-testid="bright-sky">
                <p>{{ 'align.tooBright' | translate }}</p>
              </ion-text>
            }

            <!-- The target selected on the map, while it is above the horizon: any object in view can be solved. -->
            @if (selectedTarget(); as target) {
              <ion-list>
                <ion-list-header>{{ 'align.selected' | translate }}</ion-list-header>
                <ion-item button detail="true" data-testid="align-selected-target" (click)="choose(target)">
                  <ion-label>
                    <h2>{{ target.id }}</h2>
                    <p>
                      {{ describePosition(state.positionOf(target)) }} ·
                      {{ 'details.mag' | translate: { mag: (target.mag | number: '1.1-1') } }}
                    </p>
                  </ion-label>
                </ion-item>
              </ion-list>
            }

            <ion-list>
              <ion-list-header>{{ 'align.easiest' | translate }}</ion-list-header>
              @for (suggestion of suggestions(); track suggestion.star.id) {
                <ion-item button detail="true" data-testid="alignment-star" (click)="choose(suggestion.star)">
                  <ion-label>
                    <h2>{{ suggestion.star.id }}</h2>
                    <p>
                      {{ describePosition(suggestion.position) }} ·
                      {{ 'details.mag' | translate: { mag: (suggestion.mag | number: '1.1-1') } }}
                    </p>
                  </ion-label>
                </ion-item>
              } @empty {
                <ion-item>
                  <ion-note>{{ 'align.noStars' | translate }}</ion-note>
                </ion-item>
              }
            </ion-list>
          }

          @case ('centre') {
            @if (chosen(); as target) {
              <div class="step">
                <div class="step-head">
                  <h2>{{ 'align.centre' | translate: { name: target.id } }}</h2>
                  <p>{{ describePosition(state.positionOf(target)) }}</p>
                  <p>{{ 'align.centreHint' | translate }}</p>
                </div>
                <!-- Big and round in the middle, to find by feel while looking in the eyepiece. -->
                <!-- The same crosshair as the align button on the map. -->
                <div class="big-round-ring">
                  <ion-button class="big-round" data-testid="confirm-centred" (click)="confirm()">
                    <span class="big-round-content">
                      <ion-icon name="locate-outline" aria-hidden="true"></ion-icon>
                      <span>{{ 'align.align' | translate }}</span>
                    </span>
                  </ion-button>
                </div>
                <div class="step-actions">
                  <ion-button expand="block" fill="outline" (click)="step.set('choose')">{{
                    'align.otherTarget' | translate
                  }}</ion-button>
                </div>
              </div>
            }
          }

          @case ('solving') {
            <div class="step">
              <div class="step-head">
                <h2>{{ 'align.solving' | translate }}</h2>
                <p>{{ 'align.holdStill' | translate }}</p>
              </div>
              <div class="big-round-ring solving">
                <div class="big-round solving" data-testid="alignment-solving">
                  <span class="big-round-content">
                    <ion-spinner name="crescent" aria-hidden="true"></ion-spinner>
                    <span>{{ 'align.solvingShort' | translate }}</span>
                  </span>
                </div>
              </div>
              <div class="step-actions"></div>
            </div>
          }

          @case ('failed') {
            <div class="step">
              <div class="step-head">
                <h2>{{ 'align.failed' | translate }}</h2>
                <p class="warn-text" data-testid="alignment-failed">{{ failure() }}</p>
              </div>
              <div class="big-round-ring failed">
                <ion-button class="big-round" data-testid="retry-solve" (click)="confirm()">
                  <span class="big-round-content">
                    <ion-icon name="refresh" aria-hidden="true"></ion-icon>
                    <span>{{ 'align.retry' | translate }}</span>
                  </span>
                </ion-button>
              </div>
              <div class="step-actions">
                @if (state.cameraPointing()) {
                  <ion-button expand="block" fill="outline" data-testid="align-with-sensors" (click)="useSensors()">
                    {{ 'align.useSensors' | translate }}
                  </ion-button>
                }
                @if (isPreview) {
                  <!-- Development only: there are no stars to solve on a desk. -->
                  <ion-button expand="block" fill="outline" data-testid="align-simulated" (click)="useSimulated()">
                    {{ 'align.simulate' | translate }}
                  </ion-button>
                }
                <ion-button expand="block" fill="outline" (click)="step.set('choose')">{{
                  'align.otherTarget' | translate
                }}</ion-button>
              </div>
            </div>
          }

          @case ('done') {
            @if (state.alignment(); as current) {
              <!-- The same layout as the steps before: the result at the top, Done in the middle. -->
              <div class="step">
                <div class="step-head">
                  <h2>{{ 'settings.alignedOn' | translate: { star: current.starId } }}</h2>
                  <p data-testid="alignment-result">
                    {{ 'align.offset' | translate: { degrees: (offsetAngle() | number: '1.1-1') } }} ·
                    {{ resultNote(current.method) }}
                  </p>
                  @if (current.method !== 'plate-solve') {
                    <p class="warn-text">{{ 'align.rough' | translate }}</p>
                  }
                </div>
                <div class="big-round-ring done">
                  <ion-button class="big-round done" data-testid="alignment-done" (click)="finish()">
                    <span class="big-round-content">
                      <ion-icon name="checkmark" aria-hidden="true"></ion-icon>
                      <span>{{ 'common.done' | translate }}</span>
                    </span>
                  </ion-button>
                </div>
                <div class="step-actions">
                  <ion-button expand="block" fill="outline" (click)="step.set('choose')">{{
                    'align.again' | translate
                  }}</ion-button>
                </div>
              </div>
            }
          }
        }
      }
    </ion-content>
  `,
})
export class AlignPage {
  protected readonly state = inject(AppState);
  private readonly liveSolver = inject(LiveSolverService);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);

  constructor() {
    // A Bluetooth shutter remote presses the big round button, when the setting is on.
    const onKey = (event: KeyboardEvent) => this.shutterPressed(event);
    window.addEventListener('keydown', onKey);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('keydown', onKey));
    addIcons({ checkmark, checkmarkCircleOutline, locateOutline, refresh, timeOutline, trashOutline });
  }

  /** Simulating the camera is only offered in development, where there are no stars. */
  protected readonly isPreview = isDevMode();
  protected readonly step = signal<Step>('choose');
  protected readonly chosen = signal<Target | null>(null);
  protected readonly failure = signal('');
  private readonly solvedStars = signal(0);

  /** Leaves planning, so alignment can measure the real sky. */
  protected backToNow(): void {
    this.state.plannedTime.set(null);
    this.state.timeControlOpen.set(false);
  }

  protected readonly skyIsBright = computed(() => this.state.conditions().sunAltDeg > BRIGHT_SKY_SUN_ALT_DEG);

  protected readonly suggestions = computed(() =>
    suggestAlignmentStars(
      this.state
        .targets()
        .filter((target) => target.kind === 'Star')
        .map((star) => ({
          star,
          mag: star.mag,
          position: this.state.positionOf(star),
        })),
      4,
      // Fainter stars are easy to recognise under a dark sky, but not from a city.
      alignmentStarLimit(this.state.settings().bortle),
    ),
  );

  protected readonly offsetAngle = computed(() => {
    const alignment = this.state.alignment();
    return alignment ? offsetAngleDeg(alignment.offset) : 0;
  });

  /** Describes a position in everyday terms, such as "in the east, 60° up". */
  /** The target selected on the map, if it is above the horizon to centre in the eyepiece. */
  protected readonly selectedTarget = computed(() => {
    const target = this.state.selectedTarget();
    return target && this.state.positionOf(target).altDeg > 0 ? target : null;
  });

  /**
   * A shutter remote's press: Align while centring, and Retry after a failed solve. Only
   * on this page and those steps, so a stray press elsewhere does nothing.
   */
  private shutterPressed(event: KeyboardEvent): void {
    if (!this.state.settings().shutterAligns || !isShutterPress(event)) return;
    if (!this.router.url.startsWith('/align')) return;
    const step = this.step();
    if (step !== 'centre' && step !== 'failed') return;
    event.preventDefault();
    void this.confirm();
  }

  /** Forgets the alignment, after asking: it took a clear sky to measure. */
  protected async removeAlignment(): Promise<void> {
    const alert = await this.alerts.create({
      header: t('align.removeQuestion'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('align.removeButton'), role: 'destructive', handler: () => this.state.alignment.set(null) },
      ],
    });
    await alert.present();
  }

  protected describePosition(position: Horizontal): string {
    return t('align.position', { direction: compassPoint(position.azDeg), degrees: Math.round(position.altDeg) });
  }

  protected methodNote(method: AlignmentMethod | undefined): string {
    if (method === 'plate-solve') return t('align.plateSolved');
    if (method === 'simulated') return t('align.simulated');
    return t('align.sensorsRough');
  }

  protected resultNote(method: AlignmentMethod | undefined): string {
    if (method === 'plate-solve') return t('align.plateSolvedStars', { count: this.solvedStars() });
    if (method === 'simulated') return t('align.simulated');
    return t('align.fromSensors');
  }

  protected choose(star: Target): void {
    this.chosen.set(star);
    this.step.set('centre');
  }

  /** The telescope is on the star, so a plate solve now shows how the camera sits. */
  protected async confirm(): Promise<void> {
    if (!this.chosen()) return;
    this.step.set('solving');
    const result = await this.liveSolver.solveNow();
    if (!result.ok) {
      this.failure.set(result.reason);
      this.step.set('failed');
      return;
    }
    this.solvedStars.set(result.matched);
    this.save(cameraPointing(rearCameraDirection(result.attitude)), 'plate-solve');
  }

  protected useSensors(): void {
    const camera = this.state.cameraPointing();
    if (camera) this.save(camera, 'sensors');
  }

  protected useSimulated(): void {
    const star = this.chosen();
    if (!star) return;
    const telescope = this.state.positionOf(star);
    this.save(
      { altDeg: telescope.altDeg + PREVIEW_CAMERA_ERROR.altDeg, azDeg: telescope.azDeg + PREVIEW_CAMERA_ERROR.azDeg },
      'simulated',
    );
  }

  /** Stores how the camera sits relative to the telescope, which is on the chosen star. */
  private save(camera: Horizontal, method: AlignmentMethod): void {
    const star = this.chosen();
    if (!star) return;
    const position = this.state.positionOf(star);
    // A new alignment starts without syncs: they measured the camera as it sat before.
    this.state.alignment.set({
      starId: star.id,
      alignedAt: new Date().toISOString(),
      offset: cameraOffset(camera, position),
      position,
      method,
    });
    this.step.set('done');
  }

  protected finish(): void {
    void this.router.navigateByUrl('/tabs/sky');
  }
}
