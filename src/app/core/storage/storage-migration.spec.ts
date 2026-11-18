import { describe, expect, it } from 'vitest';

import { DEFAULT_EYEPIECE, DEFAULT_TELESCOPE } from '../equipment/equipment';
import { UNCATEGORIZED_ID, listItemId } from '../lists/target-lists';

import {
  OLD_LISTS_KEY,
  OLD_LOG_KEY,
  OLD_PLAN_KEY,
  SETTINGS_KEY,
  listUuid,
  logEntryUuid,
  recordsFromOldStorage,
  settingsWithoutKit,
  withUuids,
} from './storage-migration';
import { contentHash, contentOf, createRecord, isUuid } from './sync-record';

const NOW = Date.UTC(2026, 10, 14);
const DEVICE = 'device';

/** A stand-in for localStorage, holding these values. */
const storage =
  (values: Record<string, unknown>) =>
  (key: string): string | null =>
    key in values ? (typeof values[key] === 'string' ? (values[key] as string) : JSON.stringify(values[key])) : null;

describe('moving from localStorage to the database', () => {
  it('starts with an empty Saved for later, and no kit, when nothing was saved', () => {
    const records = recordsFromOldStorage(storage({}), DEVICE, NOW);
    expect(records.logEntries).toEqual([]);
    expect(records.lists.map(contentOf)).toEqual([{ id: UNCATEGORIZED_ID, name: 'Saved for later' }]);
    expect(records.listItems).toEqual([]);
    expect(records.kit).toEqual([]);
    expect(records.kitSelection).toBeNull();
  });

  it('keeps each log entry, made when it was logged, with a UUID made from its old id', () => {
    const entry = { id: 'old-1', targetId: 'M31', time: '2026-01-02T22:00:00.000Z', rating: 3, tags: [], note: '' };
    const [record] = recordsFromOldStorage(storage({ [OLD_LOG_KEY]: [entry] }), DEVICE, NOW).logEntries;
    expect(contentOf(record)).toEqual({ ...entry, id: logEntryUuid('old-1') });
    expect(record).toMatchObject({ createdAt: Date.parse(entry.time), deviceId: DEVICE, rev: 1, pending: 1 });
    expect(record.hash).toBe(contentHash(contentOf(record)));
  });

  it('keeps the lists in order, each target once, in order, all with UUIDs', () => {
    const lists = [
      { id: 'uncategorized', name: 'Uncategorized', targetIds: ['M42'] },
      { id: 'list-1', name: 'Autumn', targetIds: ['M31', 'M33', 'M31'] },
    ];
    const records = recordsFromOldStorage(storage({ [OLD_LISTS_KEY]: lists }), DEVICE, NOW);
    const autumn = listUuid('list-1');
    expect(records.lists.map((l) => [l.id, l.createdAt])).toEqual([
      [UNCATEGORIZED_ID, NOW],
      [autumn, NOW + 1],
    ]);
    expect(records.listItems.map(contentOf)).toEqual([
      { id: listItemId(UNCATEGORIZED_ID, 'M42'), listId: UNCATEGORIZED_ID, targetId: 'M42', position: 0 },
      { id: listItemId(autumn, 'M31'), listId: autumn, targetId: 'M31', position: 0 },
      { id: listItemId(autumn, 'M33'), listId: autumn, targetId: 'M33', position: 1 },
    ]);
    expect([...records.lists, ...records.listItems].every((r) => isUuid(r.id))).toBe(true);
  });

  it('turns the old session plan into Saved for later', () => {
    const records = recordsFromOldStorage(storage({ [OLD_PLAN_KEY]: { ids: ['M42'] } }), DEVICE, NOW);
    expect(records.listItems.map((i) => i.id)).toEqual([listItemId(UNCATEGORIZED_ID, 'M42')]);
  });

  it('ignores damaged data rather than failing', () => {
    const records = recordsFromOldStorage(storage({ [OLD_LOG_KEY]: '{oops', [OLD_LISTS_KEY]: 'nope' }), DEVICE, NOW);
    expect(records.logEntries).toEqual([]);
    expect(records.lists.map((l) => l.id)).toEqual([UNCATEGORIZED_ID]);
  });
});

describe('moving the kit out of the settings', () => {
  const settings = {
    nightMode: true,
    kit: {
      telescopes: [
        { id: 'telescope-1', name: '', type: 'newtonian', apertureMm: 130, focalMm: 650 },
        { id: 'telescopes-abc', name: 'Dobson', type: 'newtonian', apertureMm: 254, focalMm: 1200 },
      ],
      eyepieces: [{ id: 'eyepiece-1', name: '', focalMm: 25, fieldDeg: 52 }],
      modifiers: [{ id: 'modifiers-x', name: '', factor: 2 }],
      filters: [],
    },
    kitSelection: {
      telescopeId: 'telescopes-abc',
      eyepieceId: 'eyepiece-1',
      modifierId: 'modifiers-x',
      filterId: null,
    },
  };

  it('gives each item a UUID, of its kind, and points the selection at the new ids', () => {
    const { kit, kitSelection } = recordsFromOldStorage(storage({ [SETTINGS_KEY]: settings }), DEVICE, NOW);
    expect(kit.map((r) => [r.kind, r.name])).toEqual([
      ['telescopes', ''],
      ['telescopes', 'Dobson'],
      ['modifiers', ''],
    ]);
    expect(kit.every((r) => isUuid(r.id))).toBe(true);
    const dobson = kit.find((r) => r.name === 'Dobson')!;
    const barlow = kit.find((r) => r.kind === 'modifiers')!;
    // The eyepiece was only the untouched default, so the built-in one takes its place.
    expect(kitSelection).toEqual({
      telescopeId: dobson.id,
      eyepieceId: DEFAULT_EYEPIECE.id,
      modifierId: barlow.id,
      filterId: null,
    });
  });

  it('keeps two phones\' old "telescope-1" apart', () => {
    const custom = {
      ...settings,
      kit: { ...settings.kit, telescopes: [{ ...settings.kit.telescopes[1], id: 'telescope-1' }] },
    };
    const ids = ['phone-a', 'phone-b'].map(
      (device) => recordsFromOldStorage(storage({ [SETTINGS_KEY]: custom }), device, NOW).kit[0].id,
    );
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('builds the kit from the settings of before the kit existed', () => {
    const old = {
      telescopeType: 'refractor',
      telescopeFocalMm: 900,
      telescopeApertureMm: 102,
      eyepieceFocalMm: 10,
      eyepieceFieldDeg: 52,
    };
    const { kit, kitSelection } = recordsFromOldStorage(storage({ [SETTINGS_KEY]: old }), DEVICE, NOW);
    expect(kit.map((r) => r.kind)).toEqual(['telescopes', 'eyepieces']);
    expect(kitSelection?.telescopeId).toBe(kit[0].id);
    expect(kitSelection?.telescopeId).not.toBe(DEFAULT_TELESCOPE.id);
  });

  it('removes the kit from the settings, and nothing else', () => {
    expect(settingsWithoutKit({ ...settings, telescopeFocalMm: 650 })).toEqual({
      nightMode: true,
      kitSelection: settings.kitSelection,
    });
  });
});

describe('UUIDs for records saved with older ids', () => {
  it('turns each old id into the same UUID every time, and leaves UUIDs alone', () => {
    expect(listUuid('list-1')).toBe(listUuid('list-1'));
    expect(listUuid('uncategorized')).toBe(UNCATEGORIZED_ID);
    expect(logEntryUuid(UNCATEGORIZED_ID)).toBe(UNCATEGORIZED_ID);
  });

  it('moves a list and its targets to UUIDs together, with their hashes worked out again', () => {
    const list = createRecord({ id: 'list-1', name: 'Autumn' }, DEVICE, NOW);
    const item = createRecord({ id: 'list-1|M31', listId: 'list-1', targetId: 'M31', position: 0 }, DEVICE, NOW);
    const result = withUuids({ logEntries: [], lists: [list], listItems: [item] });
    expect(result.lists[0]).toMatchObject({ id: listUuid('list-1'), name: 'Autumn', createdAt: NOW });
    expect(result.listItems[0]).toMatchObject({
      id: listItemId(listUuid('list-1'), 'M31'),
      listId: listUuid('list-1'),
    });
    expect(result.listItems[0].hash).toBe(contentHash(contentOf(result.listItems[0])));
    // Running it again changes nothing.
    expect(withUuids(result)).toEqual(result);
  });
});
