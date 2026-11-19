import { Component } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';

import { SettingsEquipmentComponent } from '../core/settings/settings-equipment.component';

/**
 * The user's telescopes, eyepieces, Barlows and filters, on a page of their own inside
 * Settings. The eyepiece view's Edit equipment opens it straight away.
 */
@Component({
  selector: 'app-equipment',
  imports: [
    TranslatePipe,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    SettingsEquipmentComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button
            defaultHref="/tabs/settings"
            text=""
            [attr.aria-label]="'common.back' | translate"
          ></ion-back-button>
        </ion-buttons>
        <ion-title>{{ 'settings.equipment' | translate }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-settings-equipment />
    </ion-content>
  `,
})
export class EquipmentPage {}
