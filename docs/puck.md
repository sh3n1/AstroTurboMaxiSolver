# The puck

**Draft (2026-11-21).** Built so far, on both sides: the pairing (QR code and `auth`), the
`view`, `targetInfo`, `state`, the commands `solveNow`, `step` and `night`, and keeping the
link alive (`ping`). Written, to test with the puck: `puckHello`, `objects` and the catalogue's
transfer. The rest is agreed but not built.

The puck is a hand remote for the app: a small round screen (a Waveshare
ESP32-S3-Touch-AMOLED-1.75, 466×466 px) that shows the phone's sky map and guides to the
target. Its firmware lives in its own repository, [AstroTurboMaxiPuck](https://github.com/sh3n1/AstroTurboMaxiPuck).

This file is the contract between the app and the puck's firmware. Change it first, then
both sides.

## Who the puck links to (decided 2026-11-21)

**Where the telescope points always comes from the phone on the telescope.** What changes is
the way it reaches the puck:

- **One phone, in normal mode,** on the telescope: the puck links straight to it.
- **[Two phones](two-phones.md):** the puck links to the **screen phone**, which passes on what
  the finder on the telescope sends it. The puck never links to the finder.

Why: the puck is a remote, and a remote of a phone whose screen is locked, as the finder's is,
makes no sense. The screen phone, by contrast, already takes control of the finder, so the
puck works through it.

- **The phone the puck links to stays as it is.** Linking a puck doesn't put it in finder or
  any other mode, and doesn't lock or take over its screen: the puck is only a remote over it.
- **Both ways:** what the user changes on the puck acts on that phone (and, in Two phones,
  through it on the finder, as the screen's own changes do), and what changes on that phone
  (target, view, night mode…) updates the puck's view.

This phone is the puck's **host** below.

## The app's Remote page (decided 2026-11-21, not built)

- The menu tile and page **Two phones is renamed Remote**.
- The page has two sections:
  - **Two devices:** the two buttons it has today, this phone is the finder, and this phone is
    the screen.
  - **Puck:** a button to link a puck.

## Principles

- **Astronomy stays on the phone; the puck draws** (map option B, decided 2026-11-21). The host
  sends the puck its catalogue once (stars, constellation lines, deep-sky objects), and the
  puck keeps it in flash. After that the host only sends where the map points, about 30 times
  a second, and the Sun, Moon and planets now and then. The puck turns, projects and draws,
  the same way the app's map does (see "Drawing on the puck").
- **Everything that needs astronomy comes from the host:** the rotation from J2000 to the
  local sky (sidereal time, precession, the site, the alignment), the positions of what moves,
  the magnitude limit, and which objects show at which field of view. The puck only does the
  geometry of drawing.
- **The puck shows what the phone's map shows** (decided 2026-11-21): the same items (stars,
  lines, objects, labels, the horizon, the grid, the Moon's phase, the target and guidance),
  wherever the puck can technically draw them. What it can't yet is listed in the puck's
  `TODO.md`.
- **The data drives the puck.** A new kind of object, a change of label rules or a new star
  list is a change to the data the host sends, not to the firmware, as far as the formats
  below allow.
- **Every translated word comes from the host** (decided 2026-11-21), in the `texts`
  message, so the firmware holds no translations: the compass points, the data credits, and
  later the menu's words. Names and designations are never translated, and come in the
  catalogue and `objects`. Only what the puck shows before any link (joining the Wi-Fi, the
  QR code) is written in the firmware, in English.
- **Three kinds of message, on one WebRTC link:**
  - **Control messages:** JSON text, rare and small.
  - **The view:** binary, many times a second, in the fixed layout below. No Protobuf or other
    library: the layouts are simple enough to read with a `DataView` on the phone and a C
    struct on the puck.
  - **The catalogue:** binary, sent in parts when the puck doesn't have it yet.

## Pairing (built 2026-11-21)

The puck has a screen but no camera, so pairing is one way: the puck shows **one QR code**,
and the host builds the whole session from it. No server, no STUN or TURN: the puck and the
phone must be on the same Wi-Fi (or the phone's hotspot).

**The same code until the puck restarts** (decided 2026-11-22): after a lost link the puck
keeps its address, port, ICE credentials, DTLS certificate and secret, and shows the same
QR code. The host keeps the code it read, so its Reconnect button (on the Remote page, and
on the "Puck disconnected" message) links again without a new scan. The puck makes a new
code at start-up, and after a wrong secret. "Unlink" on the host forgets the code.

### The QR code

`AFP1:` followed by 82 bytes in base64url without padding:

| Offset | Bytes | Field         | Meaning                                                             |
| ------ | ----- | ------------- | ------------------------------------------------------------------- |
| 0      | 4     | `ip`          | The puck's IPv4 address.                                            |
| 4      | 2     | `port`        | Its UDP port, big-endian.                                           |
| 6      | 4     | `ufrag`       | Its ICE username fragment, ASCII.                                   |
| 10     | 24    | `pwd`         | Its ICE password, ASCII.                                            |
| 34     | 32    | `fingerprint` | The SHA-256 of its DTLS certificate.                                |
| 66     | 16    | `secret`      | Random, new for every QR code, which the host must send back first. |

The prefix tells a puck's code from a phone's (`AF1:`) at once. Code: `puck-pairing.ts` in the
app, `main/link.c` in the puck.

### The session

- The host makes its offer as usual, and builds the puck's answer itself from the QR code
  (`puckAnswer`): ICE-lite, `a=setup:passive` (the puck is the DTLS server), the offer's `mid`,
  one host candidate, and `a=max-message-size:16384`.
- The puck learns the host's address and ICE username from the host's first valid STUN check,
  and never sends checks of its own.
- **Trust, both ways:**
  - The host checks the puck's certificate against the fingerprint in the QR code, as WebRTC
    always does.
  - The puck can't check the host's certificate, since it never sees the host's offer.
    Instead, the host's **first message on the control channel is `auth`** with the secret,
    inside the encrypted link. Anything else first, a wrong secret, or no secret within 5 s,
    and the puck drops the link and shows a new QR code.
- The QR code is only for one pairing: the puck makes new credentials, certificate and secret
  every time it shows one.

### Messages in pieces

The puck puts messages of up to 16 KB back together (`SCTP_MAX_MESSAGE_SIZE` in its libpeer
copy, announced as `max-message-size`). Every message either side sends, of any kind, must
stay at or under 16,384 bytes.

## Channels

Opened by the host, in this order, with the usual in-band negotiation (not `negotiated`). The
puck tells them apart by label.

| Channel                        | Carries                                            | Delivery                                      |
| ------------------------------ | -------------------------------------------------- | --------------------------------------------- |
| `astroturbomaxisolver`         | Control messages, JSON text                        | Reliable, ordered                             |
| `astroturbomaxisolver-view`    | The `view`, binary                                 | Never resent, any order (`maxRetransmits: 0`) |
| `astroturbomaxisolver-catalog` | `catalogStart`, then the catalogue's parts, binary | Reliable, ordered                             |

A lost `view` is never resent: the next one, a few tens of milliseconds later, replaces it.
The catalogue has its own channel so that its few seconds of transfer don't hold back the
control messages.

The pose channel of Two phones (`astroturbomaxisolver-pose`) isn't used with a puck.

## Keeping the link alive

Each side sends at least one message a second, on any channel, and each takes 4 s of silence
from the other as a lost link, long before WebRTC itself would notice:

- **The host** sends a `view` at least once a second. Before its map has drawn a frame, it
  sends `state` instead.
- **The puck** sends `ping` (`{ t: 'ping' }`) when it has sent nothing else for a second.

On a lost link, the puck shows a new QR code and says the link was lost. The host says
"Puck disconnected" wherever the user is, and its Remote page shows "Link lost".

## Binary rules

- **Little-endian.** Both the ESP32-S3 and phones are little-endian, so the puck reads the
  bytes as they come. The phone writes with `DataView`, passing `true` for little-endian.
- **Numbers:** `u8`, `u16`, `i16`, `u32` integers; `f32` is a 32-bit IEEE 754 float.
- **Every field sits at an offset that is a multiple of its size,** so the puck can read a
  buffer as a C struct. The ESP32-S3 can't read a misaligned float.
- **Angles in degrees,** as in the rest of the app, except inside quaternions.
- **Directions** are unit vectors in the frames below. J2000 vectors are
  `[cos δ cos α, cos δ sin α, sin δ]`, as `equatorialVector` in `astronomy.ts`.
- **Local vectors** are east, north, up (x, y, z), as the app's local sky.
- **View vectors** are right, up and back (x, y, z): z points from the sky towards the
  viewer, so forward is −z. The map's own `toViewCoordinates` (right, up, forward) is a
  mirror image of that, which a quaternion can't hold.

## The view (channel `astroturbomaxisolver-view`, about 30 a second)

Where the host's map points, and the guidance to the target. 68 bytes.

| Offset | Type     | Field           | Meaning                                                                                                                                                                                                                                      |
| ------ | -------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | `u8`     | `type`          | 1. Unknown types are ignored.                                                                                                                                                                                                                |
| 1      | `u8`     | `version`       | Layout version, 1. A version not known is ignored.                                                                                                                                                                                           |
| 2      | `u16`    | `seq`           | Counts up for each `view`, wrapping at 65535. Older than the last used (by wrapping comparison) means late: dropped.                                                                                                                         |
| 4      | `u32`    | `timeMs`        | The host's clock, in ms since the link opened.                                                                                                                                                                                               |
| 8      | `f32[4]` | `sky`           | Unit quaternion (w, x, y, z): J2000 vectors to local vectors, before refraction. The app's `rotationAt(frameTime)`.                                                                                                                          |
| 24     | `f32[4]` | `view`          | Unit quaternion (w, x, y, z): local vectors to view vectors (right, up, back). The map's smoothed `viewBasis`, roll included.                                                                                                                |
| 40     | `f32`    | `fovDeg`        | The host's field: what its map shows across. The puck uses it only in the eyepiece view; on the sky map it zooms on its own ("The puck's zoom").                                                                                             |
| 44     | `f32`    | `altDeg`        | Altitude of the view's centre, as it appears, for the top edge.                                                                                                                                                                              |
| 48     | `f32`    | `azDeg`         | Azimuth of the view's centre, for the top edge.                                                                                                                                                                                              |
| 52     | `f32`    | `targetDistDeg` | Angle from the centre to the target. NaN when there is no target.                                                                                                                                                                            |
| 56     | `f32`    | `targetDirDeg`  | Direction to the target on the puck's screen, clockwise from up. NaN when there is no target.                                                                                                                                                |
| 60     | `f32`    | `starLimitMag`  | The faintest stars to draw, as the host's map does (`magnitudeLimit`, or the eyepiece's `starLimit`).                                                                                                                                        |
| 64     | `u8`     | `flags`         | Bit 0: mirror left to right. Bit 1: mirror top to bottom (the host's `imageFlip`). Bit 2: the host shows the eyepiece view. Bit 3: the sky map shows the eyepiece's field as its one ring (the app's ring view), instead of the three rings. |
| 65     | `u8[3]`  |                 | Zero, for later.                                                                                                                                                                                                                             |

Quaternions rather than 3×3 matrices: 16 bytes instead of 36, and two of them blend smoothly
(slerp) when the puck glides between messages. The puck draws with the newest `view` it has.
Its `sky` changes slowly, so a late one costs nothing visible.

The host sends the view it draws (smoothed, as `steadyPointing`): its map publishes each
frame (`map-view.service.ts`), and the puck's link sends a new frame at most every 33 ms
(`puck-link.service.ts`, `puck-view.ts`). `fovDeg` is the width of the host's map; the
puck takes it as its diameter only in the eyepiece view (see "The puck's zoom").

## The puck's zoom (decided 2026-11-21)

The puck's sky map is **not tied to the phone's zoom**: it follows where the phone points,
but shows a field of its own. The menu's Zoom shows +, −, ✓ and ✗ over the map: ✓ keeps the
new field, ✗ goes back to the one before. Nothing is sent to the host, whose own zoom stays
as it is.

- **In the host's eyepiece view** (flag bit 2), the puck follows the host's field (`fovDeg`)
  and draws the eyepiece's circle, as the phone does. Back on the sky map, it returns to
  its own field.
- **The rules are the map's**, sent by the host once linked, so both zoom the same way:
  `{ t: 'mapRules', field: { minDeg, maxDeg, step, startDeg }, starLimits: [[field, mag], …] }`.
  `starLimits` runs widest first: the faintest stars from that field up (the app's
  `STAR_LIMITS`). The puck draws to the limit for its own field, and the objects and labels
  for its own field (`showBelowFieldDeg`). On the sky map, `starLimitMag` in the `view` is
  the host's, for its own field, and the puck doesn't use it.

## Drawing on the puck

To match the app's map (`sky-canvas.component.ts`, `draw-sky.ts`, `draw-targets.ts`):

1. **J2000 to local:** `local = sky · v`.
2. **Refraction:** raise `local` by the app's refraction for its altitude `h` (astronomy-engine's
   `normal` model, Saemundsson's formula in Meeus):
   - `hd = max(h, −1)`;
   - `r = 1.02 / tan((hd + 10.3 / (hd + 5.11))°) / 60` degrees;
   - below −1°, `r` is also multiplied by `(h + 90) / 89`;
   - `r = 0` outside ±90°.

   Display geometry, so it is done on the puck, not sent.

3. **Local to view:** `(x, y, z) = view · local`, and forward `f = −z`. Skip what has
   `f < −0.2`, too far behind.
4. **Stereographic projection:**
   - `k = 2 / (1 + f)`, and `scale = 233 / (2 tan(field / 4))` pixels per unit, field being the puck's own (or `fovDeg` in the eyepiece view);
   - `px = 233 + sx · k · x · scale` and `py = 233 − sy · k · y · scale`;
   - `sx` and `sy` are −1 when the `flags` mirror bits are set, else 1.
5. **Below the horizon** (`local.z < 0` after refraction), the sky map draws at a lower opacity
   (`BELOW_HORIZON_OPACITY`); the eyepiece view (flag bit 2) draws it in full.
6. **Stars:**
   - draw the stars down to the limit for the field shown (`starLimits`; `starLimitMag` in the eyepiece view);
   - the radius is `max(0.8, 3.4 − 0.42 · mag)` px, scaled for the puck;
   - the colour is the star's tint (`STAR_TINTS`);
   - the opacity is `min(1, max(0.55, 1.15 − 0.1 · floor(mag)))`.
7. **Objects** show when the field the puck shows (its own zoom, or `fovDeg` in the
   eyepiece view) is under their `showBelowFieldDeg`. Their icons and labels
   follow the app's look in `draw-targets.ts` and `target-icons.ts`.
8. **Night mode** (`state.night`): everything in full-strength red, no grey.

The puck's own parts (rings, crosshair, chevrons, top edge, bottom third) are in its
`docs/screen-layout.md`.

## The catalogue

### What it holds

Everything on the host's map that doesn't move: stars, constellation lines and names, and
the fixed objects (deep-sky objects, named stars, doubles). Built by the host from the files
the app already loads (`stars.json`, `stars-deep.json`, `constellations.json`, the targets):
the map's stars to 6.5 in section 1, and the fainter ones the eyepiece view shows in
section 7, always both, so the catalogue (and its `id`) doesn't depend on whether the app's
eyepiece view has been opened. About 2.1 MB. Built by `puck-catalog.ts` and
`puck-catalog.service.ts`; kept on the puck by its `main/catalog.c`.

**Data licences:**

- The stars and constellation lines (XHIP and the IAU, via d3-celestial) are in the app's GPL part.
- The NGC and IC objects are OpenNGC's, CC BY-SA 4.0, and the star names are the HYG Database's, CC BY-SA 4.0. Both are aggregate data (see the app's `AGENTS.md`).

The catalogue reaches the puck only over the link, from the app: it is never built into the
firmware or its repository, and the puck keeps a copy as a browser's cache does. The data
credits come in the `texts` message instead, translated, and the puck shows them in its
Settings. Nothing translated goes in the catalogue: the same data must give the same `id`
in every language, or a change of language would send it all again.

### Its identity

The catalogue's `id` is the first 16 hex digits of the SHA-256 of its bytes. The same data
always gives the same `id`, so the puck asks for it again only when it changes.

### Transfer

1. After `auth`, the puck sends `puckHello` with the `id` of the catalogue it holds, or null.
2. If it's the same, the host sends `catalogOk`. Otherwise it sends `catalogStart` as text
   **on the catalogue channel**: `{ t: 'catalogStart', id, bytes, parts, crc32 }`. Not on
   the control channel: the two are separate streams with no order between them, and a
   resent `catalogStart` could come after the first parts.
3. Then, on the same channel, the catalogue's bytes in order, in binary parts of up to
   16,384 bytes. Each part is the bytes alone, with no header: the channel is reliable and
   ordered.
4. The puck collects them in its PSRAM, and once `bytes` have come checks the CRC-32 (IEEE,
   as zlib). Then a task of its own writes them to flash, while the link carries on: a
   megabyte of flash takes about 10 s to erase, longer than the 4 s silence limit.
5. It answers `{ t: 'catalogDone', id }` once the catalogue is written and read back, or
   `{ t: 'catalogFailed', reason }` (`crc`, `size`, `memory` or `flash`). On a failure the
   host starts again once.
6. Until it has a catalogue, the puck shows the reticle, the guidance and the top edge
   without the map, and says "Loading the sky…" with the progress.

A link that drops during the transfer starts it again from the beginning next time.

### Format

The catalogue's bytes:

- **Header:**
  - `u32` magic, the ASCII `ATMC`;
  - `u16` format version, 1;
  - `u16` the number of sections.
- **Section table**, one entry of 16 bytes per section:
  - `u32` type;
  - `u32` offset from the catalogue's start, a multiple of 4;
  - `u32` the number of records;
  - `u32` bytes.
- **The sections.**

The puck skips a section type it doesn't know, so new ones can be added without breaking it.

| Type | Section             | Record (bytes)                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Stars               | 12:<br>• `f32` raDeg<br>• `f32` decDeg<br>• `i16` magnitude × 100<br>• `u8` tint (index in `STAR_TINTS`)<br>• `u8` zero.<br>Brightest first, so drawing can stop at the limit.                                                                                                                                                                                         |
| 2    | Constellation lines | 16, one segment each:<br>• `f32` raDeg and decDeg of one end<br>• `f32` raDeg and decDeg of the other end.                                                                                                                                                                                                                                                             |
| 3    | Constellation names | 12:<br>• `f32` raDeg and decDeg of the label<br>• `u32` the name's offset in the strings.                                                                                                                                                                                                                                                                              |
| 4    | Objects             | 20:<br>• `f32` raDeg and decDeg<br>• `u32` the label's offset in the strings: what the map writes beside it, its first designation (`designations()[0]`, such as M1)<br>• `i16` magnitude × 100 (32767 for none)<br>• `u16` size × 10, in arcminutes (0 for none)<br>• `u16` minor axis × 10 (0 for round)<br>• `u8` kind<br>• `u8` `showBelowFieldDeg` (255: always). |
| 5    | Strings             | UTF-8 strings, each ending in a zero byte. Names are never translated (as in the app).                                                                                                                                                                                                                                                                                 |
| 6    | (none)              | Was the data credits: no longer sent, as they are translated (see `texts`). Don't use this number again.                                                                                                                                                                                                                                                               |
| 7    | Faint stars         | As section 1, the stars fainter than the map's 6.5 that the phone's eyepiece view shows (`stars-deep.json`, about 109 000), sorted by declination band (2° wide, from −90°), then by right ascension, so the puck reads only those near where it looks. Only drawn in the eyepiece view, down to its `starLimitMag`.                                                   |
| 8    | Palette             | Optional: the colours (`STAR_TINTS`, the line and label colours, by name), so the look follows the app. Layout to agree when it's built.                                                                                                                                                                                                                               |

Kinds (section 4 and `objects`):

- 1 Galaxy
- 2 Nebula
- 3 Open cluster
- 4 Globular cluster
- 5 Star
- 6 Double star
- 7 Planet
- 8 Dwarf planet
- 9 Asteroid
- 10 Moon
- 11 Sun
- 0 Other

New kinds take new numbers; the puck draws one it doesn't know as Other.

`showBelowFieldDeg` is the host's `isShownAtField` written as data:

- the object shows when the field is under this angle;
- 255 means it always shows;
- 0 means only in the eyepiece view.

So label rules can change in the app without changing the firmware.

The user's own targets aren't in the catalogue, so adding one doesn't send it all again: they
go in `objects`.

## Control messages (JSON)

On the `astroturbomaxisolver` channel. The puck's link is its own: none of Two phones'
messages between finder and screen (`hello`, `site`, `alignment`, `pause`, `resume`,
`fullscreen`, `dataOn`, `dataManifest`, `dataRecords`, `pose`) go to or come from the puck.
Closing the puck's link ends it; the host's own link to a finder, if any, carries on.

| From | Message         | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host | `auth`          | `{ t: 'auth', secret }`: always first, the secret from the QR code in base64url. See "Pairing". **Built.**                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Puck | `puckHello`     | Once paired: `{ t: 'puckHello', version: 1, screenPx: 466, catalog: id \| null }`, so the host knows it's a puck and what it holds. A finder answers `puckRefused` and closes.                                                                                                                                                                                                                                                                                                                                                                                     |
| Host | `puckRefused`   | `{ t: 'puckRefused', reason: 'finder' }`: this phone is a finder, which a puck can't link to. The puck says so on its screen.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Host | `catalogOk`     | `{ t: 'catalogOk' }`: the puck's catalogue is current.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Host | `catalogStart`  | `{ t: 'catalogStart', id, bytes, parts, crc32 }`, sent **on the catalogue channel**, before the parts. See "Transfer".                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Puck | `catalogDone`   | `{ t: 'catalogDone', id }`: received, checked and kept.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Puck | `catalogFailed` | `{ t: 'catalogFailed', reason }`: the CRC didn't match, or the flash is full.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Host | `objects`       | What moves, and the user's own targets: `{ t: 'objects', sun, items: [...] }`, below. Sent once linked, every minute, and on every change.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Host | `state`         | What the puck shows besides the map: `{ t: 'state', night, solving, sensorsOn, aligned, eyepieceFieldDeg }`, the last being the eyepiece's true field, for its circle in the eyepiece view and for "on target" (within half of it). Sent once linked and on every change.                                                                                                                                                                                                                                                                                          |
| Host | `texts`         | The puck's words in the host's language, right after `auth`: `{ t: 'texts', compass: { n, e, s, w }, altAz, field, credits }`: altAz and field are the top edge's readout (`readout.altAz`, `readout.field`) with `{alt}`, `{az}` and `{field}` where the puck writes its numbers; credits one per line. See "Principles".                                                                                                                                                                                                                                         |
| Host | `mapRules`      | The map's rules for the puck's own zoom, right after `texts`. See "The puck's zoom".                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Host | `targetInfo`    | The target: `{ t: 'targetInfo', id: string \| null, name, designations, list, label, kind, sizeArcmin }`: `name` and `designations` (all of them, as the target bar's, "M31 · NGC 224") for the player and the bottom edge; `list`, the list being observed through as the playlist bar shows it ("3/110 Messier"), or empty, for the player, sent again as it steps; `label` (as the map writes it), `kind` (the catalogue's number) and `sizeArcmin` (or null) so the puck's map draws it first and in full, as the app's. Sent once linked and on every change. |
| Host | `icon`          | `{ t: 'icon', body, paths: [{ p: [x, y, …], dashed?, fill? }] }`: one of the app's own icons (`target-icons.ts`) flattened into lines of points on its 24 grid (`puck-icons.ts`), one message each, right after `mapRules`: the planets', the Moon's and Venus's in their phase now, and Galaxy, Nebula, Double star and Constellation. The map draws the planets' in place of a plain disc (the Moon and Venus keep their turned phases); the lists draw them all.                                                                                                |
| Host | `solveLog`      | Each plate solve attempt as it ends, the host's or its finder's, only those after linking: `{ t: 'solveLog', entry: { at, trigger, outcome, message, starCount, matched, iso, frames, durationMs, sensorErrorDeg } }`, as Two phones sends it (`outcome` is `solved`, `failed` or `retry`; `message` is the app's line in its language, such as "No match in 14 stars"), so the puck can show "solved" or why not.                                                                                                                                                 |
| Puck | `solveNow`      | A tap on the reticle: `{ t: 'solveNow', trigger: 'tap' }`. The host solves, or asks its finder to, as for its own tap.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Puck | `step`          | The left or right arrow: `{ t: 'step', by: -1 \| 1 }`: the previous or next target of the list playing on the host.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Host | `appLog`        | `{ t: 'appLog', text }`: once linked again after a loss, this side's record of it (silence, connection state, page stalls), kept in the puck's log for finding why links drop.                                                                                                                                                                                                                                                                                                                                                                                     |
| Puck | `ping`          | `{ t: 'ping' }`: the puck is still there. See "Keeping the link alive".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Puck | `night`         | `{ t: 'night', on: boolean }`: night mode on the host, which passes it on to its finder as usual.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Puck | `lists`         | `{ t: 'lists' }`: the menu's Lists opened. The host answers with its `lists`. See "Lists" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Host | `lists`         | `{ t: 'lists', lists: [{ id, name, count }] }`: the lists the puck offers, in order, each with how many targets it has, as the phone's Lists page counts them; its `listTargets` then sends only those that are up.                                                                                                                                                                                                                                                                                                                                                |
| Puck | `listTargets`   | `{ t: 'listTargets', id }`: a list chosen. The host answers with that list's `listTargets`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Host | `listTargets`   | `{ t: 'listTargets', id, name, targets: [row], more }`: the list's targets above the horizon, in its order, at most 60, each a row as the phone's lists: `{ id, name, sub, icon, alt, dir, good }`, `sub` the designation where it isn't the name, `icon` its icon's name (an `icon` message's `body`, or Star, Open cluster, Globular cluster, Other for the standard ones), `alt` and `dir` how high and which way ("42° SE"), `good` from 30° up; `more` how many more are up.                                                                                  |
| Puck | `play`          | `{ t: 'play', list, target }`: a target chosen in a list: it becomes the target and the list plays from it, as a tap in the host's list page. The arrows (`step`) then go through it.                                                                                                                                                                                                                                                                                                                                                                              |
| Puck | `alignStars`    | `{ t: 'alignStars' }`: the menu's Alignment opened. The host answers with its `alignStars`. See "Alignment" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Host | `alignStars`    | `{ t: 'alignStars', current, remove, removeAgain, stars: [{ id, name, sub }] }`: what the host is aligned on (or empty), the Remove chip's words before and after a first tap, and the targets to align on, rows as `listTargets`' with how bright under each: the selected one while up, then the 4 easiest stars.                                                                                                                                                                                                                                                |
| Puck | `alignChoose`   | `{ t: 'alignChoose', id }`: a star chosen, to centre in the eyepiece by eye (it doesn't become the target). The host answers `alignStatus` (centre).                                                                                                                                                                                                                                                                                                                                                                                                               |
| Puck | `alignNow`      | `{ t: 'alignNow' }`: the star is centred: plate solve and align. The host answers `alignStatus` (solving), then (done or failed).                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Puck | `alignRemove`   | `{ t: 'alignRemove' }`: remove the alignment (the puck asks for a second tap). The host answers with its `alignStars`.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Host | `alignStatus`   | `{ t: 'alignStatus', step: 'centre' \| 'solving' \| 'failed' \| 'done', text, detail, button }`: where the alignment is, and the words of the puck's alignment page: the heading, a line or two under it, and the big button's word.                                                                                                                                                                                                                                                                                                                               |
| Puck | `lx200`         | `{ t: 'lx200', on }`: the puck's LX200 repeater on or off, sent once linked and on every change. While on, the host sends `pointing`. See "LX200" below.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Host | `pointing`      | `{ t: 'pointing', raDeg, decDeg }`: where the telescope points, on the equator and equinox of the date (JNow), once a second while the repeater is on (`puck-lx200.ts`).                                                                                                                                                                                                                                                                                                                                                                                           |
| Puck | `goto`          | `{ t: 'goto', raDeg, decDeg }`: a planetarium's GoTo, of the date. The host selects the nearest object within 2° as the target, or says there is none.                                                                                                                                                                                                                                                                                                                                                                                                             |

Each item of `objects`:

- `id`, `label` (what the map writes beside it, as in the catalogue), and `kind` (a
  number, as in the catalogue);
- `raDeg` and `decDeg`: where the host's own map draws it, in the same frame as the catalogue
  (topocentric for the Moon), so the same `sky` rotation applies;
- `mag` (or null), `sizeArcmin` (or null), and `showBelowFieldDeg`;
- for the Moon and Venus, `phase`: the lit fraction, 0 to 1.

The message also has `sun: { raDeg, decDeg }`, in the same frame, so the puck turns the lit
side towards the Sun, as `drawTargets` does.

The Moon moves about half a degree an hour, so once a minute is enough: the host sends it
once linked and whenever its own list moves them, once a minute (`puck-objects.ts`). About
2 KB, read by the puck's `main/moving.c`. The user's own targets aren't sent yet.

### Lists (built 2026-11-22)

The puck's menu offers tonight's collections (Best right now, In the reticle), the user's
own lists, then Messier and Caldwell; the other catalogues hold too many targets to scroll
through on a round screen. Only the targets above the horizon are sent, as the arrows skip
the others anyway (`playlist.ts`, `stepIndex`). The host builds both answers in
`puck-lists.ts`; the puck asks again each time its Lists page opens, so they follow the sky.

### LX200 (built 2026-11-22)

The puck's Settings → Meade LX200 Repeater: the puck answers LX200 commands over TCP on
port 4030, so planetarium apps (Stellarium, SkySafari) show where the telescope points
and can send it a GoTo. The puck only repeats: it asks for the pointing (`lx200`), the host
sends it in coordinates of the date (`pointing`, as LX200 telescopes report), and a GoTo
comes back (`goto`), which the host turns into the nearest object, as if chosen on the
phone. Set the planetarium to JNow (equinox of date) for this telescope.

### Alignment (built 2026-11-22)

As the app's Align page (`align.page.ts`), from the puck (`puck-align.service.ts`): the
menu's Alignment shows the targets to align on; once one is chosen the puck shows a page
over its map, as the Align page's steps: "Centre Vega", where it is and the hint, a big round
Align button in the middle and ✗ at the bottom. The star doesn't become the target: the map,
not yet aligned, would guide the phone's camera onto it rather than the telescope, and the
solve would then measure no offset (found on the board 2026-11-23). Align plate solves as the
page's button does, and saves the alignment the same way (`newAlignment` in
`alignment.ts`). The words shown come with each message, in the host's language.

## Open questions

- The palette section's layout, and night mode's colours (full-strength red, no grey).
- The menu items (Sensors, Eyepiece, Lists, Alignment, Settings, Meade LX200 Repeater): which
  need new messages. See the puck's `docs/screen-layout.md`.
- Re-pairing without a new QR code (the puck's TODO, "Improvements").
