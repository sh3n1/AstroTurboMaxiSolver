import { Component, inject } from '@angular/core';
import {
  IonButton,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonListHeader,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, createOutline, trashOutline } from 'ionicons/icons';

import { AppState } from '../app-state.service';
import type { KitItem, KitKind } from '../equipment';
import { kitItemDetail, kitItemLabel } from '../equipment';
import { EquipmentEditorComponent } from '../equipment-editor.component';
import { listToastPlace } from '../list-toast';

import { SETTINGS_SECTION_STYLES } from './settings-styles';

/** The user's telescopes, eyepieces, Barlows and filters, as a section of Settings. */
@Component({
  selector: 'app-settings-equipment',
  imports: [IonButton, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonListHeader],
  styles: [SETTINGS_SECTION_STYLES],
  template: `
    <ion-list inset="true" id="equipment" data-testid="equipment">
      <ion-list-header>Equipment</ion-list-header>
      @for (group of kitGroups; track group.kind) {
        <ion-item-divider>{{ group.title }}</ion-item-divider>
        @let items = kitItems(group.kind);
        @for (item of items; track item.id) {
          <ion-item data-testid="kit-item">
            <ion-label class="ion-text-wrap">
              <h2>{{ itemLabel(group.kind, item) }}</h2>
              @if (itemDetail(group.kind, item); as detail) {
                <p>{{ detail }}</p>
              }
            </ion-label>
            <ion-button
              slot="end"
              fill="clear"
              data-testid="kit-edit"
              [attr.aria-label]="'Edit ' + itemLabel(group.kind, item)"
              (click)="editKit(group.kind, item)"
            >
              <ion-icon slot="icon-only" name="create-outline" aria-hidden="true"></ion-icon>
            </ion-button>
            <!-- In plain sight. The last telescope or eyepiece stays: the views need one. -->
            <ion-button
              slot="end"
              fill="clear"
              color="danger"
              data-testid="kit-delete"
              [attr.aria-label]="'Delete ' + itemLabel(group.kind, item)"
              [disabled]="group.required && items.length === 1"
              (click)="removeKit(group.kind, item)"
            >
              <ion-icon slot="icon-only" name="trash-outline" aria-hidden="true"></ion-icon>
            </ion-button>
          </ion-item>
        }
        <ion-item button detail="false" [attr.data-testid]="'kit-add-' + group.kind" (click)="editKit(group.kind)">
          <ion-icon slot="start" name="add" aria-hidden="true"></ion-icon>
          <ion-label>Add</ion-label>
        </ion-item>
      }
    </ion-list>
  `,
})
export class SettingsEquipmentComponent {
  private readonly state = inject(AppState);
  private readonly modals = inject(ModalController);
  private readonly toasts = inject(ToastController);

  /** The kinds of equipment, in the order a setup is put together. */
  protected readonly kitGroups: readonly { kind: KitKind; title: string; required: boolean }[] = [
    { kind: 'telescopes', title: 'Telescopes', required: true },
    { kind: 'eyepieces', title: 'Eyepieces', required: true },
    { kind: 'modifiers', title: 'Barlows and reducers', required: false },
    { kind: 'filters', title: 'Filters', required: false },
  ];
  protected readonly itemLabel = kitItemLabel;
  protected readonly itemDetail = kitItemDetail;

  protected kitItems(kind: KitKind): readonly KitItem[] {
    return this.state.kit()[kind];
  }

  /** Adds an item, or changes one, in a sheet. Saved only when the sheet's tick is tapped. */
  protected async editKit(kind: KitKind, item?: KitItem): Promise<void> {
    const sheet = await this.modals.create({ component: EquipmentEditorComponent, componentProps: { kind, item } });
    await sheet.present();
    const { data, role } = await sheet.onWillDismiss<KitItem>();
    if (role === 'save' && data) this.state.saveKitItem(kind, data);
  }

  /** Deletes an item at once, with Undo in the message, which puts the kit back as it was. */
  protected async removeKit(kind: KitKind, item: KitItem): Promise<void> {
    const { kitSelection } = this.state.settings();
    if (!this.state.removeKitItem(kind, item.id)) return;
    const toast = await this.toasts.create({
      message: `Deleted ${kitItemLabel(kind, item)}`,
      duration: 5000,
      ...listToastPlace(),
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': 'kit-deleted-toast' },
      buttons: [{ text: 'Undo', handler: () => this.state.restoreKitItem(kind, item, kitSelection) }],
    });
    await toast.present();
  }

  constructor() {
    addIcons({ add, createOutline, trashOutline });
  }
}
