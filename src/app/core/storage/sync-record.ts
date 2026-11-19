// What every record saved on the device carries so that it can be synced between devices
// later: who changed it last and when, how many times, a hash of its content, and a
// deletion mark instead of a real deletion. Pure helpers with no Angular dependency.
// How a sync uses them is in sync-merge.ts and docs/sync-plan.md.

/** The bookkeeping kept next to a record's content. */
export interface SyncMeta {
  /** When the record was made, in milliseconds since 1970, by this device's clock. */
  createdAt: number;
  /** When its content last changed, or it was deleted or put back. */
  updatedAt: number;
  /** The device that made the last change. See LocalDb.deviceId. */
  deviceId: string;
  /** How many times it has changed: 1 when made. A sync uses it to break ties. */
  rev: number;
  /** A hash of its content, so two copies can be compared without reading every field. */
  hash: string;
  /**
   * When it was deleted, or null. A deleted record is kept, as a "tombstone", so that a
   * sync can tell other devices to delete it too, and so that Undo can put it back.
   */
  deletedAt: number | null;
  /** 1 when it changed since the last sync, so a sync knows what to send. 0 once sent. */
  pending: 0 | 1;
  /**
   * The revisions this one replaced, newest first, as revision ids (see revId), up to
   * HISTORY_LENGTH of them. A sync uses them to tell a newer version of a record from an
   * older one, and both from two edits made apart, as CouchDB does. Missing on records made
   * before sync, which is the same as empty.
   */
  history?: string[];
}

/** How many earlier revisions a record remembers. Plenty for phones that sync now and then. */
export const HISTORY_LENGTH = 50;

/**
 * A revision's id: its number and its content hash, as CouchDB writes its _rev, such as
 * "3-0a1b2c3d4e5f60". Two devices that make the same change from the same revision make the
 * same id, so they don't count as a conflict.
 */
export function revId(record: Pick<SyncMeta, 'rev' | 'hash'>): string {
  return `${record.rev}-${record.hash}`;
}

/** The history of a record that replaces this one: this revision, then its own history. */
function historyAfter(record: SyncMeta): string[] {
  return [revId(record), ...(record.history ?? [])].slice(0, HISTORY_LENGTH);
}

/** A record as saved: its content and its bookkeeping, side by side. */
export type Synced<T> = T & SyncMeta;

/** The bookkeeping's field names, to take a record's content back out. */
const META_KEYS: readonly (keyof SyncMeta)[] = [
  'createdAt',
  'updatedAt',
  'deviceId',
  'rev',
  'hash',
  'deletedAt',
  'pending',
  'history',
];

/**
 * A random id that is unique across devices, so records made on two phones never clash.
 * crypto.randomUUID only works on HTTPS, so on a plain-HTTP test address it is built from
 * random bytes the same way.
 */
export function newUuid(): string {
  if (typeof crypto.randomUUID === 'function' && globalThis.isSecureContext !== false) return crypto.randomUUID();
  return formatUuid(crypto.getRandomValues(new Uint8Array(16)), 4);
}

/**
 * A UUID made from a name, the same on every device for the same name. For records that
 * two phones must agree on without talking to each other: Saved for later, a target's
 * place in a list, or an old id turned into a UUID. It is a version 8 UUID, the standard
 * kind for ids built a custom way, from a 128-bit hash of the name.
 */
export function nameUuid(name: string): string {
  const words = cyrb128(name);
  const bytes = new Uint8Array(16);
  words.forEach((word, i) => new DataView(bytes.buffer).setUint32(i * 4, word));
  return formatUuid(bytes, 8);
}

/** Whether an id is already a UUID, rather than one of the ids used before them. */
export function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** 16 bytes as a UUID of the given version, in its usual written form. */
function formatUuid(bytes: Uint8Array, version: 4 | 8): string {
  bytes[6] = (bytes[6] & 0x0f) | (version << 4);
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // The standard variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** cyrb128, a public-domain 128-bit hash by bryc (github.com/bryc/code), as four 32-bit words. */
function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * JSON with object keys in alphabetical order, so the same content always gives the same
 * text, and so the same hash, whatever order its fields were set in. Empty fields
 * (undefined) are left out, as JSON.stringify does.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v ?? null)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const fields = Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`);
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * A short hash of a record's content, as 14 hex digits. It is cyrb53, a fast public-domain
 * hash by bryc (github.com/bryc/code). It spots changes and equal copies. It is not for
 * security, which nothing here needs, and unlike crypto.subtle it works without HTTPS and
 * gives its answer straight away.
 */
export function contentHash(content: unknown): string {
  const text = canonicalJson(content);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** A record's content, without its bookkeeping. */
export function contentOf<T>(record: Synced<T>): T {
  const content = { ...record } as Record<string, unknown>;
  for (const key of META_KEYS) delete content[key];
  return content as T;
}

/** A new record, as made on this device now. */
export function createRecord<T>(content: T, deviceId: string, now: number): Synced<T> {
  return {
    ...contentOf(content as Synced<T>),
    createdAt: now,
    updatedAt: now,
    deviceId,
    rev: 1,
    hash: contentHash(contentOf(content as Synced<T>)),
    deletedAt: null,
    pending: 1,
  };
}

/**
 * The record with new content, or with the same content put back after a deletion.
 * Returns null when nothing would change, so saving the same thing twice writes nothing
 * and doesn't count as a change to sync.
 */
export function changeRecord<T>(record: Synced<T>, content: T, deviceId: string, now: number): Synced<T> | null {
  const bare = contentOf(content as Synced<T>);
  const hash = contentHash(bare);
  if (hash === record.hash && record.deletedAt === null) return null;
  return {
    ...bare,
    createdAt: record.createdAt,
    updatedAt: now,
    deviceId,
    rev: record.rev + 1,
    hash,
    deletedAt: null,
    pending: 1,
    history: historyAfter(record),
  };
}

/**
 * Settles a conflict: a new revision with the chosen version's content, descending from both
 * versions, like a merge commit. Every device then takes it over either one, and knows the
 * version it kept aside is settled (see sync-local-db.ts).
 */
export function settleConflict<T>(
  current: Synced<T>,
  other: Synced<T>,
  keep: 'current' | 'other',
  deviceId: string,
  now: number,
): Synced<T> {
  const chosen = keep === 'current' ? current : other;
  const history = [...new Set([...historyAfter(current), ...historyAfter(other)])].slice(0, HISTORY_LENGTH);
  return {
    ...contentOf(chosen),
    createdAt: Math.min(current.createdAt, other.createdAt),
    updatedAt: now,
    deviceId,
    rev: Math.max(current.rev, other.rev) + 1,
    hash: chosen.hash,
    deletedAt: chosen.deletedAt === null ? null : now,
    pending: 1,
    history,
  } as Synced<T>;
}

/** The record marked deleted, or null if it already is. */
export function deleteRecord<T>(record: Synced<T>, deviceId: string, now: number): Synced<T> | null {
  if (record.deletedAt !== null) return null;
  return {
    ...record,
    updatedAt: now,
    deviceId,
    rev: record.rev + 1,
    deletedAt: now,
    pending: 1,
    history: historyAfter(record),
  };
}
