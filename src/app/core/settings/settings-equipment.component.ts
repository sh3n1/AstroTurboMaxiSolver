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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { add, createOutline, trashOutline } from 'ionicons/icons';

import { AppState } from '../app-state.service';
import type { KitItem, KitKind } from '../equipment/equipment';
import { kitItemDetail, kitItemLabel } from '../equipment/equipment';
import { EquipmentEditorComponent } from '../equipment/equipment-editor.component';
import { listToastPlace } from '../lists/list-toast';

import { SETTINGS_SECTION_STYLES } from './settings-styles';

/** The user's telescopes, eyepieces, Barlows and filters, as a section of Settings. */
@Component({
  selector: 'app-settings-equipment',
  imports: [TranslatePipe, IonButton, IonIcon, IonItem, IonItemDivider, IonLabel, IonList, IonListHeader],
  styles: [SETTINGS_SECTION_STYLES],
  template: `
    <ion-list inset="true" id="equipment" data-testid="equipment">
      <ion-list-header>{{ 'settings.equipment' | translate }}</ion-list-header>
      @for (group of kitGroups; track group.kind) {
        <ion-item-divider>{{ group.title | translate }}</ion-item-divider>
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
              [attr.aria-label]="'common.editItem' | translate: { name: itemLabel(group.kind, item) }"
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
              [attr.aria-label]="'common.deleteItem' | translate: { name: itemLabel(group.kind, item) }"
              [disabled]="group.required && items.length === 1"
              (click)="removeKit(group.kind, item)"
            >
              <ion-icon slot="icon-only" name="trash-outline" aria-hidden="true"></ion-icon>
            </ion-button>
          </ion-item>
        }
        <ion-item button detail="false" [attr.data-testid]="'kit-add-' + group.kind" (click)="editKit(group.kind)">
          <ion-icon slot="start" name="add" aria-hidden="true"></ion-icon>
          <ion-label>{{ 'common.add' | translate }}</ion-label>
        </ion-item>
      }
    </ion-list>
  `,
})
export class SettingsEquipmentComponent {
  private readonly state = inject(AppState);
  private readonly modals = inject(ModalController);
  private readonly toasts = inject(ToastController);
  private readonly translate = inject(TranslateService);

  /** The kinds of equipment, in the order a setup is put together. */
  protected readonly kitGroups: readonly { kind: KitKind; title: string; required: boolean }[] = [
    { kind: 'telescopes', title: 'equipment.groups.telescopes', required: true },
    { kind: 'eyepieces', title: 'equipment.groups.eyepieces', required: true },
    { kind: 'modifiers', title: 'equipment.groups.modifiers', required: false },
    { kind: 'filters', title: 'equipment.groups.filters', required: false },
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
      message: this.translate.instant('common.deletedItem', { name: kitItemLabel(kind, item) }) as string,
      duration: 5000,
      ...listToastPlace(),
      cssClass: 'af-toast',
      htmlAttributes: { 'data-testid': 'kit-deleted-toast' },
      buttons: [
        {
          text: this.translate.instant('common.undo') as string,
          handler: () => this.state.restoreKitItem(kind, item, kitSelection),
        },
      ],
    });
    await toast.present();
  }

  constructor() {
    addIcons({ add, createOutline, trashOutline });
  }
}
