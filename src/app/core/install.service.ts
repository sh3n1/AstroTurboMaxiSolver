import { Injectable, computed, signal } from '@angular/core';

import type { DeviceKind } from './permission-help';
import { deviceKind } from './permission-help';

/** Chrome's install event: kept to show its install dialog when the user asks. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Whether the app already runs installed, from the home screen, rather than in a browser tab. */
function runsInstalled(): boolean {
  const modes = ['fullscreen', 'standalone', 'minimal-ui'];
  const displayed = typeof matchMedia === 'function' && modes.some((m) => matchMedia(`(display-mode: ${m})`).matches);
  // Safari on iPhones says so in its own way.
  return displayed || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Installing the app on the home screen, where it opens full screen, works offline and
 * keeps its data for good: iPhones clear a browser tab's data after a week unused.
 *
 * Android Chrome offers its own install dialog, which the app shows when the user asks.
 * iPhones and iPads have none, so the app shows the steps to add it from the Share menu.
 * Started with the app, so Chrome's install event, which comes early, isn't missed.
 */
@Injectable({ providedIn: 'root' })
export class InstallService {
  /** Already on the home screen: nothing to offer. */
  readonly installed = signal(runsInstalled());
  /** The kind of device, which says where its settings are, and how to install. */
  readonly device: DeviceKind = deviceKind(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  /** An iPhone or iPad, where installing means following steps. */
  readonly isApple = this.device === 'apple';
  /** Chrome's install event, while it can still be used. */
  private readonly prompt = signal<InstallPromptEvent | null>(null);
  /** The steps for iPhones and iPads are on show. */
  readonly stepsOpen = signal(false);

  /** Whether installing can be offered here: Chrome's dialog is ready, or the steps on iPhones. */
  readonly available = computed(() => !this.installed() && (!!this.prompt() || this.isApple));

  constructor() {
    window.addEventListener('beforeinstallprompt', (event) => {
      // Chrome's own banner would come at a moment of its choosing: the app offers it instead.
      event.preventDefault();
      this.prompt.set(event as InstallPromptEvent);
    });
    window.addEventListener('appinstalled', () => {
      this.installed.set(true);
      this.prompt.set(null);
    });
  }

  /** Installs: Chrome's dialog where there is one, or the steps on iPhones and iPads. */
  async install(): Promise<void> {
    const prompt = this.prompt();
    if (!prompt) {
      if (this.isApple) this.stepsOpen.set(true);
      return;
    }
    await prompt.prompt();
    // Chrome's event works once: after the dialog, accepted or not, it is used up.
    const { outcome } = await prompt.userChoice;
    this.prompt.set(null);
    if (outcome === 'accepted') this.installed.set(true);
  }
}
