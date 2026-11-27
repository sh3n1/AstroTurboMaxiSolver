# Local data

How AstroTurboMaxiSolver keeps the user's data on the phone, and how it syncs between devices
(through Google Drive, or between two linked phones; see `sync-plan.md`).

## Where each thing is kept

The rule: what belongs to the user, and should follow them to another device, is a synced
record in IndexedDB. What belongs to this phone, its camera, its mount or tonight's session,
stays in localStorage and is never synced.

**Synced, in IndexedDB:**

| Data                                                                | Table        | Notes                                     |
| ------------------------------------------------------------------- | ------------ | ----------------------------------------- |
| Observing log                                                       | `logEntries` | Grows without limit. Will get photos.     |
| The user's lists                                                    | `lists`      | Name only.                                |
| The targets in each list                                            | `listItems`  | One record per target in a list.          |
| Equipment kit: telescopes, eyepieces, Barlows and reducers, filters | `kit`        | One record per item, with a `kind` field. |
| Device id, migration flags                                          | `meta`       | About this database. Not synced.          |

**This device only, in localStorage:**

| Data                                                                                 | Key                                 | Why it isn't synced                                                              |
| ------------------------------------------------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------- |
| Kit selection: which telescope, eyepiece, Barlow and filter are in use               | `astroturbomaxisolver.settings`     | Each phone may be on a different telescope. It points at kit records by UUID.    |
| Location, Bortle                                                                     | `astroturbomaxisolver.settings`     | Where this phone is tonight. Shared observing sites would be a new synced table. |
| Camera field factor                                                                  | `astroturbomaxisolver.settings`     | This phone's camera.                                                             |
| Night mode, text size                                                                | `astroturbomaxisolver.settings`     | Chosen for this screen and session. A tablet and a phone differ.                 |
| Auto solve, keep screen on, shutter remote, solve sound, RA/Dec, eyepiece star limit | `astroturbomaxisolver.settings`     | How this phone is used.                                                          |
| Debug options: solve toasts, send solves, capture mode                               | `astroturbomaxisolver.settings`     | Development only.                                                                |
| Alignment                                                                            | `astroturbomaxisolver.alignment`    | Only valid for this phone on this telescope.                                     |
| Whether the sensors were on, to turn them back on when the app opens                 | `astroturbomaxisolver.sensorsOn`    | This phone, tonight.                                                             |
| Sort order chosen per list                                                           | `astroturbomaxisolver.listSorts`    | Keyed by list UUID, or by the app list's name. A view choice.                    |
| Chart of tonight open or closed, on every list                                       | `astroturbomaxisolver.listChart`    | A view choice.                                                                   |
| Observing programmes whose card was read                                             | `astroturbomaxisolver.programsRead` | A view choice: the card then shows folded.                                       |
| The observer's name for OAL log files                                                | `astroturbomaxisolver.observer`     | Filled in for the next export. Would join a synced profile if one is made.       |
| The list being observed through (playlist)                                           | `astroturbomaxisolver.playlist`     | Where this phone is in a list tonight, like the selected target.                 |
| Weather forecast                                                                     | `astroturbomaxisolver.forecast`     | Throwaway cache.                                                                 |
| Which drive sync uses, and when it last synced                                       | `astroturbomaxisolver.sync`         | This device's connection. The drive's access itself is kept in memory only.      |

App code and the star and target data are in the service worker cache (`ngsw-config.json`)
for offline start. They aren't user data.

IndexedDB is used through [Dexie](https://dexie.org) 4 (Apache-2.0). The database is called
`astroturbomaxisolver` and its schema is in `src/app/core/storage/local-db.ts`.

## How the app uses it

- `LocalDb` opens the database once. If IndexedDB is missing, broken or takes longer than
  4 s, the app runs from memory: what was in localStorage is shown, and changes last until the
  app closes.
- `SyncedStore<T>` holds one table in an Angular signal. A change shows at once and is
  written to the table in the background, so the pages never wait for the database.
- Each store also watches its table with Dexie's `liveQuery`. A change from another tab
  (the installed app and a browser tab open together) or from a future sync reaches the pages.
  While the tab's own writes are still in flight it ignores what the table says, since the
  table is briefly behind.
- `main.ts` waits for the kit, log and lists to load before the first page shows, so no page
  shows them empty for a moment. That takes milliseconds.
- On the first change, the app asks the browser to keep its data (`navigator.storage.persist`).
  Safari still clears a site's data after weeks without a visit unless the app is installed on
  the home screen, so the backup export stays important.

## Full backup

Settings, Backup, saves everything above as one zip file (`core/storage/backup.ts`, zipped with
fflate): one JSON file per table, with every record's bookkeeping and the deleted ones, the
conflict versions set aside, and the preferences listed in `BACKUP_PREFERENCES` (settings,
list sorts and chart, programmes read, the observer's name). Not the forecast cache, the drive
connection, tonight's alignment, or data from before the database.

Restoring merges the records as a sync would (`DexieSyncLocal.restore`), so nothing newer on the
phone is replaced, and marks what it writes to send, so the other devices get it through sync.
The preferences replace the phone's, and the app reloads. A record whose hash doesn't match its
content is left out, and a backup from a newer version is refused.

When something new is saved, decide whether a backup should keep it: a table joins
`RECORD_TYPES` or the backup's own files, a localStorage key joins `BACKUP_PREFERENCES`.

## Records

Every record holds its content and the same bookkeeping (`SyncMeta` in
`src/app/core/storage/sync-record.ts`):

| Field       | Meaning                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `id`        | Always a UUID. See the id rules below.                                                                      |
| `createdAt` | When it was made, in ms, by this device's clock                                                             |
| `updatedAt` | When it last changed, or was deleted or put back                                                            |
| `deviceId`  | The device that made the last change                                                                        |
| `rev`       | 1 when made, plus one per change                                                                            |
| `hash`      | cyrb53 hash of the content, without the bookkeeping, keys sorted                                            |
| `deletedAt` | When it was deleted, or null. Deleted records stay as tombstones.                                           |
| `pending`   | 1 when changed since the last sync                                                                          |
| `history`   | The revisions it replaced, newest first, as `"<rev>-<hash>"`, up to 50. Missing on records from before sync |

Rules every write follows:

- Saving content that hashes the same as the record's, on a record that isn't deleted, writes
  nothing. A no-op save never creates a change to sync.
- Deleting only marks the record. Undo saves the content again, which brings it back with a
  higher `rev`.
- Times come from `LocalDb.now()`, which never repeats or goes backwards on one device, so
  records made together keep their order and every change has its own time.

### Ids

- Every record id is a UUID. A new record gets a random one (version 4).
- A record that two devices must agree on without talking to each other gets a UUID made
  from a name (version 8, from a 128-bit cyrb128 hash, `nameUuid` in `sync-record.ts`):
  - Saved for later: `nameUuid('astroturbomaxisolver/list/saved-for-later')`.
  - A target's place in a list: `nameUuid('astroturbomaxisolver/list-item/<listId>/<targetId>')`.
  - The built-in default telescope and eyepiece.
- Ids from before UUIDs become name-based UUIDs of their old id, so the same old id always
  gives the same UUID (`storage-migration.ts`). An old log backup imported later still
  matches its entries, and a saved sort order still finds its list. Old kit ids such as
  `telescope-1` were only unique on one phone, so the device id goes into their name.
- Catalogue target ids (`M31`, `NGC 7000`) are references to the app's data, not record
  ids, and stay as they are.

### The kit's built-in defaults

The default telescope (130/650) and eyepiece (25 mm) are never saved. A new phone shows them
until the user saves an item of that kind.

- Editing a default saves it as the user's own item.
- Adding a first item of a kind next to a default saves the default too, so it doesn't vanish
  from the list.

So a new phone never adds another default copy to a synced kit, and a phone that already has
synced items never shows a default.

### Log entries and the kit

Each log entry records the kit items in use by id (`conditions.kitIds`) as well as a copy of
their numbers (`conditions.equipment`). The copy keeps the entry readable if an item is
edited or deleted later. The ids let observations be found by telescope or eyepiece.

### Choices made with sync in mind

- **A list's targets are one record each.** If two phones bookmark different targets in the
  same list, both bookmarks survive a merge. A whole-list record would let one phone's list
  overwrite the other's.
- **List item ids come from the list and target.** The same bookmark made on two phones is the
  same record, not two copies.
- **Positions are numbers with gaps allowed.** Adding to the end writes one record, and
  removing writes one tombstone. Only reordering by hand rewrites the positions that moved.
- **The kit is one record per item.** Adding a filter on one phone and a telescope on another
  both survive.
- **Log entries are never merged field by field.** An entry is small and nearly always
  edited on one phone, so last writer wins is enough.

## Moving from localStorage

On the first start with the database, `LocalDb` moves the old data in one transaction
(`src/app/core/storage/storage-migration.ts`). Each part has its own flag in `meta`, so it moves once:

- `migratedFromLocalStorage` covers `astroturbomaxisolver.log`, `astroturbomaxisolver.lists` and the older
  `astroturbomaxisolver.plan`. Their keys are removed only after the transaction commits.
- `migratedKit` covers the kit in `astroturbomaxisolver.settings`. It comes either as the `kit` field
  or as the flat telescope fields of earlier versions. AppState then rewrites the settings
  without the kit, with the selection pointing at the new UUIDs.

A failure leaves localStorage untouched for the next start.

Database version 2 added the `kit` table and turned version 1's non-UUID ids into UUIDs.
Version 3 added the `conflicts` table, for log entry versions that lost a sync conflict.

## Sync

Sync is built, and described in `sync-plan.md`: through the user's Google Drive (Dropbox and
OneDrive to follow), and between two linked phones. The outline below came first;
`sync-plan.md` replaces it where they differ, notably winners by revision rather than by clock.

The intended protocol, which the fields above support:

1. **Push:** send every record with `pending = 1`, tombstones included. Set `pending = 0` once
   the server accepts it, but only if `updatedAt` hasn't changed since it was sent.
2. **Pull:** fetch the records changed since the last pull (keep a server cursor in `meta`) and
   write them with Dexie. `liveQuery` updates the pages.
3. **Conflicts:** when both sides changed a record, the same `hash` means no conflict.
   Otherwise the higher `updatedAt` wins, then the higher `rev`, then the higher `deviceId`,
   so every device picks the same winner. Phone clocks drift, so a server could stamp its own
   receive time, or the records could move to hybrid logical clocks if this proves a problem.
4. **Tombstones** can be purged once every device has synced past them. Until sync exists they
   are kept. They are small, and re-adding a bookmark brings back the same record.
5. **Photos** (later) go in their own table, keyed by entry id, as Blobs, with the same
   bookkeeping. They can be synced on their own schedule, on Wi-Fi only.
6. **A selection pointing at a kit item deleted on another device** falls back to the first
   telescope or eyepiece, or to none, as it already does (`resolveSelection`).

## Changing the schema

Add `this.version(n + 1).stores({...})` in `AstroTurboMaxiSolverDb`, with `.upgrade(tx => …)` if
existing records must change. Never edit a released version. A tab still running the old
version reloads itself when a newer tab upgrades the database.
