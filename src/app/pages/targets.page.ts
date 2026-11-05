import { Component, computed, inject, signal } from '@angular/core';
import { IonChip, IonContent, IonHeader, IonSearchbar, IonText, IonTitle, IonToolbar } from '@ionic/angular';

import { AppState } from '../core/app-state.service';
import { TargetListComponent } from '../core/target-list.component';
import { TARGETS } from '../core/targets';

/** Target types the user can filter by. Clusters combine open and globular. */
const FILTERS = ['All', 'Galaxy', 'Nebula', 'Cluster', 'Star'] as const;
type Filter = (typeof FILTERS)[number];

/** Search for a target by designation, name or type. */
@Component({
  selector: 'app-targets',
  imports: [IonChip, IonContent, IonHeader, IonSearchbar, IonText, IonTitle, IonToolbar, TargetListComponent],
  styles: `
    .filters {
      display: flex;
      gap: 4px;
      overflow-x: auto;
      padding: 0 8px 8px;
    }
    ion-chip {
      flex-shrink: 0;
    }
  `,
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
        <div class="filters">
          @for (option of filters; track option) {
            <ion-chip
              [outline]="filter() !== option"
              [color]="filter() === option ? 'primary' : 'medium'"
              (click)="filter.set(option)"
            >
              {{ option }}
            </ion-chip>
          }
        </div>
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
  protected readonly filters = FILTERS;
  protected readonly filter = signal<Filter>('All');
  protected readonly query = signal('');

  /** Matching targets, with those highest in the sky first. */
  protected readonly results = computed(() => {
    const term = this.query().trim().toLowerCase();
    const filter = this.filter();
    return TARGETS.filter(
      (t) =>
        (filter === 'All' || t.kind.includes(filter === 'Cluster' ? 'cluster' : filter)) &&
        `${t.id} ${t.name} ${t.kind}`.toLowerCase().includes(term),
    ).sort((a, b) => this.state.positionOf(b).altDeg - this.state.positionOf(a).altDeg);
  });
}
