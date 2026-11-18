import { describe, expect, it } from 'vitest';

import { changeRecord, createRecord, revId } from '../sync-record';
import type { Synced } from '../sync-record';

import {
  ENTRIES_PER_MESSAGE,
  isDataMessage,
  manifestMessages,
  receivedChanges,
  recordKey,
  recordMessages,
  RECORDS_PER_MESSAGE,
  recordsToSend,
} from './link-sync';
import type { Change } from './sync-engine';

/** A list record, as made on a phone. */
function list(id: string, name: string): Change {
  return { type: 'list', record: createRecord({ id, name }, 'phone-a', 1000) };
}

describe('link sync', () => {
  it('tells its messages from the link’s own', () => {
    expect(isDataMessage({ t: 'dataOn' })).toBe(true);
    expect(isDataMessage({ t: 'pose' })).toBe(false);
  });

  it('sends the manifest in parts, the last one marked, and an empty one when there is nothing', () => {
    const many = Array.from({ length: ENTRIES_PER_MESSAGE + 1 }, (_, i) => list(`id-${i}`, `List ${i}`));
    const parts = manifestMessages(many);
    expect(parts.map((p) => p.t === 'dataManifest' && [p.entries.length, p.last])).toEqual([
      [ENTRIES_PER_MESSAGE, false],
      [1, true],
    ]);
    expect(manifestMessages([])).toEqual([{ t: 'dataManifest', entries: [], last: true }]);
    const first = parts[0].t === 'dataManifest' ? parts[0].entries[0] : null;
    expect(first).toEqual(['list', 'id-0', revId(many[0].record)]);
  });

  it('sends only what the other phone lacks, or has in another revision', () => {
    const same = list('a', 'Same');
    const older = list('b', 'Old name');
    const newer: Change = {
      type: 'list',
      record: changeRecord(
        older.record as Synced<{ id: string; name: string }>,
        { id: 'b', name: 'New name' },
        'phone-a',
        2000,
      )!,
    };
    const missing = list('c', 'Only here');
    const peerHas = new Map([
      [recordKey('list', 'a'), revId(same.record)],
      [recordKey('list', 'b'), revId(older.record)],
    ]);
    expect(recordsToSend([same, newer, missing], peerHas).map((c) => c.record.id)).toEqual(['b', 'c']);
  });

  it('sends records in batches, as already synced, and takes only sound ones back', () => {
    const records = Array.from({ length: RECORDS_PER_MESSAGE + 3 }, (_, i) => list(`id-${i}`, `List ${i}`));
    const messages = recordMessages(records);
    expect(messages).toHaveLength(2);
    const received = receivedChanges(JSON.parse(JSON.stringify(messages[1])) as { changes: unknown });
    expect(received.map((c) => [c.record.id, c.record.pending])).toEqual([
      [`id-${RECORDS_PER_MESSAGE}`, 0],
      [`id-${RECORDS_PER_MESSAGE + 1}`, 0],
      [`id-${RECORDS_PER_MESSAGE + 2}`, 0],
    ]);
    // A record changed on the way, so its hash no longer matches, is left out.
    const tampered = { changes: [{ type: 'list', record: { ...list('x', 'Real').record, name: 'Fake' } }] };
    expect(receivedChanges(tampered)).toEqual([]);
    expect(receivedChanges({})).toEqual([]);
  });
});
