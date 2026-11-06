import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, isDevMode, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { cameraOffset, offsetAngleDeg, suggestAlignmentStars } from '../core/alignment';
import type { AlignmentMethod } from '../core/app-state.service';
import { AppState } from '../core/app-state.service';
import type { Horizontal } from '../core/astronomy';
import { compassPoint } from '../core/astronomy';
import { rearCameraDirection } from '../core/attitude';
import { cameraPointing } from '../core/device-orientation';
import { LiveSolverService } from '../core/live-solver.service';
import type { Target } from '../core/targets';

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
    DatePipe,
    DecimalPipe,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonText,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/sky" text="" aria-label="Back"></ion-back-button>
        </ion-buttons>
        <ion-title>Align telescope</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      @switch (step()) {
        @case ('choose') {
          @if (state.alignment(); as current) {
            <ion-card data-testid="current-alignment">
              <ion-card-content>
                Aligned on <strong>{{ current.starId }}</strong> on {{ current.alignedAt | date: 'd MMM, HH:mm' }}
                {{ methodNote(current.method) }}. You only need to align again if the phone has moved in its mount.
              </ion-card-content>
            </ion-card>
          }

          <p>Choose a bright star you can see. Alignment teaches the app how your phone sits on your telescope.</p>

          @if (skyIsBright()) {
            <ion-text color="warning" data-testid="bright-sky">
              <p>
                The sky is still too bright to see most stars. Try again after dark, when these positions will have
                changed.
              </p>
            </ion-text>
          }

          <ion-list>
            <ion-list-header>Easiest to see now</ion-list-header>
            @for (suggestion of suggestions(); track suggestion.star.id) {
              <ion-item button detail="true" data-testid="alignment-star" (click)="choose(suggestion.star)">
                <ion-label>
                  <h2>{{ suggestion.star.id }}</h2>
                  <p>{{ describePosition(suggestion.position) }} · mag {{ suggestion.mag | number: '1.1-1' }}</p>
                </ion-label>
              </ion-item>
            } @empty {
              <ion-item>
                <ion-note>No bright stars are well placed right now.</ion-note>
              </ion-item>
            }
          </ion-list>
        }

        @case ('centre') {
          @if (chosen(); as star) {
            <h2>Centre {{ star.id }}</h2>
            <p>Look {{ describePosition(state.positionOf(star)) }}.</p>
            <ol>
              <li>Use your lowest-power eyepiece.</li>
              <li>Move the telescope until {{ star.id }} is in the centre of the view.</li>
              <li>Keep the telescope still, then confirm.</li>
            </ol>
            <ion-button expand="block" data-testid="confirm-centred" (click)="confirm()">
              The star is centred
            </ion-button>
            <ion-button expand="block" fill="clear" (click)="step.set('choose')">Choose another star</ion-button>
            <ion-text color="medium">
              <p data-testid="alignment-source">
                When you confirm, the phone's camera takes a picture of the sky and plate solves it to find exactly
                where it points. Keep the telescope still for a few seconds.
              </p>
            </ion-text>
          }
        }

        @case ('solving') {
          <h2 data-testid="alignment-solving">Plate solving…</h2>
          <p>Keep the telescope still.</p>
        }

        @case ('failed') {
          <h2>Couldn't plate solve</h2>
          <ion-text color="warning">
            <p data-testid="alignment-failed">{{ failure() }}</p>
          </ion-text>
          <ion-button expand="block" data-testid="retry-solve" (click)="confirm()">Try again</ion-button>
          @if (state.cameraPointing()) {
            <ion-button expand="block" fill="outline" data-testid="align-with-sensors" (click)="useSensors()">
              Use the sensors instead, less accurate
            </ion-button>
          }
          @if (isPreview) {
            <ion-button expand="block" fill="clear" data-testid="align-simulated" (click)="useSimulated()">
              Development preview: simulate the camera
            </ion-button>
          }
          <ion-button expand="block" fill="clear" (click)="step.set('choose')">Choose another star</ion-button>
        }

        @case ('done') {
          @if (state.alignment(); as current) {
            <h2>Aligned on {{ current.starId }}</h2>
            <p data-testid="alignment-result">
              Your camera points {{ offsetAngle() | number: '1.1-1' }}° away from your telescope,
              {{ resultNote(current.method) }}. The app will now allow for this difference.
            </p>
            @if (current.method !== 'plate-solve') {
              <ion-text color="warning">
                <p>Align again with plate solving when the sky is clear, for an accurate result.</p>
              </ion-text>
            }
            <p>No further alignment is needed unless the phone moves in its mount.</p>
            <ion-button expand="block" data-testid="alignment-done" (click)="finish()">Done</ion-button>
            <ion-button expand="block" fill="clear" (click)="step.set('choose')">Align again</ion-button>
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

  /** Simulating the camera is only offered in development, where there are no stars. */
  protected readonly isPreview = isDevMode();
  protected readonly step = signal<Step>('choose');
  protected readonly chosen = signal<Target | null>(null);
  protected readonly failure = signal('');
  private readonly solvedStars = signal(0);

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
    ),
  );

  protected readonly offsetAngle = computed(() => {
    const alignment = this.state.alignment();
    return alignment ? offsetAngleDeg(alignment.offset) : 0;
  });

  /** Describes a position in everyday terms, such as "in the east, 60° up". */
  protected describePosition(position: Horizontal): string {
    return `in the ${compassPoint(position.azDeg)}, ${Math.round(position.altDeg)}° up`;
  }

  protected methodNote(method: AlignmentMethod | undefined): string {
    if (method === 'plate-solve') return 'by plate solving';
    if (method === 'simulated') return 'with a simulated camera';
    return 'using the sensors, which is less accurate';
  }

  protected resultNote(method: AlignmentMethod | undefined): string {
    if (method === 'plate-solve') return `measured by plate solving ${this.solvedStars()} stars`;
    if (method === 'simulated') return 'simulated in this preview';
    return 'according to the sensors, which can be several degrees off';
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
    this.state.alignment.set({
      starId: star.id,
      alignedAt: new Date().toISOString(),
      mount: this.state.settings().mount,
      offset: cameraOffset(camera, this.state.positionOf(star)),
      method,
    });
    this.step.set('done');
  }

  protected finish(): void {
    void this.router.navigateByUrl('/tabs/sky');
  }
}
