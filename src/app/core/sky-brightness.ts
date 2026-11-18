// How bright the night sky is at a place, from the light pollution atlas in
// assets/data/aggregate/falchi/ (Falchi et al. 2016, CC BY-NC 4.0, built by
// scripts/build-sky-brightness.mjs), and the Bortle class that brightness means.
// Plain functions, with no Angular dependency. The atlas is optional: without it, every
// lookup gives null and the Bortle class is chosen by hand.

/** The atlas's index.json: how its tiles are laid out, and which ones exist. */
export interface SkyBrightnessIndex {
  /** Cells per degree, both ways. */
  cellsPerDegree: number;
  /** The size of a tile, in degrees, both ways. */
  tileDegrees: number;
  /** The atlas's northern and southern limits, in degrees. Outside them it has no data. */
  north: number;
  south: number;
  /** The natural sky's brightness, in mag/arcsec², that a cell's byte counts from. */
  naturalMagnitude: number;
  /** How many steps of a cell's byte make a magnitude. */
  stepsPerMagnitude: number;
  /** The tiles there are. The others are pristine sky everywhere. */
  tiles: string[];
}

/** What the atlas says about a place. */
export interface SkyBrightness {
  /** The sky's total brightness overhead, natural plus artificial, in mag/arcsec². */
  magnitude: number;
  /** The Bortle class that brightness means, 1 to 9. */
  bortle: number;
}

/**
 * The darkest sky, in mag/arcsec², of each Bortle class from 2 to 9: class 2 starts
 * below 21.99, class 9 below 17.80. These are the usual matches between sky quality
 * meter readings and the Bortle scale, which itself is described by eye, so they are a guide.
 */
const BORTLE_LIMITS = [21.99, 21.89, 21.69, 20.49, 19.5, 18.94, 18.38, 17.8];

/** The Bortle class of a sky of this brightness, in mag/arcsec². */
export function bortleFromMagnitude(magnitude: number): number {
  const brighter = BORTLE_LIMITS.filter((limit) => magnitude < limit).length;
  return 1 + brighter;
}

/** A tile's name, from the south-west corner of the tile holding this place: "N30W010". */
export function tileName(latDeg: number, lonDeg: number, tileDegrees: number): string {
  const lat = Math.floor(latDeg / tileDegrees) * tileDegrees;
  // Longitude 180° is the same place as -180°.
  const lon = Math.floor(((((lonDeg + 180) % 360) + 360) % 360) / tileDegrees) * tileDegrees - 180;
  const ns = lat < 0 ? 'S' : 'N';
  const ew = lon < 0 ? 'W' : 'E';
  return `${ns}${String(Math.abs(lat)).padStart(2, '0')}${ew}${String(Math.abs(lon)).padStart(3, '0')}`;
}

/**
 * Where a place's cell is in its tile's bytes. A tile's rows run from its northern edge
 * south, and its columns from its western edge east.
 */
export function cellOffset(latDeg: number, lonDeg: number, index: SkyBrightnessIndex): number {
  const { cellsPerDegree, tileDegrees } = index;
  const size = cellsPerDegree * tileDegrees;
  const northEdge = (Math.floor(latDeg / tileDegrees) + 1) * tileDegrees;
  const lon = ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  const westEdge = Math.floor(lon / tileDegrees) * tileDegrees;
  const clamp = (n: number) => Math.min(size - 1, Math.max(0, n));
  const row = clamp(Math.floor((northEdge - latDeg) * cellsPerDegree));
  const column = clamp(Math.floor((lon - westEdge) * cellsPerDegree));
  return row * size + column;
}

/** A cell's byte as the sky's brightness: 0 is the natural sky, each step a little brighter. */
export function cellMagnitude(byte: number, index: SkyBrightnessIndex): number {
  return index.naturalMagnitude - byte / index.stepsPerMagnitude;
}

/**
 * A tile's bytes, from the file as fetched. Tiles are stored gzipped, but a server may
 * already have unzipped one on the way, so it is unzipped here only if it still is.
 */
export async function tileBytes(file: ArrayBuffer): Promise<Uint8Array> {
  const bytes = new Uint8Array(file);
  // Every gzip file starts with these two bytes.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Response(file).body!.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The sky's brightness at a place, or null where the atlas has no data: north of about
 * 85° or south of 60°. A place whose tile isn't listed is pristine sky.
 * @param readTile Fetches a tile's file by name, such as "N30W010".
 */
export async function lookUpSkyBrightness(
  latDeg: number,
  lonDeg: number,
  index: SkyBrightnessIndex,
  readTile: (name: string) => Promise<ArrayBuffer>,
): Promise<SkyBrightness | null> {
  if (latDeg > index.north || latDeg < index.south) return null;
  const name = tileName(latDeg, lonDeg, index.tileDegrees);
  const byte = index.tiles.includes(name)
    ? ((await tileBytes(await readTile(name)))[cellOffset(latDeg, lonDeg, index)] ?? 0)
    : 0;
  const magnitude = Math.round(cellMagnitude(byte, index) * 100) / 100;
  return { magnitude, bortle: bortleFromMagnitude(magnitude) };
}
