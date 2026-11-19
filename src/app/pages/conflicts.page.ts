import { NgTemplateOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';

import { LocalTimePipe } from '../core/local-time.pipe';
import type { LogEntry } from '../core/log/observing-log';
import { ratingText, tagText } from '../core/log/observing-log';
import { ConflictsService } from '../core/sync/conflicts.service';

/**
 * Log entries edited on two phones before they synced: both versions side by side, to keep
 * one. The choice syncs, so the other phones settle it too. Reached from Settings, Sync.
 */
@Component({
  selector: 'app-conflicts',
  imports: [
    TranslatePipe,
    LocalTimePipe,
    NgTemplateOutlet,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonContent,
    IonHeader,
    IonText,
    IonTitle,
    IonToolbar,
  ],
  styles: `
    /* The two versions side by side where there is room, one above the other on a narrow phone. */
    .versions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 8px;
      padding: 0 8px 8px;
    }
    .version {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px;
      border: 1px solid var(--ion-border-color);
      border-radius: 12px;
      font-size: calc(15px * var(--af-scale, 1));
    }
    .version h3 {
      margin: 0;
      font-size: calc(14px * var(--af-scale, 1));
      color: var(--af-muted);
    }
    .note {
      white-space: pre-wrap;
    }
  `,
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button
            defaultHref="/tabs/settings"
            text=""
            [attr.aria-label]="'common.back' | translate"
          ></ion-back-button>
        </ion-buttons>
        <ion-title>{{ 'conflicts.title' | translate }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @for (conflict of conflicts.conflicts(); track conflict.key) {
        <ion-card data-testid="conflict">
          <ion-card-header>
            <ion-card-title>{{ conflict.other.targetId }}</ion-card-title>
            <ion-card-subtitle>{{ conflict.other.targetName }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <p>{{ 'conflicts.explain' | translate }}</p>
          </ion-card-content>
          <div class="versions">
            <div class="version" data-testid="conflict-current">
              <h3>{{ 'conflicts.thisPhone' | translate }}</h3>
              @if (conflict.current; as entry) {
                <ng-container *ngTemplateOutlet="version; context: { $implicit: entry }" />
              } @else {
                <span>{{ 'conflicts.deletedHere' | translate }}</span>
              }
              <ion-button
                size="small"
                data-testid="conflict-keep-current"
                (click)="conflicts.settle(conflict, 'current')"
              >
                {{ 'conflicts.keep' | translate }}
              </ion-button>
            </div>
            <div class="version" data-testid="conflict-other">
              <h3>{{ 'conflicts.otherPhone' | translate }}</h3>
              <ng-container *ngTemplateOutlet="version; context: { $implicit: conflict.other }" />
              <ion-button size="small" data-testid="conflict-keep-other" (click)="conflicts.settle(conflict, 'other')">
                {{ 'conflicts.keep' | translate }}
              </ion-button>
            </div>
          </div>
        </ion-card>
      } @empty {
        <ion-text color="medium">
          <p class="ion-padding" data-testid="conflicts-empty">{{ 'conflicts.none' | translate }}</p>
        </ion-text>
      }

      <!-- One version of an entry: when, how well it was seen, its tags and its note. -->
      <ng-template #version let-entry>
        <span>{{ entry.time | localTime: 'date-time' }} · {{ rating(entry) }}</span>
        @if (entry.tags.length > 0) {
          <span>{{ tags(entry) }}</span>
        }
        @if (entry.note) {
          <span class="note">{{ entry.note }}</span>
        }
      </ng-template>
    </ion-content>
  `,
})
export class ConflictsPage {
  protected readonly conflicts = inject(ConflictsService);

  protected rating(entry: LogEntry): string {
    return ratingText(entry.rating);
  }

  protected tags(entry: LogEntry): string {
    return entry.tags.map(tagText).join(', ');
  }
}
