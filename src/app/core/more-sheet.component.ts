import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  contractOutline,
  expandOutline,
  listOutline,
  locateOutline,
  moonOutline,
  phoneLandscapeOutline,
  settingsOutline,
  timeOutline,
} from 'ionicons/icons';

import { AppState } from './app-state.service';
import { FullscreenService } from './fullscreen.service';

/**
 * What the sky map's More button opens: big tiles with words, over the map, for what is
 * needed less often at the telescope than the round buttons. A tap on a tile does its job
 * and closes the sheet, and so does a tap beside it. It lies over the sky page's stage,
 * which places it.
 */
@Component({
  selector: 'app-more-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  styles: `
    /* The backdrop and the sheet are placed on the map's stage, not in a box of their own. */
    :host {
      display: contents;
    }
    /* Taps outside the sheet close it. */
    .backdrop {
      position: absolute;
      inset: 0;
      z-index: 20;
      background: rgb(0 0 0 / 40%);
    }
    .sheet {
      position: absolute;
      left: 10px;
      right: 10px;
      bottom: calc(10px + var(--af-tab-bar-height, 0px));
      z-index: 21;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
      gap: 8px;
      padding: 10px;
      border: 1px solid #232a3d;
      border-radius: 16px;
      background: rgb(10 14 28 / 97%);
    }
    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 84px;
      padding: 8px;
      border: 1px solid #232a3d;
      border-radius: 12px;
      background: #141a2c;
      color: var(--af-text);
      font: inherit;
      font-size: calc(16px * var(--af-scale, 1));
      font-weight: 600;
    }
    .tile ion-icon {
      font-size: 30px;
    }
    .tile.warn ion-icon {
      color: var(--ion-color-warning);
    }
    .tile.good ion-icon {
      color: var(--ion-color-success);
    }
    /* A switch that is on, such as night mode, has a lit frame. */
    .tile[aria-pressed='true'] {
      border-color: var(--ion-color-primary);
    }
  `,
  template: `
    <div class="backdrop" aria-hidden="true" (click)="closed.emit()"></div>
    <div class="sheet" data-testid="more-sheet" role="group" aria-label="More">
      <button type="button" class="tile" data-testid="open-lists" (click)="openLists()">
        <ion-icon name="list-outline" aria-hidden="true"></ion-icon>
        Lists
      </button>
      <!-- Green once aligned, amber until then, and says if it was only rough. -->
      <button
        type="button"
        class="tile"
        data-testid="alignment-status"
        [class.good]="state.alignment()"
        [class.warn]="!state.alignment()"
        (click)="go('/align')"
      >
        <ion-icon name="locate-outline" aria-hidden="true"></ion-icon>
        @if (state.alignment(); as alignment) {
          Aligned: {{ alignment.starId }}{{ alignment.method === 'plate-solve' ? '' : ', rough' }}
        } @else {
          Not aligned
        }
      </button>
      <button
        type="button"
        class="tile"
        data-testid="night-toggle"
        [attr.aria-pressed]="state.settings().nightMode"
        (click)="toggleNight()"
      >
        <ion-icon name="moon-outline" aria-hidden="true"></ion-icon>
        Night
      </button>
      <!-- Amber while the map shows another time. -->
      <button type="button" class="tile" data-testid="open-time" [class.warn]="state.planning()" (click)="openTime()">
        <ion-icon name="time-outline" aria-hidden="true"></ion-icon>
        Time
      </button>
      <!-- Full screen hides the browser bars. Not offered where the browser can't, as on iPhones. -->
      @if (fullscreen.supported) {
        <button
          type="button"
          class="tile"
          data-testid="fullscreen-toggle"
          [attr.aria-pressed]="fullscreen.active()"
          (click)="toggleFullscreen()"
        >
          <ion-icon [name]="fullscreen.active() ? 'contract-outline' : 'expand-outline'" aria-hidden="true"></ion-icon>
          Full screen
        </button>
      }
      <button type="button" class="tile" data-testid="more-remote" (click)="go('/remote')">
        <ion-icon name="phone-landscape-outline" aria-hidden="true"></ion-icon>
        Two phones
      </button>
      <button type="button" class="tile" data-testid="open-settings" (click)="go('/tabs/settings')">
        <ion-icon name="settings-outline" aria-hidden="true"></ion-icon>
        Settings
      </button>
    </div>
  `,
})
export class MoreSheetComponent {
  /** A tile was tapped, or the map beside the sheet: the sky page closes it. */
  readonly closed = output<void>();

  protected readonly state = inject(AppState);
  protected readonly fullscreen = inject(FullscreenService);
  private readonly router = inject(Router);
  /** The tabs holding the pages, which remember where each was left. */
  private readonly tabs = inject(IonTabs, { optional: true });

  constructor() {
    addIcons({
      contractOutline,
      expandOutline,
      listOutline,
      locateOutline,
      moonOutline,
      phoneLandscapeOutline,
      settingsOutline,
      timeOutline,
    });
  }

  protected go(url: string): void {
    this.closed.emit();
    void this.router.navigateByUrl(url);
  }

  /**
   * Back to the page of Lists left last, such as a search or one list, with its search and
   * scroll as they were: Ionic's tabs keep each tab's pages, and selecting it goes back.
   */
  protected openLists(): void {
    this.closed.emit();
    if (this.tabs) void this.tabs.select('lists');
    else void this.router.navigateByUrl('/tabs/lists');
  }

  /** Opens or closes the time control, to see the sky at another time. */
  protected openTime(): void {
    this.closed.emit();
    this.state.timeControlOpen.set(!this.state.timeControlOpen());
  }

  protected toggleNight(): void {
    this.closed.emit();
    this.state.updateSettings({ nightMode: !this.state.settings().nightMode });
  }

  protected toggleFullscreen(): void {
    this.closed.emit();
    void this.fullscreen.toggle();
  }
}
