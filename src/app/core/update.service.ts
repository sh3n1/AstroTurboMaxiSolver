import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** While the app stays open, it checks for a new version this often. */
const CHECK_EVERY_MS = 30 * 60_000;

/**
 * New versions of the app. Angular's service worker fetches a new version in the background
 * when the app opens, but keeps running the old one until the app starts again, which on a
 * phone means closing it fully. This notices when a new version is ready, so the map can
 * offer to switch to it straight away.
 *
 * It checks when the app opens, when it comes back to the front, and every half hour while
 * it stays open. Under the dev server there is no service worker, and so nothing to offer.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  /** Missing where no service worker is provided, as in some tests. */
  private readonly worker = inject(SwUpdate, { optional: true });

  /** A new version is downloaded and ready: switching to it is a reload. */
  readonly ready = signal(false);

  constructor() {
    if (!this.worker?.isEnabled) return;
    const worker = this.worker;
    worker.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') this.ready.set(true);
    });
    // The version kept for offline use is broken, as when the server removed its files: a
    // reload fetches the current one.
    worker.unrecoverable.subscribe(() => this.ready.set(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.check();
    });
    setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  /** Switches to the new version: the service worker takes it up, and the page reloads with it. */
  async apply(): Promise<void> {
    try {
      await this.worker?.activateUpdate();
    } catch {
      // A reload alone still gets the new version from the network.
    }
    this.reload();
  }

  /** Reloads the page. Its own method, so tests can replace it. */
  protected reload(): void {
    location.reload();
  }

  private async check(): Promise<void> {
    try {
      await this.worker?.checkForUpdate();
    } catch {
      // Offline, or the server can't be reached: the next check will try again.
    }
  }
}
