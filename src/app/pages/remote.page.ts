import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import type { Signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { addIcons } from 'ionicons';
import { discOutline, phonePortraitOutline, scanOutline, telescopeOutline } from 'ionicons/icons';

import { PuckLinkService } from '../core/remote/puck-link.service';
import { isPuckCode } from '../core/remote/puck-pairing';
import { QrCodeComponent } from '../core/remote/qr-code.component';
import { QrScannerComponent } from '../core/remote/qr-scanner.component';
import { RemoteService } from '../core/remote/remote.service';

/**
 * Links two phones: one on the telescope as the finder, one in the hand as the screen.
 * The finder shows a code, the screen reads it and shows a reply, and the finder reads
 * that. Each code can also be pasted, for when a camera can't read it.
 */
@Component({
  selector: 'app-remote',
  imports: [
    TranslatePipe,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
    NgTemplateOutlet,
    QrCodeComponent,
    QrScannerComponent,
  ],
  styles: `
    .step {
      font-size: calc(17px * var(--af-scale, 1));
      text-align: center;
      margin: 16px 0 12px;
    }
    .choice {
      --padding-top: 16px;
      --padding-bottom: 16px;
      height: auto;
      font-size: calc(17px * var(--af-scale, 1));
      margin-bottom: 12px;
    }
    .choice ion-icon {
      font-size: 28px;
      margin-right: 12px;
    }
    /* The page's two sections: two devices, and the puck. */
    .section {
      margin: 20px 4px 10px;
      color: var(--af-muted);
      font-size: calc(14px * var(--af-scale, 1));
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .status {
      text-align: center;
      font-size: calc(17px * var(--af-scale, 1));
    }
    .error {
      color: var(--ion-color-danger);
      text-align: center;
      font-size: calc(15px * var(--af-scale, 1));
    }
    .paste {
      margin-top: 16px;
    }
    ion-spinner {
      display: block;
      margin: 24px auto;
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
        <ion-title>{{ 'remote.title' | translate }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <div data-testid="remote-status" [attr.data-status]="remote.status()" [attr.data-role]="remote.role()">
        @switch (remote.status()) {
          @case ('connected') {
            <p class="status">
              {{ (remote.role() === 'finder' ? 'settings.thisIsFinder' : 'settings.linkedToFinder') | translate }}
            </p>
            <ion-button expand="block" data-testid="remote-open-sky" (click)="openSky()">{{
              'views.sky' | translate
            }}</ion-button>
            <!-- Paused, each phone works alone, and the link resumes without new codes. -->
            <ion-button expand="block" fill="outline" data-testid="remote-pause" (click)="remote.pause()">
              {{ 'remote.pause' | translate }}
            </ion-button>
            <ion-button
              expand="block"
              fill="outline"
              color="danger"
              data-testid="remote-disconnect"
              (click)="disconnect()"
            >
              {{ 'remote.unlink' | translate }}
            </ion-button>
          }
          @case ('paused') {
            <p class="status">{{ 'settings.linkPaused' | translate }}</p>
            <ion-button expand="block" data-testid="remote-resume" (click)="remote.resume()">{{
              'remote.reconnect' | translate
            }}</ion-button>
            <ion-button
              expand="block"
              fill="outline"
              color="danger"
              data-testid="remote-disconnect"
              (click)="disconnect()"
            >
              {{ 'remote.unlink' | translate }}
            </ion-button>
          }
          @case ('connecting') {
            <p class="status">{{ 'remote.connecting' | translate }}</p>
            <ion-spinner [attr.aria-label]="'remote.connecting' | translate"></ion-spinner>
          }
          @case ('showing-offer') {
            <!-- While scanning the reply, the code is out of the way: the screen phone has read it already. -->
            @if (scanning()) {
              <p class="step">{{ 'remote.scanReplyStep' | translate }}</p>
              <app-qr-scanner (scanned)="read($event)" />
              <ion-button expand="block" fill="clear" data-testid="remote-scan-cancel" (click)="scanning.set(false)">
                {{ 'remote.backToCode' | translate }}
              </ion-button>
            } @else {
              <p class="step">{{ 'remote.scanThisStep' | translate }}</p>
              <app-qr-code
                data-testid="remote-code"
                [label]="'remote.pairingCode' | translate"
                [text]="remote.code()"
              />
              <p class="step">{{ 'remote.scanReplyStep' | translate }}</p>
              <ion-button expand="block" data-testid="remote-scan" (click)="scanning.set(true)">
                <ion-icon slot="start" name="scan-outline" aria-hidden="true"></ion-icon>
                {{ 'remote.scanReply' | translate }}
              </ion-button>
            }
            <ng-container *ngTemplateOutlet="paste" />
          }
          @case ('showing-answer') {
            <p class="step">{{ 'remote.scanWithFinder' | translate }}</p>
            <app-qr-code data-testid="remote-code" [label]="'remote.replyCode' | translate" [text]="remote.code()" />
            <ion-spinner [attr.aria-label]="'remote.waiting' | translate"></ion-spinner>
          }
          @default {
            @if (remote.status() === 'lost') {
              <p class="error" data-testid="remote-lost">{{ 'settings.linkLost' | translate }}</p>
            }
            @if (scanning() && !scanningPuck()) {
              <p class="step">{{ 'remote.scanFinder' | translate }}</p>
              <app-qr-scanner (scanned)="read($event)" />
              <ion-button expand="block" fill="clear" (click)="scanning.set(false)">{{
                'common.cancel' | translate
              }}</ion-button>
              <ng-container *ngTemplateOutlet="paste" />
            } @else if (!scanning()) {
              <!-- A second phone: one on the telescope as the finder, the other in the hand. -->
              <h2 class="section" data-testid="remote-two-devices">{{ 'remote.twoDevices' | translate }}</h2>
              <ion-button class="choice" expand="block" data-testid="remote-as-finder" (click)="remote.startAsFinder()">
                <ion-icon name="telescope-outline" aria-hidden="true"></ion-icon>
                {{ 'settings.thisIsFinder' | translate }}
              </ion-button>
              <ion-button
                class="choice"
                expand="block"
                fill="outline"
                data-testid="remote-as-screen"
                (click)="scan(false)"
              >
                <ion-icon name="phone-portrait-outline" aria-hidden="true"></ion-icon>
                {{ 'remote.thisIsScreen' | translate }}
              </ion-button>
            }
          }
        }
        @if (remote.error()) {
          <p class="error" data-testid="remote-error">{{ remote.error() }}</p>
        }
      </div>

      <!--
        The puck, the hand remote, has its own link (puck-link.service.ts): over this phone
        on the telescope, or the screen phone of two devices, which keeps working as usual.
        Never over a finder: see docs/puck.md.
      -->
      @if (remote.role() !== 'finder' && !(scanning() && !scanningPuck())) {
        <div data-testid="puck-status" [attr.data-status]="puck.status()">
          <h2 class="section" data-testid="remote-puck-section">{{ 'remote.puck' | translate }}</h2>
          @switch (puck.status()) {
            @case ('connected') {
              <p class="status">{{ 'remote.linkedToPuck' | translate }}</p>
              <ion-button
                expand="block"
                fill="outline"
                color="danger"
                data-testid="puck-disconnect"
                (click)="puck.disconnect()"
              >
                {{ 'remote.unlinkPuck' | translate }}
              </ion-button>
            }
            @case ('connecting') {
              <p class="status">{{ 'remote.connecting' | translate }}</p>
              <ion-spinner [attr.aria-label]="'remote.connecting' | translate"></ion-spinner>
            }
            @default {
              @if (puck.status() === 'lost') {
                <p class="error" data-testid="puck-lost">{{ 'settings.linkLost' | translate }}</p>
              }
              @if (scanning()) {
                <p class="step">{{ 'remote.scanPuck' | translate }}</p>
                <app-qr-scanner (scanned)="read($event)" />
                <ion-button expand="block" fill="clear" (click)="scanning.set(false)">{{
                  'common.cancel' | translate
                }}</ion-button>
                <ng-container *ngTemplateOutlet="paste" />
              } @else {
                <ion-button class="choice" expand="block" fill="outline" data-testid="remote-puck" (click)="scan(true)">
                  <ion-icon name="disc-outline" aria-hidden="true"></ion-icon>
                  {{ 'remote.linkPuck' | translate }}
                </ion-button>
              }
            }
          }
          @if (puck.error()) {
            <p class="error" data-testid="puck-error">{{ puck.error() }}</p>
          }
        </div>
      }

      <!-- For when a camera can't read the code: it can be sent by any app and pasted. -->
      <ng-template #paste>
        <div class="paste">
          <ion-textarea
            data-testid="remote-paste"
            [label]="'remote.paste' | translate"
            label-placement="stacked"
            fill="outline"
            [rows]="2"
            [value]="pasted()"
            (ionInput)="pasted.set($any($event).detail.value ?? '')"
          ></ion-textarea>
          <ion-button
            expand="block"
            fill="outline"
            data-testid="remote-paste-submit"
            [disabled]="!pasted().trim()"
            (click)="read(pasted())"
          >
            {{ 'remote.connect' | translate }}
          </ion-button>
        </div>
      </ng-template>
    </ion-content>
  `,
})
export class RemotePage {
  protected readonly remote = inject(RemoteService);
  protected readonly puck = inject(PuckLinkService);
  private readonly router = inject(Router);

  /** Whether the camera is reading a code, and whether it is the puck's. */
  protected readonly scanning = signal(false);
  protected readonly scanningPuck = signal(false);
  protected readonly pasted = signal('');

  private readonly connected = computed(() => this.remote.status() === 'connected');
  private readonly puckConnected = computed(() => this.puck.status() === 'connected');

  constructor() {
    addIcons({ discOutline, phonePortraitOutline, scanOutline, telescopeOutline });
    // Linked just now: both phones go to the map, the finder to solve, the screen to guide.
    // Opened while already linked, the page stays, to pause or unlink.
    this.openSkyWhenLinked(this.connected);
    // The puck too: this phone then works as usual, and the puck mirrors its map.
    this.openSkyWhenLinked(this.puckConnected);
  }

  private openSkyWhenLinked(linked: Signal<boolean>): void {
    let wasLinked = untracked(linked);
    effect(() => {
      const now = linked();
      if (now && !wasLinked) this.openSky();
      wasLinked = now;
    });
  }

  /** Opens the camera, for the finder phone's code or the puck's. */
  protected scan(puck: boolean): void {
    this.scanningPuck.set(puck);
    this.scanning.set(true);
  }

  /**
   * A code read or pasted: the screen's reply on the finder, the puck's code, or the finder's
   * code on the screen. A puck's code pasted in the wrong place is told apart by what it
   * starts with.
   */
  protected async read(code: string): Promise<void> {
    this.scanning.set(false);
    this.pasted.set('');
    if (this.remote.status() === 'showing-offer') await this.remote.acceptReply(code);
    else if (this.scanningPuck() || isPuckCode(code)) await this.puck.start(code);
    else await this.remote.startAsScreen(code);
  }

  protected disconnect(): void {
    this.remote.disconnect();
  }

  protected openSky(): void {
    void this.router.navigateByUrl('/tabs/sky');
  }
}
