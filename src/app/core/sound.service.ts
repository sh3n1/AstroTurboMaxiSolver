import { Injectable } from '@angular/core';

import { Beeper } from './beep';

/**
 * The app's sounds, shared by every page. Browsers, and iOS Safari above all, only let a
 * page make sound after the user has tapped it, so sound is unlocked on the first tap or
 * key press anywhere, and stays unlocked from then on.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private readonly beeper = new Beeper();

  private readonly unlock = (): void => {
    this.beeper.unlock();
    // Once running it stays so; until then, any later tap tries again.
    if (this.beeper.ready) this.stopListening();
  };

  constructor() {
    window.addEventListener('pointerdown', this.unlock, true);
    window.addEventListener('keydown', this.unlock, true);
  }

  /** The soft shutter click for a plate solve. Silent if sound isn't unlocked yet. */
  shutter(): void {
    this.beeper.shutter();
  }

  private stopListening(): void {
    window.removeEventListener('pointerdown', this.unlock, true);
    window.removeEventListener('keydown', this.unlock, true);
  }
}
