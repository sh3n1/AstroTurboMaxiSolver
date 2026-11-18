# HYG Database star names

- **What:** the stars' catalogue names (Bayer, Flamsteed, variable star, HR, HD and Hipparcos), so stars can be searched by them.
- **From:** `hygdata_v41.csv`, version 4.1 of the [HYG Database](https://github.com/astronexus/HYG-Database) by David Nash, which combines Hipparcos, the Yale Bright Star Catalogue and the Gliese catalogue.
- **Licence:** CC BY-SA 4.0, see `LICENSE.txt`.
- **Built by:** `node scripts/build-hyg.mjs <hygdata_v41.csv>`
- **Changes:** stars to magnitude 6.5, fainter stars with a Bayer or Flamsteed name, and variable stars to magnitude 8.5. Only the names, position, magnitude and colour are kept, as compact JSON.
