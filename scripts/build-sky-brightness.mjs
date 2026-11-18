// Builds the sky brightness map the app reads to set the Bortle class from the location,
// in src/assets/data/aggregate/falchi/, from the World Atlas of Artificial Night Sky
// Brightness by Falchi et al. (2016).
// Usage: node scripts/build-sky-brightness.mjs <World_Atlas_2015.tif>
//
// The atlas: https://doi.org/10.5880/GFZ.1.4.2016.001, the zip file at
// https://datapub.gfz.de/download/10.5880.GFZ.1.4.2016.001/ (about 700 MB, 3 GB unzipped).
// It is CC BY-NC 4.0, non-commercial, so what this writes is too: it stays in its own
// folder, outside the app's GPL, and the app works without it. See SOURCE.md there.
//
// The atlas is a GeoTIFF of 43200 × 17406 floats, the artificial brightness of the sky
// overhead in mcd/m², every 30″ from 85°N to 60°S. It is uncompressed and in 128 × 128
// tiles, so it is read here directly, with no GeoTIFF library.
//
// What this writes, cut to what a phone needs:
// - Cells of 1′ (about 1.8 km at the equator): each the mean brightness of the 4 atlas
//   cells in it. Sky glow spreads over tens of kilometres, so little is lost.
// - Each cell as one byte: the total sky brightness, natural plus artificial, as how many
//   fortieths of a magnitude it is brighter than the natural sky, 22.0 mag/arcsec².
//   So 0 is a pristine sky and 191 is central Valencia (17.2 mag/arcsec²).
// - Tiles of 10° × 10°, gzipped, so the app only downloads the one for its location.
//   Tiles where the sky is pristine everywhere, such as open ocean, are left out.

import { closeSync, mkdirSync, openSync, readdirSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const [, , sourcePath] = process.argv;
if (!sourcePath) throw new Error('Usage: node scripts/build-sky-brightness.mjs <World_Atlas_2015.tif>');

const OUT_DIR = 'src/assets/data/aggregate/falchi';
/** The output cells: 60 a degree, so 1′ each. */
const CELLS_PER_DEGREE = 60;
const TILE_DEGREES = 10;
const TILE_CELLS = CELLS_PER_DEGREE * TILE_DEGREES;
/** The natural sky brightness the atlas assumes: 174 µcd/m², 22.0 mag/arcsec². */
const NATURAL_MCD = 0.174;
/** Fortieths of a magnitude per stored step, so a byte covers 22.0 down to 15.6 mag/arcsec². */
const STEPS_PER_MAG = 40;

// --- Reading the GeoTIFF's header: its size, its tiles, and where it lies on Earth. ---

const file = openSync(sourcePath, 'r');
/** Reads bytes from the file at a position. */
function read(position, length) {
  const buffer = Buffer.alloc(length);
  readSync(file, buffer, 0, length, position);
  return buffer;
}
const head = read(0, 16);
if (head.toString('ascii', 0, 2) !== 'II' || head.readUInt16LE(2) !== 42) throw new Error('Not a little-endian TIFF');

/** The first directory's tags, by number: [type, count, value or offset]. */
const tags = new Map();
const directory = head.readUInt32LE(4);
const entryCount = read(directory, 2).readUInt16LE(0);
const entries = read(directory + 2, entryCount * 12);
for (let i = 0; i < entryCount; i++) {
  const at = i * 12;
  tags.set(entries.readUInt16LE(at), [
    entries.readUInt16LE(at + 2),
    entries.readUInt32LE(at + 4),
    entries.readUInt32LE(at + 8),
  ]);
}
const tagValue = (tag) => tags.get(tag)[2];
const width = tagValue(256);
const height = tagValue(257);
const tileWidth = tagValue(322);
const tileHeight = tagValue(323);
if (tagValue(258) !== 32 || tagValue(259) !== 1 || tagValue(339) !== 3) {
  throw new Error('Expected uncompressed 32-bit floats');
}
const [, tileCount, tileOffsetsAt] = tags.get(324);
const tileOffsets = read(tileOffsetsAt, tileCount * 4);
const tilesAcross = Math.ceil(width / tileWidth);
const tilesDown = Math.ceil(height / tileHeight);
// ModelPixelScale (33550) and ModelTiepoint (33922): the size of a cell, and the
// top left corner of the image in degrees.
const scale = read(tagValue(33550), 24).readDoubleLE(0);
const tiepoint = read(tagValue(33922), 48);
const west = tiepoint.readDoubleLE(24);
const north = tiepoint.readDoubleLE(32);
const south = north - height * scale;
console.log(
  `${width} × ${height} cells of ${(scale * 3600).toFixed(1)}″, ${north.toFixed(2)}° to ${south.toFixed(2)}°`,
);

// --- Adding up the atlas cells into the output cells, a row of TIFF tiles at a time. ---

/** The output grid, the whole world, from 90°N down and from 180°W east. */
const gridWidth = 360 * CELLS_PER_DEGREE;
const gridHeight = 180 * CELLS_PER_DEGREE;
const sums = new Float32Array(gridWidth * gridHeight);
const counts = new Uint8Array(gridWidth * gridHeight);

for (let ty = 0; ty < tilesDown; ty++) {
  for (let tx = 0; tx < tilesAcross; tx++) {
    const tile = read(tileOffsets.readUInt32LE((ty * tilesAcross + tx) * 4), tileWidth * tileHeight * 4);
    for (let y = 0; y < tileHeight; y++) {
      const row = ty * tileHeight + y;
      if (row >= height) break;
      // Each atlas cell goes to the output cell holding its centre.
      const lat = north - (row + 0.5) * scale;
      const outRow = Math.floor((90 - lat) * CELLS_PER_DEGREE);
      for (let x = 0; x < tileWidth; x++) {
        const column = tx * tileWidth + x;
        if (column >= width) break;
        const value = tile.readFloatLE((y * tileWidth + x) * 4);
        // The atlas marks cells with no data, at its edges, with a huge negative number.
        if (!(value >= 0)) continue;
        const lon = west + (column + 0.5) * scale;
        const outColumn = Math.min(gridWidth - 1, Math.floor((lon + 180) * CELLS_PER_DEGREE));
        const index = outRow * gridWidth + outColumn;
        sums[index] += value;
        counts[index]++;
      }
    }
  }
  process.stdout.write(`\rRead ${ty + 1} of ${tilesDown} rows of tiles`);
}
closeSync(file);
console.log();

/** A cell's byte: how much brighter than the natural sky, in fortieths of a magnitude. */
function cellByte(index) {
  if (!counts[index]) return 0;
  const artificial = sums[index] / counts[index];
  const magnitudes = 2.5 * Math.log10(1 + artificial / NATURAL_MCD);
  return Math.min(255, Math.round(magnitudes * STEPS_PER_MAG));
}

// --- Writing the tiles, named by their south-west corner as SRTM's are: N30W010. ---

/** A tile's name from its south-west corner in degrees. */
function tileName(lat, lon) {
  const ns = lat < 0 ? 'S' : 'N';
  const ew = lon < 0 ? 'W' : 'E';
  return `${ns}${String(Math.abs(lat)).padStart(2, '0')}${ew}${String(Math.abs(lon)).padStart(3, '0')}`;
}

mkdirSync(OUT_DIR, { recursive: true });
// Old tiles go first, so a tile that is now pristine doesn't stay behind.
for (const name of readdirSync(OUT_DIR)) if (name.endsWith('.bin')) rmSync(`${OUT_DIR}/${name}`);

const written = [];
let bytes = 0;
const southTile = Math.floor(south / TILE_DEGREES) * TILE_DEGREES;
for (let lat = southTile; lat < north; lat += TILE_DEGREES) {
  for (let lon = -180; lon < 180; lon += TILE_DEGREES) {
    // Rows from the tile's northern edge down, columns from its western edge east.
    const cells = new Uint8Array(TILE_CELLS * TILE_CELLS);
    const firstRow = (90 - lat - TILE_DEGREES) * CELLS_PER_DEGREE;
    const firstColumn = (lon + 180) * CELLS_PER_DEGREE;
    let brightest = 0;
    for (let r = 0; r < TILE_CELLS; r++) {
      for (let c = 0; c < TILE_CELLS; c++) {
        const value = cellByte((firstRow + r) * gridWidth + firstColumn + c);
        cells[r * TILE_CELLS + c] = value;
        brightest = Math.max(brightest, value);
      }
    }
    if (!brightest) continue;
    const name = tileName(lat, lon);
    const zipped = gzipSync(cells, { level: 9 });
    // ".bin", not ".gz": a server could otherwise send it as already compressed.
    writeFileSync(`${OUT_DIR}/${name}.bin`, zipped);
    written.push(name);
    bytes += zipped.length;
  }
}

// The index tells the app which tiles exist, and where the atlas has no data at all.
const index = {
  cellsPerDegree: CELLS_PER_DEGREE,
  tileDegrees: TILE_DEGREES,
  north: Math.floor(north * 100) / 100,
  south: Math.ceil(south * 100) / 100,
  naturalMagnitude: 22,
  stepsPerMagnitude: STEPS_PER_MAG,
  tiles: written,
};
writeFileSync(`${OUT_DIR}/index.json`, JSON.stringify(index));
console.log(`Wrote ${written.length} tiles, ${(bytes / 1e6).toFixed(1)} MB, to ${OUT_DIR}`);
