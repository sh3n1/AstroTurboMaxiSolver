import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ActionSheetController,
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  copyOutline,
  createOutline,
  ellipsisVertical,
  saveOutline,
  shareSocialOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';
import { map } from 'rxjs';

import { AppState } from '../core/app-state.service';
import { ListsService } from '../core/lists.service';
import { ObservingLogService } from '../core/observing-log.service';
import { PlanChartComponent } from '../core/plan-chart.component';
import { normalizeSearch, targetSearchText } from '../core/search';
import { TargetListComponent } from '../core/target-list.component';
import { exportFileName, exportLists } from '../core/target-lists';

/** One bookmark list, with a search, and for the user's own lists, rename and delete. */
@Component({
  selector: 'app-list',
  imports: [
    DecimalPipe,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonContent,
    IonHeader,
    IonIcon,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonText,
    IonTitle,
    IonToolbar,
    TargetListComponent,
    PlanChartComponent,
  ],
  styles: `
    /* The clock is amber while another time is on show, as on the sky map. */
    ion-button.warn {
      --color: var(--ion-color-warning);
    }
    /* How much of the list has been seen: a ring filling in green, the count beside it. */
    .progress {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      padding: 12px 16px 4px;
      font-size: calc(16px * var(--af-scale, 1));
    }
    .progress svg {
      flex: none;
      width: 36px;
      height: 36px;
      transform: rotate(-90deg);
    }
    .progress .track {
      stroke: var(--ion-border-color);
    }
    .progress .done {
      stroke: var(--ion-color-success);
    }
    .progress ion-segment {
      flex: 1 1 220px;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/lists" text="" aria-label="Back"></ion-back-button>
        </ion-buttons>
        <ion-title data-testid="list-title">{{ list()?.name ?? 'List' }}</ion-title>
        @if (list(); as current) {
          <ion-buttons slot="end">
            @if (current.id === 'now') {
              <!-- Opens the time control: the list follows the time as it changes. -->
              <ion-button
                aria-label="Change the time"
                data-testid="list-change-time"
                [class.warn]="state.planning()"
                (click)="state.timeControlOpen.set(true)"
              >
                <ion-icon slot="icon-only" name="time-outline" aria-hidden="true"></ion-icon>
              </ion-button>
            }
            <ion-button aria-label="Share" data-testid="share-list" (click)="share()">
              <ion-icon slot="icon-only" name="share-social-outline" aria-hidden="true"></ion-icon>
            </ion-button>
            <ion-button aria-label="More actions" data-testid="list-actions" (click)="actions()">
              <ion-icon slot="icon-only" name="ellipsis-vertical" aria-hidden="true"></ion-icon>
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          placeholder="Search this list"
          data-testid="list-search"
          [debounce]="100"
          (ionInput)="query.set($any($event).detail.value ?? '')"
        ></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (list(); as current) {
        @if (current.id === 'reticle') {
          <!-- Where the reticle is, since this list follows it. -->
          <ion-card>
            <ion-card-content data-testid="reticle-centre">
              <p>
                <strong>Around: </strong>Alt {{ state.pointing().altDeg | number: '1.0-0' }}° Az
                {{ state.pointing().azDeg | number: '1.0-0' }}°
              </p>
            </ion-card-content>
          </ion-card>
        }

        <!-- The user's own lists: each target's height through tonight, on one chart. -->
        @if (current.kind !== 'fixed' && current.targets.length > 0) {
          <app-plan-chart [targets]="current.targets"></app-plan-chart>
        }

        @if (showProgress()) {
          <div class="progress" data-testid="list-progress">
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle class="track" cx="20" cy="20" r="16" fill="none" stroke-width="4" />
              <circle
                class="done"
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke-width="4"
                stroke-linecap="round"
                [attr.stroke-dasharray]="ringDash()"
              />
            </svg>
            <span data-testid="list-seen-count"
              ><strong>{{ progress().seen }}</strong> of {{ progress().total }} seen</span
            >
            <ion-segment
              aria-label="Show"
              data-testid="list-seen-filter"
              [value]="seenFilter()"
              (ionChange)="seenFilter.set($any($event).detail.value)"
            >
              <ion-segment-button value="all">All</ion-segment-button>
              <ion-segment-button value="todo">To see</ion-segment-button>
              <ion-segment-button value="seen">Seen</ion-segment-button>
            </ion-segment>
          </div>
        }

        @if (shown().length > 0) {
          <app-target-list [targets]="shown()"></app-target-list>
        } @else {
          <ion-text color="medium">
            <p class="ion-padding" data-testid="list-empty">
              @if (query()) {
                Nothing in this list matches your search.
              } @else if (seenFilter() === 'seen' && showProgress()) {
                Nothing seen in this list yet.
              } @else if (seenFilter() === 'todo' && showProgress()) {
                All seen. Well done!
              } @else if (current.id === 'reticle') {
                Nothing is inside the aiming rings. Move the telescope, or the map, to fill this list.
              } @else if (current.kind === 'fixed') {
                Nothing is well placed at that time.
              } @else {
                This list is empty. Tap the bookmark on any target to save it here.
              }
            </p>
          </ion-text>
        }
      } @else {
        <p class="ion-padding">This list no longer exists.</p>
      }
    </ion-content>
  `,
})
export class ListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly lists = inject(ListsService);
  protected readonly state = inject(AppState);
  private readonly alerts = inject(AlertController);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly toasts = inject(ToastController);

  private readonly log = inject(ObservingLogService);

  protected readonly query = signal('');
  /** Which rows to show by the observing log: all, those still to see, or those seen. */
  protected readonly seenFilter = signal<'all' | 'todo' | 'seen'>('all');

  private readonly id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: '',
  });

  /** The list on show. Reads the lists, so it updates when they change. */
  protected readonly list = computed(() => {
    // Read both, so the page follows any change to either kind of list.
    this.lists.fixedLists();
    this.lists.userLists();
    return this.lists.list(this.id());
  });

  /**
   * Progress shows on lists that stay put, the catalogues and the user's own. The two that
   * follow the time or the telescope change too often for it to mean anything.
   */
  protected readonly showProgress = computed(() => {
    const id = this.list()?.id;
    return !!id && id !== 'now' && id !== 'reticle';
  });

  /** How many of the list's targets have been seen, each target counted once. */
  protected readonly progress = computed(() => {
    const ids = new Set((this.list()?.targets ?? []).map((t) => t.id));
    const states = this.log.states();
    return { seen: [...ids].filter((id) => states.get(id) === 'seen').length, total: ids.size };
  });

  /** The ring's filled part, as an SVG dash: the seen share of its circumference. */
  protected readonly ringDash = computed(() => {
    const { seen, total } = this.progress();
    const circumference = 2 * Math.PI * 16;
    return `${(total ? seen / total : 0) * circumference} ${circumference}`;
  });

  /** The list's targets that match the search and the seen filter, in the list's own order. */
  protected readonly shown = computed(() => {
    const targets = this.list()?.targets ?? [];
    const term = normalizeSearch(this.query());
    const filter = this.showProgress() ? this.seenFilter() : 'all';
    const states = this.log.states();
    return targets.filter(
      (t) =>
        (!term || targetSearchText(t).includes(term)) &&
        (filter === 'all' || (states.get(t.id) === 'seen') === (filter === 'seen')),
    );
  });

  constructor() {
    addIcons({
      copyOutline,
      createOutline,
      ellipsisVertical,
      saveOutline,
      shareSocialOutline,
      timeOutline,
      trashOutline,
    });
  }

  protected async share(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const result = await this.lists.share(list);
    if (result === 'saved') void this.toast('Saved as a file in your downloads');
  }

  /**
   * What can be done with this list. The app's own lists can only be shared or copied.
   * Uncategorized keeps its name and can't be deleted: only what's in it changes.
   */
  protected async actions(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const buttons: { text: string; icon?: string; role?: string; handler?: () => void }[] = [
      { text: 'Save as a file', icon: 'save-outline', handler: () => this.saveFile() },
    ];
    if (list.kind === 'fixed') {
      buttons.push({ text: 'Make an editable copy', icon: 'copy-outline', handler: () => void this.copy() });
    }
    if (list.kind === 'custom') {
      buttons.push({ text: 'Rename', icon: 'create-outline', handler: () => void this.rename() });
      buttons.push({
        text: 'Delete list',
        icon: 'trash-outline',
        role: 'destructive',
        handler: () => void this.delete(),
      });
    }
    buttons.push({ text: 'Cancel', role: 'cancel' });
    const sheet = await this.actionSheets.create({ header: list.name, buttons });
    await sheet.present();
  }

  private saveFile(): void {
    const list = this.list();
    if (!list) return;
    this.lists.download(
      // A target listed twice, under two numbers, is saved once.
      exportLists([{ name: list.name, targetIds: [...new Set(list.targets.map((t) => t.id))] }]),
      exportFileName(list.name),
    );
  }

  /**
   * A copy of one of the app's lists, as the user's own, so it can be edited. It asks for
   * a name first, offering the original's: left empty, the copy keeps the original's name.
   */
  private async copy(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const alert = await this.alerts.create({
      header: 'Name the copy',
      inputs: [{ name: 'name', type: 'text', value: list.name, attributes: { 'data-testid': 'copy-name' } }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Copy',
          handler: ({ name }: { name: string }) => {
            const id = this.lists.create(name.trim() || list.name);
            // A target listed twice, under two numbers, is added once: a second toggle would remove it.
            for (const targetId of new Set(list.targets.map((t) => t.id))) this.lists.toggle(id, targetId);
            void this.router.navigateByUrl(`/tabs/lists/${id}`, { replaceUrl: true });
          },
        },
      ],
    });
    await alert.present();
  }

  private async rename(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const alert = await this.alerts.create({
      header: 'Rename list',
      inputs: [{ name: 'name', type: 'text', value: list.name }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Rename', handler: ({ name }: { name: string }) => this.lists.rename(list.id, name) },
      ],
    });
    await alert.present();
  }

  private async delete(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const alert = await this.alerts.create({
      header: 'Delete this list?',
      message: `“${list.name}” and its ${list.targets.length} bookmarks will be removed. The targets themselves stay in the catalogue.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.lists.delete(list.id);
            void this.router.navigateByUrl('/tabs/lists', { replaceUrl: true });
          },
        },
      ],
    });
    await alert.present();
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toasts.create({ message, duration: 3000, position: 'top', cssClass: 'af-toast' });
    await toast.present();
  }
}
