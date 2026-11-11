import { Component, computed, inject } from '@angular/core';
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
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  flowerOutline,
  leafOutline,
  snowOutline,
  sparklesOutline,
  sunnyOutline,
} from 'ionicons/icons';

import { ListsService } from '../core/lists.service';
import type { FixedListSection } from '../core/target-lists';
import { CATALOGUE_GROUPS, fixedListEntries } from '../core/target-lists';

/**
 * The Catalogues page, opened from the Bookmarks tab's collections: Messier, Caldwell,
 * Herschel 400, Herschel II and the SAC 110 Best NGC, each opening its own list, then the
 * RASC Finest NGC, which opens a page of its four seasons. That page is this one again,
 * set by the route's data.
 */
@Component({
  selector: 'app-catalogues',
  imports: [
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
  // The same rows as the Bookmarks tab.
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
          <ion-back-button [defaultHref]="back" text=""></ion-back-button>
        </ion-buttons>
        <ion-title>{{ title }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list inset="true">
        @for (entry of catalogues(); track entry.list.id) {
          <ion-item button detail="true" data-testid="list-link" (click)="open(entry.list.id)">
            <ion-icon slot="start" aria-hidden="true" [name]="entry.icon"></ion-icon>
            <ion-label>
              <h2>{{ entry.list.name }}</h2>
              @if (entry.description) {
                <p>{{ entry.description }}</p>
              }
            </ion-label>
            <ion-badge slot="end" color="medium">{{ entry.list.targets.length }}</ion-badge>
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** The split catalogue this page shows, from the address, or none for the Catalogues page. */
  private readonly group = CATALOGUE_GROUPS.find((g) => g.id === this.route.snapshot.paramMap.get('group'));

  /** The lists this page shows: the Catalogues page itself, or one split catalogue's. */
  private readonly section: FixedListSection = this.group?.section ?? 'catalogues';
  protected readonly title: string = this.group?.name ?? 'Catalogues';
  protected readonly back = this.group ? '/tabs/lists/catalogues' : '/tabs/lists';

  protected readonly catalogues = computed(() => fixedListEntries(this.lists.fixedLists(), this.section));
  /** Split catalogues, only on the Catalogues page itself. */
  protected readonly groups = this.group ? [] : CATALOGUE_GROUPS;

  constructor() {
    addIcons({ calendarOutline, flowerOutline, leafOutline, snowOutline, sparklesOutline, sunnyOutline });
  }

  protected openGroup(id: string): void {
    void this.router.navigateByUrl(`/tabs/lists/catalogues/${id}`);
  }

  protected open(id: string): void {
    void this.router.navigateByUrl(`/tabs/lists/${id}`);
  }
}
