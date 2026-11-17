import { Injectable, computed, signal } from '@angular/core';

/** Chrome's install event: kept to show its install dialog when the user asks. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Saved once the user says "not now" to the install notice, so it isn't offered again. */
const DISMISSED_KEY = 'astroturbomaxisolver.install-dismissed';

/** Whether the app already runs installed, from the home screen, rather than in a browser tab. */
function runsInstalled(): boolean {
  const modes = ['fullscreen', 'standalone', 'minimal-ui'];
  const displayed = typeof matchMedia === 'function' && modes.some((m) => matchMedia(`(display-mode: ${m})`).matches);
  // Safari on iPhones says so in its own way.
  return displayed || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * iPhones and iPads, where no browser offers an install button: the app is added from the
 * Share menu instead. iPads ask for the desktop site, so they say they are Macs, with touch.
 */
export function isAppleMobile(userAgent: string, platform: string, touchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && touchPoints > 1);
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
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
  /** An iPhone or iPad, where installing means following steps. */
  readonly isApple = isAppleMobile(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  /** Chrome's install event, while it can still be used. */
  private readonly prompt = signal<InstallPromptEvent | null>(null);
  /** The user said "not now" to the notice once. The menu still offers installing. */
  readonly dismissed = signal(readDismissed());
  /** The steps for iPhones and iPads are on show. */
  readonly stepsOpen = signal(false);

  /** Whether installing can be offered here: Chrome's dialog is ready, or the steps on iPhones. */
  readonly available = computed(() => !this.installed() && (!!this.prompt() || this.isApple));
  /** Whether to show the notice on the map: available, and not turned down before. */
  readonly offered = computed(() => this.available() && !this.dismissed());

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

  /** "Not now": the notice isn't shown again on this device. */
  dismiss(): void {
    this.dismissed.set(true);
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // Storage may be blocked: then it is only for this visit.
    }
  }
}
