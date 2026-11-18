import { Injectable, signal } from '@angular/core';

import type { CaldwellData } from './caldwell';
import { CATALOG_PATHS, buildCatalog, readCatalogFiles } from './catalog-build';
import type { CatalogFiles } from './catalog-build';
import type { Target } from './targets';

/** Every catalogue file, and the two small ones the map shows at once. */
const ALL_FILES = Object.keys(CATALOG_PATHS) as (keyof CatalogFiles)[];
const FIRST_FILES: (keyof CatalogFiles)[] = ['targets', 'constellations'];

/**
 * Loads the catalogue files so an old phone shows its map quickly.
 *
 * The files are several megabytes, and reading and joining them keeps a phone busy for a
 * second or more. Done on the page at start-up, as it was, that held back the first sight
 * of the map. Now the page reads only the two small files with the brightest objects and
 * the constellations, and a Web Worker reads and joins everything in the background. The
 * page then takes the whole list in one step.
 */
@Injectable({ providedIn: 'root' })
export class CatalogLoaderService {
  /** Fixed objects from the catalogue files: the brightest first, then all of them. */
  readonly catalog = signal<Target[]>([]);
  /** The Caldwell catalogue, which adds its numbers to NGC and IC objects. Null until loaded. */
  readonly caldwell = signal<CaldwellData | null>(null);
  /** True once the whole catalogue is in, so the brightest objects alone don't replace it. */
  private complete = false;
  /** Resolves once the whole catalogue is in: see whenComplete. */
  private markComplete: () => void = () => undefined;
  /**
   * Resolves once the whole catalogue is in, for work that must see every object, such as
   * importing a list, which would otherwise call NGC objects missing in the first seconds.
   */
  readonly whenComplete = new Promise<void>((resolve) => (this.markComplete = resolve));

  constructor() {
    const folderUrl = new URL('assets/data/', document.baseURI).href;
    void this.loadFirst(folderUrl);
    void this.loadCaldwell(folderUrl);
    this.loadAll(folderUrl);
  }

  /** What the map shows at a glance: Messier, the named stars and the constellations. */
  private async loadFirst(folderUrl: string): Promise<void> {
    const catalog = buildCatalog(await readCatalogFiles(folderUrl, FIRST_FILES));
    if (!this.complete) this.catalog.set(catalog);
  }

  /** Everything, in the background where there are workers, as in every browser the app supports. */
  private loadAll(folderUrl: string): void {
    const onPage = async (): Promise<void> => this.finish(buildCatalog(await readCatalogFiles(folderUrl, ALL_FILES)));
    if (typeof Worker !== 'function') return void onPage();
    const worker = new Worker(new URL('./catalog.worker', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ({ data }: MessageEvent<Target[]>) => {
      this.finish(data);
      worker.terminate();
    });
    // A worker that fails to start must not leave the app without its catalogues.
    worker.addEventListener('error', () => {
      worker.terminate();
      void onPage();
    });
    worker.postMessage(folderUrl);
  }

  private finish(catalog: Target[]): void {
    this.complete = true;
    this.catalog.set(catalog);
    this.markComplete();
  }

  /** Loads the Caldwell list. Without it, everything still works, just without Caldwell numbers. */
  private async loadCaldwell(folderUrl: string): Promise<void> {
    try {
      this.caldwell.set((await (await fetch(`${folderUrl}caldwell.json`)).json()) as CaldwellData);
    } catch {
      // Search by NGC and IC numbers still finds every Caldwell object.
    }
  }
}
