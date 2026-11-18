// Syncing the log, lists and kit straight between two phones linked for Two phones, over
// their WebRTC link, with no drive in between. Plain functions and the messages, so they can
// be tested without a link; link-sync.service.ts runs them. The records merge by the same
// rules as a drive sync (sync-merge.ts).
//
// How it goes, once both phones say their setting is on:
// 1. Each sends a manifest: every record's type, id and revision, without the content.
// 2. Each then sends the records whose revision the other doesn't have, in batches.
// 3. From then on, each sends a record whenever it changes.
// Each phone remembers which revision the other has of each record, so nothing goes twice.

import { revId } from '../storage/sync-record';

import type { Change, RecordType } from './sync-engine';
import { isValidChange } from './sync-engine';

/** One record in a manifest: its type, its id and its revision. */
export type ManifestEntry = [RecordType, string, string];

/** The messages, sent by either phone. */
export type DataMessage =
  /** Whether this phone's setting is on. Sent once linked, and whenever it changes. */
  | { t: 'dataOn'; on: boolean }
  /** Part of this phone's manifest. The last part says so. */
  | { t: 'dataManifest'; entries: ManifestEntry[]; last: boolean }
  /** Records the other phone doesn't have yet, in their latest revision here. */
  | { t: 'dataRecords'; changes: Change[] };

/**
 * How many records or manifest entries go in one message. A data channel message is safest
 * under about 64 KB; records are rarely over 500 bytes, entries about 80.
 */
export const RECORDS_PER_MESSAGE = 100;
export const ENTRIES_PER_MESSAGE = 600;

/** A record's key, the same on both phones: its type and its id. */
export function recordKey(type: RecordType, id: string): string {
  return `${type}/${id}`;
}

/** Whether a message from the other phone is one of these. */
export function isDataMessage(message: { t: string }): message is DataMessage {
  return message.t === 'dataOn' || message.t === 'dataManifest' || message.t === 'dataRecords';
}

/** The manifest of these records, in messages small enough to send. */
export function manifestMessages(records: readonly Change[]): DataMessage[] {
  const entries = records.map(({ type, record }): ManifestEntry => [type, record.id, revId(record)]);
  const parts = inGroups(entries, ENTRIES_PER_MESSAGE);
  if (parts.length === 0) parts.push([]);
  return parts.map((part, i) => ({ t: 'dataManifest', entries: part, last: i === parts.length - 1 }));
}

/**
 * The records the other phone doesn't have in this revision, by what it is known to have.
 * The other phone's merge keeps its own copy where that one is newer.
 */
export function recordsToSend(records: readonly Change[], peerHas: ReadonlyMap<string, string>): Change[] {
  return records.filter(({ type, record }) => peerHas.get(recordKey(type, record.id)) !== revId(record));
}

/**
 * Records in messages small enough to send. They go as already synced: `pending` says what
 * this phone still has to send to the user's drive, which is no business of the other one.
 */
export function recordMessages(records: readonly Change[]): DataMessage[] {
  return inGroups(records, RECORDS_PER_MESSAGE).map((group) => ({
    t: 'dataRecords',
    changes: group.map(({ type, record }) => ({ type, record: { ...record, pending: 0 } })),
  }));
}

/**
 * The well-formed records in a received message, ready to merge: anything damaged, or whose
 * hash doesn't match its content, is left out, as for a drive's files.
 */
export function receivedChanges(message: { changes?: unknown }): Change[] {
  if (!Array.isArray(message.changes)) return [];
  return message.changes.filter(isValidChange).map(({ type, record }) => ({ type, record: { ...record, pending: 0 } }));
}

/** Items in groups of at most `size`. */
function inGroups<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}
