import { Component } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';

import { SettingsCreditsComponent } from '../core/settings/settings-credits.component';

/** The credits the data's licences require, on a page of their own inside Settings. */
@Component({
  selector: 'app-credits',
  imports: [IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar, SettingsCreditsComponent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/settings" text="" aria-label="Back"></ion-back-button>
        </ion-buttons>
        <ion-title>Data credits</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-settings-credits />
    </ion-content>
  `,
})
export class CreditsPage {}
