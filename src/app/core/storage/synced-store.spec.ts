import { describe, expect, it } from 'vitest';

import { UNCATEGORIZED_ID } from '../lists/target-lists';
import type { ListRecord } from '../lists/target-lists';

import { LocalDb } from './local-db';
import { SyncedStore } from './synced-store';

// The test browser has no IndexedDB, so the store runs as it does where the database is
// blocked: in memory. Writing to a real database is covered by the end-to-end tests.
async function makeStore(): Promise<SyncedStore<ListRecord>> {
  const store = new SyncedStore<ListRecord>(
    new LocalDb(),
    (db) => db.lists,
    (old) => old.lists,
  );
  await store.load();
  return store;
}

describe('synced store', () => {
  it('still has what was saved before the database, when the database is missing', async () => {
    const store = await makeStore();
    expect(store.items().map((l) => l.id)).toEqual([UNCATEGORIZED_ID]);
  });

  it('adds, changes, deletes and brings back items, counting each change', async () => {
    const store = await makeStore();
    store.save([{ id: 'a', name: 'Galaxies' }]);
    store.save([{ id: 'a', name: 'Galaxies' }]);
    expect(store.records().find((r) => r.id === 'a')?.rev).toBe(1);

    store.save([{ id: 'a', name: 'Nebulae' }]);
    expect(store.get('a')).toEqual({ id: 'a', name: 'Nebulae' });
    expect(store.records().find((r) => r.id === 'a')?.rev).toBe(2);

    store.remove(['a']);
    expect(store.get('a')).toBeUndefined();
    expect(store.items().some((l) => l.id === 'a')).toBe(false);

    store.save([{ id: 'a', name: 'Nebulae' }]);
    expect(store.records().find((r) => r.id === 'a')).toMatchObject({ rev: 4, deletedAt: null, pending: 1 });
  });

  it('gives changes made together times in order', async () => {
    const store = await makeStore();
    store.save([{ id: 'a', name: 'A' }]);
    store.save([{ id: 'b', name: 'B' }]);
    const [a, b] = ['a', 'b'].map((id) => store.records().find((r) => r.id === id)!);
    expect(b.createdAt).toBeGreaterThan(a.createdAt);
  });
});
