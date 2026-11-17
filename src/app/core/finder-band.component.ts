import { Component, inject } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, expandOutline, phoneLandscapeOutline } from 'ionicons/icons';

import { AppState } from './app-state.service';
import { FullscreenService } from './fullscreen.service';
import { RemoteService } from './remote.service';
import { SensorService } from './sensor.service';

/**
 * The finder phone's footer while linked to a screen phone, in place of the time band
 * and the tabs. It says the phone is in remote mode, and its cross ends that. If the
 * sensors aren't running, as when a phone needs a tap before it allows them, the words
 * start them.
 */
@Component({
  selector: 'app-finder-band',
  imports: [IonButton, IonIcon],
  styles: `
    :host {
      display: block;
      background: rgb(var(--af-surface-rgb) / 94%);
      color: var(--af-text);
      border-top: 2px solid var(--ion-color-primary);
      border-bottom: 2px solid var(--ion-color-primary);
    }
    .band {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 4px 2px 12px;
      min-height: 48px;
    }
    .band-text {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: calc(15px * var(--af-scale));
      font-weight: 600;
      color: var(--af-text);
      background: none;
      border: none;
      text-align: start;
      padding: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Amber, like the time band's clock: the map isn't for using on this phone now. */
    .band-text ion-icon {
      flex: none;
      font-size: 24px;
      color: var(--ion-color-warning);
    }
  `,
  template: `
    <div class="band" data-testid="finder-band" [attr.data-steering]="state.sensorsActive()">
      @if (remote.fullscreenWanted() && !fullscreen.active()) {
        <!-- The screen phone went full screen: the browser needs a tap here, anywhere, to follow. -->
        <button
          class="band-text"
          type="button"
          data-testid="finder-fullscreen"
          (click)="remote.enterWantedFullscreen()"
        >
          <ion-icon name="expand-outline" aria-hidden="true"></ion-icon>
          <span>Tap for full screen</span>
        </button>
      } @else if (state.sensorsActive()) {
        <span class="band-text">
          <ion-icon name="phone-landscape-outline" aria-hidden="true"></ion-icon>
          <span>Finder · remote mode</span>
        </span>
      } @else {
        <button class="band-text" type="button" data-testid="finder-start-sensors" (click)="sensors.start()">
          <ion-icon name="phone-landscape-outline" aria-hidden="true"></ion-icon>
          <span>Finder · tap to start sensors</span>
        </button>
      }
      <ion-button fill="clear" data-testid="finder-exit" aria-label="Exit remote mode" (click)="remote.disconnect()">
        <ion-icon slot="icon-only" name="close" aria-hidden="true"></ion-icon>
      </ion-button>
    </div>
  `,
})
export class FinderBandComponent {
  protected readonly state = inject(AppState);
  protected readonly remote = inject(RemoteService);
  protected readonly sensors = inject(SensorService);
  protected readonly fullscreen = inject(FullscreenService);

  constructor() {
    addIcons({ close, expandOutline, phoneLandscapeOutline });
  }
}
