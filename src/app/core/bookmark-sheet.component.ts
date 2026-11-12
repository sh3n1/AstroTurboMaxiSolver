import { Component, inject } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, close } from 'ionicons/icons';

import { designationText } from './designations';
import { ListsService } from './lists.service';
import type { Target } from './targets';

/**
 * Chooses which of the user's lists a target is in. Opens as a sheet from the bookmark
 * icon. Each tick saves at once, so there is nothing to confirm.
 */
@Component({
  selector: 'app-bookmark-sheet',
  imports: [
    IonButton,
    IonButtons,
    IonCheckbox,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonTitle,
    IonToolbar,
  ],
  styles: `
    ion-checkbox::part(label) {
      white-space: normal;
    }
    .new-list ion-icon {
      color: var(--ion-color-primary);
      margin-inline-end: 16px;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Save {{ title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button data-testid="bookmark-done" aria-label="Close" (click)="close()">
            <ion-icon slot="icon-only" name="close" aria-hidden="true"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <ion-list>
        @for (list of lists.userLists(); track list.id) {
          <ion-item>
            <ion-checkbox
              justify="space-between"
              data-testid="bookmark-list"
              [checked]="lists.contains(list.id, target.id)"
              (ionChange)="lists.toggle(list.id, target.id)"
            >
              {{ list.name }}
            </ion-checkbox>
          </ion-item>
        }
        <ion-item button detail="false" class="new-list" data-testid="bookmark-new-list" (click)="newList()">
          <ion-icon slot="start" name="add" aria-hidden="true"></ion-icon>
          <ion-label>New list</ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class BookmarkSheetComponent {
  /** Set by the modal from its componentProps, before the sheet first draws. */
  target!: Target;

  protected readonly lists = inject(ListsService);
  private readonly modals = inject(ModalController);
  private readonly alerts = inject(AlertController);

  constructor() {
    addIcons({ add, close });
  }

  protected title(): string {
    return designationText(this.target);
  }

  protected close(): void {
    void this.modals.dismiss();
  }

  /** Asks for a name, makes the list and puts the target straight in it. */
  protected async newList(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'New list',
      inputs: [{ name: 'name', type: 'text', placeholder: 'For example, Spring galaxies' }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Create',
          handler: ({ name }: { name: string }) => {
            const id = this.lists.create(name);
            this.lists.toggle(id, this.target.id);
          },
        },
      ],
    });
    await alert.present();
  }
}
