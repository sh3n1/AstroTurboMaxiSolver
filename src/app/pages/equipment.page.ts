import { Component } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { SettingsEquipmentComponent } from '../core/settings/settings-equipment.component';

/**
 * The user's telescopes, eyepieces, Barlows and filters, on a page of their own inside
 * Settings. The eyepiece view's Edit equipment opens it straight away.
 */
@Component({
  selector: 'app-equipment',
  imports: [IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, SettingsEquipmentComponent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/settings" text="" aria-label="Back"></ion-back-button>
        </ion-buttons>
        <ion-title>Equipment</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-settings-equipment />
    </ion-content>
  `,
})
export class EquipmentPage {}
