import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonReorder,
  IonReorderGroup,
  ModalController,
} from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import {
  arrowUpOutline,
  bookmark,
  bookmarkOutline,
  checkmarkCircle,
  ellipseOutline,
  eye,
  eyeOffOutline,
  shapesOutline,
  sparklesOutline,
  starOutline,
  trashOutline,
} from 'ionicons/icons';

import { AppState } from '../app-state.service';
import type { Horizontal } from '../astronomy/astronomy';
import { compassPoint, compassShort } from '../astronomy/astronomy';
import { iconDataUrl, targetIcon } from '../catalog/target-icons';
import type { Target, TargetKind } from '../catalog/targets';
import { LocalTimePipe } from '../local-time.pipe';
import { countLabel } from '../log/observing-log';
import { ObservingLogService } from '../log/observing-log.service';
import { SeenActionsService } from '../log/seen-actions.service';
import { SensorService } from '../sensors/sensor.service';

import { BookmarkSheetComponent } from './bookmark-sheet.component';
import { ListViewService } from './list-view.service';
import { ListsService } from './lists.service';
import { PlaylistService } from './playlist.service';
import type { ListedTarget } from './target-lists';
import { rowDesignations } from './target-lists';

/** Standard icons for the kinds without one of AstroTurboMaxiSolver's own, in target-icons.ts. */
const KIND_ICONS: Record<
  Exclude<
    TargetKind,
    'Galaxy' | 'Nebula' | 'Constellation' | 'Planet' | 'Dwarf planet' | 'Asteroid' | 'Moon' | 'Double star'
  >,
  string
> = {
  Other: 'shapes-outline',
  'Open cluster': 'sparkles-outline',
  'Globular cluster': 'ellipse-outline',
  Star: 'star-outline',
};

/** A row as the list draws it: its target, with everything about it worked out in advance. */
interface Row {
  target: ListedTarget;
  /** Tells rows apart, since a catalogue can list one target under two numbers. */
  key: string;
  position: Horizontal;
  rise: Date | null;
  /** AstroTurboMaxiSolver's own icon as an image, or null to use a standard one. */
  icon: string | null;
  designations: string;
  seen: 'seen' | 'tried' | undefined;
  /** How many times it has been seen, on any night, failed tries left out. */
  seenCount: number;
  note: string | undefined;
  bookmarked: boolean;
}

/** Rise times kept at once. Lists show at most a few hundred targets. */
const MAX_CACHED_RISES = 2000;

// Below this altitude, targets are dimmed by the atmosphere and hidden by buildings.
const GOOD_ALTITUDE_DEG = 30;

/**
 * The rows of a list of targets, the same in the search and on every list. A tap
 * aims at the target. Swiping a row to the left uncovers its actions: mark it seen, and
 * on the user's own lists, remove it. While reordering, each row has a handle to drag by.
 */
@Component({
  selector: 'app-target-list',
  // Checked only when its rows change. A list stays alive behind the sky map, which
  // updates many times a second, and must not redo its rows each time the map does.
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    DecimalPipe,
    LocalTimePipe,
    IonBadge,
    IonButton,
    IonIcon,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonReorder,
    IonReorderGroup,
  ],
  styles: `
    /* Sits where the height badge would be, in the quieter text colour. */
    .below-horizon {
      color: var(--af-muted);
      font-size: 26px;
    }
    /* The kind's icon, with room for the seen tick at its corner. */
    .icon-wrap {
      position: relative;
      display: inline-flex;
      margin-inline-end: 16px;
      border-radius: 50%;
    }
    .icon-wrap > ion-icon:first-child {
      font-size: 24px;
    }
    .icon-wrap.tried {
      box-shadow: 0 0 0 2px var(--ion-color-warning);
    }
    .tick {
      position: absolute;
      right: -7px;
      bottom: -5px;
      font-size: 15px;
      color: var(--ion-color-success);
      background: var(--ion-item-background, var(--ion-background-color));
      border-radius: 50%;
    }
    /*
     * At night every colour becomes red by its brightness, and the green tick would turn a
     * dull dark red. White becomes full-strength red, like the count beside it.
     */
    :host-context(html.night) .tick {
      color: var(--af-bright);
    }
    /* Seen more than once: the count takes the tick's place, at the same corner. */
    /*
     * Where the tick sits, on the icon's bottom right corner, its right edge in the same
     * place: a second digit grows back over the icon, never into the target's name.
     */
    .icon-wrap .af-count {
      right: -8px;
      bottom: -6px;
      --af-count-edge: var(--ion-item-background, var(--ion-background-color));
    }
    /* What the order is about, such as the best time tonight: the app's blue, to stand out. */
    .note {
      color: var(--ion-color-primary);
      font-variant-numeric: tabular-nums;
    }
    /*
     * A phone on its side shows few rows, each with room to spare: two columns, read
     * across. Not while reordering, when rows are dragged up and down one column.
     */
    @media (orientation: landscape) and (max-height: 520px) {
      ion-reorder-group.columns {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
    /* A rise time, in the same quieter colour, with a small up arrow before it. */
    .rises {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      color: var(--af-muted);
      font-size: calc(15px * var(--af-scale, 1));
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  `,
  template: `
    <ion-list>
      <ion-reorder-group [class.columns]="!reorder()" [disabled]="!reorder()" (ionReorderEnd)="onReorder($any($event))">
        @for (row of rows(); track row.key) {
          @let target = row.target;
          @let position = row.position;
          @let altDeg = position.altDeg;
          <ion-item-sliding #sliding [disabled]="reorder()">
            <ion-item button detail="false" (click)="aimAt(target)">
              @let icon = row.icon;
              @let seen = row.seen;
              <!-- Galaxies, nebulae, planets and the Moon have AstroTurboMaxiSolver's own icons. A green tick
               marks a target seen, or how many times once it is more than one, and an amber
               ring one looked for but not seen yet. -->
              <span
                slot="start"
                class="icon-wrap"
                [class.seen]="seen === 'seen'"
                [class.tried]="seen === 'tried'"
                [attr.role]="seen ? 'img' : null"
                [attr.aria-label]="
                  row.seenCount > 1
                    ? ('lists.seenTimes' | translate: { count: row.seenCount })
                    : seen === 'seen'
                      ? ('lists.seen' | translate)
                      : seen === 'tried'
                        ? ('lists.notSeenYet' | translate)
                        : null
                "
                [attr.data-seen]="seen ?? null"
              >
                <ion-icon
                  color="medium"
                  aria-hidden="true"
                  data-testid="target-icon"
                  [attr.data-icon]="icon ? 'custom' : kindIcons[target.kind]"
                  [name]="icon ? undefined : kindIcons[target.kind]"
                  [src]="icon ?? undefined"
                ></ion-icon>
                @if (row.seenCount > 1) {
                  <span class="af-count" data-testid="seen-count" aria-hidden="true">{{
                    countLabel(row.seenCount)
                  }}</span>
                } @else if (seen === 'seen') {
                  <ion-icon class="tick" name="checkmark-circle" aria-hidden="true"></ion-icon>
                }
              </span>
              <ion-label>
                <!-- Every catalogue number: Messier, then Caldwell, then NGC and IC. -->
                <h2 data-testid="designations">{{ row.designations }}</h2>
                <!-- Magnitude only where it is known. Constellations, and some objects, have none. -->
                <p>
                  {{ target.name }}
                  @if (target.mag < 90) {
                    · mag {{ target.mag | number: '1.1-1' }}
                  }
                </p>
                <!-- A few words about the order the list is in, such as its best time tonight. -->
                @if (row.note; as note) {
                  <p class="note" data-testid="row-note">{{ note }}</p>
                }
              </ion-label>
              @if (altDeg > 0) {
                <!-- How high, and which way to face: "42° SE". -->
                <ion-badge
                  slot="end"
                  data-testid="sky-position"
                  [color]="altDeg >= goodAltitude ? 'success' : 'warning'"
                  [attr.aria-label]="
                    'lists.upToThe'
                      | translate: { degrees: (altDeg | number: '1.0-0'), direction: compassPoint(position.azDeg) }
                  "
                  >{{ altDeg | number: '1.0-0' }}° {{ compassShort(position.azDeg) }}</ion-badge
                >
              } @else if (row.rise; as rise) {
                <!-- Below the horizon now, but up within a day: when it rises. -->
                <span
                  slot="end"
                  class="rises"
                  role="img"
                  data-testid="rises-at"
                  [attr.aria-label]="'lists.risesAt' | translate: { time: (rise | localTime) }"
                  ><ion-icon name="arrow-up-outline" aria-hidden="true"></ion-icon>{{ rise | localTime }}</span
                >
              } @else {
                <!-- Not up within a day: a crossed-out eye instead of a height. -->
                <ion-icon
                  slot="end"
                  class="below-horizon"
                  name="eye-off-outline"
                  role="img"
                  [attr.aria-label]="'details.belowHorizon' | translate"
                  data-testid="below-horizon"
                ></ion-icon>
              }
              @if (reorder()) {
                <ion-reorder slot="end" data-testid="reorder-handle"></ion-reorder>
              } @else {
                <ion-button
                  slot="end"
                  fill="clear"
                  data-testid="bookmark"
                  [attr.aria-label]="'lists.saveTo' | translate: { name: target.id }"
                  (click)="chooseLists($event, target)"
                >
                  <ion-icon slot="icon-only" [name]="row.bookmarked ? 'bookmark' : 'bookmark-outline'"></ion-icon>
                </ion-button>
              }
            </ion-item>
            <!-- Uncovered by swiping the row to the left, away from the edge that goes back. -->
            <ion-item-options side="end">
              <ion-item-option
                color="success"
                data-testid="swipe-seen"
                [attr.aria-label]="'lists.markSeen' | translate: { name: target.id }"
                (click)="markSeen(sliding, target)"
              >
                <ion-icon slot="icon-only" name="eye" aria-hidden="true"></ion-icon>
              </ion-item-option>
              @if (removable()) {
                <ion-item-option
                  color="danger"
                  data-testid="swipe-remove"
                  [attr.aria-label]="'lists.removeFrom' | translate: { name: target.id }"
                  (click)="removeRow(sliding, target)"
                >
                  <ion-icon slot="icon-only" name="trash-outline" aria-hidden="true"></ion-icon>
                </ion-item-option>
              }
            </ion-item-options>
          </ion-item-sliding>
        }
      </ion-reorder-group>
    </ion-list>
  `,
})
export class TargetListComponent {
  /** The rows. A catalogue may list a target twice, under two numbers: see ListedTarget. */
  readonly targets = input.required<readonly ListedTarget[]>();
  /** The time altitudes are shown for. Defaults to right now. */
  readonly at = input<Date | null>(null);
  /** A few words under some rows, by target id, about the order the list is in. */
  readonly notes = input<ReadonlyMap<string, string> | null>(null);
  /** Whether rows can be removed, as on the user's own lists. */
  readonly removable = input(false);
  /** Whether rows show a handle to drag them by, into another order. */
  readonly reorder = input(false);

  /** A row's Remove action was tapped. */
  readonly remove = output<ListedTarget>();
  /** A row was dragged from one place to another, counted from the top. */
  readonly moved = output<{ from: number; to: number }>();

  protected readonly state = inject(AppState);
  protected readonly goodAltitude = GOOD_ALTITUDE_DEG;
  private readonly router = inject(Router);
  private readonly sensors = inject(SensorService);
  private readonly modals = inject(ModalController);
  protected readonly lists = inject(ListsService);
  protected readonly log = inject(ObservingLogService);
  private readonly seenActions = inject(SeenActionsService);
  private readonly playlist = inject(PlaylistService);
  /** The list on show, which a tap on a row plays from that row. */
  private readonly view = inject(ListViewService, { optional: true });

  constructor() {
    addIcons({
      bookmark,
      bookmarkOutline,
      checkmarkCircle,
      ellipseOutline,
      eye,
      eyeOffOutline,
      shapesOutline,
      arrowUpOutline,
      sparklesOutline,
      starOutline,
      trashOutline,
    });
  }

  /**
   * When a target below the horizon rises, within a day of the list's time. Kept per
   * time, since the list asks again on every update and the search for planets is slow.
   */
  private riseOf(target: Target): Date | null {
    const from = this.at() ?? this.state.now();
    const { latitudeDeg, longitudeDeg } = this.state.settings();
    const key = `${target.id}|${from.getTime()}|${latitudeDeg}|${longitudeDeg}`;
    if (!this.riseTimes.has(key)) {
      if (this.riseTimes.size > MAX_CACHED_RISES) this.riseTimes.clear();
      this.riseTimes.set(key, this.state.nextRise(target, from));
    }
    return this.riseTimes.get(key) ?? null;
  }
  private readonly riseTimes = new Map<string, Date | null>();

  /**
   * Everything each row shows, worked out once whenever the rows, the minute, the log or
   * the bookmarks change. The template only reads it, so drawing the list again costs
   * nothing: positions and icons are slow to work out for every row on every update.
   */
  protected readonly rows = computed<Row[]>(() => {
    // Heights in a list only need the minute clock, which saves re-drawing it every second.
    const time = this.at() ?? this.state.now();
    const seen = this.log.states();
    const counts = this.log.counts();
    const notes = this.notes();
    const bookmarked = new Set(this.lists.editableLists().flatMap((list) => list.targetIds));
    return this.targets().map((target) => {
      const position = this.state.positionAt(target, time);
      const icon = targetIcon(target);
      return {
        target,
        key: target.id + (target.listedAs ?? ''),
        position,
        // Only a target below the horizon has a rise time to show.
        rise: position.altDeg > 0 ? null : this.riseOf(target),
        icon: icon ? iconDataUrl(icon) : null,
        designations: rowDesignations(target),
        seen: seen.get(target.id),
        seenCount: counts.get(target.id) ?? 0,
        note: notes?.get(target.id),
        bookmarked: bookmarked.has(target.id),
      };
    });
  });

  protected readonly countLabel = countLabel;
  protected readonly compassPoint = compassPoint;
  protected readonly compassShort = compassShort;

  protected readonly kindIcons: Partial<Record<TargetKind, string>> = KIND_ICONS;

  /** Logs the row's target as seen, as the sky map's eye button does, and closes the row. */
  protected markSeen(sliding: IonItemSliding, target: Target): void {
    void sliding.close();
    void this.seenActions.markSeen(target, 'list');
  }

  protected removeRow(sliding: IonItemSliding, target: ListedTarget): void {
    void sliding.close();
    this.remove.emit(target);
  }

  /** A row was dropped in a new place. The list itself is changed by whoever owns it. */
  protected onReorder(event: CustomEvent<{ from: number; to: number; complete: (data?: boolean) => void }>): void {
    const { from, to, complete } = event.detail;
    // The rows are drawn again from the saved list, so the dragged copy is put back first.
    complete(false);
    if (from !== to) this.moved.emit({ from, to });
  }

  /** Opens a sheet to choose which of the user's lists the target is in. */
  protected async chooseLists(event: Event, target: Target): Promise<void> {
    // The button sits inside the row, so stop the tap from also selecting the row.
    event.stopPropagation();
    const sheet = await this.modals.create({
      component: BookmarkSheetComponent,
      componentProps: { target },
      breakpoints: [0, 0.6, 1],
      initialBreakpoint: 0.6,
    });
    await sheet.present();
  }

  /**
   * Selects a target and opens the sky map, where the arrow guides the user to it. The
   * list plays from there, as it is ordered and filtered now, so the map's buttons step
   * to the next and previous targets in it. The sensors start too, since following the
   * arrow needs them. This tap is what lets the browser ask for sensor permission, so it
   * happens here rather than on the map.
   */
  protected aimAt(target: Target): void {
    if (this.view) {
      const ids = this.view.ordered().map((row) => row.id);
      this.playlist.play(this.view.title(), ids, target.id, this.router.url);
    } else {
      this.state.selectedTargetId.set(target.id);
    }
    if (!this.state.sensorsActive()) void this.sensors.start({ automatic: true });
    void this.router.navigateByUrl('/tabs/sky');
  }
}
