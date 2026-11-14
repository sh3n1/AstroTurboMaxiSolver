// Moves what was saved before the database into it, and turns the ids used before UUIDs
// into UUIDs. Pure, so it can be tested without a browser database.

import { DEFAULT_EYEPIECE, DEFAULT_SELECTION, DEFAULT_TELESCOPE, kitFromOldSettings } from './equipment';
import type { Kit, KitRecord, KitSelection, Equipment } from './equipment';
import type { LogEntry } from './observing-log';
import { contentHash, contentOf, createRecord, isUuid, nameUuid } from './sync-record';
import type { Synced } from './sync-record';
import type { ListItem, ListRecord, TargetList } from './target-lists';
import { UNCATEGORIZED_ID, listItemId, startingLists } from './target-lists';

/** Where localStorage kept them. The keys are removed once the database has them. */
export const OLD_LOG_KEY = 'astrofinder.log';
export const OLD_LISTS_KEY = 'astrofinder.lists';
/** Older still: the session plan's bookmarks, which became Saved for later. */
export const OLD_PLAN_KEY = 'astrofinder.plan';
export const OLD_KEYS = [OLD_LOG_KEY, OLD_LISTS_KEY, OLD_PLAN_KEY] as const;
/** The settings, which held the equipment kit before the database did. They stay there. */
export const SETTINGS_KEY = 'astrofinder.settings';
/** The settings fields that held the kit, removed once the database has it. */
export const OLD_KIT_SETTINGS = [
  'kit',
  'telescopeType',
  'telescopeFocalMm',
  'telescopeApertureMm',
  'eyepieceFocalMm',
  'eyepieceFieldDeg',
  'recentEquipment',
] as const;

/** The settings without the fields that held the kit, once the database has it. */
export function settingsWithoutKit<T extends object>(settings: T): T {
  const copy = { ...settings } as Record<string, unknown>;
  for (const key of OLD_KIT_SETTINGS) delete copy[key];
  return copy as T;
}

/** Saved for later's id before ids were UUIDs. */
const OLD_UNCATEGORIZED_ID = 'uncategorized';

/** Everything the database keeps, by table. */
export interface LocalRecords {
  logEntries: Synced<LogEntry>[];
  lists: Synced<ListRecord>[];
  listItems: Synced<ListItem>[];
  kit: Synced<KitRecord>[];
}

/** What was saved before the database, as records, and the kit selection with the new ids. */
export interface OldData extends LocalRecords {
  /** Null when the settings had no kit, so the selection in them is left alone. */
  kitSelection: KitSelection | null;
}

// ---- Ids ----
// An old id always becomes the same UUID, so a backup made before still matches its
// entries, and a list's sort order, saved by its id, still finds it.

/** A log entry's id as a UUID. */
export const logEntryUuid = (id: string): string => (isUuid(id) ? id : nameUuid(`astrofinder/log-entry/${id}`));

/** A list's id as a UUID. Saved for later has its own, the same on every device. */
export function listUuid(id: string): string {
  if (id === OLD_UNCATEGORIZED_ID) return UNCATEGORIZED_ID;
  return isUuid(id) ? id : nameUuid(`astrofinder/list/${id}`);
}

/**
 * A kit item's id as a UUID. Old kit ids such as "telescope-1" were only unique on one
 * phone, so the device's id goes into the name: two phones' "telescope-1" stay apart.
 */
const kitUuid = (id: string, deviceId: string): string =>
  isUuid(id) ? id : nameUuid(`astrofinder/kit/${deviceId}/${id}`);

/** The record with a new id and other content changes, its hash worked out again. */
function changeIds<T extends { id: string }>(record: Synced<T>, changes: Partial<T>): Synced<T> {
  const changed = { ...record, ...changes };
  return { ...changed, hash: contentHash(contentOf(changed)) };
}

type LogAndLists = Pick<LocalRecords, 'logEntries' | 'lists' | 'listItems'>;

/**
 * The log and lists with every id a UUID. A list's targets follow their list. Records
 * already with UUIDs come back as they were.
 */
export function withUuids(records: LogAndLists): LogAndLists {
  return {
    logEntries: records.logEntries.map((e) => (isUuid(e.id) ? e : changeIds(e, { id: logEntryUuid(e.id) }))),
    lists: records.lists.map((l) => (isUuid(l.id) ? l : changeIds(l, { id: listUuid(l.id) }))),
    listItems: records.listItems.map((item) => {
      const listId = listUuid(item.listId);
      const id = listItemId(listId, item.targetId);
      return id === item.id ? item : changeIds(item, { id, listId });
    }),
  };
}

// ---- What localStorage held ----

/** Reads JSON, or gives undefined for a missing or damaged value. */
function parse<T>(text: string | null): T | undefined {
  try {
    return text ? (JSON.parse(text) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** The settings as saved by earlier versions, with the kit in them. */
type OldSettings = Partial<Equipment> & {
  kit?: Kit;
  kitSelection?: KitSelection;
  recentEquipment?: Partial<Equipment>[];
};

/** Whether an item is a built-in default as earlier versions saved it, only with another id. */
function isOldDefault(item: { id: string }, defaultItem: { id: string }): boolean {
  return contentHash({ ...item, id: '' }) === contentHash({ ...defaultItem, id: '' });
}

/**
 * The kit from the settings, as records with UUIDs, and the selection pointing at them.
 * A telescope or eyepiece that is only the untouched default isn't saved: the built-in
 * default takes its place.
 */
function kitFromSettings(settings: OldSettings, deviceId: string, now: number) {
  let kit: Kit;
  let selection: KitSelection;
  if (settings.kit) {
    kit = settings.kit;
    selection = settings.kitSelection ?? DEFAULT_SELECTION;
  } else if ('telescopeFocalMm' in settings) {
    ({ kit, selection } = kitFromOldSettings(settings, settings.recentEquipment));
  } else {
    return { kit: [], kitSelection: null };
  }

  const ids = new Map<string, string>();
  const onlyDefault = (items: { id: string }[], defaultItem: { id: string }): boolean =>
    items.length === 1 && isOldDefault(items[0], defaultItem);
  if (onlyDefault(kit.telescopes, DEFAULT_TELESCOPE)) ids.set(kit.telescopes[0].id, DEFAULT_TELESCOPE.id);
  if (onlyDefault(kit.eyepieces, DEFAULT_EYEPIECE)) ids.set(kit.eyepieces[0].id, DEFAULT_EYEPIECE.id);

  const records: Synced<KitRecord>[] = [];
  for (const kind of ['telescopes', 'eyepieces', 'modifiers', 'filters'] as const) {
    for (const item of kit[kind] ?? []) {
      if (ids.has(item.id)) continue;
      const id = kitUuid(item.id, deviceId);
      ids.set(item.id, id);
      records.push(createRecord<KitRecord>({ ...item, id, kind }, deviceId, now + records.length));
    }
  }
  const newId = (id: string | null): string | null => (id === null ? null : (ids.get(id) ?? null));
  return {
    kit: records,
    kitSelection: {
      telescopeId: newId(selection.telescopeId) ?? DEFAULT_TELESCOPE.id,
      eyepieceId: newId(selection.eyepieceId) ?? DEFAULT_EYEPIECE.id,
      modifierId: newId(selection.modifierId),
      filterId: newId(selection.filterId),
    },
  };
}

/**
 * The records for what localStorage held, all with UUIDs. Saved for later is always
 * there, even when nothing was saved. Lists keep their order through their creation
 * times, one millisecond apart, and their targets through their positions.
 */
export function recordsFromOldStorage(read: (key: string) => string | null, deviceId: string, now: number): OldData {
  // A log entry was made when it was logged.
  const logEntries = (parse<LogEntry[]>(read(OLD_LOG_KEY)) ?? []).map((entry) =>
    createRecord(entry, deviceId, Date.parse(entry.time) || now),
  );

  let lists = parse<TargetList[]>(read(OLD_LISTS_KEY));
  if (!lists) lists = startingLists(parse<{ ids: string[] }>(read(OLD_PLAN_KEY))?.ids ?? []);
  lists = lists.map((l) => ({ ...l, id: listUuid(l.id) }));
  if (!lists.some((l) => l.id === UNCATEGORIZED_ID)) lists = [...startingLists(), ...lists];

  return {
    ...withUuids({
      logEntries,
      lists: lists.map(({ id, name }, index) => createRecord<ListRecord>({ id, name }, deviceId, now + index)),
      listItems: lists.flatMap(({ id: listId, targetIds }) =>
        // A target saved twice in a list is kept once.
        [...new Set(targetIds)].map((targetId, position) =>
          createRecord<ListItem>({ id: listItemId(listId, targetId), listId, targetId, position }, deviceId, now),
        ),
      ),
    }),
    ...kitFromSettings(parse<OldSettings>(read(SETTINGS_KEY)) ?? {}, deviceId, now),
  };
}
