import { describe, expect, it } from 'vitest';

import { bortleFromMagnitude, cellOffset, lookUpSkyBrightness, tileBytes, tileName } from './sky-brightness';
import type { SkyBrightnessIndex } from './sky-brightness';

/** A small atlas: 10° tiles of 2 × 2 cells, so each cell is 5°. */
const INDEX: SkyBrightnessIndex = {
  cellsPerDegree: 0.2,
  tileDegrees: 10,
  north: 85.05,
  south: -59.99,
  naturalMagnitude: 22,
  stepsPerMagnitude: 40,
  tiles: ['N30W010'],
};

/** Gzips bytes, as the build script stores tiles. */
async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const stream = new Response(bytes).body!.pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

describe('bortleFromMagnitude', () => {
  it('matches sky quality meter readings to the Bortle scale', () => {
    expect(bortleFromMagnitude(22)).toBe(1);
    expect(bortleFromMagnitude(21.95)).toBe(2);
    expect(bortleFromMagnitude(21.8)).toBe(3);
    expect(bortleFromMagnitude(21)).toBe(4);
    expect(bortleFromMagnitude(20)).toBe(5);
    expect(bortleFromMagnitude(19.2)).toBe(6);
    expect(bortleFromMagnitude(18.6)).toBe(7);
    expect(bortleFromMagnitude(18)).toBe(8);
    // Central Valencia, the app's reference city sky.
    expect(bortleFromMagnitude(17.2)).toBe(9);
  });
});

describe('tileName', () => {
  it('names a tile by its south-west corner', () => {
    expect(tileName(39.47, -0.38, 10)).toBe('N30W010');
    expect(tileName(-33.9, 151.2, 10)).toBe('S40E150');
    expect(tileName(0, 0, 10)).toBe('N00E000');
    expect(tileName(51.5, -179.9, 10)).toBe('N50W180');
  });

  it('treats longitude 180° as -180°', () => {
    expect(tileName(10, 180, 10)).toBe('N10W180');
  });
});

describe('cellOffset', () => {
  it('counts rows from the north edge and columns from the west edge', () => {
    // N30W010 runs 30° to 40° north and 10° west to 0°.
    expect(cellOffset(39, -9, INDEX)).toBe(0);
    expect(cellOffset(39, -1, INDEX)).toBe(1);
    expect(cellOffset(31, -9, INDEX)).toBe(2);
    expect(cellOffset(31, -1, INDEX)).toBe(3);
  });

  it('keeps a place on a tile edge inside its tile', () => {
    expect(cellOffset(30, -10, INDEX)).toBe(2);
  });
});

describe('tileBytes', () => {
  it('unzips a gzipped tile, and takes one a server already unzipped as it is', async () => {
    const cells = new Uint8Array([0, 40, 80, 191]);
    expect([...(await tileBytes(await gzip(cells)))]).toEqual([0, 40, 80, 191]);
    expect([...(await tileBytes(cells.buffer))]).toEqual([0, 40, 80, 191]);
  });
});

describe('lookUpSkyBrightness', () => {
  const tile = new Uint8Array([0, 40, 80, 191]);
  const readTile = async (name: string) => {
    expect(name).toBe('N30W010');
    return gzip(tile);
  };

  it('reads the brightness of the place from its tile', async () => {
    // 191 fortieths brighter than 22.0: about central Valencia, Bortle 9.
    expect(await lookUpSkyBrightness(31, -1, INDEX, readTile)).toEqual({ magnitude: 17.23, bortle: 9 });
    expect(await lookUpSkyBrightness(39, -1, INDEX, readTile)).toEqual({ magnitude: 21, bortle: 4 });
  });

  it('gives a pristine sky where no tile is listed, as over the ocean', async () => {
    const result = await lookUpSkyBrightness(35, -40, INDEX, () => Promise.reject(new Error('not fetched')));
    expect(result).toEqual({ magnitude: 22, bortle: 1 });
  });

  it('gives nothing outside the atlas, as in Antarctica', async () => {
    expect(await lookUpSkyBrightness(-75, 0, INDEX, readTile)).toBeNull();
    expect(await lookUpSkyBrightness(88, 0, INDEX, readTile)).toBeNull();
  });
});
