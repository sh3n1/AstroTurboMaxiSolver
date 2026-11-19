import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBackButton,
  IonBadge,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { bookOutline, calendarOutline, flowerOutline, leafOutline, snowOutline, sunnyOutline } from 'ionicons/icons';

import { isIconUrl } from '../core/app-icons';
import { AppState } from '../core/app-state.service';
import { t } from '../core/i18n/t';
import { currentFirst } from '../core/lists/list-order';
import { ListsService } from '../core/lists/lists.service';
import { programFor } from '../core/lists/observing-programs';
import { ProgramCardComponent } from '../core/lists/program-card.component';
import type { FixedListSection } from '../core/lists/target-lists';
import { CATALOGUE_GROUPS, fixedListEntries, isReserved } from '../core/lists/target-lists';
import { ObservingLogService } from '../core/log/observing-log.service';

/** The split catalogues shown: not those whose publishers reserve their rights, for now. */
const SHOWN_GROUPS = CATALOGUE_GROUPS.filter((group) => !isReserved(group));

/**
 * The Catalogues page, opened from the Lists tab: Messier, Caldwell,
 * Herschel 400, Herschel II and the SAC 110 Best NGC, each opening its own list, then the
 * RASC Finest NGC, which opens a page of its four seasons. That page is this one again,
 * set by the route's data.
 */
@Component({
  selector: 'app-catalogues',
  // Everything shown comes from signals, so the page is checked only when one changes,
  // not each time the sky map behind it updates.
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    ProgramCardComponent,
    IonBackButton,
    IonBadge,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonTitle,
    IonToolbar,
  ],
  // The same rows as the Lists tab.
  styles: `
    ion-item > ion-icon[slot='start'] {
      color: var(--ion-color-primary);
      margin-inline-end: 16px;
    }
    ion-label p {
      color: var(--af-muted);
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button [defaultHref]="back" text="" [attr.aria-label]="'common.back' | translate"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- A split catalogue from an observing programme: what it is, and a link to its own page. -->
      @if (program; as programme) {
        <app-program-card [program]="programme"></app-program-card>
      }
      <!-- The rows go in two columns on a phone on its side: see .af-columns in global.scss. -->
      <ion-list inset="true" class="af-columns">
        @for (entry of catalogues(); track entry.list.id) {
          <ion-item button detail="true" data-testid="list-link" (click)="open(entry.list.id)">
            <ion-icon
              slot="start"
              aria-hidden="true"
              [name]="isIconUrl(entry.icon) ? undefined : entry.icon"
              [src]="isIconUrl(entry.icon) ? entry.icon : undefined"
            ></ion-icon>
            <ion-label>
              <h2>{{ entry.list.name }}</h2>
              @if (entry.description) {
                <p>{{ entry.description }}</p>
              }
            </ion-label>
            <!-- How many are seen, once any is: "12/110". -->
            <ion-badge slot="end" color="medium">{{ log.progressLabel(entry.list.targets) }}</ion-badge>
          </ion-item>
        }
        <!-- Catalogues split into several lists, each opening its own page of them. -->
        @for (group of groups; track group.id) {
          <ion-item button detail="true" data-testid="catalogue-group-link" (click)="openGroup(group.id)">
            <ion-icon slot="start" aria-hidden="true" [name]="group.icon"></ion-icon>
            <ion-label>
              <h2>{{ group.name }}</h2>
              <p>{{ group.description }}</p>
            </ion-label>
          </ion-item>
        }
      </ion-list>
    </ion-content>
  `,
})
export class CataloguesPage {
  private readonly lists = inject(ListsService);
  private readonly state = inject(AppState);
  protected readonly log = inject(ObservingLogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** The split catalogue this page shows, from the address, or none for the Catalogues page. */
  private readonly group = SHOWN_GROUPS.find((g) => g.id === this.route.snapshot.paramMap.get('group'));

  /** The lists this page shows: the Catalogues page itself, or one split catalogue's. */
  private readonly section: FixedListSection = this.group?.section ?? 'catalogues';
  protected readonly title: string = this.group?.name ?? t('lists.catalogues');
  /** The observing programme of a split catalogue, such as the RASC Finest NGC. */
  protected readonly program = this.group ? programFor(this.group.id) : null;
  protected readonly back = this.group ? '/tabs/lists/catalogues' : '/tabs/lists';

  /**
   * The lists, in the catalogue's order. A catalogue split by season or month starts at
   * the current one, for the time on show, since that is the one to observe now.
   */
  protected readonly catalogues = computed(() => {
    const entries = fixedListEntries(this.lists.fixedLists(), this.section);
    return this.group ? currentFirst(entries, this.state.now()) : entries;
  });
  /** Split catalogues, only on the Catalogues page itself. */
  protected readonly groups = this.group ? [] : SHOWN_GROUPS;

  constructor() {
    addIcons({ bookOutline, calendarOutline, flowerOutline, leafOutline, snowOutline, sunnyOutline });
  }

  protected readonly isIconUrl = isIconUrl;

  protected openGroup(id: string): void {
    void this.router.navigateByUrl(`/tabs/lists/catalogues/${id}`);
  }

  protected open(id: string): void {
    void this.router.navigateByUrl(`/tabs/lists/${id}`);
  }
}
