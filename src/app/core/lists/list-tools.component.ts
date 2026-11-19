import { ChangeDetectionStrategy, Component, inject, input, viewChild } from '@angular/core';
import { ActionSheetController, IonButton, IonChip, IonIcon, IonModal, IonSearchbar } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { analyticsOutline, close, filterOutline, funnelOutline } from 'ionicons/icons';

import { t } from '../i18n/t';

import type { SeenFilter } from './list-order';
import { TYPE_FILTERS, typeFilterText } from './list-order';
import { ListViewService } from './list-view.service';

/**
 * The tools above every list of targets: the search, then the order, the filters and the
 * chart, each behind one icon. The same in the search and on every list, so a list
 * always works the way the last one did. The filters open as a sheet from the bottom,
 * with every choice in view at once. The page provides the ListViewService.
 */
@Component({
  selector: 'app-list-tools',
  // Everything shown comes from signals, so the page is checked only when one changes,
  // not each time the sky map behind it updates.
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IonButton, IonChip, IonIcon, IonModal, IonSearchbar],
  styles: `
    .bar {
      display: flex;
      align-items: center;
      padding-inline-end: 4px;
    }
    ion-searchbar {
      flex: 1;
      min-width: 0;
      padding-inline-end: 0;
    }
    .bar ion-button {
      flex: none;
      margin: 0;
      --padding-start: 8px;
      --padding-end: 8px;
    }
    /* A tool that is switched on, or a filter in use, is in the app's blue. */
    .bar ion-button.on {
      --color: var(--ion-color-primary);
    }
    .bar ion-button:not(.on) {
      --color: var(--af-text);
    }
    /* The filters in use, under the search. They wrap, so all are always in view. */
    .active {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 12px 8px;
    }
    ion-chip {
      margin: 0;
    }

    /* The filter sheet: as tall as its choices, which wrap over as many lines as they need. */
    ion-modal {
      --height: auto;
    }
    .sheet {
      padding: 4px 16px calc(16px + env(safe-area-inset-bottom));
      color: var(--af-text);
      /* On a short screen, such as a phone on its side, the choices scroll inside the sheet. */
      max-height: calc(100vh - 24px);
      overflow-y: auto;
    }
    .sheet-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .sheet-title h2 {
      margin: 0;
      font-size: calc(20px * var(--af-scale, 1));
    }
    .sheet h3 {
      margin: 12px 0 8px;
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .choices {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .clear {
      margin-top: 16px;
    }
  `,
  template: `
    <div class="bar">
      <ion-searchbar
        data-testid="list-search"
        [placeholder]="placeholder()"
        [debounce]="100"
        [value]="view.query()"
        (ionInput)="view.query.set($any($event).detail.value ?? '')"
      ></ion-searchbar>
      <ion-button
        fill="clear"
        [attr.aria-label]="'lists.order' | translate"
        data-testid="list-sort"
        (click)="chooseSort()"
      >
        <ion-icon slot="icon-only" name="filter-outline" aria-hidden="true"></ion-icon>
      </ion-button>
      <ion-button
        fill="clear"
        [attr.aria-label]="'lists.filters' | translate"
        data-testid="list-filter"
        [class.on]="view.activeFilters().length > 0"
        (click)="view.filtersOpen.set(true)"
      >
        <ion-icon slot="icon-only" name="funnel-outline" aria-hidden="true"></ion-icon>
      </ion-button>
      <ion-button
        fill="clear"
        [attr.aria-label]="'lists.chart' | translate"
        data-testid="list-chart-toggle"
        [class.on]="view.chartOpen()"
        [attr.aria-pressed]="view.chartOpen()"
        (click)="view.toggleChart()"
      >
        <ion-icon slot="icon-only" name="analytics-outline" aria-hidden="true"></ion-icon>
      </ion-button>
    </div>

    @if (view.activeFilters().length > 0) {
      <!-- The filters in use stay on show. A tap takes one off. -->
      <div class="active" data-testid="list-active-filters">
        @for (filter of view.activeFilters(); track filter.id) {
          <ion-chip
            color="primary"
            [attr.aria-label]="'lists.removeFilter' | translate: { filter: filter.label }"
            (click)="view.clearFilter(filter.id)"
          >
            {{ filter.label }}
            <ion-icon name="close" aria-hidden="true"></ion-icon>
          </ion-chip>
        }
      </div>
    }

    <!-- Every filter at once, in a sheet from the bottom. The list behind follows each tap. -->
    <ion-modal
      [isOpen]="view.filtersOpen()"
      [breakpoints]="[0, 1]"
      [initialBreakpoint]="1"
      (didDismiss)="view.filtersOpen.set(false)"
    >
      <ng-template>
        <div class="sheet" data-testid="list-filters">
          <div class="sheet-title">
            <h2>{{ 'lists.filters' | translate }}</h2>
            <ion-button
              fill="clear"
              [attr.aria-label]="'common.close' | translate"
              data-testid="filters-close"
              (click)="view.filtersOpen.set(false)"
            >
              <ion-icon slot="icon-only" name="close" aria-hidden="true"></ion-icon>
            </ion-button>
          </div>

          <h3 id="filter-type">{{ 'lists.type' | translate }}</h3>
          <div class="choices" role="radiogroup" aria-labelledby="filter-type" data-testid="list-type-filters">
            @for (option of types; track option) {
              <ion-chip
                role="radio"
                [attr.aria-checked]="view.type() === option"
                [outline]="view.type() !== option"
                [color]="view.type() === option ? 'primary' : 'medium'"
                (click)="view.type.set(option)"
              >
                {{ typeFilterText(option) }}
              </ion-chip>
            }
          </div>

          <h3>{{ 'lists.observingLog' | translate }}</h3>
          <div class="choices" data-testid="list-seen-filters">
            <ion-chip
              role="checkbox"
              [attr.aria-checked]="view.seen() === 'todo'"
              [outline]="view.seen() !== 'todo'"
              [color]="view.seen() === 'todo' ? 'primary' : 'medium'"
              (click)="toggleSeen('todo')"
              >{{ 'lists.toSee' | translate }}</ion-chip
            >
            <ion-chip
              role="checkbox"
              [attr.aria-checked]="view.seen() === 'seen'"
              [outline]="view.seen() !== 'seen'"
              [color]="view.seen() === 'seen' ? 'primary' : 'medium'"
              (click)="toggleSeen('seen')"
              >{{ 'lists.seen' | translate }}</ion-chip
            >
          </div>

          <h3>Sky</h3>
          <div class="choices">
            <ion-chip
              role="checkbox"
              data-testid="filter-up-tonight"
              [attr.aria-checked]="view.upTonight()"
              [outline]="!view.upTonight()"
              [color]="view.upTonight() ? 'primary' : 'medium'"
              (click)="view.upTonight.set(!view.upTonight())"
              >{{ 'lists.upTonight' | translate }}</ion-chip
            >
          </div>

          @if (view.activeFilters().length > 0) {
            <ion-button class="clear" fill="outline" expand="block" data-testid="filters-clear" (click)="clearAll()">
              {{ 'lists.clearFilters' | translate }}
            </ion-button>
          }
        </div>
      </ng-template>
    </ion-modal>
  `,
})
export class ListToolsComponent {
  private readonly searchbar = viewChild(IonSearchbar);

  /** Puts the cursor in the search, ready to type, as a list opens. */
  focusSearch(): void {
    void this.searchbar()?.setFocus();
  }

  readonly placeholder = input(t('lists.searchThisList'));
  protected readonly typeFilterText = typeFilterText;

  protected readonly view = inject(ListViewService);
  private readonly actionSheets = inject(ActionSheetController);
  protected readonly types = TYPE_FILTERS;

  constructor() {
    addIcons({ analyticsOutline, close, filterOutline, funnelOutline });
  }

  /** "To see" and "Seen" can't both be on. A tap on the one that is on takes it off. */
  protected toggleSeen(filter: Exclude<SeenFilter, 'all'>): void {
    this.view.seen.set(this.view.seen() === filter ? 'all' : filter);
  }

  protected clearAll(): void {
    for (const filter of this.view.activeFilters()) this.view.clearFilter(filter.id);
  }

  /** The orders this list offers, with the one in use marked. */
  protected async chooseSort(): Promise<void> {
    const current = this.view.sort();
    const sheet = await this.actionSheets.create({
      header: t('lists.order'),
      buttons: [
        ...this.view.sorts().map(({ id, label }) => ({
          text: label,
          role: id === current ? 'selected' : undefined,
          htmlAttributes: { 'data-sort': id },
          handler: () => this.view.setSort(id),
        })),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
  }
}
