// How a record received from another device is merged with this device's copy. Pure
// functions, the same on every device, so that all devices end up agreeing without talking
// to each other and without trusting their clocks. Modelled on CouchDB's replication: each
// record remembers the revisions it replaced (SyncMeta.history), which tells a newer version
// from an older one, and both from two edits made apart. The design is in docs/sync-plan.md.

import { revId } from '../storage/sync-record';
import type { Synced } from '../storage/sync-record';

/** Any synced record: its content is only known to have an id. */
export type AnyRecord = Synced<{ id: string }>;

/** What to do with a received record. */
export type MergeOutcome =
  /** This device's copy is the same, or newer: nothing to write. */
  | { kind: 'keep' }
  /** The received record replaces this device's copy, or is new here. */
  | { kind: 'take'; record: AnyRecord }
  /**
   * Both were changed apart, from the same earlier revision: a real conflict. `winner` is
   * what this device should hold, and `loser` the other version, for records worth keeping
   * both of. `winner` may be this device's own copy, with nothing to write.
   */
  | { kind: 'conflict'; winner: AnyRecord; loser: AnyRecord; localWins: boolean };

/**
 * Merges one received record with this device's copy of it, if any.
 *
 * - Not here yet: take it.
 * - The same revision, or one this copy already replaced: keep this copy.
 * - A revision that replaced this copy: take it.
 * - Otherwise both changed apart. The same content is not a real conflict: the higher
 *   revision is taken quietly. Different content is a conflict, settled by `beats`.
 */
export function mergeRecord(local: AnyRecord | undefined, incoming: AnyRecord): MergeOutcome {
  if (!local) return { kind: 'take', record: received(incoming) };

  const localId = revId(local);
  const incomingId = revId(incoming);
  if (localId === incomingId || (local.history ?? []).includes(incomingId)) return { kind: 'keep' };
  if ((incoming.history ?? []).includes(localId)) return { kind: 'take', record: received(incoming) };

  const sameContent = local.hash === incoming.hash && (local.deletedAt === null) === (incoming.deletedAt === null);
  if (sameContent) return incoming.rev > local.rev ? { kind: 'take', record: received(incoming) } : { kind: 'keep' };

  const localWins = beats(local, incoming);
  return localWins
    ? { kind: 'conflict', winner: local, loser: received(incoming), localWins }
    : { kind: 'conflict', winner: received(incoming), loser: local, localWins };
}

/**
 * Which of two versions changed apart wins, the same answer on every device:
 * 1. one that still exists beats a deletion, so a conflict never loses the user's data;
 * 2. then the higher revision number, the one changed more times;
 * 3. then the higher content hash, an arbitrary but shared tie-break.
 */
export function beats(a: AnyRecord, b: AnyRecord): boolean {
  const aAlive = a.deletedAt === null;
  const bAlive = b.deletedAt === null;
  if (aAlive !== bAlive) return aAlive;
  if (a.rev !== b.rev) return a.rev > b.rev;
  return a.hash > b.hash;
}

/** A received record as kept here: already synced, so nothing to send back. */
function received(record: AnyRecord): AnyRecord {
  return { ...record, pending: 0 };
}

/** What merging a batch of received records gives: what to write, and conflicts found. */
export interface BatchResult {
  /** Records to write to this device's table. */
  writes: AnyRecord[];
  /** The versions that lost a conflict, to keep where that is wanted. */
  losers: AnyRecord[];
}

/**
 * Merges received records with this device's copies, given by id. A record received more
 * than once in the batch is merged in order, each time with the result so far.
 */
export function mergeBatch(locals: ReadonlyMap<string, AnyRecord>, incoming: readonly AnyRecord[]): BatchResult {
  const current = new Map(locals);
  const written = new Map<string, AnyRecord>();
  const losers: AnyRecord[] = [];
  for (const record of incoming) {
    const outcome = mergeRecord(current.get(record.id), record);
    if (outcome.kind === 'keep') continue;
    if (outcome.kind === 'conflict') {
      losers.push(outcome.loser);
      // This device's copy stays: nothing to write.
      if (outcome.localWins) continue;
    }
    const next = outcome.kind === 'take' ? outcome.record : outcome.winner;
    current.set(record.id, next);
    written.set(record.id, next);
  }
  return { writes: [...written.values()], losers };
}
