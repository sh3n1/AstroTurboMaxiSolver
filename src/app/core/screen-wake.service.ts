import { effect, inject, Injectable } from '@angular/core';

import { AppState } from './app-state.service';

/**
 * Keeps the phone's screen on while the app is open, when the "Keep screen on" setting is
 * on. At the telescope the phone sits untouched while you look through the eyepiece, and
 * a screen that sleeps also stops the sensors and the camera.
 *
 * Uses the browser's Screen Wake Lock API. The browser drops the lock whenever the app
 * goes to the background, so it is asked for again each time the app comes back.
 * Browsers without the API, such as older iPhones, simply follow the phone's own sleep
 * setting, and Settings says so.
 */
@Injectable({ providedIn: 'root' })
export class ScreenWakeService {
  private readonly state = inject(AppState);

  /** Whether this browser can keep the screen on. */
  readonly supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  /** The lock while held, or null. */
  private lock: WakeLockSentinel | null = null;

  constructor() {
    if (!this.supported) return;
    // Follows the setting: asks for the lock when it is turned on, lets go when turned off.
    effect(() => {
      if (this.state.settings().keepScreenOn) void this.acquire();
      else void this.release();
    });
    // The lock ends when the app is hidden, so ask again when it is visible once more.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.state.settings().keepScreenOn) void this.acquire();
    });
  }

  private async acquire(): Promise<void> {
    if (this.lock || document.visibilityState !== 'visible') return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      // Forget it when the browser lets it go, so the next visit asks again.
      lock.addEventListener('release', () => {
        if (this.lock === lock) this.lock = null;
      });
      this.lock = lock;
    } catch {
      // Refused, for example in battery saver: the phone's own sleep setting applies.
    }
  }

  private async release(): Promise<void> {
    const lock = this.lock;
    this.lock = null;
    await lock?.release().catch(() => undefined);
  }
}
