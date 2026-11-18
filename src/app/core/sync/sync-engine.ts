// One sync between this device and the user's cloud drive, with no server of ours. Every
// device writes only its own files, numbered change files with the records it changed, and
// reads the other devices' files to merge what it is missing, remembering how far it has read
// each (a checkpoint, like CouchDB's replication checkpoints). As no two devices ever write
// the same file, the drives never make "conflicted copy" files. The design is in
// docs/sync-plan.md.
//
// Nothing here knows which drive is used, or the database: both come in through the small
// interfaces below, so the whole sync is tested with in-memory stand-ins.

import { contentHash, contentOf } from '../sync-record';

import type { AnyRecord } from './sync-merge';

/** The kinds of record that sync, one per table. */
export const RECORD_TYPES = ['logEntry', 'list', 'listItem', 'kit'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** One changed record, as written in a change file. */
export interface Change {
  type: RecordType;
  record: AnyRecord;
}

/**
 * The app's folder on a cloud drive, as flat file names. Each drive's code (Google Drive
 * first) turns these calls into its own requests.
 */
export interface SyncStorage {
  /** The names of every file in the app's folder. */
  list(): Promise<string[]>;
  /** A file's text, or null if there is no such file. */
  read(name: string): Promise<string | null>;
  /** Writes a file, replacing one of the same name. */
  write(name: string, text: string): Promise<void>;
}

/** This device's side: its records and its own sync bookkeeping. */
export interface SyncLocal {
  /** This device's id, which names its files. */
  readonly deviceId: string;
  /** Every record changed here since it was last sent, deleted ones too. */
  pending(): Promise<Change[]>;
  /** Marks records sent, unless they changed again meanwhile. */
  markSent(changes: readonly Change[]): Promise<void>;
  /** Merges received records into the tables. Says how many changed here, and conflicts found. */
  apply(type: RecordType, records: readonly AnyRecord[]): Promise<{ changed: number; conflicts: number }>;
  /** Reads or writes a value of the sync's own, such as a checkpoint. */
  readMeta(key: string): Promise<unknown>;
  writeMeta(key: string, value: unknown): Promise<void>;
}

/** The change files' format. A device that finds a newer one leaves the file alone. */
export const FORMAT = 1;

/** What a sync did, for the Settings page. */
export interface SyncResult {
  sent: number;
  received: number;
  conflicts: number;
}

/** A change file's name: the device, then its number, padded so names sort in order. */
export function changeFileName(deviceId: string, seq: number): string {
  return `${deviceId}.${String(seq).padStart(6, '0')}.changes.json`;
}

/** A device's description file. */
export function deviceFileName(deviceId: string): string {
  return `${deviceId}.device.json`;
}

/** The device and number in a change file's name, or null for any other file. */
export function parseChangeFileName(name: string): { deviceId: string; seq: number } | null {
  const match = /^([0-9a-f-]{36})\.(\d{6,})\.changes\.json$/.exec(name);
  return match ? { deviceId: match[1], seq: Number(match[2]) } : null;
}

/** The meta keys: this device's last change file, and how far each other device was read. */
const SEQ_KEY = 'syncSeq';
const readKey = (deviceId: string): string => `syncRead:${deviceId}`;

/**
 * Syncs once: first sends this device's changes, so that a conflict with another device is
 * seen by both, then reads every other device's new change files and merges them.
 * A failure stops the sync where it was; what was done stays done, and the next sync
 * carries on from there.
 */
export async function runSync(storage: SyncStorage, local: SyncLocal, now = Date.now()): Promise<SyncResult> {
  const result: SyncResult = { sent: 0, received: 0, conflicts: 0 };
  result.sent = await sendChanges(storage, local, now);

  const others = otherDevicesFiles(await storage.list(), local.deviceId);
  for (const [deviceId, seqs] of others) {
    const readUpTo = Number((await local.readMeta(readKey(deviceId))) ?? 0);
    for (const seq of seqs.filter((s) => s > readUpTo)) {
      const text = await storage.read(changeFileName(deviceId, seq));
      const changes = text === null ? [] : parseChangeFile(text);
      if (changes === null) break; // A newer format: leave it, and what follows, for a newer app.
      for (const type of RECORD_TYPES) {
        const records = changes.filter((c) => c.type === type).map((c) => c.record);
        if (records.length === 0) continue;
        const applied = await local.apply(type, records);
        result.received += applied.changed;
        result.conflicts += applied.conflicts;
      }
      await local.writeMeta(readKey(deviceId), seq);
    }
  }
  return result;
}

/** Writes this device's pending changes as its next change file. Says how many were sent. */
async function sendChanges(storage: SyncStorage, local: SyncLocal, now: number): Promise<number> {
  const changes = await local.pending();
  if (changes.length === 0) return 0;
  const seq = Number((await local.readMeta(SEQ_KEY)) ?? 0) + 1;
  const file = {
    format: FORMAT,
    deviceId: local.deviceId,
    seq,
    writtenAt: now,
    // `pending` only means something on the device that made the change.
    changes: changes.map(({ type, record }) => ({ type, record: { ...record, pending: undefined } })),
  };
  await storage.write(changeFileName(local.deviceId, seq), JSON.stringify(file));
  await storage.write(
    deviceFileName(local.deviceId),
    JSON.stringify({ format: FORMAT, deviceId: local.deviceId, lastSeq: seq, writtenAt: now }),
  );
  await local.writeMeta(SEQ_KEY, seq);
  await local.markSent(changes);
  return changes.length;
}

/** The other devices' change file numbers, in order, by device. */
function otherDevicesFiles(names: readonly string[], ownId: string): Map<string, number[]> {
  const byDevice = new Map<string, number[]>();
  for (const name of names) {
    const parsed = parseChangeFileName(name);
    if (!parsed || parsed.deviceId === ownId) continue;
    byDevice.set(parsed.deviceId, [...(byDevice.get(parsed.deviceId) ?? []), parsed.seq]);
  }
  for (const seqs of byDevice.values()) seqs.sort((a, b) => a - b);
  return byDevice;
}

/**
 * The valid changes in a change file's text: [] for a damaged file, so it is skipped, and
 * null for a newer format, which this version must not guess at. A record whose hash doesn't
 * match its content, or that lacks its bookkeeping, is left out, so a damaged or hand-edited
 * file can't spoil the tables.
 */
export function parseChangeFile(text: string): Change[] | null {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isObject(file) || !Array.isArray(file['changes'])) return [];
  if (typeof file['format'] !== 'number' || file['format'] > FORMAT) return null;
  return file['changes'].filter(isValidChange).map(({ type, record }) => ({ type, record: { ...record, pending: 0 } }));
}

/** Whether a received change is a well-formed record of a known type whose hash matches its content. */
export function isValidChange(change: unknown): change is Change {
  if (!isObject(change) || !RECORD_TYPES.includes(change['type'] as RecordType)) return false;
  const r = change['record'];
  return (
    isObject(r) &&
    typeof r['id'] === 'string' &&
    Number.isInteger(r['rev']) &&
    (r['rev'] as number) > 0 &&
    typeof r['hash'] === 'string' &&
    typeof r['deviceId'] === 'string' &&
    typeof r['createdAt'] === 'number' &&
    typeof r['updatedAt'] === 'number' &&
    (r['deletedAt'] === null || typeof r['deletedAt'] === 'number') &&
    (r['history'] === undefined || (Array.isArray(r['history']) && r['history'].every((h) => typeof h === 'string'))) &&
    contentHash(contentOf(r as unknown as AnyRecord)) === r['hash']
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
