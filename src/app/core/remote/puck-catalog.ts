// The puck's catalogue (docs/puck.md, "The catalogue"): everything on the sky map that
// doesn't move, in a compact binary form, sent to the puck once and kept in its flash.
// Plain functions, so they can be tested without a link.

import type { Vector3 } from '../astronomy/astronomy';
import { designations } from '../catalog/designations';
import type { Target, TargetKind } from '../catalog/targets';
import type { Constellation, Star } from '../sky-map/sky-style';
import { isShownAtField } from '../sky-map/sky-style';

/** "ATMC" as a little-endian u32: the first four bytes read as those letters. */
const MAGIC = 0x434d5441;
const FORMAT_VERSION = 1;
const HEADER_BYTES = 8;
const TABLE_ENTRY_BYTES = 16;

/** Section types, as docs/puck.md numbers them. */
export const SECTION = {
  stars: 1,
  constellationLines: 2,
  constellationNames: 3,
  objects: 4,
  strings: 5,
  faintStars: 7,
} as const;

/** Faint stars are sorted into declination bands this wide, then by right ascension, so the
 * puck finds those near where it looks without going through them all. */
export const FAINT_BAND_DEG = 2;

const STAR_BYTES = 12;
const SEGMENT_BYTES = 16;
const NAME_BYTES = 12;
const OBJECT_BYTES = 20;
/** No magnitude, in an object's `i16` magnitude × 100. */
const NO_MAGNITUDE = 32767;
/** An object always shown, whatever the field of view. */
const ALWAYS_SHOWN = 255;
/** The biggest message the puck takes (its SCTP_MAX_MESSAGE_SIZE). */
export const PART_BYTES = 16384;

/** Kind numbers (docs/puck.md). New kinds take new numbers; the puck draws unknown ones as Other. */
const KIND_CODES: Partial<Record<TargetKind | 'Sun', number>> = {
  Galaxy: 1,
  Nebula: 2,
  'Open cluster': 3,
  'Globular cluster': 4,
  Star: 5,
  'Double star': 6,
  Planet: 7,
  'Dwarf planet': 8,
  Asteroid: 9,
  Moon: 10,
  Sun: 11,
};

export function kindCode(kind: TargetKind | 'Sun'): number {
  return KIND_CODES[kind] ?? 0;
}

/**
 * The app's `isShownAtField` written as data: the object shows when the field is under this
 * many degrees; 255 always. Its rules step at whole degrees, so trying each whole degree
 * finds the step exactly.
 */
export function showBelowFieldDeg(target: Target): number {
  for (let fieldDeg = 1; fieldDeg <= 180; fieldDeg++) {
    if (!isShownAtField(target, fieldDeg)) return fieldDeg;
  }
  return ALWAYS_SHOWN;
}

/** Right ascension and declination, in degrees, of a J2000 unit vector. */
function raDecOf([x, y, z]: Vector3): [number, number] {
  const ra = (Math.atan2(y, x) * 180) / Math.PI;
  return [(ra + 360) % 360, (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI];
}

/** What goes into the catalogue. */
export interface PuckCatalogInput {
  /** The map's stars, in any order. */
  stars: readonly Star[];
  /** The fainter stars the eyepiece view shows, in any order. */
  faintStars?: readonly Star[];
  constellations: readonly Constellation[];
  /** The targets: those that move (with a `body`) and constellations are left out here. */
  targets: readonly Target[];
}

/** UTF-8 strings, each ending in a zero byte, kept once however often they are used. */
class StringTable {
  private readonly offsets = new Map<string, number>();
  private readonly parts: Uint8Array[] = [];
  private length = 0;
  private readonly encoder = new TextEncoder();

  offsetOf(text: string): number {
    const known = this.offsets.get(text);
    if (known !== undefined) return known;
    const bytes = this.encoder.encode(text + '\0');
    const offset = this.length;
    this.offsets.set(text, offset);
    this.parts.push(bytes);
    this.length += bytes.length;
    return offset;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/** A section's bytes, written with a DataView, and its record count. */
interface Section {
  type: number;
  count: number;
  bytes: Uint8Array;
}

function recordSection(type: number, count: number, size: number, write: (data: DataView, i: number) => void): Section {
  const bytes = new Uint8Array(count * size);
  const data = new DataView(bytes.buffer);
  for (let i = 0; i < count; i++) write(new DataView(data.buffer, i * size, size), i);
  return { type, count, bytes };
}

/** The catalogue's bytes, as docs/puck.md lays them out. */
export function buildPuckCatalog({ stars, faintStars = [], constellations, targets }: PuckCatalogInput): Uint8Array {
  const strings = new StringTable();

  // Brightest first, so the puck can stop drawing at its limit, as the map does.
  const sortedStars = [...stars].sort((a, b) => a.mag - b.mag);
  const starSection = recordSection(SECTION.stars, sortedStars.length, STAR_BYTES, (data, i) => {
    const star = sortedStars[i];
    data.setFloat32(0, star.raDeg, true);
    data.setFloat32(4, star.decDeg, true);
    data.setInt16(8, Math.round(star.mag * 100), true);
    data.setUint8(10, star.colorIndex);
  });

  // The faint stars: the same records, by declination band, then right ascension.
  const band = (star: Star): number =>
    Math.min(Math.floor((star.decDeg + 90) / FAINT_BAND_DEG), 180 / FAINT_BAND_DEG - 1);
  const sortedFaint = [...faintStars].sort((a, b) => band(a) - band(b) || a.raDeg - b.raDeg);
  const faintSection = recordSection(SECTION.faintStars, sortedFaint.length, STAR_BYTES, (data, i) => {
    const star = sortedFaint[i];
    data.setFloat32(0, star.raDeg, true);
    data.setFloat32(4, star.decDeg, true);
    data.setInt16(8, Math.round(star.mag * 100), true);
    data.setUint8(10, star.colorIndex);
  });

  const segments = constellations.flatMap(({ lines }) =>
    lines.flatMap((line) => line.slice(1).map((end, i) => [line[i], end] as const)),
  );
  const lineSection = recordSection(SECTION.constellationLines, segments.length, SEGMENT_BYTES, (data, i) => {
    const [a, b] = segments[i];
    [...raDecOf(a), ...raDecOf(b)].forEach((value, k) => data.setFloat32(k * 4, value, true));
  });

  const nameSection = recordSection(SECTION.constellationNames, constellations.length, NAME_BYTES, (data, i) => {
    const { name, label } = constellations[i];
    const [ra, dec] = raDecOf(label);
    data.setFloat32(0, ra, true);
    data.setFloat32(4, dec, true);
    data.setUint32(8, strings.offsetOf(name), true);
  });

  // What moves comes in the `objects` message instead; constellations are named in section 3.
  const fixed = targets.filter((target) => !target.body && target.kind !== 'Constellation');
  const objectSection = recordSection(SECTION.objects, fixed.length, OBJECT_BYTES, (data, i) => {
    const target = fixed[i];
    data.setFloat32(0, target.raDeg, true);
    data.setFloat32(4, target.decDeg, true);
    // The label the map writes beside it, such as "M1" or "Sirius".
    data.setUint32(8, strings.offsetOf(designations(target)[0]), true);
    const mag = Number.isFinite(target.mag) ? Math.round(target.mag * 100) : NO_MAGNITUDE;
    data.setInt16(12, Math.max(-32768, Math.min(NO_MAGNITUDE, mag)), true);
    data.setUint16(14, Math.min(65535, Math.round((target.sizeArcmin ?? 0) * 10)), true);
    data.setUint16(16, Math.min(65535, Math.round((target.minorArcmin ?? 0) * 10)), true);
    data.setUint8(18, kindCode(target.kind));
    data.setUint8(19, showBelowFieldDeg(target));
  });

  // The strings only now: every name is in the table once the sections above are written.
  // Their count is their bytes, as the puck reads them by offset.
  const stringBytes = strings.bytes();
  const sections: Section[] = [
    starSection,
    lineSection,
    nameSection,
    objectSection,
    { type: SECTION.strings, count: stringBytes.length, bytes: stringBytes },
    ...(sortedFaint.length > 0 ? [faintSection] : []),
    // Nothing translated goes in: the same data must give the same catalogue, and the same
    // id, in every language. Translated words come in the `texts` message (puck-messages.ts).
  ];

  // The header, the table, then each section at an offset that is a multiple of 4.
  const pad = (n: number): number => (n + 3) & ~3;
  let offset = HEADER_BYTES + sections.length * TABLE_ENTRY_BYTES;
  const offsets = sections.map((section) => {
    const at = offset;
    offset = pad(offset + section.bytes.length);
    return at;
  });
  const out = new Uint8Array(offset);
  const data = new DataView(out.buffer);
  data.setUint32(0, MAGIC, true);
  data.setUint16(4, FORMAT_VERSION, true);
  data.setUint16(6, sections.length, true);
  sections.forEach((section, i) => {
    const entry = HEADER_BYTES + i * TABLE_ENTRY_BYTES;
    data.setUint32(entry, section.type, true);
    data.setUint32(entry + 4, offsets[i], true);
    data.setUint32(entry + 8, section.count, true);
    data.setUint32(entry + 12, section.bytes.length, true);
    out.set(section.bytes, offsets[i]);
  });
  return out;
}

/** The catalogue's identity: the first 16 hex digits of its SHA-256. */
export async function catalogId(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
  return [...digest.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

let crcTable: Uint32Array | null = null;

/** CRC-32 (IEEE, as zlib), which the puck checks the catalogue against. */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** The catalogue cut into parts the puck can take in one message each. */
export function catalogParts(bytes: Uint8Array, partBytes = PART_BYTES): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let at = 0; at < bytes.length; at += partBytes) parts.push(bytes.subarray(at, at + partBytes));
  return parts;
}
