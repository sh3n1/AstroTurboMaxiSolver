// Builds the star files the app loads, from d3-celestial's stars.14.json.
// Usage: node scripts/build-star-data.mjs <stars.14.json>
// The source is the full Hipparcos-based XHIP catalogue. It is complete to about
// magnitude 8.5, and includes only some fainter stars.
//
// It writes two files, so the sky map loads quickly and only the eyepiece view needs
// the large one:
//   stars.json       stars to magnitude 6.5, for the sky map
//   stars-deep.json  every fainter star, loaded when the eyepiece view opens
//
// Each row is [right ascension in degrees, declination in degrees, magnitude, B-V colour
// index]. A missing colour index becomes a neutral 0.6. Rows run brightest first.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , sourcePath] = process.argv;
if (!sourcePath) throw new Error('Usage: node scripts/build-star-data.mjs <stars.14.json>');
const MAP_LIMIT = 6.5;

const rows = JSON.parse(readFileSync(sourcePath, 'utf8'))
  .features // The source stores right ascension from -180 to 180, the app uses 0 to 360.
  .map(({ geometry, properties }) => [
    Number(((geometry.coordinates[0] + 360) % 360).toFixed(3)),
    Number(geometry.coordinates[1].toFixed(3)),
    Number(properties.mag.toFixed(2)),
    Number((Number.parseFloat(properties.bv) || 0.6).toFixed(2)),
  ])
  .sort((a, b) => a[2] - b[2]);

const mapRows = rows.filter((row) => row[2] <= MAP_LIMIT);
const deepRows = rows.filter((row) => row[2] > MAP_LIMIT);
if (mapRows.length < 8000 || deepRows.length < 100_000) {
  throw new Error(`Unexpected star counts: ${mapRows.length} and ${deepRows.length}`);
}

writeFileSync('src/assets/data/stars.json', JSON.stringify(mapRows));
writeFileSync('src/assets/data/stars-deep.json', JSON.stringify(deepRows));
console.log(`Wrote ${mapRows.length} map stars and ${deepRows.length} fainter stars`);
