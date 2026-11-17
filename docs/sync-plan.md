# Sync between devices (plan, not built)

Status: design discussed on 2026-11-16; work started on 2026-11-17 on the `sync` branch,
Google Drive first. This note keeps what was decided,
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

## Design

The core is built and unit tested, with no drive yet: `src/app/core/sync/`.

| File | What it does |
| --- | --- |
| `sync-merge.ts` | Merges a received record with this device's copy: the rules below |
| `sync-engine.ts` | One sync: sends this device's changes, reads the others', checkpoints. The `SyncStorage` and `SyncLocal` interfaces |
| `sync-local-db.ts` | `SyncLocal` on the Dexie database, in transactions |
| `memory-sync-storage.ts` | A drive in memory, for tests |
| `sync-provider.ts` | `SyncProvider`: what each drive implements (sign in, renew, sign out, its `SyncStorage`) |

Google Drive, Dropbox and OneDrive differ in how they sign in and in their file APIs, and
in nothing else the app sees. Each one is a class implementing `SyncProvider`, and the rest
of the app, the engine, the service and Settings, only uses that interface. Adding a drive is
writing that class.

### Files

The app folder holds flat file names, which every drive handles the same way:

```
<app folder>/
  <deviceId>.device.json             format, last change file number, last write time
  <deviceId>.000001.changes.json     numbered change files, each a batch of changed records
  <deviceId>.000002.changes.json
```

A change file is `{ format, deviceId, seq, writtenAt, changes: [{ type, record }] }`, where
`type` is `logEntry`, `list`, `listItem` or `kit`, and `record` is the whole record without
`pending`. A reader skips damaged files, leaves out records whose hash doesn't match their
content, and stops at a format newer than it knows. Snapshots, so old change files can be
removed, come later.

### Each device writes only its own changes

A device writes what it created or edited, including edits to records another device made,
as newer revisions of the same record id. Readers merge every device's files.

- Copying everything into every folder would multiply the data by the number of devices, and
  echo changes back and forth.
- A device that is gone (reset, replaced) still has its files, so its data isn't lost.

### Incremental sync, like CouchDB's change feed

- Each device numbers its change files in order (`syncSeq` in the local `meta` table).
- Each device remembers, per other device, the last change file it has read
  (`syncRead:<deviceId>` in `meta`), like CouchDB's `_local` replication documents.
- A sync first writes this device's pending records (`pending = 1`) as one new change file,
  so a conflict is seen by both devices, then marks them sent unless they changed meanwhile.
  It then lists the folder and reads each other device's change files after its checkpoint.

### Record header

Records keep the bookkeeping they had (`sync-record.ts`): `id` (UUID), `createdAt`,
`updatedAt`, `deviceId` (last writer), `rev` (a counter), `hash` (cyrb53 of the content),
`deletedAt` (tombstone), `pending`. Sync adds one field:

- `history`: the revisions this one replaced, newest first, as revision ids `"<rev>-<hash>"`
  (CouchDB's `_rev` form), up to 50. Records from before sync have none.

The record type isn't stored in the record: each table is one type, and the change files say
it. `createdBy` and `updatedBy` weren't needed for merging, so `deviceId` stays as it is.

### Picking the winner, without trusting phone clocks

As CouchDB does, with no clocks involved (`sync-merge.ts`):

1. The same revision, or one in this copy's history: an older version, keep this copy.
2. This copy's revision in the received one's history: a newer version, take it.
3. Otherwise both changed apart. With the same content it isn't a real conflict: the higher
   revision is taken quietly.
4. A **real conflict**: a version that still exists beats a deletion, then the higher
   revision number, then the higher hash. Every device picks the same winner.
5. For log entries the losing version is kept, in the `conflicts` table (database version
   3), since losing someone's observing notes silently is the worst outcome. A mark on the
   entry ("edited on two phones") is still to do. Lists and kit just take the winner.

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

## Decisions

- **First provider: Google Drive** (decided 2026-11-17).
- **Redirect addresses:** the published site, `https://astroturbomaxisolver.app/app/`, and
  `http://localhost` for the dev server, so no tunnel is needed. The Google client id is
  public by design (sign-in uses PKCE or Google's token flow, with no secret), but it is still
  kept outside the code's logic as configuration, so the code doesn't depend on one account.
- **Google sign-in** uses Google Identity Services' token flow, its script loaded from
  `accounts.google.com` only when Drive is connected. Access lasts an hour and is kept in
  memory only. After that, or after the app restarts, a tap renews it: Google's window opens
  and closes by itself. No server, so no refresh tokens.
- **Each device writes only its own changes**; readers merge every device's folder.
- **Log entry conflicts keep both versions:** the losing one is kept and the entry is marked.
  Lists and kit just take the winner.
- **Google Drive's hidden `appDataFolder`** (scope `drive.appdata`), so files can't be moved
  or deleted by mistake.

## Suggested order of work

1. Done: the `history` field, the merge rules, and the conflicts table, with unit tests.
2. Done: the storage interface with an in-memory drive, and the sync (change files,
   checkpoints) tested against it, with no network. Snapshots later.
3. The first provider, Google Drive: sign-in, then list, read and write in its app folder.
4. Settings: connect and disconnect, last sync time, "Sync now". Sync on start, on
   reconnecting, and a while after a change.
5. End-to-end test with two browser contexts sharing the fake storage, as the two-phone test
   does.
6. The other providers, then tombstone purging and snapshots.
