# OpenNGC

- **What:** the NGC and IC objects the app offers as targets.
- **From:** `database_files/NGC.csv` of [OpenNGC](https://github.com/mattiaverga/OpenNGC), by Mattia Verga.
- **Licence:** CC BY-SA 4.0, see `LICENSE.txt`.
- **Built by:** `node scripts/build-openngc.mjs <NGC.csv>`
- **Changes:** converted to JSON, with duplicates, non-existent objects, single stars and Messier objects removed, and the fields reduced to position, brightness, type and names.
