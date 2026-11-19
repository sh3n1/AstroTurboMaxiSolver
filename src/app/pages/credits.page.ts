import { Component } from '@angular/core';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';

import { SettingsCreditsComponent } from '../core/settings/settings-credits.component';

/** The credits the data's licences require, on a page of their own inside Settings. */
@Component({
  selector: 'app-credits',
  imports: [
    TranslatePipe,
    IonBackButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    SettingsCreditsComponent,
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
        <ion-title>{{ 'settings.about.credits' | translate }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <app-settings-credits />
    </ion-content>
  `,
})
export class CreditsPage {}
