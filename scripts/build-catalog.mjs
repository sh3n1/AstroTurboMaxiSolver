// Builds the target catalogue the app loads: Messier objects and named stars.
// Usage: node scripts/build-catalog.mjs <messier.json> <starnames.json> <stars.8.json>
// All three source files are in the data folder of
// https://github.com/ofrohn/d3-celestial
// Planets and the Moon are not here, because their positions change. The app
// calculates them with astronomy-engine.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , messierPath, namesPath, starsPath] = process.argv;
if (!messierPath || !namesPath || !starsPath) {
  throw new Error('Usage: node scripts/build-catalog.mjs <messier.json> <starnames.json> <stars.8.json>');
}

// Named stars fainter than this are hard to find, and many of the names are obscure.
const NAMED_STAR_MAG_LIMIT = 5;

// How the source labels Messier object types, mapped to the app's target kinds.
const MESSIER_KINDS = {
  gc: 'Globular cluster',
  oc: 'Open cluster',
  s: 'Galaxy',
  e: 'Galaxy',
  i: 'Galaxy',
  snr: 'Nebula',
  sfr: 'Nebula',
  pn: 'Nebula',
  rn: 'Nebula',
  pos: 'Other',
};

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
// The source stores right ascension from -180 to 180, and the app uses 0 to 360.
const round = (value, digits = 3) => Number(value.toFixed(digits));
const toRa = (value) => round((value + 360) % 360);

const messier = readJson(messierPath).features.map(({ id, properties, geometry }) => {
  const kind = MESSIER_KINDS[properties.type];
  if (!kind) throw new Error(`Unknown type ${properties.type} for ${id}`);
  return {
    id,
    // Many objects have no common name, so their other designation is shown instead.
    name: properties.alt || properties.desig || id,
    aliases: [properties.desig, properties.alt].filter(Boolean).join(' '),
    kind,
    raDeg: toRa(geometry.coordinates[0]),
    decDeg: round(geometry.coordinates[1]),
    mag: properties.mag,
    // The source gives sizes in arcminutes, as "6x4" or "13". The longer side comes first.
    ...(Number.parseFloat(properties.dim) ? { sizeArcmin: Number.parseFloat(properties.dim) } : {}),
  };
});

const names = readJson(namesPath);
const seen = new Set();
const namedStars = readJson(starsPath)
  .features.filter((star) => star.properties.mag <= NAMED_STAR_MAG_LIMIT && names[star.id]?.name)
  .sort((a, b) => a.properties.mag - b.properties.mag)
  .flatMap(({ id, properties, geometry }) => {
    const { name, bayer, flam, c, hip } = names[id];
    if (seen.has(name)) return []; // Keep the brightest star that has a given name
    seen.add(name);
    const designation = bayer || flam ? `${bayer || flam} ${c}` : hip;
    return [
      {
        id: name,
        name: designation,
        aliases: hip,
        kind: 'Star',
        raDeg: toRa(geometry.coordinates[0]),
        decDeg: round(geometry.coordinates[1]),
        mag: properties.mag,
      },
    ];
  });

const catalog = [...messier, ...namedStars];

// Stop now if a source changes format, rather than ship a broken catalogue.
const invalid = catalog.filter((t) => !t.id || !Number.isFinite(t.raDeg) || !Number.isFinite(t.decDeg) || !Number.isFinite(t.mag));
if (messier.length !== 110) throw new Error(`Expected 110 Messier objects, found ${messier.length}`);
if (invalid.length > 0) throw new Error(`Invalid entries: ${invalid.map((t) => t.id).join(', ')}`);

writeFileSync('src/assets/data/targets.json', JSON.stringify(catalog));
console.log(`Wrote ${messier.length} Messier objects and ${namedStars.length} named stars`);
