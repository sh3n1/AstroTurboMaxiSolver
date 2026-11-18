/// <reference lib="webworker" />

// Reads the catalogue files and joins them in the background, so the map stays smooth while
// several megabytes load. The page sends the folder they are in, and gets the targets back.

import { CATALOG_PATHS, buildCatalog, readCatalogFiles } from './catalog-build';
import type { CatalogFiles } from './catalog-build';

addEventListener('message', ({ data: folderUrl }: MessageEvent<string>) => {
  void readCatalogFiles(folderUrl, Object.keys(CATALOG_PATHS) as (keyof CatalogFiles)[]).then((files) =>
    postMessage(buildCatalog(files)),
  );
});
