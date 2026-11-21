import { describe, expect, it } from 'vitest';

import { equatorialVector } from '../astronomy/astronomy';
import type { Target } from '../catalog/targets';
import type { Constellation, Star } from '../sky-map/sky-style';

import { SECTION, buildPuckCatalog, catalogId, catalogParts, crc32, kindCode, showBelowFieldDeg } from './puck-catalog';

const star = (raDeg: number, decDeg: number, mag: number, colorIndex: number): Star => ({
  raDeg,
  decDeg,
  mag,
  colorIndex,
  vector: equatorialVector(raDeg, decDeg),
});

const orion: Constellation = {
  name: 'Orion',
  label: equatorialVector(83, 5),
  lines: [[equatorialVector(88.79, 7.41), equatorialVector(81.28, 6.35), equatorialVector(78.63, -8.2)]],
};

const crab: Target = {
  id: 'M1',
  name: 'Crab Nebula',
  kind: 'Nebula',
  raDeg: 83.625,
  decDeg: 22.017,
  mag: 8.4,
  sizeArcmin: 6,
  minorArcmin: 4,
};
const moon: Target = { id: 'Moon', name: "Earth's Moon", kind: 'Moon', raDeg: 10, decDeg: 5, mag: -12, body: 'Moon' };
const sirius: Target = { id: 'Sirius', name: 'Sirius', kind: 'Star', raDeg: 101.287, decDeg: -16.716, mag: -1.44 };

/** Reads the section table of a catalogue: type to [offset, count, bytes]. */
function sections(bytes: Uint8Array): Map<number, [number, number, number]> {
  const data = new DataView(bytes.buffer, bytes.byteOffset);
  const table = new Map<number, [number, number, number]>();
  for (let i = 0; i < data.getUint16(6, true); i++) {
    const at = 8 + i * 16;
    table.set(data.getUint32(at, true), [
      data.getUint32(at + 4, true),
      data.getUint32(at + 8, true),
      data.getUint32(at + 12, true),
    ]);
  }
  return table;
}

function stringAt(bytes: Uint8Array, stringsOffset: number, offset: number): string {
  const start = stringsOffset + offset;
  return new TextDecoder().decode(bytes.subarray(start, bytes.indexOf(0, start)));
}

describe('puck catalogue', () => {
  const bytes = buildPuckCatalog({
    stars: [star(279.235, 38.784, 0.03, 1), star(101.287, -16.716, -1.44, 1), star(10, 10, 5.5, 3)],
    constellations: [orion],
    targets: [crab, moon, sirius],
  });
  const data = new DataView(bytes.buffer);
  const table = sections(bytes);

  it('starts with the magic, the version and the section table', () => {
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe('ATMC');
    expect(data.getUint16(4, true)).toBe(1);
    expect([...table.keys()]).toEqual([1, 2, 3, 4, 5]);
    for (const [offset] of table.values()) expect(offset % 4).toBe(0);
  });

  it('writes the stars brightest first', () => {
    const [offset, count, size] = table.get(SECTION.stars)!;
    expect(count).toBe(3);
    expect(size).toBe(36);
    expect(data.getFloat32(offset, true)).toBeCloseTo(101.287, 3);
    expect(data.getInt16(offset + 8, true)).toBe(-144);
    expect(data.getUint8(offset + 10)).toBe(1);
    expect(data.getInt16(offset + 2 * 12 + 8, true)).toBe(550);
  });

  it('cuts constellation lines into segments, and names them', () => {
    const [lineOffset, segments] = table.get(SECTION.constellationLines)!;
    expect(segments).toBe(2);
    expect(data.getFloat32(lineOffset, true)).toBeCloseTo(88.79, 3);
    expect(data.getFloat32(lineOffset + 4, true)).toBeCloseTo(7.41, 3);
    const [nameOffset] = table.get(SECTION.constellationNames)!;
    const [stringsOffset] = table.get(SECTION.strings)!;
    expect(stringAt(bytes, stringsOffset, data.getUint32(nameOffset + 8, true))).toBe('Orion');
  });

  it('leaves out what moves, and writes the fixed objects', () => {
    const [offset, count] = table.get(SECTION.objects)!;
    expect(count).toBe(2);
    const [stringsOffset] = table.get(SECTION.strings)!;
    // Labelled as the map labels it, by its first designation.
    expect(stringAt(bytes, stringsOffset, data.getUint32(offset + 8, true))).toBe('M1');
    expect(data.getInt16(offset + 12, true)).toBe(840);
    expect(data.getUint16(offset + 14, true)).toBe(60);
    expect(data.getUint16(offset + 16, true)).toBe(40);
    expect(data.getUint8(offset + 18)).toBe(kindCode('Nebula'));
    expect(data.getUint8(offset + 19)).toBe(showBelowFieldDeg(crab));
  });

  it('sorts the faint stars by declination band, then right ascension', () => {
    const withFaint = buildPuckCatalog({
      stars: [],
      faintStars: [star(300, 10.5, 9, 2), star(20, 10.9, 8, 2), star(100, -45, 7, 1)],
      constellations: [],
      targets: [],
    });
    const faintData = new DataView(withFaint.buffer);
    const [offset, count] = sections(withFaint).get(SECTION.faintStars)!;
    expect(count).toBe(3);
    const read = (i: number): [number, number] => [
      faintData.getFloat32(offset + i * 12, true),
      faintData.getFloat32(offset + i * 12 + 4, true),
    ];
    expect(read(0)[1]).toBeCloseTo(-45, 3); // the southern band first
    expect(read(1)[0]).toBeCloseTo(20, 3); // then, in one band, by right ascension
    expect(read(2)[0]).toBeCloseTo(300, 3);
  });

  it("writes the map's label rules as the field below which each object shows", () => {
    expect(showBelowFieldDeg(sirius)).toBe(255); // bright stars always show
    // Messier objects: down to magnitude 7 always, fainter ones once under 60°.
    expect(showBelowFieldDeg({ ...crab, id: 'M2', mag: 6.5 })).toBe(255);
    expect(showBelowFieldDeg(crab)).toBe(60);
    expect(showBelowFieldDeg({ ...sirius, mag: 4 })).toBe(25);
  });

  it('gives the same id for the same data, and checks it as zlib does', async () => {
    expect(await catalogId(bytes)).toMatch(/^[0-9a-f]{16}$/);
    expect(await catalogId(bytes)).toBe(await catalogId(bytes.slice()));
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('cuts the catalogue into parts the puck can take', () => {
    const parts = catalogParts(new Uint8Array(40_000));
    expect(parts.map((part) => part.length)).toEqual([16384, 16384, 7232]);
  });
});
