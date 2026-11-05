import { Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonHeader, IonSearchbar, IonText, IonTitle, IonToolbar } from '@ionic/angular';

import { AppState } from '../core/app-state.service';
import { TargetListComponent } from '../core/target-list.component';
import { TARGETS } from '../core/targets';

/** Search for a target by designation, name or type. */
@Component({
  selector: 'app-targets',
  imports: [IonContent, IonHeader, IonSearchbar, IonText, IonTitle, IonToolbar, TargetListComponent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Targets</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          placeholder="Search M31, Vega, galaxy…"
          [debounce]="100"
          (ionInput)="query.set($any($event).detail.value ?? '')"
        ></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <app-target-list [targets]="results()"></app-target-list>
      @if (results().length === 0) {
        <ion-text color="medium">
          <p class="ion-text-center ion-padding">No targets match your search.</p>
        </ion-text>
      }
    </ion-content>
  `,
})
export class TargetsPage {
  private readonly state = inject(AppState);
  protected readonly query = signal('');

  /** Matching targets, with those highest in the sky first. */
  protected readonly results = computed(() => {
    const term = this.query().trim().toLowerCase();
    return TARGETS.filter((t) => `${t.id} ${t.name} ${t.kind}`.toLowerCase().includes(term)).sort(
      (a, b) => this.state.positionOf(b).altDeg - this.state.positionOf(a).altDeg,
    );
  });
}
