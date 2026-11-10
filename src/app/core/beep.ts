// Short beeps made with the Web Audio API, so the user knows something finished without
// looking at the screen, for example while the phone lies still facing the sky.

/** One tone: its pitch in hertz, and when it starts and how long it lasts, in seconds. */
interface Tone {
  hz: number;
  start: number;
  seconds: number;
}

/**
 * Plays beeps on a sound context. Browsers, and iOS Safari above all, only let a page make
 * sound after the user taps, so `unlock()` must be called from a tap before any `play()`.
 */
export class Beeper {
  private context: AudioContext | null = null;

  /** Prepares the sound context. Call it from a tap handler. */
  unlock(): void {
    try {
      this.context ??= new AudioContext();
      void this.context.resume();
    } catch {
      // No sound on this browser: beeping just stays silent.
    }
  }

  /** Two rising beeps, for success. */
  success(): void {
    this.play([
      { hz: 880, start: 0, seconds: 0.15 },
      { hz: 1320, start: 0.2, seconds: 0.2 },
    ]);
  }

  /** One low, longer beep, for a failure. */
  failure(): void {
    this.play([{ hz: 440, start: 0, seconds: 0.45 }]);
  }

  /** Frees the sound context. */
  close(): void {
    void this.context?.close();
    this.context = null;
  }

  private play(tones: Tone[]): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    for (const tone of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = tone.hz;
      // A quick fade in and out avoids clicks at the edges of the tone.
      const start = now + tone.start;
      const end = start + tone.seconds;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.4, start + 0.01);
      gain.gain.setValueAtTime(0.4, end - 0.03);
      gain.gain.linearRampToValueAtTime(0, end);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end);
    }
  }
}
