import { Injectable, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

import { AppState } from '../app-state.service';
import { i18n } from '../i18n/t';

import { InstallService } from './install.service';
import type { PermissionKind, Text } from './permission-help';
import { LOCATION_BLOCKED, PERMISSION_REASONS, blockedHelp } from './permission-help';

/** Which permissions have been explained already on this device, so each is explained once. */
const EXPLAINED_KEY = 'astroturbomaxisolver.permissions-explained';
/** Set once the first-time welcome has been shown, so it is shown once. */
const WELCOME_KEY = 'astroturbomaxisolver.welcome-seen';

/** The user chose "Not now" before the browser was asked. */
export class NotNowError extends Error {
  constructor() {
    super('Not now');
    this.name = 'NotNowError';
  }
}

function readExplained(): Set<PermissionKind> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPLAINED_KEY) ?? '[]') as PermissionKind[]);
  } catch {
    return new Set();
  }
}

/**
 * Asks for the camera, the location and the motion sensors, each when it is first needed,
 * never all at once on opening: a permission refused without knowing why is hard to undo,
 * since the browser then stops asking. The first time, a line says why, before the
 * browser's own question. Once one is blocked, a card says how to allow it again.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly state = inject(AppState);
  private readonly install = inject(InstallService);
  private readonly alerts = inject(AlertController);
  private readonly translate = inject(TranslateService);
  private readonly explained = readExplained();

  /**
   * Runs the request that makes the browser ask, after saying why the first time. The
   * request runs inside the tap on Continue, since iPhones only ask for the motion sensors
   * straight after a tap. "Not now" rejects with NotNowError, and explains again next time.
   */
  ask<T>(
    kind: PermissionKind,
    request: () => Promise<T>,
    words: { header: string; message: string; messagePrefix?: string; later: string; go: string } = {
      ...PERMISSION_REASONS[kind],
      later: i18n('common.notNow'),
      go: i18n('common.continue'),
    },
  ): Promise<T> {
    if (this.explained.has(kind)) return request();
    // The words are text keys, translated here.
    const t = (key: string): string => this.translate.instant(key) as string;
    const { header, message, later, go } = words;
    return new Promise<T>((resolve, reject) => {
      void this.alerts
        .create({
          header: t(header),
          message: words.messagePrefix ? `${t(words.messagePrefix)} ${t(message)}` : t(message),
          backdropDismiss: false,
          htmlAttributes: { 'data-testid': 'permission-reason' },
          buttons: [
            { text: t(later), role: 'cancel', handler: () => reject(new NotNowError()) },
            {
              text: t(go),
              handler: () => {
                this.markExplained(kind);
                request().then(resolve, reject);
              },
            },
          ],
        })
        .then((alert) => alert.present());
    });
  }

  /** How to allow a blocked permission again, in this phone's own settings. */
  async showBlocked(kind: PermissionKind): Promise<void> {
    const { header, steps } = blockedHelp(kind, this.install.device);
    // A text, with the permission's name in it translated too.
    const say = ({ key, params }: Text): string =>
      this.translate.instant(key, params?.['name'] ? { name: this.translate.instant(params['name']) } : undefined);
    const alert = await this.alerts.create({
      header: say(header),
      // Each step on its own line: Ionic shows the message as text with line breaks kept.
      message: [say({ key: 'permissions.blocked.turnOn' }), ...steps.map(say)].join('\n\n'),
      cssClass: 'af-steps-alert',
      htmlAttributes: { 'data-testid': 'permission-blocked' },
      buttons: [this.translate.instant('common.gotIt') as string],
    });
    await alert.present();
  }

  /**
   * Sets the location from the GPS, asking for it as above. Resolves with the key of the short
   * message to show, or none when it was put off.
   */
  async locate(welcome = false): Promise<string> {
    let message: string;
    try {
      const request = (): Promise<string> => this.state.locateWithGps();
      message = welcome
        ? await this.ask('location', request, {
            header: i18n('permissions.welcome.header'),
            messagePrefix: i18n('permissions.welcome.question'),
            message: PERMISSION_REASONS.location.message,
            later: i18n('common.later'),
            go: i18n('permissions.welcome.useLocation'),
          })
        : await this.ask('location', request);
    } catch {
      return '';
    }
    if (message === LOCATION_BLOCKED) void this.showBlocked('location');
    return message;
  }

  /**
   * The first time the app opens, with no location yet: offers to take it from the GPS,
   * since the whole sky depends on it. The other permissions wait until they are needed.
   */
  welcomeOnce(): void {
    let seen = true;
    try {
      seen = localStorage.getItem(WELCOME_KEY) === 'true';
      localStorage.setItem(WELCOME_KEY, 'true');
    } catch {
      // Without storage it would show on every visit, so it isn't shown at all.
    }
    if (seen || this.state.settings().locationSet || this.explained.has('location')) return;
    void this.locate(true);
  }

  private markExplained(kind: PermissionKind): void {
    this.explained.add(kind);
    try {
      localStorage.setItem(EXPLAINED_KEY, JSON.stringify([...this.explained]));
    } catch {
      // Storage may be blocked: then it is explained again next visit.
    }
  }
}
