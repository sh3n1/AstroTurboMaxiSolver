# The puck

**Draft (2026-11-20): nothing here is built yet, on either side.**

The puck is a hand remote for the app: a small round screen (a Waveshare
ESP32-S3-Touch-AMOLED-1.75, 466×466 px) that shows the phone's sky map and guides to the
target. Its firmware lives in its own repository, AstroTurboMaxiPuck. It takes the screen
phone's part in [Two phones](two-phones.md): the phone on the telescope is the finder, as
usual.

This file is the contract between the app and the puck's firmware. Change it first, then
both sides.

## Principles

- **Astronomy stays on the phone.** The phone works out where everything is and projects it.
  The puck only draws what it is sent, and turns the last frame between frames.
- **Two kinds of message, on the same WebRTC link as Two phones:**
  - **Control messages** are JSON text, rare and small, the same as Two phones.
  - **The view** (where the map points, and the stars to draw) is binary, sent many times a
    second, in the fixed layouts below. No Protobuf or other library: the layouts are simple
    enough to read with a `DataView` on the phone and a C struct on the puck.

## Channels

| Channel                     | Carries                           | Delivery                                |
| --------------------------- | --------------------------------- | --------------------------------------- |
| `astroturbomaxisolver`      | Control messages, JSON text       | Reliable, ordered (as Two phones)       |
| `astroturbomaxisolver-pose` | `pose`, JSON text (as Two phones) | Never resent, any order (as Two phones) |
| `astroturbomaxisolver-view` | View messages, binary             | Never resent, any order                 |

A lost view message is never resent: the next one, a few tens of milliseconds later,
replaces it. Each binary message stays under 16 KB, which every browser handles.

Open: whether to make the channels `negotiated` with fixed ids, so neither side has to wait
for the other to create them. That may be simpler for the puck's WebRTC library.

## Binary view messages

### Rules for every layout

- **Little-endian.** Both the ESP32-S3 and phones are little-endian, so the puck reads the
  bytes as they come. The phone writes with `DataView`, passing `true` for little-endian.
- **Numbers:** `u8`, `u16`, `i16`, `u32` integers; `f32` is a 32-bit IEEE 754 float.
- **Every field sits at an offset that is a multiple of its size,** so the puck can read a
  received buffer as a C struct. The ESP32-S3 can't read a misaligned float.
- **Angles in degrees,** as in the rest of the app.

### Header (8 bytes, at the start of every view message)

| Offset | Type  | Field     | Meaning                                                                                                                      |
| ------ | ----- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0      | `u8`  | `type`    | Which message: 1 `view`, 2 `stars`. Unknown types are ignored.                                                               |
| 1      | `u8`  | `version` | Layout version, 1 for now. A message with a version not known is ignored.                                                    |
| 2      | `u16` | `seq`     | Counts up for each message of that type, wrapping at 65535. Older than the last used (by wrapping comparison) means dropped. |
| 4      | `u32` | `timeMs`  | The phone's clock, in ms since the link opened, when it was made.                                                            |

### `view` (type 1, about 30 a second)

Where the phone's map points now, and the guidance to the target. 44 bytes.

| Offset | Type     | Field           | Meaning                                                                                                       |
| ------ | -------- | --------------- | ------------------------------------------------------------------------------------------------------------- |
| 0      | header   |                 |                                                                                                               |
| 8      | `f32[4]` | `rotation`      | Unit quaternion (w, x, y, z), turning J2000 directions into the view's frame.                                 |
| 24     | `f32`    | `fovDeg`        | The angle the puck's full diameter covers.                                                                    |
| 28     | `f32`    | `altDeg`        | Altitude of the view's centre, for the top edge.                                                              |
| 32     | `f32`    | `azDeg`         | Azimuth of the view's centre, for the top edge.                                                               |
| 36     | `f32`    | `targetDistDeg` | Angle from the centre to the target. NaN when there is no target.                                             |
| 40     | `f32`    | `targetDirDeg`  | Direction to the target on the puck's screen, clockwise from up, for the arrows. NaN when there is no target. |

A quaternion rather than a 3×3 matrix: 16 bytes instead of 36, and two of them blend
smoothly (slerp) when the puck glides between messages.

### `stars` (type 2, about 10 a second)

The stars the phone's map shows, already projected for the puck's screen. 32 bytes, then
6 bytes a star.

| Offset | Type     | Field      | Meaning                                                               |
| ------ | -------- | ---------- | --------------------------------------------------------------------- |
| 0      | header   |            |                                                                       |
| 8      | `f32[4]` | `rotation` | The `view` rotation these stars were projected with.                  |
| 24     | `f32`    | `fovDeg`   | The field of view they were projected with.                           |
| 28     | `u8`     | `part`     | Which part of the frame this is, from 0.                              |
| 29     | `u8`     | `parts`    | How many parts the frame has: more than one when it would pass 16 KB. |
| 30     | `u16`    | `count`    | How many stars follow in this part.                                   |
| 32     | star[]   |            | `count` stars, 6 bytes each:                                          |

Each star:

| Offset | Type  | Field    | Meaning                                                                                      |
| ------ | ----- | -------- | -------------------------------------------------------------------------------------------- |
| 0      | `i16` | `x`      | Right of the centre, in eighths of a puck pixel.                                             |
| 2      | `i16` | `y`      | Down from the centre, in eighths of a puck pixel.                                            |
| 4      | `u8`  | `mag`    | Magnitude: (mag + 2) × 20, rounded and clamped to 0–255 (−2 to 10.75).                       |
| 5      | `u8`  | `colour` | Colour index from B−V, matching the app's star colours (`sky-style.ts`); table to be agreed. |

The frame includes stars a little outside the screen, so turning it doesn't show empty
edges. Between frames the puck turns it by the difference between the newest `view`
rotation and the frame's own ("timewarp"); for the small turns between two frames, a shift
and a roll of the 2D frame are enough.

Later types, not yet designed: constellation lines, deep-sky objects, labels, the horizon.

## Control messages (JSON)

The puck uses the screen phone's messages from [Two phones](two-phones.md):

- **It receives** `hello`, `site`, `solveLog`, `solveResult`, `alignment`, `pause`, `resume`,
  and `pose` (which it may ignore, since `view` has the same and more).
- **It sends** `solveNow` (a tap on the reticle, `trigger: 'tap'`), `night`, `target`,
  `pause`, `resume`.
- **It never sends** `fullscreen`, `dataOn`, `dataManifest` or `dataRecords`: no link sync.

Proposed new messages, since the puck has no lists of its own:

| From  | Message      | Meaning                                                                                                                   |
| ----- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Puck  | `puckHello`  | Sent first: `{ t: 'puckHello', version: 1, screenPx: 466 }`, so the phone knows it is a puck and projects for its screen. |
| Puck  | `step`       | The left or right arrow: `{ t: 'step', by: -1 \| 1 }`, the previous or next item in the current list.                     |
| Phone | `targetInfo` | The target's name to show: `{ t: 'targetInfo', id: string \| null, name: string }`. Sent once linked and on every change. |

## Pairing

Open. The puck has no camera, so it can't read the phone's reply code as Two phones does. The
puck shows a QR code with what the phone needs (its address, ICE credentials and DTLS
fingerprint); how the phone's answer reaches the puck is still to be worked out.

## Open questions

- Pairing, above.
- How the phone's rectangular map fits the round screen: which side's field of view the
  puck's diameter shows.
- The colour table for `colour`, and how night mode changes it (full-strength red, no grey).
- The menu items (Sensors, Eyepiece, Lists, Alignment, Settings, Meade LX200 Repeater): which
  need new messages. See the puck's `docs/screen-layout.md`.
- Whether the phone stays in finder mode, with no buttons, while linked to a puck.
