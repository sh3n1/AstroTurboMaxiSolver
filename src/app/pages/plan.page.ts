import { Component, computed, inject } from '@angular/core';
import { IonContent, IonHeader, IonListHeader, IonText, IonTitle, IonToolbar } from '@ionic/angular';

import { AppState } from '../core/app-state.service';
import { TargetListComponent } from '../core/target-list.component';
import { TARGETS } from '../core/targets';

// Below this altitude, targets are dimmed by the atmosphere and hidden by buildings.
const GOOD_ALTITUDE_DEG = 30;
const SUGGESTION_COUNT = 5;

/**
 * The user's session plan and suggestions for right now. Suggestions only look
 * at current altitude for now. Stage 12 of todo.md adds darkness and the Moon.
 */
@Component({
  selector: 'app-plan',
  imports: [IonContent, IonHeader, IonListHeader, IonText, IonTitle, IonToolbar, TargetListComponent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Session plan</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list-header>My plan</ion-list-header>
      @if (planned().length > 0) {
        <app-target-list [targets]="planned()"></app-target-list>
      } @else {
        <ion-text color="medium">
          <p class="ion-padding-horizontal">Tap the bookmark on any target to add it to your plan.</p>
        </ion-text>
      }

      <ion-list-header>Well placed right now</ion-list-header>
      @if (suggested().length > 0) {
        <app-target-list [targets]="suggested()"></app-target-list>
      } @else {
        <ion-text color="medium">
          <p class="ion-padding-horizontal">No listed targets are high in the sky right now.</p>
        </ion-text>
      }
    </ion-content>
  `,
})
export class PlanPage {
  private readonly state = inject(AppState);

  protected readonly planned = computed(() => {
    const ids = this.state.planIds();
    return TARGETS.filter((t) => ids.includes(t.id));
  });

  // Deep-sky objects first, since stars are mainly useful for alignment.
  protected readonly suggested = computed(() =>
    TARGETS.filter((t) => t.kind !== 'Star' && this.state.positionOf(t).altDeg >= GOOD_ALTITUDE_DEG)
      .sort((a, b) => this.state.positionOf(b).altDeg - this.state.positionOf(a).altDeg)
      .slice(0, SUGGESTION_COUNT),
  );
}
