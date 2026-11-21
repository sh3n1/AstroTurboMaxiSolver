import { computed, effect, inject, Injectable, signal } from '@angular/core';

import { AppState } from '../app-state.service';

/**
 * Keeps the phone's screen on while the app is open, when the "Keep screen on" setting is
 * on, or while something needs it whatever the setting (keepOnFor), such as a linked puck.
 * At the telescope the phone sits untouched while you look through the eyepiece, and a
 * screen that sleeps also stops the sensors and the camera, and the app's messages.
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
  /** What needs the screen on whatever the setting, such as 'puck'. */
  private readonly needs = signal<ReadonlySet<string>>(new Set());
  /** Whether the screen should stay on now. */
  private readonly wanted = computed(() => this.state.settings().keepScreenOn || this.needs().size > 0);

  constructor() {
    if (!this.supported) return;
    // Follows the setting and the needs: asks for the lock when one wants it, lets go when none does.
    effect(() => {
      if (this.wanted()) void this.acquire();
      else void this.release();
    });
    // The lock ends when the app is hidden, so ask again when it is visible once more.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.wanted()) void this.acquire();
    });
  }

  /**
   * Keeps the screen on for this reason, whatever the setting, until called with false. A
   * linked puck needs it: with the screen off, the browser all but stops the app, its
   * messages stop, and after 4 s the puck takes the link as lost.
   */
  keepOnFor(reason: string, on: boolean): void {
    const needs = new Set(this.needs());
    if (on) needs.add(reason);
    else needs.delete(reason);
    this.needs.set(needs);
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
