import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { playSkipBack, playSkipForward } from 'ionicons/icons';

import { PlaylistService } from '../lists/playlist.service';

/**
 * The playlist's row at the top of the sky map's target box, while observing through a
 * list: big buttons to go back and forward through it, as in a music player, and between
 * them where in the list the target is. Tapping that opens the list again.
 */
@Component({
  selector: 'app-playlist-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonIcon],
  styles: `
    :host {
      display: flex;
      align-items: center;
      margin: -2px 0 4px -8px;
      border-bottom: 1px solid var(--af-edge);
    }
    /* Big enough to find in the dark at arm's length. */
    .step {
      flex: none;
      margin: 0;
      height: 52px;
      --padding-start: 12px;
      --padding-end: 12px;
      font-size: 22px;
      --color: var(--af-text);
    }
    .name {
      flex: 1;
      min-width: 0;
      display: flex;
      justify-content: center;
      align-items: baseline;
      gap: 8px;
      padding: 0 4px;
      border: none;
      background: none;
      color: var(--af-text);
      font: inherit;
      font-size: calc(16px * var(--af-scale, 1));
      font-weight: 600;
    }
    .position {
      white-space: nowrap;
    }
    .title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--af-muted);
      font-weight: 400;
    }
  `,
  template: `
    @if (playlist.playlist(); as current) {
      <ion-button
        fill="clear"
        class="step"
        aria-label="Previous target"
        data-testid="playlist-previous"
        [disabled]="playlist.previousIndex() === null"
        (click)="playlist.previous()"
      >
        <ion-icon slot="icon-only" name="play-skip-back" aria-hidden="true"></ion-icon>
      </ion-button>
      <button type="button" class="name" data-testid="playlist-name" (click)="openList()">
        <span class="position" data-testid="playlist-position"
          >{{ playlist.index() + 1 }}/{{ current.ids.length }}</span
        >
        <span class="title">{{ current.name }}</span>
      </button>
      <ion-button
        fill="clear"
        class="step"
        aria-label="Next target"
        data-testid="playlist-next"
        [disabled]="playlist.nextIndex() === null"
        (click)="playlist.next()"
      >
        <ion-icon slot="icon-only" name="play-skip-forward" aria-hidden="true"></ion-icon>
      </ion-button>
    }
  `,
})
export class PlaylistBarComponent {
  protected readonly playlist = inject(PlaylistService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ playSkipBack, playSkipForward });
  }

  /** Back to the list being observed through, where it was left. */
  protected openList(): void {
    const from = this.playlist.playlist()?.from;
    if (from) void this.router.navigateByUrl(from);
  }
}
