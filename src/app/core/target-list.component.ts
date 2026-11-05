import { DecimalPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonBadge, IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bookmark,
  apertureOutline,
  bookmarkOutline,
  cloudOutline,
  ellipsisHorizontalOutline,
  moonOutline,
  ellipseOutline,
  planetOutline,
  sparklesOutline,
  starOutline,
} from 'ionicons/icons';

import { AppState } from './app-state.service';
import type { Target, TargetKind } from './targets';

const KIND_ICONS: Record<TargetKind, string> = {
  Galaxy: 'aperture-outline',
  Planet: 'planet-outline',
  Moon: 'moon-outline',
  Other: 'ellipsis-horizontal-outline',
  Nebula: 'cloud-outline',
  'Open cluster': 'sparkles-outline',
  'Globular cluster': 'ellipse-outline',
  Star: 'star-outline',
};

// Below this altitude, targets are dimmed by the atmosphere and hidden by buildings.
const GOOD_ALTITUDE_DEG = 30;

/** A list of targets, used by both the Targets and Plan tabs. */
@Component({
  selector: 'app-target-list',
  imports: [DecimalPipe, IonBadge, IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote],
  template: `
    <ion-list>
      @for (target of targets(); track target.id) {
        @let altDeg = altitudeOf(target);
        <ion-item button detail="false" (click)="aimAt(target)">
          <ion-icon slot="start" color="medium" aria-hidden="true" [name]="iconFor(target)"></ion-icon>
          <ion-label>
            <h2>{{ target.id }}</h2>
            <p>{{ target.name }} · mag {{ target.mag < 90 ? (target.mag | number: '1.1-1') : '?' }}</p>
          </ion-label>
          @if (altDeg > 0) {
            <ion-badge slot="end" [color]="altDeg >= goodAltitude ? 'success' : 'warning'"
              >{{ altDeg | number: '1.0-0' }}°</ion-badge
            >
          } @else {
            <ion-note slot="end">Set</ion-note>
          }
          <ion-button
            slot="end"
            fill="clear"
            [attr.aria-label]="(isPlanned(target) ? 'Remove from plan: ' : 'Add to plan: ') + target.id"
            (click)="togglePlan($event, target)"
          >
            <ion-icon slot="icon-only" [name]="isPlanned(target) ? 'bookmark' : 'bookmark-outline'"></ion-icon>
          </ion-button>
        </ion-item>
      }
    </ion-list>
  `,
})
export class TargetListComponent {
  readonly targets = input.required<readonly Target[]>();
  /** The time altitudes are shown for. Defaults to right now. */
  readonly at = input<Date | null>(null);

  protected readonly state = inject(AppState);
  protected readonly goodAltitude = GOOD_ALTITUDE_DEG;
  private readonly router = inject(Router);

  constructor() {
    addIcons({
      apertureOutline,
      bookmark,
      bookmarkOutline,
      cloudOutline,
      ellipseOutline,
      ellipsisHorizontalOutline,
      moonOutline,
      planetOutline,
      sparklesOutline,
      starOutline,
    });
  }

  protected altitudeOf(target: Target): number {
    const at = this.at();
    return (at ? this.state.positionAt(target, at) : this.state.positionOf(target)).altDeg;
  }

  protected iconFor(target: Target): string {
    return KIND_ICONS[target.kind];
  }

  protected isPlanned(target: Target): boolean {
    return this.state.planIds().includes(target.id);
  }

  protected togglePlan(event: Event, target: Target): void {
    // The button sits inside the row, so stop the tap from also selecting the row.
    event.stopPropagation();
    this.state.togglePlan(target.id);
  }

  /** Selects a target and opens the sky map, where the arrow guides the user to it. */
  protected aimAt(target: Target): void {
    this.state.selectedTargetId.set(target.id);
    void this.router.navigateByUrl('/tabs/sky');
  }
}
