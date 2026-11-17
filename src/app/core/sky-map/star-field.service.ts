import { Injectable, computed, inject, signal } from '@angular/core';

import { AppState } from '../app-state.service';
import { equatorialVector } from '../astronomy';
import type { ConstellationRow } from '../constellations';
import type { ComponentStar } from '../double-stars';
import { doubleComponents, withoutDoubleCopies } from '../double-stars';

import type { Constellation, Star } from './sky-style';
import { starTintIndex } from './sky-style';

/** Size of the grid cells that let the eyepiece view find nearby stars quickly. */
const STAR_CELL_DEG = 4;

/** A row of stars.json and stars-deep.json: right ascension, declination, magnitude, B-V. */
type StarRow = [number, number, number, number];

function toStar([raDeg, decDeg, mag, colorIndex]: StarRow): Star {
  return { raDeg, decDeg, vector: equatorialVector(raDeg, decDeg), mag, colorIndex: starTintIndex(colorIndex) };
}

/** The grid cell a position falls in: see STAR_CELL_DEG. */
function cellKey(raDeg: number, decDeg: number): number {
  const row = Math.floor((decDeg + 90) / STAR_CELL_DEG);
  const column = Math.floor((((raDeg % 360) + 360) % 360) / STAR_CELL_DEG);
  return row * 1000 + column;
}

/**
 * The sky map's background: its stars and the constellations' lines and names, loaded from
 * the app's data files. The bright stars and the constellations load at once. The faint
 * stars are a large file, so they wait until the eyepiece view asks for them.
 */
@Injectable({ providedIn: 'root' })
export class StarFieldService {
  private readonly state = inject(AppState);

  /** The map's stars as loaded, brightest first. */
  readonly stars = signal<Star[]>([]);
  readonly constellations = signal<Constellation[]>([]);

  private readonly baseStarsLoaded: Promise<void>;
  private deepStarsRequested = false;

  /**
   * The double stars' own stars. Only changes when the doubles load, not each minute as
   * the planets move, so the stars below aren't sorted again for nothing.
   */
  private readonly doubleStars = computed(() => doubleComponents(this.state.targets().filter((t) => t.double)), {
    equal: (a, b) => a.length === b.length,
  });

  /**
   * Every star to draw, brightest first: the map's stars, with each double star's stars
   * at their precise places instead of the map's rounded or blended copies.
   */
  readonly allStars = computed(() => {
    const components = this.doubleStars();
    if (components.length === 0) return this.stars();
    const toStar = ({ raDeg, decDeg, mag, bv }: ComponentStar): Star => ({
      raDeg,
      decDeg,
      vector: equatorialVector(raDeg, decDeg),
      mag,
      colorIndex: starTintIndex(bv),
    });
    return [...withoutDoubleCopies(this.stars(), components), ...components.map(toStar)].sort((a, b) => a.mag - b.mag);
  });

  /** Stars grouped into cells of right ascension and declination. */
  private readonly starGrid = computed(() => {
    const grid = new Map<number, Star[]>();
    for (const star of this.allStars()) {
      const key = cellKey(star.raDeg, star.decDeg);
      const cell = grid.get(key);
      if (cell) cell.push(star);
      else grid.set(key, [star]);
    }
    return grid;
  });

  constructor() {
    this.baseStarsLoaded = this.loadStars();
    void this.loadConstellations();
  }

  /** Stars within a field of where the view points, from the grid cells that can hold them. */
  starsNear(fieldDeg: number): Star[] {
    const { raDeg, decDeg } = this.state.pointingEquatorial();
    const radius = fieldDeg * 0.75 + STAR_CELL_DEG; // Half the diagonal, plus a cell's width
    const grid = this.starGrid();
    const found: Star[] = [];
    const lowDec = Math.max(-90, decDeg - radius);
    const highDec = Math.min(90, decDeg + radius);
    // Lines of right ascension crowd together towards the poles, so cover more of them there.
    const widestDec = Math.min(89.9, Math.max(Math.abs(lowDec), Math.abs(highDec)));
    const raRadius =
      highDec >= 89.9 || lowDec <= -89.9 ? 180 : Math.min(180, radius / Math.cos((widestDec * Math.PI) / 180));
    const columns = Math.min(360 / STAR_CELL_DEG, Math.ceil((2 * raRadius) / STAR_CELL_DEG) + 1);
    const firstColumn = Math.floor((raDeg - raRadius) / STAR_CELL_DEG);
    for (let dec = lowDec; dec <= highDec + STAR_CELL_DEG; dec += STAR_CELL_DEG) {
      const clampedDec = Math.min(89.99, dec);
      for (let c = 0; c < columns; c++) {
        found.push(...(grid.get(cellKey((firstColumn + c) * STAR_CELL_DEG, clampedDec)) ?? []));
      }
    }
    return found;
  }

  /** Adds the faint stars after the bright ones, keeping the brightest-first order. Once only. */
  async loadDeepStars(): Promise<void> {
    if (this.deepStarsRequested) return;
    this.deepStarsRequested = true;
    try {
      await this.baseStarsLoaded;
      const response = await fetch('assets/data/stars-deep.json');
      const deep = ((await response.json()) as StarRow[]).map(toStar);
      this.stars.update((current) => [...current, ...deep]);
    } catch {
      // The eyepiece view still works with the brighter stars only.
      this.deepStarsRequested = false;
    }
  }

  private async loadStars(): Promise<void> {
    try {
      const response = await fetch('assets/data/stars.json');
      this.stars.set(((await response.json()) as StarRow[]).map(toStar));
    } catch {
      // The map still shows targets and the horizon without its background stars.
      this.stars.set([]);
    }
  }

  private async loadConstellations(): Promise<void> {
    try {
      const response = await fetch('assets/data/constellations.json');
      const rows = (await response.json()) as ConstellationRow[];
      this.constellations.set(
        rows.map(({ name, label, lines }) => ({
          name,
          label: equatorialVector(label[0], label[1]),
          lines: lines.map((line) => line.map(([ra, dec]) => equatorialVector(ra, dec))),
        })),
      );
    } catch {
      // Constellation lines are a help, not a requirement.
      this.constellations.set([]);
    }
  }
}
