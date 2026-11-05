// Builds the compact star file the sky map loads, from d3-celestial's stars.8.json.
// Usage: node scripts/build-star-data.mjs <stars.8.json> [limitingMagnitude]
// Each output row is [right ascension in degrees, declination in degrees, magnitude,
// B-V colour index]. A missing colour index becomes a neutral 0.6.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , sourcePath, limitArg] = process.argv;
if (!sourcePath) throw new Error('Usage: node scripts/build-star-data.mjs <stars.8.json> [limit]');
const limit = Number(limitArg ?? 6.5);

const rows = JSON.parse(readFileSync(sourcePath, 'utf8'))
  .features.filter((star) => star.properties.mag <= limit)
  // The source stores right ascension from -180 to 180, the app uses 0 to 360.
  .map(({ geometry, properties }) => [
    Number(((geometry.coordinates[0] + 360) % 360).toFixed(3)),
    Number(geometry.coordinates[1].toFixed(3)),
    Number(properties.mag.toFixed(2)),
    Number((Number.parseFloat(properties.bv) || 0.6).toFixed(2)),
  ])
  // Brightest first, so drawing can stop early when only bright stars are needed.
  .sort((a, b) => a[2] - b[2]);

writeFileSync('src/assets/data/stars.json', JSON.stringify(rows));
console.log(`Wrote ${rows.length} stars down to magnitude ${limit}`);
