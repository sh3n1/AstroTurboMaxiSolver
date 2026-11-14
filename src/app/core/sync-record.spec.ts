import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  changeRecord,
  contentHash,
  contentOf,
  createRecord,
  deleteRecord,
  isUuid,
  nameUuid,
  newUuid,
} from './sync-record';

const DEVICE_A = 'device-a';
const DEVICE_B = 'device-b';

describe('sync records', () => {
  it('gives ids in the standard UUID form, a different one each time', () => {
    const id = newUuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newUuid()).not.toBe(id);
  });

  it('makes the same UUID from the same name, on any device, and a different one from another name', () => {
    const id = nameUuid('astrofinder/list/saved-for-later');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(nameUuid('astrofinder/list/saved-for-later')).toBe(id);
    expect(nameUuid('astrofinder/list/saved-for-later2')).not.toBe(id);
    expect([isUuid(id), isUuid(newUuid()), isUuid('list-1'), isUuid('telescope-1')]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('hashes the same content the same, whatever order its fields were set in', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
    expect(contentHash({ id: 'x', name: 'Galaxies' })).toBe(contentHash({ name: 'Galaxies', id: 'x' }));
    expect(contentHash({ id: 'x', name: 'Galaxies' })).not.toBe(contentHash({ id: 'x', name: 'Galaxies 2' }));
    expect(contentHash({ id: 'x' })).toMatch(/^[0-9a-f]{14}$/);
  });

  it('stamps a new record as made on this device, waiting to be synced', () => {
    const record = createRecord({ id: 'x', name: 'Galaxies' }, DEVICE_A, 1000);
    expect(record).toEqual({
      id: 'x',
      name: 'Galaxies',
      createdAt: 1000,
      updatedAt: 1000,
      deviceId: DEVICE_A,
      rev: 1,
      hash: contentHash({ id: 'x', name: 'Galaxies' }),
      deletedAt: null,
      pending: 1,
    });
    expect(contentOf(record)).toEqual({ id: 'x', name: 'Galaxies' });
  });

  it('counts a change, keeps when it was made, and writes nothing when nothing changed', () => {
    const record = { ...createRecord({ id: 'x', name: 'Galaxies' }, DEVICE_A, 1000), pending: 0 as const };
    expect(changeRecord(record, { id: 'x', name: 'Galaxies' }, DEVICE_B, 2000)).toBeNull();
    const changed = changeRecord(record, { id: 'x', name: 'Nebulae' }, DEVICE_B, 2000)!;
    expect(changed).toMatchObject({ name: 'Nebulae', createdAt: 1000, updatedAt: 2000, deviceId: DEVICE_B, rev: 2 });
    expect(changed.pending).toBe(1);
    expect(changed.hash).toBe(contentHash({ id: 'x', name: 'Nebulae' }));
  });

  it('keeps a deleted record as a tombstone, which saving again brings back', () => {
    const record = createRecord({ id: 'x', name: 'Galaxies' }, DEVICE_A, 1000);
    const deleted = deleteRecord(record, DEVICE_A, 2000)!;
    expect(deleted).toMatchObject({ name: 'Galaxies', deletedAt: 2000, updatedAt: 2000, rev: 2 });
    expect(deleteRecord(deleted, DEVICE_A, 3000)).toBeNull();
    // Same content, but no longer deleted: that is a change.
    expect(changeRecord(deleted, { id: 'x', name: 'Galaxies' }, DEVICE_A, 3000)).toMatchObject({
      deletedAt: null,
      rev: 3,
    });
  });

  it('never copies the bookkeeping of what it is given into the content', () => {
    const record = createRecord({ id: 'x', name: 'Galaxies' }, DEVICE_A, 1000);
    // Saving a record read back, with its old bookkeeping, makes a clean new one.
    const again = createRecord(record, DEVICE_B, 5000);
    expect(again).toMatchObject({ createdAt: 5000, deviceId: DEVICE_B, rev: 1 });
    expect(again.hash).toBe(record.hash);
  });
});
