import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { IonInfiniteScroll, IonInfiniteScrollContent, IonItemDivider, IonLabel, ToastController } from '@ionic/angular';

import { t } from '../i18n/t';
import { PlanChartComponent } from '../planning/plan-chart.component';

import { listToastPlace } from './list-toast';
import { ListViewService } from './list-view.service';
import { ListsService } from './lists.service';
import { TargetListComponent } from './target-list.component';
import type { ListedTarget } from './target-lists';

/** How long the message stays after removing a row, to leave time to undo it. */
const UNDO_TOAST_MS = 5000;

/**
 * The rows of a list as the ListViewService arranges them: the chart of tonight when it
 * is open, then the rows under their headings, a part at a time. More load as the user
 * reaches the end. Whatever the page puts inside shows when no row passes the filters.
 */
@Component({
  selector: 'app-list-rows',
  // Everything shown comes from signals, so the page is checked only when one changes,
  // not each time the sky map behind it updates.
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonItemDivider,
    IonLabel,
    PlanChartComponent,
    TargetListComponent,
  ],
  styles: `
    /* The headings stay in view while their rows scroll under them. */
    ion-item-divider {
      --background: var(--ion-background-color);
      --color: var(--af-text);
      font-size: calc(15px * var(--af-scale, 1));
      font-weight: 700;
      letter-spacing: 0.04em;
    }
  `,
  template: `
    @if (view.chartOpen() && view.total() > 0) {
      <app-plan-chart [targets]="view.ordered()"></app-plan-chart>
    }

    <div data-testid="list-rows" [attr.data-total]="view.total()" [attr.data-sort]="view.sort()">
      @for (section of view.visible(); track section.title) {
        @if (section.title) {
          <ion-item-divider sticky="true" data-testid="list-section">
            <ion-label>{{ section.title }}</ion-label>
          </ion-item-divider>
        }
        <app-target-list
          [targets]="section.rows"
          [notes]="view.notes()"
          [removable]="!!ownListId()"
          [reorder]="view.editing()"
          (remove)="remove($event)"
          (moved)="move($event)"
        ></app-target-list>
      }
    </div>

    @if (view.total() === 0) {
      <ng-content></ng-content>
    }

    <ion-infinite-scroll [disabled]="view.allShown()" (ionInfinite)="more($any($event))">
      <ion-infinite-scroll-content></ion-infinite-scroll-content>
    </ion-infinite-scroll>
  `,
})
export class ListRowsComponent {
  /** The id of the list on show when it is one of the user's own, whose rows can be removed and moved. */
  readonly ownListId = input<string | null>(null);

  protected readonly view = inject(ListViewService);
  private readonly lists = inject(ListsService);
  private readonly toasts = inject(ToastController);

  /** The end of the rows on show came into view: show the next part. */
  protected more(event: CustomEvent & { target: { complete: () => Promise<void> } }): void {
    this.view.showMore();
    void event.target.complete();
  }

  /** Takes a target out of the user's list, with a moment to undo it, back in its place. */
  protected async remove(target: ListedTarget): Promise<void> {
    const listId = this.ownListId();
    if (!listId) return;
    const before = this.lists.targetIds(listId);
    this.lists.setTargets(
      listId,
      before.filter((id) => id !== target.id),
    );
    const toast = await this.toasts.create({
      message: t('lists.removed', { name: target.id }),
      duration: UNDO_TOAST_MS,
      ...listToastPlace(),
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': 'removed-toast' },
      buttons: [{ text: t('common.undo'), handler: () => this.lists.setTargets(listId, before) }],
    });
    await toast.present();
  }

  /** A row was dragged to a new place, while reordering: the list is saved in that order. */
  protected move({ from, to }: { from: number; to: number }): void {
    const listId = this.ownListId();
    if (!listId) return;
    const shown = this.view.ordered().map((row) => row.id);
    const [moved] = shown.splice(from, 1);
    shown.splice(to, 0, moved);
    // Targets saved in the list but missing from the catalogue aren't on show: keep them, last.
    const hidden = this.lists.targetIds(listId).filter((id) => !shown.includes(id));
    this.lists.setTargets(listId, [...shown, ...hidden]);
  }
}
