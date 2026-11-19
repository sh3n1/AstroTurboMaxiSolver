import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
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
  IonText,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  copyOutline,
  createOutline,
  ellipsisVertical,
  reorderThreeOutline,
  saveOutline,
  shareSocialOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons';
import { map } from 'rxjs';

import { AppState } from '../core/app-state.service';
import { NumPipe } from '../core/i18n/i18n-pipes';
import { t, tn } from '../core/i18n/t';
import { ListRowsComponent } from '../core/lists/list-rows.component';
import { ListToolsComponent } from '../core/lists/list-tools.component';
import { ListViewService } from '../core/lists/list-view.service';
import { ListsService } from '../core/lists/lists.service';
import { programFor } from '../core/lists/observing-programs';
import { ProgramCardComponent } from '../core/lists/program-card.component';
import { exportFileName, exportLists } from '../core/lists/target-lists';
import { ObservingLogService } from '../core/log/observing-log.service';

/**
 * One list of targets: a catalogue, a collection or one of the user's own. It has the same
 * tools, orders, filters and rows as the search. The user's own lists can also be
 * renamed, deleted and put in order by hand, and their rows removed.
 */
@Component({
  selector: 'app-list',
  // Everything shown comes from signals, so the page is checked only when one changes,
  // not each time the sky map behind it updates.
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    ProgramCardComponent,
    NumPipe,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
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
    /* How much of the list has been seen: a ring filling in green, the count beside it. */
    .progress {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      padding: 12px 16px 8px;
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
        <ion-title data-testid="list-title">{{ list()?.name ?? ('lists.list' | translate) }}</ion-title>
        @if (list(); as current) {
          <ion-buttons slot="end">
            @if (view.editing()) {
              <!-- Reordering by hand: the rows have handles until this is tapped. -->
              <ion-button data-testid="reorder-done" (click)="view.editing.set(false)">{{
                'common.done' | translate
              }}</ion-button>
            } @else {
              <!-- Opens the time control: the heights and the order follow the time chosen. -->
              <ion-button
                [attr.aria-label]="'lists.changeTime' | translate"
                data-testid="list-change-time"
                [class.warn]="state.planning()"
                (click)="state.timeControlOpen.set(true)"
              >
                <ion-icon slot="icon-only" name="time-outline" aria-hidden="true"></ion-icon>
              </ion-button>
              <ion-button [attr.aria-label]="'lists.share' | translate" data-testid="share-list" (click)="share()">
                <ion-icon slot="icon-only" name="share-social-outline" aria-hidden="true"></ion-icon>
              </ion-button>
              <ion-button
                [attr.aria-label]="'lists.moreActions' | translate"
                data-testid="list-actions"
                (click)="actions()"
              >
                <ion-icon slot="icon-only" name="ellipsis-vertical" aria-hidden="true"></ion-icon>
              </ion-button>
            }
          </ion-buttons>
        }
      </ion-toolbar>
      @if (!view.editing()) {
        <ion-toolbar>
          <app-list-tools></app-list-tools>
        </ion-toolbar>
      }
    </ion-header>

    <ion-content>
      @if (list(); as current) {
        <!-- A club's or society's observing programme: what it is, and a link to its own page. -->
        @if (program(); as programme) {
          <app-program-card [program]="programme"></app-program-card>
        }
        @if (current.id === 'reticle') {
          <!-- Where the reticle is, since this list follows it. -->
          <ion-card>
            <ion-card-content data-testid="reticle-centre">
              <p>
                <strong>{{ 'lists.around' | translate }}</strong>
                {{
                  'readout.altAz'
                    | translate
                      : {
                          alt: (state.pointing().altDeg | num: '1.0-0'),
                          az: (state.pointing().azDeg | num: '1.0-0'),
                        }
                }}
              </p>
            </ion-card-content>
          </ion-card>
        }

        @if (showProgress() && !view.editing()) {
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
              ><strong>{{ progress().seen }}</strong>
              {{ 'lists.ofSeen' | translate: { total: progress().total } }}</span
            >
          </div>
        }

        <app-list-rows [ownListId]="current.kind === 'fixed' ? null : current.id">
          <ion-text color="medium">
            <p class="ion-padding" data-testid="list-empty">
              @if (view.query()) {
                {{ 'lists.empty.search' | translate }}
              } @else if (current.targets.length > 0) {
                <!-- The list has targets, so the filters are what hide them. -->
                @if (view.seen() === 'seen') {
                  {{ 'lists.empty.noneSeen' | translate }}
                } @else if (view.seen() === 'todo' && view.activeFilters().length === 1) {
                  {{ 'lists.empty.allSeen' | translate }}
                } @else {
                  {{ 'lists.empty.filtered' | translate }}
                }
              } @else if (current.id === 'reticle') {
                {{ 'lists.empty.reticle' | translate }}
              } @else if (current.kind === 'fixed') {
                {{ 'lists.empty.notPlaced' | translate }}
              } @else {
                {{ 'lists.empty.mine' | translate }}
              }
            </p>
          </ion-text>
        </app-list-rows>
      } @else {
        <p class="ion-padding">{{ 'lists.gone' | translate }}</p>
      }
    </ion-content>
  `,
})
export class ListPage {
  private readonly tools = viewChild(ListToolsComponent);

  /** Each time the list comes on show, the search is ready to type in. */
  ionViewDidEnter(): void {
    this.tools()?.focusSearch();
  }

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly lists = inject(ListsService);
  protected readonly state = inject(AppState);
  private readonly alerts = inject(AlertController);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly toasts = inject(ToastController);

  private readonly log = inject(ObservingLogService);
  /** This page's own search, order and filters, shared with its tools and rows. */
  protected readonly view = inject(ListViewService);

  private readonly id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), {
    initialValue: '',
  });

  /** The list on show. Reads the lists, so it updates when they change. */
  /** The observing programme the list comes from, if it is one. */
  protected readonly program = computed(() => programFor(this.id()));
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

  constructor() {
    addIcons({
      copyOutline,
      createOutline,
      ellipsisVertical,
      reorderThreeOutline,
      saveOutline,
      shareSocialOutline,
      timeOutline,
      trashOutline,
    });
    this.view.configure({
      key: () => this.id(),
      rows: () => this.list()?.targets ?? [],
      title: () => this.list()?.name ?? 'List',
      ownOrder: () => {
        const list = this.list();
        if (list?.id === 'now') return t('lists.sorts.bestFirst');
        if (list?.id === 'reticle') return t('lists.sorts.nearestCentre');
        return t(list?.kind === 'fixed' ? 'lists.sorts.catalogue' : 'lists.sorts.mine');
      },
      // Inside the reticle, the list's own order is already the nearest first.
      withoutSorts: () => (this.id() === 'reticle' ? ['nearest'] : []),
    });
  }

  /** Reordering ends when the page is left, so coming back shows the list as usual. */
  ionViewWillLeave(): void {
    this.view.editing.set(false);
  }

  protected async share(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const result = await this.lists.share(list);
    // Without a share sheet, the list is copied as text, which "Import pasted text" reads.
    if (result === 'copied') void this.toast(t('lists.copied'));
    if (result === 'unavailable') void this.toast(t('lists.noSharing'));
  }

  /**
   * What can be done with this list. The app's own lists can only be shared or copied.
   * Saved for later keeps its name and can't be deleted: only what's in it changes.
   */
  protected async actions(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const buttons: { text: string; icon?: string; role?: string; handler?: () => void }[] = [
      { text: t('lists.saveFile'), icon: 'save-outline', handler: () => this.saveFile() },
    ];
    if (list.kind === 'fixed') {
      buttons.push({ text: t('lists.makeCopy'), icon: 'copy-outline', handler: () => void this.copy() });
    }
    if (list.kind !== 'fixed' && list.targets.length > 1) {
      buttons.push({
        text: t('lists.reorder'),
        icon: 'reorder-three-outline',
        handler: () => this.view.editing.set(true),
      });
    }
    if (list.kind === 'custom') {
      buttons.push({ text: t('lists.rename'), icon: 'create-outline', handler: () => void this.rename() });
      buttons.push({
        text: t('lists.deleteList'),
        icon: 'trash-outline',
        role: 'destructive',
        handler: () => void this.delete(),
      });
    }
    buttons.push({ text: t('common.cancel'), role: 'cancel' });
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
      header: t('lists.nameCopy'),
      inputs: [{ name: 'name', type: 'text', value: list.name, attributes: { 'data-testid': 'copy-name' } }],
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('lists.copy'),
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
      header: t('lists.renameList'),
      inputs: [{ name: 'name', type: 'text', value: list.name }],
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('lists.rename'), handler: ({ name }: { name: string }) => this.lists.rename(list.id, name) },
      ],
    });
    await alert.present();
  }

  private async delete(): Promise<void> {
    const list = this.list();
    if (!list) return;
    const alert = await this.alerts.create({
      header: t('lists.deleteQuestion'),
      message: tn('lists.deleteMessage', list.targets.length, { name: list.name }),
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('common.delete'),
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
