import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonButton, IonIcon, IonModal } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircleOutline, close, downloadOutline, shareOutline } from 'ionicons/icons';

import { InstallService } from './install.service';

/**
 * The notice offering to install the app, over the top of the map, until the user installs
 * it or says "not now". On iPhones and iPads it opens the steps, in a sheet that the menu's
 * Install tile opens too.
 */
@Component({
  selector: 'app-install-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonIcon, IonModal],
  styles: `
    :host {
      display: contents;
    }
    .notice {
      position: absolute;
      /* Below the pointing readout, and clear of the zoom buttons on the right. */
      top: calc(72px + var(--ion-safe-area-top, 0px));
      left: 10px;
      right: calc(70px + var(--ion-safe-area-right, 0px));
      max-width: 420px;
      z-index: 22;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 4px 4px 12px;
      border: 1px solid var(--af-edge);
      border-radius: 12px;
      background: var(--af-overlay);
      color: var(--af-text);
      font-size: calc(16px * var(--af-scale, 1));
    }
    /* With the phone on its side, bottom right, where nothing else is, clear of the rings. */
    @media (orientation: landscape) and (max-height: 520px) {
      .notice {
        top: auto;
        left: auto;
        bottom: calc(10px + var(--ion-safe-area-bottom, 0px));
        right: calc(10px + var(--ion-safe-area-right, 0px));
      }
    }
    .notice span {
      flex: 1;
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
    @if (install.offered()) {
      <div class="notice" data-testid="install-notice" role="status">
        <span>Install the app</span>
        <ion-button size="small" data-testid="install-app" (click)="install.install()">Install</ion-button>
        <ion-button
          fill="clear"
          size="small"
          aria-label="Not now"
          data-testid="install-dismiss"
          (click)="install.dismiss()"
        >
          <ion-icon slot="icon-only" name="close" aria-hidden="true"></ion-icon>
        </ion-button>
      </div>
    }

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
    addIcons({ addCircleOutline, close, downloadOutline, shareOutline });
  }
}
