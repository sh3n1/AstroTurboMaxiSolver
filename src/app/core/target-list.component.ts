import { DecimalPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonBadge, IonButton, IonIcon, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  arrowUpOutline,
  bookmark,
  bookmarkOutline,
  ellipseOutline,
  eyeOffOutline,
  shapesOutline,
  sparklesOutline,
  starOutline,
} from 'ionicons/icons';

import { AppState } from './app-state.service';
import type { Horizontal } from './astronomy';
import { compassPoint, compassShort } from './astronomy';
import { BookmarkSheetComponent } from './bookmark-sheet.component';
import { ListsService } from './lists.service';
import { LocalTimePipe } from './local-time.pipe';
import { SensorService } from './sensor.service';
import { iconDataUrl, targetIcon } from './target-icons';
import type { ListedTarget } from './target-lists';
import { rowDesignations } from './target-lists';
import type { Target, TargetKind } from './targets';

/** Standard icons for the kinds without one of AstroFinder's own, in target-icons.ts. */
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

/** Rise times kept at once. Lists show at most a few hundred targets. */
const MAX_CACHED_RISES = 2000;

// Below this altitude, targets are dimmed by the atmosphere and hidden by buildings.
const GOOD_ALTITUDE_DEG = 30;

/** A list of targets, used by both the Targets and Plan tabs. */
@Component({
  selector: 'app-target-list',
  imports: [DecimalPipe, LocalTimePipe, IonBadge, IonButton, IonIcon, IonItem, IonLabel, IonList],
  styles: `
    /* Sits where the height badge would be, in the quieter text colour. */
    .below-horizon {
      color: var(--af-muted);
      font-size: 26px;
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
      @for (target of targets(); track target.id + (target.listedAs ?? '')) {
        @let position = positionOf(target);
        @let altDeg = position.altDeg;
        <ion-item button detail="false" (click)="aimAt(target)">
          @let icon = customIcon(target);
          <!-- Galaxies, nebulae, planets and the Moon have AstroFinder's own icons. -->
          <ion-icon
            slot="start"
            color="medium"
            aria-hidden="true"
            data-testid="target-icon"
            [attr.data-icon]="icon ? 'custom' : kindIcons[target.kind]"
            [name]="icon ? undefined : kindIcons[target.kind]"
            [src]="icon ?? undefined"
          ></ion-icon>
          <ion-label>
            <!-- Every catalogue number: Messier, then Caldwell, then NGC and IC. -->
            <h2 data-testid="designations">{{ rowDesignations(target) }}</h2>
            <!-- Magnitude only where it is known. Constellations, and some objects, have none. -->
            <p>
              {{ target.name }}
              @if (target.mag < 90) {
                · mag {{ target.mag | number: '1.1-1' }}
              }
            </p>
          </ion-label>
          @if (altDeg > 0) {
            <!-- How high, and which way to face: "42° SE". -->
            <ion-badge
              slot="end"
              data-testid="sky-position"
              [color]="altDeg >= goodAltitude ? 'success' : 'warning'"
              [attr.aria-label]="(altDeg | number: '1.0-0') + '° up, to the ' + compassPoint(position.azDeg)"
              >{{ altDeg | number: '1.0-0' }}° {{ compassShort(position.azDeg) }}</ion-badge
            >
          } @else if (riseOf(target); as rise) {
            <!-- Below the horizon now, but up within a day: when it rises. -->
            <span
              slot="end"
              class="rises"
              role="img"
              data-testid="rises-at"
              [attr.aria-label]="'Below the horizon, rises at ' + (rise | localTime)"
              ><ion-icon name="arrow-up-outline" aria-hidden="true"></ion-icon>{{ rise | localTime }}</span
            >
          } @else {
            <!-- Not up within a day: a crossed-out eye instead of a height. -->
            <ion-icon
              slot="end"
              class="below-horizon"
              name="eye-off-outline"
              role="img"
              aria-label="Below the horizon"
              data-testid="below-horizon"
            ></ion-icon>
          }
          <ion-button
            slot="end"
            fill="clear"
            data-testid="bookmark"
            [attr.aria-label]="'Save to a list: ' + target.id"
            (click)="chooseLists($event, target)"
          >
            <ion-icon
              slot="icon-only"
              [name]="lists.isBookmarked(target.id) ? 'bookmark' : 'bookmark-outline'"
            ></ion-icon>
          </ion-button>
        </ion-item>
      }
    </ion-list>
  `,
})
export class TargetListComponent {
  /** The rows. A catalogue may list a target twice, under two numbers: see ListedTarget. */
  readonly targets = input.required<readonly ListedTarget[]>();
  /** The time altitudes are shown for. Defaults to right now. */
  readonly at = input<Date | null>(null);

  protected readonly state = inject(AppState);
  protected readonly goodAltitude = GOOD_ALTITUDE_DEG;
  private readonly router = inject(Router);
  private readonly sensors = inject(SensorService);
  private readonly modals = inject(ModalController);
  protected readonly lists = inject(ListsService);

  constructor() {
    addIcons({
      bookmark,
      bookmarkOutline,
      ellipseOutline,
      eyeOffOutline,
      shapesOutline,
      arrowUpOutline,
      sparklesOutline,
      starOutline,
    });
  }

  /**
   * When a target below the horizon rises, within a day of the list's time. Kept per
   * time, since the list asks again on every update and the search for planets is slow.
   */
  protected riseOf(target: Target): Date | null {
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

  /** Where the target is in the sky, now or at the list's chosen time. */
  protected positionOf(target: Target): Horizontal {
    const at = this.at();
    // Heights in a list only need the minute clock, which saves re-drawing it every second.
    return this.state.positionAt(target, at ?? this.state.now());
  }

  protected readonly compassPoint = compassPoint;
  protected readonly compassShort = compassShort;

  protected readonly rowDesignations = rowDesignations;
  protected readonly kindIcons: Partial<Record<TargetKind, string>> = KIND_ICONS;

  /** AstroFinder's own icon as an image, or null to use a standard one. */
  protected customIcon(target: Target): string | null {
    const paths = targetIcon(target);
    return paths ? iconDataUrl(paths) : null;
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
   * sensors start too, since following the arrow needs them. This tap is what lets the
   * browser ask for sensor permission, so it happens here rather than on the map.
   */
  protected aimAt(target: Target): void {
    this.state.selectedTargetId.set(target.id);
    if (!this.state.sensorsActive()) void this.sensors.start({ automatic: true });
    void this.router.navigateByUrl('/tabs/sky');
  }
}
