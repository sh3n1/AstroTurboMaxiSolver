import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { timeOutline } from 'ionicons/icons';

import { AppState } from '../core/app-state.service';
import { t } from '../core/i18n/t';
import { ListRowsComponent } from '../core/lists/list-rows.component';
import { ListToolsComponent } from '../core/lists/list-tools.component';
import { ListViewService } from '../core/lists/list-view.service';

/**
 * Search every target by designation, name or type, opened from the top of Lists. It is a
 * list like any other, the longest one: the same tools, orders, filters and rows as the
 * catalogues and the user's own lists. Its own order is the best match for what was typed.
 */
@Component({
  selector: 'app-targets',
  // Everything shown comes from signals, so the page is checked only when one changes,
  // not each time the sky map behind it updates.
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonText,
    IonTitle,
    IonToolbar,
    ListRowsComponent,
    ListToolsComponent,
  ],
  providers: [ListViewService],
  styles: `
    /* The clock is amber while another time is on show, as on the sky map. */
    ion-button.warn {
      --color: var(--ion-color-warning);
    }
  `,
  template: `
    <ion-header class="list-header">
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button
            defaultHref="/tabs/lists"
            text=""
            [attr.aria-label]="'common.back' | translate"
          ></ion-back-button>
        </ion-buttons>
        <ion-title>{{ 'lists.search' | translate }}</ion-title>
        <ion-buttons slot="end">
          <!-- Opens the time control: the heights and the order follow the time chosen. -->
          <ion-button
            [attr.aria-label]="'lists.changeTime' | translate"
            data-testid="list-change-time"
            [class.warn]="state.planning()"
            (click)="state.timeControlOpen.set(true)"
          >
            <ion-icon slot="icon-only" name="time-outline" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <app-list-tools placeholder="M31, Vega…"></app-list-tools>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <app-list-rows>
        <ion-text color="medium">
          <p class="ion-text-center ion-padding" data-testid="list-empty">{{ 'lists.empty.noMatch' | translate }}</p>
        </ion-text>
      </app-list-rows>
    </ion-content>
  `,
})
export class TargetsPage {
  private readonly tools = viewChild(ListToolsComponent);

  /** Each time the list comes on show, the search is ready to type in. */
  ionViewDidEnter(): void {
    this.tools()?.focusSearch();
  }

  protected readonly state = inject(AppState);

  constructor() {
    addIcons({ timeOutline });
    inject(ListViewService).configure({
      key: () => 'targets',
      rows: () => this.state.targets(),
      title: () => 'Search',
      ownOrder: () => t('lists.sorts.bestMatch'),
      bestMatch: true,
    });
  }
}
