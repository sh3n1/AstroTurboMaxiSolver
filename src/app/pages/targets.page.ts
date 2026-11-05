import { Component, computed, inject, signal } from '@angular/core';
import { IonChip, IonContent, IonHeader, IonSearchbar, IonText, IonTitle, IonToolbar } from '@ionic/angular';

import { AppState } from '../core/app-state.service';
import { TargetListComponent } from '../core/target-list.component';
import type { Target } from '../core/targets';

/** Target types the user can filter by. Clusters combine open and globular. */
const MAX_RESULTS = 40;

const FILTERS = ['All', 'Solar system', 'Galaxy', 'Nebula', 'Cluster', 'Star'] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(target: Target, filter: Filter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Solar system') return !!target.body;
  if (filter === 'Cluster') return target.kind.includes('cluster');
  return target.kind === filter;
}

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
          placeholder="Search M31, Vega, Jupiter, NGC 224…"
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
      @if (matchCount() > maxResults) {
        <ion-text color="medium" data-testid="more-results">
          <p class="ion-text-center ion-padding">
            Showing {{ maxResults }} of {{ matchCount() }}. Search to narrow them down.
          </p>
        </ion-text>
      }
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

  /** Every target that matches, before limiting how many are shown. */
  private readonly matches = computed(() => {
    const term = this.query().trim().toLowerCase();
    const filter = this.filter();
    return this.state
      .targets()
      .filter(
        (t) =>
          matchesFilter(t, filter) && `${t.id} ${t.name} ${t.kind} ${t.aliases ?? ''}`.toLowerCase().includes(term),
      );
  });

  protected readonly matchCount = computed(() => this.matches().length);
  protected readonly maxResults = MAX_RESULTS;

  /**
   * The best matches: exact designations first, then whatever is up and brightest.
   * Rendering thousands of rows would freeze a phone, so the list is limited.
   */
  protected readonly results = computed(() => {
    const term = this.query().trim().toLowerCase();
    return this.matches()
      .map((target) => {
        const isExact = ` ${target.id} ${target.aliases ?? ''} `.toLowerCase().includes(` ${term} `);
        const isUp = this.state.positionOf(target).altDeg > 0;
        return { target, rank: (term && isExact ? 0 : 2000) + (isUp ? 0 : 1000) + target.mag };
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_RESULTS)
      .map(({ target }) => target);
  });
}
