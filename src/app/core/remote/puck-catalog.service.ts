import { Injectable, inject } from '@angular/core';

import { AppState } from '../app-state.service';
import { CatalogLoaderService } from '../catalog/catalog-loader.service';
import { StarFieldService } from '../sky-map/star-field.service';

import { buildPuckCatalog, catalogId, crc32 } from './puck-catalog';

/** The faintest stars in the puck's catalogue: the sky map's own limit (stars.json). */
const MAP_STAR_LIMIT = 6.5;
/** How long to wait for the map's stars to load before sending a catalogue anyway. */
const STARS_WAIT_MS = 15_000;

/** A catalogue built for the puck, with its identity and check. */
export interface BuiltCatalog {
  id: string;
  bytes: Uint8Array;
  crc32: number;
}

/**
 * Builds the puck's catalogue (puck-catalog.ts) from what the sky map draws, once the app
 * has loaded it all, and keeps it: building takes a moment, and the same data must give the
 * same catalogue, so the puck doesn't load it again on every link.
 */
@Injectable({ providedIn: 'root' })
export class PuckCatalogService {
  private readonly state = inject(AppState);
  private readonly starField = inject(StarFieldService);
  private readonly loader = inject(CatalogLoaderService);

  private built: Promise<BuiltCatalog> | null = null;
  /** What the kept catalogue was built from, to build again only when that changes. */
  private builtFrom = '';

  /** The catalogue as the sky map's data is now. */
  async current(): Promise<BuiltCatalog> {
    await this.loader.whenComplete;
    await this.starsLoaded();
    const stars = this.starField.allStars().filter((star) => star.mag <= MAP_STAR_LIMIT);
    const constellations = this.starField.constellations();
    const targets = this.state.targets().filter((target) => !target.body);
    const from = [stars.length, constellations.length, targets.length].join('/');
    if (!this.built || from !== this.builtFrom) {
      this.builtFrom = from;
      this.built = (async () => {
        const bytes = buildPuckCatalog({ stars, constellations, targets });
        return { id: await catalogId(bytes), bytes, crc32: crc32(bytes) };
      })();
    }
    return this.built;
  }

  /** Waits for the map's stars and constellations, which load at start-up. */
  private async starsLoaded(): Promise<void> {
    for (let waited = 0; waited < STARS_WAIT_MS; waited += 200) {
      if (this.starField.stars().length > 0 && this.starField.constellations().length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}
