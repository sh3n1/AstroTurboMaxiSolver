# Sky brightness, from the Falchi et al. world atlas

- **What:** how bright the night sky is at each place, which sets the Bortle class from the location (`sky-brightness.ts`). Optional: without this folder the Bortle class is chosen by hand.
- **From:** `World_Atlas_2015.tif` in `World_Atlas_2015.zip`, the [New World Atlas of Artificial Night Sky Brightness](https://doi.org/10.5880/GFZ.1.4.2016.001) by Falchi et al. (2016), downloaded from https://datapub.gfz.de/download/10.5880.GFZ.1.4.2016.001/ on 2026-11-18. It gives the artificial brightness of the sky overhead in mcd/m², every 30″ from 85°N to 60°S, modelled from 2014 VIIRS satellite data.
- **Licence:** CC BY-NC 4.0, see `LICENSE.txt`. The README inside the zip, from 2016, still says further distribution is prohibited. It also says changes would be announced on the data's web page, which since 13 November 2019 gives the licence as CC BY-NC 4.0.
- **Built by:** `node scripts/build-sky-brightness.mjs <World_Atlas_2015.tif>`
- **Changes:**
  - averaged to cells of 1′;
  - natural sky brightness added: 174 µcd/m², 22.0 mag/arcsec², as in the atlas paper;
  - each cell stored as one byte: fortieths of a magnitude brighter than 22.0 mag/arcsec²;
  - cut into gzipped tiles of 10° × 10°, named by their south-west corner (`N30W010.bin`), leaving out tiles where the sky is pristine everywhere;
  - `index.json` lists the tiles and the atlas's limits.
