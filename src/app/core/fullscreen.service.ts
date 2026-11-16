import { Injectable, signal } from '@angular/core';

/**
 * Full screen, which hides the browser's bars and the phone's status bar, so the sky map
 * gets the whole screen and nothing bright shows at the edges in the dark.
 *
 * Installed as an app, the manifest already opens it full screen, so the button is only
 * needed in a browser tab, or where the phone opens installed apps with their bars.
 * iPhones don't let web pages go full screen, so there the button is hidden.
 */
@Injectable({ providedIn: 'root' })
export class FullscreenService {
  /** Whether the installed app already opened full screen, from the manifest. */
  private readonly openedFullscreen =
    typeof matchMedia !== 'undefined' && matchMedia('(display-mode: fullscreen)').matches;

  /** Whether the button is worth offering: the browser allows it and the app isn't full screen already. */
  readonly supported = typeof document !== 'undefined' && document.fullscreenEnabled === true && !this.openedFullscreen;

  /** Whether the page is full screen now, including after the user leaves it by a gesture. */
  readonly active = signal(this.isFullscreen());

  constructor() {
    if (this.supported) {
      document.addEventListener('fullscreenchange', () => this.active.set(this.isFullscreen()));
    }
  }

  /** Enters full screen, or leaves it. */
  async toggle(): Promise<void> {
    if (this.isFullscreen()) await this.exit();
    else await this.enter();
  }

  /**
   * Enters full screen. Returns whether it worked: browsers only allow it straight after a
   * tap on this phone, so a request from the other phone of a pair is refused.
   */
  async enter(): Promise<boolean> {
    if (this.isFullscreen()) return true;
    // Hides the phone's navigation bar too, where the browser allows it.
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    return this.isFullscreen();
  }

  /** Leaves full screen, which needs no tap. */
  async exit(): Promise<void> {
    if (this.isFullscreen()) await document.exitFullscreen().catch(() => undefined);
  }

  private isFullscreen(): boolean {
    return typeof document !== 'undefined' && Boolean(document.fullscreenElement);
  }
}
