# Sync between devices (plan, not built)

Status: design discussed on 2026-11-16, nothing built yet. This note keeps what was decided,
what was proposed, and what is still open, so the work can be picked up later. The record
format it builds on is in `local-data.md`.

## Goal

Keep the observing log, the user's lists and the equipment kit the same on all of a user's
devices (phones, tablet, a second phone used as a finder), through a cloud drive the user
already has. No server of ours, in keeping with the PWA-only, no-backend approach.

What syncs: `logEntries`, `lists`, `listItems`, `kit`. What doesn't: everything in
localStorage (settings, location, alignment, playlist, list orders, chart state) stays on each
device, as listed in `local-data.md`.

## The idea (from the user)

1. Use the user's own **Google Drive, OneDrive or Dropbox**, in the app's own folder there.
2. Every record carries the header fields a sync needs: device id, record id, revisions, all
   UUIDs. Inspired by **Lotus Notes** replication and **CouchDB**.
3. The app folder has **one folder per device**. Each device writes only into its own folder.
   To sync, a device reads the other devices' folders and merges what it is missing.

The core of this was agreed: **one writer per folder** avoids the cloud drives' "conflicted
copy" files entirely, because no two devices ever write the same file.

## Proposed design

### Folder layout

```
<app folder>/
  devices/
    <deviceId>/
      device.json        name, app version, data format version, last write time
      changes/
        000001.json      numbered change files, each a batch of changed records
        000002.json
      snapshot.json      now and then: everything this device has written, so old
                         change files can be removed
```

### Each device writes only its own changes

Proposed instead of copying other devices' items into one's own folder (point 3 above, as
first worded): a device writes what it created or edited, including edits to records another
device made, as newer revisions of the same record id. Readers merge every folder.

- Copying everything into every folder would multiply the data by the number of devices, and
  echo changes back and forth.
- A device that is gone (reset, replaced) still has its folder, so its data isn't lost.
- The occasional `snapshot.json` gives each folder a complete backup of its own writes.
- **Open:** the user to confirm this over "copy what's missing into my own folder".

### Incremental sync, like CouchDB's change feed

- Each device numbers its change files in order (its "sequence").
- Each device remembers, per other device, the last change number it has read: a
  checkpoint, kept in the local `meta` table, like CouchDB's `_local` replication documents.
- A sync: list `devices/`, then for each other device download only the change files after
  its checkpoint (or its snapshot, the first time), merge, move the checkpoint on. Then write
  this device's pending records (`pending = 1`) as one new change file.

### Record header

What records already have (`sync-record.ts`): `id` (UUID), `createdAt`, `updatedAt`,
`deviceId` (last writer), `rev` (a counter), `hash` (cyrb53 of the content), `deletedAt`
(tombstone), `pending`.

| Purpose | Notes / CouchDB | Today | Proposed |
| --- | --- | --- | --- |
| Item id, the same on every device | Notes UNID, CouchDB `_id` | `id` | keep |
| Which collection ("resource") | | separate tables | add `type`: `logEntry`, `list`, `listItem`, `kit` |
| Who made it, who changed it last | | `deviceId` (last writer) | split into `createdBy` and `updatedBy` |
| Revision | CouchDB `_rev` = `n-hash`, revision tree | `rev` + `hash` | `rev` as `"3-<hash>"`, plus `prevRev` (the revision it replaced) |
| Deleted | CouchDB `_deleted`, Notes deletion stub | `deletedAt` | keep |
| Data format | | per table | `schema` number in each change file |

Changing these is a Dexie version upgrade (see "Changing the schema" in `local-data.md`).

### Picking the winner, without trusting phone clocks

The current plan in `local-data.md` lets the newer `updatedAt` win, which depends on each
phone's clock. Proposed instead, as CouchDB does:

1. The same `hash`: no conflict.
2. The higher revision number wins; on a tie, the higher hash. Every device picks the same
   winner with no clocks involved.
3. With `prevRev`, two edits made from the same starting revision are seen as a **real
   conflict**. For log entries, keep the losing version (Notes calls these "replication
   conflict" documents) and show a small "edited on two phones" mark, since losing someone's
   observing notes silently is the worst outcome. Lists and kit can just take the winner.

List membership is already one `listItems` record per target, so adding targets to the same
list on two phones merges without conflict.

### Tombstones

A deleted record must stay as a tombstone, or a device that was offline brings it back on its
next sync (Notes calls the limit the "replication cutoff"). Keep tombstones at least a year,
and only purge one once every known device's checkpoint is past it.

### Photos (later)

If the log gets photos, store them as separate files named by content hash, referenced from
the records, and sync them on Wi-Fi only.

## Providers

One small interface for all three, so the rest of the app doesn't know which is used:
list a folder, read a file, write a file. Plain `fetch` calls to each REST API, probably no
new dependency (ask before adding one).

| | App folder | Sign-in from a browser, no server | Notes |
| --- | --- | --- | --- |
| Dropbox | App folder, visible to the user | OAuth with PKCE, refresh tokens | Simplest to start with |
| OneDrive | App folder (`approot`), visible | MSAL / PKCE; refresh tokens for single-page apps last about 24 hours | |
| Google Drive | `appDataFolder`, hidden from the user | Google Identity Services gives one-hour tokens, no refresh token: needs a quiet re-sign-in | Names aren't unique in Drive: work with file ids |

**Open:** which provider first. Dropbox is the simplest; Google Drive if most users are on
Android.

## Why an address is needed (not a backend)

Nothing runs on a server: sign-in uses PKCE (no client secret), and files go straight
between the device and the user's drive. But each provider only sends the sign-in back to
**registered addresses**:

- `http://localhost` is accepted by all three for development (to be confirmed for each).
- A raw IP address such as the PC's address on the home network is refused by Google, and
  possibly by the others.
- A real HTTPS hostname is accepted: the published site, `https://astroturbomaxisolver.app/app/`.

Phones test sync on the published site, or on Android through Chrome's USB port forwarding
(`chrome://inspect` → Port forwarding), which opens the PC's dev server as `localhost:8443`.
While the app is in "testing" mode, Google only lets listed accounts sign in.

## Open decisions

1. Each device writes only its own changes (proposed), or copies everything it is missing
   into its own folder (first idea)?
2. Which provider first: Dropbox, Google Drive or OneDrive?
3. Keep losing versions of log entries as conflicts (proposed), or always take the winner?

## Suggested order of work

1. Record header changes (`type`, `createdBy`/`updatedBy`, `rev` as `n-hash`, `prevRev`) as a
   Dexie version upgrade, with unit tests for the merge rules: winner, conflict, tombstone.
2. A storage interface with an in-memory fake, and the whole sync (folders, change files,
   snapshot, checkpoints) tested against it, with no network.
3. The first provider: sign-in, then list, read and write in its app folder.
4. Settings: connect and disconnect, last sync time, "Sync now". Sync on start, on
   reconnecting, and a while after a change.
5. End-to-end test with two browser contexts sharing the fake storage, as the two-phone test
   does.
6. The other providers, then tombstone purging and snapshots.
