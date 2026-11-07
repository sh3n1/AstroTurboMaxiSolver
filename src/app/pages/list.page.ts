import { DatePipe, DecimalPipe } from '@angular/common';
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
  trashOutline,
} from 'ionicons/icons';
import { map } from 'rxjs';

import { AppState } from '../core/app-state.service';
import { ListsService } from '../core/lists.service';
import { normalizeSearch, targetSearchText } from '../core/search';
import { TargetListComponent } from '../core/target-list.component';
import { exportFileName, exportLists } from '../core/target-lists';

/** One bookmark list, with a search, and for the user's own lists, rename and delete. */
@Component({
  selector: 'app-list',
  imports: [
    DatePipe,
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
    IonText,
    IonTitle,
    IonToolbar,
    TargetListComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/lists" text=""></ion-back-button>
        </ion-buttons>
        <ion-title data-testid="list-title">{{ list()?.name ?? 'List' }}</ion-title>
        @if (list(); as current) {
          <ion-buttons slot="end">
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
        @if (current.id === 'tonight') {
          <!-- Tonight's conditions, which the recommendations below are chosen for. -->
          <ion-card>
            <ion-card-content data-testid="conditions">
              <p>
                <strong>Darkness: </strong>
                @if (conditions().darkFrom; as from) {
                  from {{ from | date: 'HH:mm' }}
                } @else if (conditions().darkUntil) {
                  now
                } @else {
                  no full darkness in the next day
                }
                @if (conditions().darkUntil; as until) {
                  until {{ until | date: 'HH:mm' }}
                }
              </p>
              <p>
                <strong>Moon: </strong>{{ conditions().moonIlluminatedPercent | number: '1.0-0' }}% lit,
                {{ conditions().moonAltDeg > 0 ? 'up now' : 'below the horizon' }}
              </p>
            </ion-card-content>
          </ion-card>
        }

        @if (shown().length > 0) {
          <app-target-list [targets]="shown()" [at]="current.id === 'tonight' ? tonightTime() : null"></app-target-list>
        } @else {
          <ion-text color="medium">
            <p class="ion-padding" data-testid="list-empty">
              @if (query()) {
                Nothing in this list matches your search.
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
  private readonly state = inject(AppState);
  private readonly alerts = inject(AlertController);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly toasts = inject(ToastController);

  protected readonly conditions = this.state.conditions;
  protected readonly tonightTime = this.lists.tonightTime;
  protected readonly query = signal('');

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

  /** The list's targets that match the search, in the list's own order. */
  protected readonly shown = computed(() => {
    const targets = this.list()?.targets ?? [];
    const term = normalizeSearch(this.query());
    return term ? targets.filter((t) => targetSearchText(t).includes(term)) : targets;
  });

  constructor() {
    addIcons({ copyOutline, createOutline, ellipsisVertical, saveOutline, shareSocialOutline, trashOutline });
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
      buttons.push({ text: 'Make an editable copy', icon: 'copy-outline', handler: () => this.copy() });
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
      exportLists([{ name: list.name, targetIds: list.targets.map((t) => t.id) }]),
      exportFileName(list.name),
    );
  }

  /** A copy of one of the app's lists, as the user's own, so it can be edited. */
  private copy(): void {
    const list = this.list();
    if (!list) return;
    const id = this.lists.create(list.name);
    for (const target of list.targets) this.lists.toggle(id, target.id);
    void this.router.navigateByUrl(`/tabs/lists/${id}`, { replaceUrl: true });
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
