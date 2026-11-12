import { Component, inject } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonText, IonTitle, IonToolbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { timeOutline } from 'ionicons/icons';

import { AppState } from '../core/app-state.service';
import { ListRowsComponent } from '../core/list-rows.component';
import { ListToolsComponent } from '../core/list-tools.component';
import { ListViewService } from '../core/list-view.service';

/**
 * Search every target by designation, name or type. It is a list like any other, the
 * longest one: the same tools, orders, filters and rows as the catalogues and the user's
 * own lists. Its own order is the best match for what was typed.
 */
@Component({
  selector: 'app-targets',
  imports: [
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
    <ion-header>
      <ion-toolbar>
        <ion-title>Targets</ion-title>
        <ion-buttons slot="end">
          <!-- Opens the time control: the heights and the order follow the time chosen. -->
          <ion-button
            aria-label="Change the time"
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
          <p class="ion-text-center ion-padding" data-testid="list-empty">No targets match your search.</p>
        </ion-text>
      </app-list-rows>
    </ion-content>
  `,
})
export class TargetsPage {
  protected readonly state = inject(AppState);

  constructor() {
    addIcons({ timeOutline });
    inject(ListViewService).configure({
      key: () => 'targets',
      rows: () => this.state.targets(),
      ownOrder: () => 'Best match',
      bestMatch: true,
    });
  }
}
