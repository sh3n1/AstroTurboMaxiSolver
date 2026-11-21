# The puck

**Draft (2026-11-21).** Built so far, on both sides: the pairing (QR code and `auth`), the
`view`, `targetInfo`, `state`, the commands `solveNow`, `step` and `night`, and keeping the
link alive (`ping`). Written, to test with the puck: `puckHello` and the catalogue's
transfer. The rest is agreed but not built.

The puck is a hand remote for the app: a small round screen (a Waveshare
ESP32-S3-Touch-AMOLED-1.75, 466×466 px) that shows the phone's sky map and guides to the
target. Its firmware lives in its own repository, AstroTurboMaxiPuck.

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
- **The data drives the puck.** A new kind of object, a change of label rules or a new star
  list is a change to the data the host sends, not to the firmware, as far as the formats
  below allow.
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

| Offset | Type     | Field           | Meaning                                                                                                                       |
| ------ | -------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0      | `u8`     | `type`          | 1. Unknown types are ignored.                                                                                                 |
| 1      | `u8`     | `version`       | Layout version, 1. A version not known is ignored.                                                                            |
| 2      | `u16`    | `seq`           | Counts up for each `view`, wrapping at 65535. Older than the last used (by wrapping comparison) means late: dropped.          |
| 4      | `u32`    | `timeMs`        | The host's clock, in ms since the link opened.                                                                                |
| 8      | `f32[4]` | `sky`           | Unit quaternion (w, x, y, z): J2000 vectors to local vectors, before refraction. The app's `rotationAt(frameTime)`.           |
| 24     | `f32[4]` | `view`          | Unit quaternion (w, x, y, z): local vectors to view vectors (right, up, back). The map's smoothed `viewBasis`, roll included. |
| 40     | `f32`    | `fovDeg`        | The angle the puck's full diameter covers.                                                                                    |
| 44     | `f32`    | `altDeg`        | Altitude of the view's centre, as it appears, for the top edge.                                                               |
| 48     | `f32`    | `azDeg`         | Azimuth of the view's centre, for the top edge.                                                                               |
| 52     | `f32`    | `targetDistDeg` | Angle from the centre to the target. NaN when there is no target.                                                             |
| 56     | `f32`    | `targetDirDeg`  | Direction to the target on the puck's screen, clockwise from up. NaN when there is no target.                                 |
| 60     | `f32`    | `starLimitMag`  | The faintest stars to draw, as the host's map does (`magnitudeLimit`, or the eyepiece's `starLimit`).                         |
| 64     | `u8`     | `flags`         | Bit 0: mirror left to right. Bit 1: mirror top to bottom (the host's `imageFlip`). Bit 2: the host shows the eyepiece view.   |
| 65     | `u8[3]`  |                 | Zero, for later.                                                                                                              |

Quaternions rather than 3×3 matrices: 16 bytes instead of 36, and two of them blend smoothly
(slerp) when the puck glides between messages. The puck draws with the newest `view` it has.
Its `sky` changes slowly, so a late one costs nothing visible.

The host sends the view it draws (smoothed, as `steadyPointing`): its map publishes each
frame (`map-view.service.ts`), and the puck's link sends a new frame at most every 33 ms
(`puck-link.service.ts`, `puck-view.ts`). The host decides how its
field maps to the puck's round screen in `fovDeg`: still open (see "Open questions").

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
   - `k = 2 / (1 + f)`, and `scale = 233 / (2 tan(fovDeg / 4))` pixels per unit;
   - `px = 233 + sx · k · x · scale` and `py = 233 − sy · k · y · scale`;
   - `sx` and `sy` are −1 when the `flags` mirror bits are set, else 1.
5. **Below the horizon** (`local.z < 0` after refraction), the sky map draws at a lower opacity
   (`BELOW_HORIZON_OPACITY`); the eyepiece view (flag bit 2) draws it in full.
6. **Stars:**
   - draw the stars down to `starLimitMag`;
   - the radius is `max(0.8, 3.4 − 0.42 · mag)` px, scaled for the puck;
   - the colour is the star's tint (`STAR_TINTS`);
   - the opacity is `min(1, max(0.55, 1.15 − 0.1 · floor(mag)))`.
7. **Objects** show when `fovDeg` is under their `showBelowFieldDeg`. Their icons and labels
   follow the app's look in `draw-targets.ts` and `target-icons.ts`.
8. **Night mode** (`state.night`): everything in full-strength red, no grey.

The puck's own parts (rings, crosshair, chevrons, top edge, bottom third) are in its
`docs/screen-layout.md`.

## The catalogue

### What it holds

Everything on the host's map that doesn't move: stars, constellation lines and names, and
the fixed objects (deep-sky objects, named stars, doubles). Built by the host from the files
the app already loads (`stars.json`, `constellations.json`, the targets). Today about 0.5 MB.
The stars stop at the map's own limit, 6.5, even once the eyepiece view has loaded the
faint ones, so the catalogue (and its `id`) stays the same. Built by `puck-catalog.ts` and
`puck-catalog.service.ts`; kept on the puck by its `main/catalog.c`.

**Data licences:**

- The stars and constellation lines (XHIP and the IAU, via d3-celestial) are in the app's GPL part.
- The NGC and IC objects are OpenNGC's, CC BY-SA 4.0, and the star names are the HYG Database's, CC BY-SA 4.0. Both are aggregate data (see the app's `AGENTS.md`).

The catalogue reaches the puck only over the link, from the app: it is never built into the
firmware or its repository, and the puck keeps a copy as a browser's cache does. It carries
the app's data credits (section 6), which the puck shows in its Settings.

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
| 6    | Credits             | One UTF-8 text, the app's data credits in the host's language, lines split by `\n`.                                                                                                                                                                                                                                                                                    |
| 7    | Faint stars         | As section 1. Optional, for the eyepiece view, if the puck's flash and the transfer time allow (open).                                                                                                                                                                                                                                                                 |
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

| From | Message         | Meaning                                                                                                                                                                        |
| ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Host | `auth`          | `{ t: 'auth', secret }`: always first, the secret from the QR code in base64url. See "Pairing". **Built.**                                                                     |
| Puck | `puckHello`     | Once paired: `{ t: 'puckHello', version: 1, screenPx: 466, catalog: id \| null }`, so the host knows it's a puck and what it holds. A finder answers `puckRefused` and closes. |
| Host | `puckRefused`   | `{ t: 'puckRefused', reason: 'finder' }`: this phone is a finder, which a puck can't link to. The puck says so on its screen.                                                  |
| Host | `catalogOk`     | `{ t: 'catalogOk' }`: the puck's catalogue is current.                                                                                                                         |
| Host | `catalogStart`  | `{ t: 'catalogStart', id, bytes, parts, crc32 }`, sent **on the catalogue channel**, before the parts. See "Transfer".                                                         |
| Puck | `catalogDone`   | `{ t: 'catalogDone', id }`: received, checked and kept.                                                                                                                        |
| Puck | `catalogFailed` | `{ t: 'catalogFailed', reason }`: the CRC didn't match, or the flash is full.                                                                                                  |
| Host | `objects`       | What moves, and the user's own targets: `{ t: 'objects', sun, items: [...] }`, below. Sent once linked, every minute, and on every change.                                     |
| Host | `state`         | What the puck shows besides the map: `{ t: 'state', night, solving, sensorsOn, aligned }`. Sent once linked and on every change.                                               |
| Host | `targetInfo`    | The target's name to show: `{ t: 'targetInfo', id: string \| null, name: string }`. Sent once linked and on every change.                                                      |
| Host | `solveLog`      | Each plate solve attempt, as Two phones sends it, so the puck can show "solved" or why not.                                                                                    |
| Puck | `solveNow`      | A tap on the reticle: `{ t: 'solveNow', trigger: 'tap' }`. The host solves, or asks its finder to, as for its own tap.                                                         |
| Puck | `step`          | The left or right arrow: `{ t: 'step', by: -1 \| 1 }`: the previous or next target of the list playing on the host.                                                            |
| Puck | `zoom`          | `{ t: 'zoom', by: -1 \| 1 }`: the host's map zooms out or in one step, as its zoom buttons do; the next `view` shows it.                                                       |
| Puck | `ping`          | `{ t: 'ping' }`: the puck is still there. See "Keeping the link alive".                                                                                                        |
| Puck | `night`         | `{ t: 'night', on: boolean }`: night mode on the host, which passes it on to its finder as usual.                                                                              |

Each item of `objects`:

- `id`, `name`, and `kind` (a number, as in the catalogue);
- `raDeg` and `decDeg`: where the host's own map draws it, in the same frame as the catalogue
  (topocentric for the Moon), so the same `sky` rotation applies;
- `mag` (or null), `sizeArcmin` (or null), and `showBelowFieldDeg`;
- for the Moon and Venus, `phase`: the lit fraction, 0 to 1.

The message also has `sun: { raDeg, decDeg }`, in the same frame, so the puck turns the lit
side towards the Sun, as `drawTargets` does.

The Moon moves about half a degree an hour, so once a minute is enough.

Still to define, with the puck's menu (see its `docs/screen-layout.md`): messages for sensors
on and off, the eyepiece, choosing a list or target, and alignment.

## Open questions

- How the host's rectangular map fits the round screen: which field `fovDeg` gives.
- The faint stars (section 7) for the eyepiece view: whether to send them, and to which
  magnitude (about 100,000 stars, 1.2 MB, to 9).
- The palette section's layout, and night mode's colours (full-strength red, no grey).
- The menu items (Sensors, Eyepiece, Lists, Alignment, Settings, Meade LX200 Repeater): which
  need new messages. See the puck's `docs/screen-layout.md`.
- Re-pairing without a new QR code (the puck's TODO, "Improvements").
