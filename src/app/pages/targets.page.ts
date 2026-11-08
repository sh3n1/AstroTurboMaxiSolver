import { Component, computed, inject, signal } from '@angular/core';
import { IonChip, IonContent, IonHeader, IonSearchbar, IonText, IonTitle, IonToolbar } from '@ionic/angular';

import { AppState } from '../core/app-state.service';
import { isExactDesignation, normalizeSearch, targetSearchText } from '../core/search';
import { TargetListComponent } from '../core/target-list.component';
import type { Target } from '../core/targets';

/** Target types the user can filter by. Clusters combine open and globular. */
const MAX_RESULTS = 40;

const FILTERS = ['All', 'Solar system', 'Galaxy', 'Nebula', 'Cluster', 'Star', 'Double star', 'Constellation'] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(target: Target, filter: Filter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Solar system') return !!target.body;
  if (filter === 'Cluster') return target.kind.includes('cluster');
  // Named stars that are doubles, such as Albireo, are stars and doubles both.
  if (filter === 'Double star') return !!target.double;
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
      @if (matchCount() > maxResults()) {
        <ion-text color="medium" data-testid="more-results">
          <p class="ion-text-center ion-padding">
            Showing {{ maxResults() }} of {{ matchCount() }}. Search to narrow them down.
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
    // Typing "ngc224" or "NGC 224" finds the same object.
    const term = normalizeSearch(this.query());
    const filter = this.filter();
    return this.state.targets().filter((t) => matchesFilter(t, filter) && targetSearchText(t).includes(term));
  });

  protected readonly matchCount = computed(() => this.matches().length);
  /** All 88 constellations fit in one list, so they are never cut short. */
  protected readonly maxResults = computed(() => (this.filter() === 'Constellation' ? Infinity : MAX_RESULTS));

  /**
   * The best matches: exact designations first, then whatever is up and brightest.
   * Rendering thousands of rows would freeze a phone, so the list is limited.
   */
  protected readonly results = computed(() => {
    const term = normalizeSearch(this.query());
    return this.matches()
      .map((target) => {
        const isExact = !!term && isExactDesignation(target, term);
        // The minute clock is enough for sorting, and saves re-sorting every second.
        const isUp = this.state.positionAt(target, this.state.now()).altDeg > 0;
        return { target, rank: (isExact ? 0 : 2000) + (isUp ? 0 : 1000) + target.mag };
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, this.maxResults())
      .map(({ target }) => target);
  });
}
