import { describe, expect, it } from 'vitest';

import { changeRecord, createRecord, deleteRecord, revId } from '../storage/sync-record';
import type { Synced } from '../storage/sync-record';

import { beats, mergeBatch, mergeRecord } from './sync-merge';
import type { AnyRecord } from './sync-merge';

/** A small log-entry-like record. */
interface Note {
  id: string;
  note: string;
}

const A = 'device-a';
const B = 'device-b';

/** A log-entry-like record made on device A, then synced (pending 0). */
function made(note = 'first'): AnyRecord {
  return { ...createRecord({ id: 'x', note }, A, 1000), pending: 0 };
}

/** The record changed to a new note, on a device. */
function edited(record: AnyRecord, note: string, device = A, now = 2000): AnyRecord {
  return changeRecord(record as Synced<Note>, { id: 'x', note }, device, now)!;
}

describe('sync merge', () => {
  it('takes a record this device has never seen, as already synced', () => {
    const incoming = { ...made(), pending: 1 as const };
    expect(mergeRecord(undefined, incoming)).toEqual({ kind: 'take', record: { ...incoming, pending: 0 } });
  });

  it('keeps its copy when it receives the same revision, or one it already replaced', () => {
    const v1 = made();
    const v2 = edited(v1, 'second');
    expect(mergeRecord(v1, v1)).toEqual({ kind: 'keep' });
    expect(mergeRecord(v2, v1)).toEqual({ kind: 'keep' });
  });

  it('takes a newer revision, even several edits ahead, whichever device made it', () => {
    const v1 = made();
    const v3 = edited(edited(v1, 'second', B), 'third', B, 3000);
    expect(v3.history).toEqual([revId(edited(v1, 'second', B)), revId(v1)]);
    expect(mergeRecord(v1, v3)).toEqual({ kind: 'take', record: { ...v3, pending: 0 } });
  });

  it('finds a conflict when two devices edit the same revision, and both pick the same winner', () => {
    const v1 = made();
    const onA = edited(v1, 'seen from the garden', A);
    const onB = edited(v1, 'seen from the roof', B);
    const atA = mergeRecord(onA, onB);
    const atB = mergeRecord(onB, onA);
    expect(atA.kind).toBe('conflict');
    expect(atB.kind).toBe('conflict');
    if (atA.kind !== 'conflict' || atB.kind !== 'conflict') return;
    expect(atA.winner.hash).toBe(atB.winner.hash);
    expect(atA.loser.hash).toBe(atB.loser.hash);
    expect(atA.localWins).not.toBe(atB.localWins);
  });

  it('lets the version edited more times win, and an edit win over a deletion', () => {
    const v1 = made();
    const twice = edited(edited(v1, 'second', A), 'third', A, 3000);
    const once = edited(v1, 'other', B);
    expect(beats(twice, once)).toBe(true);
    expect(beats(once, twice)).toBe(false);

    const deletedTwice = deleteRecord(edited(v1, 'second', A), A, 3000)!;
    expect(beats(once, deletedTwice)).toBe(true);
    expect(mergeRecord(deletedTwice, once)).toMatchObject({ kind: 'conflict', localWins: false });
  });

  it('sees two devices making the same change as no conflict', () => {
    const v1 = made();
    expect(mergeRecord(edited(v1, 'same', A), edited(v1, 'same', B))).toEqual({ kind: 'keep' });
  });

  it('merges a batch in order, writing only what changed here and listing conflicts', () => {
    const v1 = made();
    const other = { ...createRecord({ id: 'y', note: 'new' }, B, 1500), pending: 0 as const };
    const onA = edited(v1, 'mine', A);
    const onB = edited(v1, 'theirs', B);
    const v2 = edited(v1, 'second', B);
    const v3 = edited(v2, 'third', B, 3000);

    // A newer version and an older one in the same batch: the newer one stays.
    expect(mergeBatch(new Map([['x', v1]]), [v3, v2]).writes).toEqual([{ ...v3, pending: 0 }]);
    // A new record and a conflict.
    const result = mergeBatch(new Map([['x', onA]]), [other, onB]);
    expect(result.writes.map((r) => r.id)).toEqual(beats(onA, onB) ? ['y'] : ['y', 'x']);
    expect(result.losers).toHaveLength(1);
  });
});
