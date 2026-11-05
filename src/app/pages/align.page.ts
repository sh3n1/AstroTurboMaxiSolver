import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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
import { AppState } from '../core/app-state.service';
import type { Horizontal } from '../core/astronomy';
import { compassPoint } from '../core/astronomy';
import type { Target } from '../core/targets';

type Step = 'choose' | 'centre' | 'done';

/** Above this Sun altitude, stars are hard to find, so the page warns the user. */
const BRIGHT_SKY_SUN_ALT_DEG = -6;

/**
 * Stands in for the plate solve that will report the camera's pointing. It places
 * the camera slightly off the telescope, as a real mount would.
 */
const PREVIEW_CAMERA_ERROR: Horizontal = { altDeg: 2, azDeg: 3 };

/** Guides the user through aligning the phone's camera with the telescope. */
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
                Aligned on <strong>{{ current.starId }}</strong> on {{ current.alignedAt | date: 'd MMM, HH:mm' }}. You
                only need to align again if the phone has moved in its mount.
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
            <ion-button expand="block" data-testid="confirm-centred" (click)="confirm()"
              >The star is centred</ion-button
            >
            <ion-button expand="block" fill="clear" (click)="step.set('choose')">Choose another star</ion-button>
            <ion-text color="medium">
              @if (usesSensors()) {
                <p data-testid="alignment-source">
                  Using your phone's sensors for the camera's direction. The finished app will plate solve here, which
                  is far more accurate.
                </p>
              } @else {
                <p data-testid="alignment-source">
                  Preview: this uses a simulated camera position. Turn on sensors on the sky map to use your phone's.
                </p>
              }
            </ion-text>
          }
        }

        @case ('done') {
          @if (state.alignment(); as current) {
            <h2>Aligned on {{ current.starId }}</h2>
            <p data-testid="alignment-result">
              Your camera points {{ offsetAngle() | number: '1.1-1' }}° away from your telescope{{
                wasMeasured() ? ', according to the sensors' : ' (simulated in this preview)'
              }}. The app will now allow for this difference.
            </p>
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
  private readonly router = inject(Router);

  protected readonly step = signal<Step>('choose');
  protected readonly chosen = signal<Target | null>(null);
  protected readonly usesSensors = computed(() => this.state.cameraPointing() !== null);
  /** Whether the last confirmed alignment came from the sensors. */
  protected readonly wasMeasured = signal(false);

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

  protected choose(star: Target): void {
    this.chosen.set(star);
    this.step.set('centre');
  }

  /** The telescope is on the star, so comparing it with the camera gives the offset. */
  protected confirm(): void {
    const star = this.chosen();
    if (!star) return;
    const telescope = this.state.positionOf(star);
    // The sensors say where the camera really points. Without them, simulate it.
    const measured = this.state.cameraPointing();
    this.wasMeasured.set(measured !== null);
    const camera = measured ?? {
      altDeg: telescope.altDeg + PREVIEW_CAMERA_ERROR.altDeg,
      azDeg: telescope.azDeg + PREVIEW_CAMERA_ERROR.azDeg,
    };
    this.state.alignment.set({
      starId: star.id,
      alignedAt: new Date().toISOString(),
      mount: this.state.settings().mount,
      offset: cameraOffset(camera, telescope),
    });
    this.step.set('done');
  }

  protected finish(): void {
    void this.router.navigateByUrl('/tabs/sky');
  }
}
