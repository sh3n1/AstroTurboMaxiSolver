// Keeping the sync folder small: snapshots, and purging old deletions. See docs/sync-plan.md.
//
// Snapshots. Each sync that sends something adds a change file, so a device's files would
// grow forever, and a new device would read them all. Once a device has more than
// COMPACT_AFTER, it writes one snapshot holding the latest version of every record in them,
// then removes them. A device that hadn't read them all reads the snapshot instead (runSync).
// Like the change files, a device only ever writes and removes its own.
//
// Purging. A deleted record stays as a tombstone, or a device that was offline would bring it
// back. Once a deletion is older than TOMBSTONE_KEEP_MS, its tombstone is removed, from this
// device's tables and from its next snapshot. Every device in use has seen it by then: one
// silent for longer is taken as gone. Such a device may still show what was deleted, but it
// can't bring it back on the others, since it only sends what it changes itself.

import type { Change, SyncLocal, SyncStorage } from './sync-engine';
import { changeFileName, FORMAT, parseChangeFile, parseChangeFileName, RECORD_TYPES, SEQ_KEY } from './sync-engine';

/** How many change files a device keeps before folding them into a snapshot. */
export const COMPACT_AFTER = 50;
/** How long a deletion is kept at least: about six months. */
export const TOMBSTONE_KEEP_MS = 183 * 24 * 3_600_000;
/** How often old deletions are looked for: they are rare. */
const PURGE_EVERY_MS = 24 * 3_600_000;
const PURGED_KEY = 'syncPurgedAt';

/** A snapshot's name: the device, then the last change file it stands for. */
export function snapshotFileName(deviceId: string, seq: number): string {
  return `${deviceId}.${String(seq).padStart(6, '0')}.snapshot.json`;
}

/** The device and number in a snapshot's name, or null for any other file. */
export function parseSnapshotFileName(name: string): { deviceId: string; seq: number } | null {
  const match = /^([0-9a-f-]{36})\.(\d{6,})\.snapshot\.json$/.exec(name);
  return match ? { deviceId: match[1], seq: Number(match[2]) } : null;
}

/** Each device's newest snapshot, by device. */
export function latestSnapshots(names: readonly string[]): Map<string, { seq: number; name: string }> {
  const latest = new Map<string, { seq: number; name: string }>();
  for (const name of names) {
    const parsed = parseSnapshotFileName(name);
    if (parsed && parsed.seq > (latest.get(parsed.deviceId)?.seq ?? 0)) {
      latest.set(parsed.deviceId, { seq: parsed.seq, name });
    }
  }
  return latest;
}

/**
 * Folds this device's change files into one snapshot, once there are more than COMPACT_AFTER,
 * then removes them. It holds this device's current copy of each record, which may be newer,
 * from another device, so a record deleted since can't come back from an old version, and it
 * leaves out the deletions purged. If any file can't be read, it waits for the next sync.
 */
export async function compactOwnFiles(
  storage: SyncStorage,
  local: SyncLocal,
  names: readonly string[],
  now: number,
): Promise<void> {
  const own = local.deviceId;
  const seqs = names
    .map(parseChangeFileName)
    .filter((parsed) => parsed?.deviceId === own)
    .map((parsed) => parsed!.seq)
    .sort((a, b) => a - b);
  if (seqs.length <= COMPACT_AFTER) return;
  const lastSeq = Number((await local.readMeta(SEQ_KEY)) ?? 0);
  const previous = latestSnapshots(names).get(own);

  // Every record in them, by type and id: the last file to hold it counts.
  const latest = new Map<string, Change>();
  const add = (changes: Change[]): void => {
    for (const change of changes) latest.set(`${change.type}/${change.record.id}`, change);
  };
  if (previous) {
    const text = await storage.read(previous.name);
    const changes = text === null ? null : parseChangeFile(text);
    if (changes === null) return;
    add(changes);
  }
  const covered = seqs.filter((seq) => seq <= lastSeq);
  for (const seq of covered) {
    const text = await storage.read(changeFileName(own, seq));
    const changes = text === null ? null : parseChangeFile(text);
    if (changes === null) return;
    add(changes);
  }

  // This device's current copies, without the deletions purged.
  const changes: Change[] = [];
  for (const type of RECORD_TYPES) {
    const ids = [...latest.values()].filter((c) => c.type === type).map((c) => c.record.id);
    if (ids.length === 0) continue;
    const current = await local.current(type, ids);
    for (const id of ids) {
      const record = current.get(id);
      // `pending` only means something on this device: readers set it themselves.
      if (record) changes.push({ type, record: { ...record, pending: 0 } });
    }
  }

  const name = snapshotFileName(own, lastSeq);
  await storage.write(name, JSON.stringify({ format: FORMAT, deviceId: own, seq: lastSeq, writtenAt: now, changes }));
  // Only once the snapshot is safely written: what it stands for.
  for (const seq of covered) await storage.remove(changeFileName(own, seq));
  if (previous && previous.name !== name) await storage.remove(previous.name);
}

/** Removes the deletions older than TOMBSTONE_KEEP_MS that were sent, about once a day. */
export async function purgeOldDeletions(local: SyncLocal, now: number): Promise<number> {
  const last = Number((await local.readMeta(PURGED_KEY)) ?? 0);
  if (now - last < PURGE_EVERY_MS) return 0;
  const purged = await local.purgeDeleted(now - TOMBSTONE_KEEP_MS);
  await local.writeMeta(PURGED_KEY, now);
  return purged;
}
