import { Injectable, effect, inject, signal } from '@angular/core';

import { AppState } from './app-state.service';
import { lookUpSkyBrightness } from './sky-brightness';
import type { SkyBrightness, SkyBrightnessIndex } from './sky-brightness';

/** Where the light pollution atlas is. Optional: see sky-brightness.ts. */
const ATLAS_FOLDER = 'assets/data/aggregate/falchi/';

/**
 * Sets the Bortle class from the location, with the light pollution atlas, while the
 * "Auto" sky darkness is on. Choosing a class by hand in Settings turns it off.
 *
 * Only the atlas tile for the location is downloaded, once, and the service worker keeps
 * it for offline use. The whole app, including every other use of the Bortle class,
 * keeps reading it from the settings as before.
 */
@Injectable({ providedIn: 'root' })
export class SkyBrightnessService {
  private readonly state = inject(AppState);

  /** False if the atlas isn't there, as in a copy of the app without it: Auto is then not offered. */
  readonly available = signal(true);
  /** What the atlas says about the current location, or null until known. */
  readonly reading = signal<SkyBrightness | null>(null);

  /** The atlas's index, read once. Null if it can't be read. */
  private index: Promise<SkyBrightnessIndex | null> | null = null;

  constructor() {
    effect(() => {
      const { latitudeDeg, longitudeDeg, locationSet } = this.state.settings();
      if (locationSet) void this.lookUp(latitudeDeg, longitudeDeg);
      else this.reading.set(null);
    });
    // While Auto is on, the Bortle class follows the atlas.
    effect(() => {
      const reading = this.reading();
      const { bortleAuto, bortle } = this.state.settings();
      if (reading && bortleAuto && bortle !== reading.bortle) this.state.updateSettings({ bortle: reading.bortle });
    });
  }

  private async lookUp(latDeg: number, lonDeg: number): Promise<void> {
    const folder = new URL(ATLAS_FOLDER, document.baseURI).href;
    this.index ??= fetchJson<SkyBrightnessIndex>(folder + 'index.json');
    const index = await this.index;
    if (!index) {
      this.available.set(false);
      return;
    }
    try {
      const reading = await lookUpSkyBrightness(latDeg, lonDeg, index, async (name) => {
        const response = await fetch(`${folder}${name}.bin`);
        if (!response.ok) throw new Error(`No tile ${name}`);
        return response.arrayBuffer();
      });
      // Only if the location is still the same: it may have changed while the tile came.
      const { latitudeDeg, longitudeDeg } = this.state.settings();
      if (latitudeDeg === latDeg && longitudeDeg === lonDeg) this.reading.set(reading);
    } catch {
      // Offline before the tile was ever downloaded: the class stays as it was, and the
      // next change of location, or the next start, tries again.
    }
  }
}

/** A JSON file, or null if it can't be fetched or read. */
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}
