import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonListHeader,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { AppState } from '../core/app-state.service';
import { TargetListComponent } from '../core/target-list.component';
import { TARGETS } from '../core/targets';

// Below this altitude, targets are dimmed by the atmosphere and hidden by buildings.
const GOOD_ALTITUDE_DEG = 30;
const SUGGESTION_COUNT = 5;

/** Tonight's conditions, the user's session plan, and suggested targets. */
@Component({
  selector: 'app-plan',
  imports: [
    DatePipe,
    DecimalPipe,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonListHeader,
    IonText,
    IonTitle,
    IonToolbar,
    TargetListComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Session plan</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-card>
        <ion-card-content data-testid="conditions">
          <p>
            <strong>Darkness: </strong>
            @if (conditions().darkFrom; as from) {
              from {{ from | date: 'HH:mm' }}
            } @else if (conditions().darkUntil) {
              now
            } @else {
              no full darkness in the next day
            }
            @if (conditions().darkUntil; as until) {
              until {{ until | date: 'HH:mm' }}
            }
          </p>
          <p>
            <strong>Moon: </strong>{{ conditions().moonIlluminatedPercent | number: '1.0-0' }}% lit,
            {{ conditions().moonAltDeg > 0 ? 'up now' : 'below the horizon' }}
          </p>
        </ion-card-content>
      </ion-card>

      <ion-list-header>My plan</ion-list-header>
      @if (planned().length > 0) {
        <app-target-list [targets]="planned()"></app-target-list>
      } @else {
        <ion-text color="medium">
          <p class="ion-padding-horizontal">Tap the bookmark on any target to add it to your plan.</p>
        </ion-text>
      }

      <ion-list-header>
        @if (conditions().darkFrom; as from) {
          Best at {{ from | date: 'HH:mm' }}
        } @else {
          Well placed right now
        }
      </ion-list-header>
      @if (suggested().length > 0) {
        <app-target-list [targets]="suggested()" [at]="suggestionTime()"></app-target-list>
      } @else {
        <ion-text color="medium">
          <p class="ion-padding-horizontal">No listed targets are high in the sky at that time.</p>
        </ion-text>
      }
    </ion-content>
  `,
})
export class PlanPage {
  private readonly state = inject(AppState);
  protected readonly conditions = this.state.conditions;

  protected readonly planned = computed(() => {
    const ids = this.state.planIds();
    return TARGETS.filter((t) => ids.includes(t.id));
  });

  /** Suggestions are for when it gets dark, or for now if it is already dark. */
  protected readonly suggestionTime = computed(() => this.conditions().darkFrom ?? this.state.now());

  // Deep-sky objects only, since stars are mainly useful for alignment.
  protected readonly suggested = computed(() => {
    const time = this.suggestionTime();
    return TARGETS.map((target) => ({ target, altDeg: this.state.positionAt(target, time).altDeg }))
      .filter(({ target, altDeg }) => target.kind !== 'Star' && altDeg >= GOOD_ALTITUDE_DEG)
      .sort((a, b) => b.altDeg - a.altDeg)
      .slice(0, SUGGESTION_COUNT)
      .map(({ target }) => target);
  });
}
