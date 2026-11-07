import { DecimalPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonBadge, IonButton, IonIcon, IonItem, IonLabel, IonList, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  bookmark,
  bookmarkOutline,
  ellipsisHorizontalOutline,
  ellipseOutline,
  eyeOffOutline,
  sparklesOutline,
  starOutline,
} from 'ionicons/icons';

import { AppState } from './app-state.service';
import type { Horizontal } from './astronomy';
import { compassPoint, compassShort } from './astronomy';
import { BookmarkSheetComponent } from './bookmark-sheet.component';
import { designationText } from './designations';
import { ListsService } from './lists.service';
import { iconDataUrl, targetIcon } from './target-icons';
import type { Target, TargetKind } from './targets';

/** Standard icons for the kinds without one of AstroFinder's own, in target-icons.ts. */
const KIND_ICONS: Record<Exclude<TargetKind, 'Galaxy' | 'Nebula' | 'Constellation' | 'Planet' | 'Moon'>, string> = {
  Other: 'ellipsis-horizontal-outline',
  'Open cluster': 'sparkles-outline',
  'Globular cluster': 'ellipse-outline',
  Star: 'star-outline',
};

// Below this altitude, targets are dimmed by the atmosphere and hidden by buildings.
const GOOD_ALTITUDE_DEG = 30;

/** A list of targets, used by both the Targets and Plan tabs. */
@Component({
  selector: 'app-target-list',
  imports: [DecimalPipe, IonBadge, IonButton, IonIcon, IonItem, IonLabel, IonList],
  styles: `
    /* Sits where the height badge would be, in the quieter text colour. */
    .below-horizon {
      color: var(--af-muted);
      font-size: 26px;
    }
  `,
  template: `
    <ion-list>
      @for (target of targets(); track target.id) {
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
            <h2 data-testid="designations">{{ designationText(target) }}</h2>
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
          } @else {
            <!-- Below the horizon, so it can't be seen: a crossed-out eye instead of a height. -->
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
  readonly targets = input.required<readonly Target[]>();
  /** The time altitudes are shown for. Defaults to right now. */
  readonly at = input<Date | null>(null);

  protected readonly state = inject(AppState);
  protected readonly goodAltitude = GOOD_ALTITUDE_DEG;
  private readonly router = inject(Router);
  private readonly modals = inject(ModalController);
  protected readonly lists = inject(ListsService);

  constructor() {
    addIcons({
      bookmark,
      bookmarkOutline,
      ellipseOutline,
      eyeOffOutline,
      ellipsisHorizontalOutline,
      sparklesOutline,
      starOutline,
    });
  }

  /** Where the target is in the sky, now or at the list's chosen time. */
  protected positionOf(target: Target): Horizontal {
    const at = this.at();
    // Heights in a list only need the minute clock, which saves re-drawing it every second.
    return this.state.positionAt(target, at ?? this.state.now());
  }

  protected readonly compassPoint = compassPoint;
  protected readonly compassShort = compassShort;

  protected readonly designationText = designationText;
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

  /** Selects a target and opens the sky map, where the arrow guides the user to it. */
  protected aimAt(target: Target): void {
    this.state.selectedTargetId.set(target.id);
    void this.router.navigateByUrl('/tabs/sky');
  }
}
