import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonButton, IonIcon, IonModal } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircleOutline, downloadOutline, shareOutline } from 'ionicons/icons';

import { InstallService } from './install.service';

/**
 * The steps to install on iPhones and iPads, which have no install button, in a card. The
 * map's Install button and the menu's Install tile open it there.
 */
@Component({
  selector: 'app-install-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonIcon, IonModal],
  styles: `
    :host {
      display: contents;
    }
    .steps {
      padding: 8px 20px 20px;
      color: var(--af-text);
      /* On a phone on its side the card may be taller than the screen: it scrolls. */
      max-height: calc(100vh - 32px);
      overflow-y: auto;
    }
    .steps h2 {
      font-size: calc(20px * var(--af-scale, 1));
    }
    .steps ol {
      padding-left: 0;
      list-style: none;
    }
    .steps li {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 14px 0;
      font-size: calc(17px * var(--af-scale, 1));
    }
    .steps li ion-icon {
      flex: none;
      font-size: 28px;
      color: var(--ion-color-primary);
    }
  `,
  template: `
    <!-- iPhones and iPads have no install button: the app is added from the Share menu. -->
    <!-- A card in the middle, as tall as its steps: see .install-steps-modal in global.scss. -->
    <ion-modal
      cssClass="install-steps-modal"
      [isOpen]="install.stepsOpen()"
      (didDismiss)="install.stepsOpen.set(false)"
    >
      <ng-template>
        <div class="steps" data-testid="install-steps">
          <h2>Install on iPhone or iPad</h2>
          <ol>
            <li>
              <ion-icon name="share-outline" aria-hidden="true"></ion-icon>
              <span>Tap <strong>Share</strong> in Safari's bar</span>
            </li>
            <li>
              <ion-icon name="add-circle-outline" aria-hidden="true"></ion-icon>
              <span>Choose <strong>Add to Home Screen</strong>. Scroll down if you don't see it.</span>
            </li>
            <li>
              <ion-icon name="download-outline" aria-hidden="true"></ion-icon>
              <span>Tap <strong>Add</strong>, then open the app from the home screen</span>
            </li>
          </ol>
          <ion-button expand="block" data-testid="install-steps-close" (click)="install.stepsOpen.set(false)">
            OK
          </ion-button>
        </div>
      </ng-template>
    </ion-modal>
  `,
})
export class InstallNoticeComponent {
  protected readonly install = inject(InstallService);

  constructor() {
    addIcons({ addCircleOutline, downloadOutline, shareOutline });
  }
}
