import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, eye, eyeOutline, informationCircle, informationCircleOutline, scanOutline } from 'ionicons/icons';

import { AppState } from './app-state.service';
import { designationText } from './designations';
import { countLabel } from './observing-log';
import { ObservingLogService } from './observing-log.service';
import { PlaylistBarComponent } from './playlist-bar.component';
import { PlaylistService } from './playlist.service';
import { SeenActionsService } from './seen-actions.service';
import { SensorService } from './sensor.service';
import { MAX_ALTITUDE_DEG } from './sky-map/sky-style';
import { TargetDetailsComponent } from './target-details.component';
import { TargetGuidanceService } from './target-guidance.service';
import { iconDataUrl, targetIcon } from './target-icons';
import type { Target } from './targets';

/**
 * The selected target's bar on the sky map: the list being played, which way to move the
 * telescope, the target's name, and its buttons: observations, aim, details and clear. With
 * the details open it carries them too. The sky page places it and gives it its box, at the
 * bottom with the phone upright, and as a panel down the left edge with the phone on its
 * side: this lays out what is inside.
 */
@Component({
  selector: 'app-target-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, IonButton, IonIcon, PlaylistBarComponent, TargetDetailsComponent],
  // The sky page's styles tell the bar with its details open from one without.
  host: { '[class.detailed]': 'showDetails()' },
  styles: `
    /* The sky page's rules for the bar's box, and its layout on a phone on its side, win over this. */
    :host {
      display: block;
    }
    /* The text takes what room is left, and the buttons stay together on one line beside it. */
    .bar-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    /*
     * The directions and distance, under the name and the buttons, the box's full width.
     * "Down 15° · Left 24°" is read as one thing, so it never breaks over two lines.
     */
    .guide {
      flex: 1 0 100%;
      order: 1;
    }
    .directions {
      white-space: nowrap;
      color: var(--af-guidance);
      font-size: calc(17px * var(--af-scale, 1));
      font-weight: 600;
    }
    .bar-text {
      flex: 1 1 0;
      min-width: 0;
    }
    .target-icon {
      flex: none;
      font-size: calc(24px * var(--af-scale, 1));
      margin-right: 4px;
      color: var(--ion-color-primary);
    }
    .bar-buttons {
      flex: none;
      display: flex;
      align-items: center;
    }
    /* Seen tonight: the eye fills in, in the green that means done and on target. */
    .bar-buttons .seen {
      --color: var(--ion-color-success);
    }
    /* At night the green would turn a dull dark red: white turns full-strength red instead. */
    :host-context(html.night) .bar-buttons .seen {
      --color: #ffffff;
    }
    /*
     * The eye's count sits on the eye's bottom right corner, as in the lists, so the button
     * keeps the same size and the target's name keeps its room beside it. It lies outside
     * the button, which would clip it, and lets taps through to the button underneath.
     */
    .eye {
      position: relative;
      display: inline-flex;
    }
    .eye .af-count {
      left: calc(50% + 6px);
      top: calc(50% + 1px);
      --af-count-edge: #0a0e1c;
    }
    /* Each part of a line wraps as a whole, never in the middle, like "below the horizon". */
    .keep {
      white-space: nowrap;
    }
    .muted {
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
    }
    /*
     * A phone on its side: the bar is a panel down the left edge, the map's full height, like
     * the card of a car's navigation app: the list being played at the top, as upright, then
     * which way to move, first and largest, then the target, and the buttons at the foot.
     */
    @media (orientation: landscape) and (max-height: 520px) {
      .bar-buttons {
        justify-content: space-between;
      }
      :host > .bar-row {
        flex: 1 0 auto;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-rows: auto auto 1fr;
        grid-template-areas:
          'guide guide'
          'icon text'
          'buttons buttons';
        align-items: center;
      }
      :host > .bar-row .guide {
        grid-area: guide;
        margin-bottom: 6px;
      }
      :host > .bar-row .target-icon {
        grid-area: icon;
      }
      :host > .bar-row .bar-text {
        grid-area: text;
      }
      :host > .bar-row .bar-buttons {
        grid-area: buttons;
        align-self: end;
      }
      /* The instruction, read first and from furthest away. */
      .directions {
        font-size: calc(22px * var(--af-scale, 1));
      }
      /*
       * The list being played stays at the top, as with the phone upright, and stays in
       * view while the details scroll under it.
       */
      app-playlist-bar {
        position: sticky;
        /* The panel's own padding, so nothing scrolls into view above the row. */
        top: -6px;
        z-index: 1;
        margin-top: -6px;
        padding-top: 4px;
        background: #0a0e1c;
      }
      /* Open, the details take the room the panel has, and scroll inside it. */
      :host(.detailed) > .bar-row {
        flex: none;
      }
    }
  `,
  template: `
    @if (state.selectedTarget(); as target) {
      <!--
        Observing through a list: back and forward through it, like a music playlist.
        The middle says where in the list, and opens it.
      -->
      @if (playlist.playing()) {
        <app-playlist-bar data-testid="playlist"></app-playlist-bar>
      }
      <div class="bar-row">
        <!-- The target's own icon, as in the lists. -->
        @if (targetIconUrl(); as icon) {
          <ion-icon class="target-icon" aria-hidden="true" [src]="icon"></ion-icon>
        }
        <div class="bar-text">
          <strong data-testid="target-designations">{{ designationText(target) }}</strong> {{ target.name }}
        </div>
        <!-- Which way to move, on a line of its own the box's full width, never broken. -->
        <div class="guide">
          <div class="directions" data-testid="directions">{{ directions() }}</div>
          <div class="muted" data-testid="guidance">
            <span class="keep">{{ targetDistance() | number: '1.1-1' }}° away</span>
            @if (targetBelowHorizon()) {
              · <span class="keep">below the horizon</span>
            }
          </div>
        </div>
        <div class="bar-buttons">
          <!-- Opens the target's observations, or a blank one. Filled in green once there is any. -->
          <span class="eye" data-testid="mark-seen-wrap">
            <ion-button
              fill="clear"
              size="small"
              data-testid="mark-seen"
              [class.seen]="observed()"
              [attr.aria-label]="
                (observed() ? 'Observations' : 'Log an observation') +
                (seenCount() > 1 ? ', seen ' + seenCount() + ' times' : '')
              "
              (click)="openLog(target)"
            >
              <ion-icon slot="icon-only" aria-hidden="true" [name]="observed() ? 'eye' : 'eye-outline'"></ion-icon>
            </ion-button>
            <!-- Seen more than once, on any night: how many times, on the eye's corner. -->
            @if (seenCount() > 1) {
              <span class="af-count" data-testid="seen-count" aria-hidden="true">{{ countLabel(seenCount()) }}</span>
            }
          </span>
          <!-- Turns the map to the target: a frame closing in on it. -->
          <ion-button
            fill="clear"
            size="small"
            aria-label="Aim at the target"
            data-testid="aim-at-target"
            (click)="aimAtTarget()"
          >
            <ion-icon slot="icon-only" name="scan-outline" aria-hidden="true"></ion-icon>
          </ion-button>
          <ion-button
            fill="clear"
            size="small"
            aria-label="Target details"
            data-testid="target-info"
            [attr.aria-pressed]="showDetails()"
            (click)="showDetails.set(!showDetails())"
          >
            <!-- Filled while the details are open, as the cloud on the time control. -->
            <ion-icon
              slot="icon-only"
              aria-hidden="true"
              [name]="showDetails() ? 'information-circle' : 'information-circle-outline'"
            ></ion-icon>
          </ion-button>
          <ion-button
            fill="clear"
            size="small"
            aria-label="Clear target"
            data-testid="clear-target"
            (click)="clearTarget()"
          >
            <ion-icon slot="icon-only" name="close" aria-hidden="true"></ion-icon>
          </ion-button>
        </div>
      </div>
      @if (showDetails()) {
        <app-target-details data-testid="target-details" [target]="target"></app-target-details>
      }
    }
  `,
})
export class TargetBarComponent {
  protected readonly state = inject(AppState);
  protected readonly playlist = inject(PlaylistService);
  private readonly sensors = inject(SensorService);
  private readonly seenActions = inject(SeenActionsService);
  private readonly log = inject(ObservingLogService);
  private readonly guidance = inject(TargetGuidanceService);

  protected readonly designationText = designationText;
  protected readonly countLabel = countLabel;
  protected readonly directions = this.guidance.directions;
  protected readonly targetDistance = this.guidance.distanceDeg;
  protected readonly targetBelowHorizon = this.guidance.belowHorizon;
  /** Whether the target's details are open under its name. */
  protected readonly showDetails = signal(false);

  /** How many times the selected target has been seen, on any night, failed tries left out. */
  protected readonly seenCount = computed(() => {
    const target = this.state.selectedTarget();
    return target ? this.log.timesSeen(target.id) : 0;
  });
  /** Whether the selected target has any observation, on any night, which fills in the eye. */
  protected readonly observed = computed(() => {
    const target = this.state.selectedTarget();
    return !!target && this.log.states().has(target.id);
  });
  /** AstroTurboMaxiSolver's own icon for the selected target, or null for kinds without one. */
  protected readonly targetIconUrl = computed(() => {
    const target = this.state.selectedTarget();
    const paths = target ? targetIcon(target) : null;
    return paths ? iconDataUrl(paths) : null;
  });

  constructor() {
    addIcons({ close, eye, eyeOutline, informationCircle, informationCircleOutline, scanOutline });
  }

  /** Opens the target's observations: the newest, or a blank form for the first. */
  protected openLog(target: Target): Promise<void> {
    return this.seenActions.openLog(target.id);
  }

  /** Clears the target, and stops observing through a list. */
  protected clearTarget(): void {
    this.state.selectedTargetId.set(null);
    this.playlist.stop();
  }

  /**
   * Turns the map straight to the target, since dragging across the sky is impractical in
   * the eyepiece's narrow field. The sensors would turn it back to where the phone points,
   * so they are switched off first.
   */
  protected aimAtTarget(): void {
    const target = this.state.selectedTarget();
    // Steered by a finder phone, the map follows the telescope, wherever the map is turned.
    if (!target || this.state.remoteFinder()) return;
    if (this.state.sensorsActive()) this.sensors.stop();
    const { altDeg, azDeg } = this.state.positionOf(target);
    this.state.pointing.set({ altDeg: Math.min(altDeg, MAX_ALTITUDE_DEG), azDeg });
  }
}
