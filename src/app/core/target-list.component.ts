import { DecimalPipe } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonBadge, IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { bookmark, bookmarkOutline } from 'ionicons/icons';

import { AppState } from './app-state.service';
import type { Target } from './targets';

/** A list of targets, used by both the Targets and Plan tabs. */
@Component({
  selector: 'app-target-list',
  imports: [DecimalPipe, IonBadge, IonButton, IonIcon, IonItem, IonLabel, IonList, IonNote],
  template: `
    <ion-list>
      @for (target of targets(); track target.id) {
        @let position = state.positionOf(target);
        <ion-item button detail="false" (click)="aimAt(target)">
          <ion-label>
            <h2>{{ target.id }}</h2>
            <p>{{ target.name }} · {{ target.kind }} · mag {{ target.mag | number: '1.1-1' }}</p>
          </ion-label>
          @if (position.altDeg > 0) {
            <ion-badge slot="end" color="success">{{ position.altDeg | number: '1.0-0' }}°</ion-badge>
          } @else {
            <ion-note slot="end">Below horizon</ion-note>
          }
          <ion-button
            slot="end"
            fill="clear"
            [attr.aria-label]="(isPlanned(target) ? 'Remove from plan: ' : 'Add to plan: ') + target.id"
            (click)="togglePlan($event, target)"
          >
            <ion-icon slot="icon-only" [name]="isPlanned(target) ? 'bookmark' : 'bookmark-outline'"></ion-icon>
          </ion-button>
        </ion-item>
      }
    </ion-list>
  `,
})
export class TargetListComponent {
  readonly targets = input.required<readonly Target[]>();

  protected readonly state = inject(AppState);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ bookmark, bookmarkOutline });
  }

  protected isPlanned(target: Target): boolean {
    return this.state.planIds().includes(target.id);
  }

  protected togglePlan(event: Event, target: Target): void {
    // The button sits inside the row, so stop the tap from also selecting the row.
    event.stopPropagation();
    this.state.togglePlan(target.id);
  }

  /** Selects a target and opens the sky map, where the arrow guides the user to it. */
  protected aimAt(target: Target): void {
    this.state.selectedTargetId.set(target.id);
    void this.router.navigateByUrl('/tabs/sky');
  }
}
