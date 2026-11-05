// Builds the constellation lines and names the sky map draws.
// Usage: node scripts/build-constellations.mjs <constellations.lines.json> <constellations.json>
// Both source files are in the data folder of https://github.com/ofrohn/d3-celestial
import { readFileSync, writeFileSync } from 'node:fs';

const [, , linesPath, namesPath] = process.argv;
if (!linesPath || !namesPath) {
  throw new Error('Usage: node scripts/build-constellations.mjs <constellations.lines.json> <constellations.json>');
}

const readFeatures = (path) => JSON.parse(readFileSync(path, 'utf8')).features;
// The source stores right ascension from -180 to 180, and the app uses 0 to 360.
const toPoint = ([ra, dec]) => [Number(((ra + 360) % 360).toFixed(3)), Number(dec.toFixed(3))];

const names = new Map(readFeatures(namesPath).map((feature) => [feature.id, feature]));

const constellations = readFeatures(linesPath).map(({ id, geometry }) => {
  const named = names.get(id);
  if (!named) throw new Error(`No name for constellation ${id}`);
  return {
    id,
    name: named.properties.name,
    label: toPoint(named.geometry.coordinates),
    lines: geometry.coordinates.map((line) => line.map(toPoint)),
  };
});

// There are exactly 88 modern constellations, though sources may split one in two.
if (constellations.length < 88) throw new Error(`Expected at least 88 constellations, found ${constellations.length}`);

writeFileSync('src/assets/data/constellations.json', JSON.stringify(constellations));
console.log(`Wrote ${constellations.length} constellations`);
