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

  /**
   * A soft camera shutter: two short, quiet clicks of filtered noise, the blades opening
   * and closing. Subtle enough not to startle anyone nearby at night.
   */
  shutter(): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    // Half a second of white noise is plenty for both clicks.
    const noise = context.createBuffer(1, Math.round(context.sampleRate * 0.5), context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    for (const { start, level } of [
      // Filtering leaves only a small part of the noise, so these levels are higher than
      // the beeps' and still don't clip.
      { start: 0, level: 0.6 },
      { start: 0.07, level: 0.4 },
    ]) {
      const source = context.createBufferSource();
      source.buffer = noise;
      // Only the mid-high band, so it sounds like a light mechanical click, not a hiss.
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2500;
      band.Q.value = 1.2;
      // A sharp attack and a fast decay make a click.
      const gain = context.createGain();
      const at = now + start;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
      source.connect(band).connect(gain).connect(context.destination);
      source.start(at);
      source.stop(at + 0.05);
    }
  }

  /** Whether sound is ready to play: unlocked and not suspended by the browser. */
  get ready(): boolean {
    return this.context?.state === 'running';
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
