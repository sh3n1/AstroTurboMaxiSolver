# The puck

**Draft (2026-11-20): nothing here is built yet, on either side.**

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

## The app's Remote page (decided 2026-11-21, not built)

- The menu tile and page **Two phones is renamed Remote**.
- The page has two sections:
  - **Two devices:** the two buttons it has today, this phone is the finder, and this phone is
    the screen.
  - **Puck:** a button to link a puck.

## Principles

- **Astronomy stays on the phone.** The phone works out where everything is and projects it.
  The puck only draws what it is sent, and turns the last frame between frames.
- **Two kinds of message, on the same WebRTC link as Two phones:**
  - **Control messages** are JSON text, rare and small, the same as Two phones.
  - **The view** (where the map points, and the stars to draw) is binary, sent many times a
    second, in the fixed layouts below. No Protobuf or other library: the layouts are simple
    enough to read with a `DataView` on the phone and a C struct on the puck.

## Channels

| Channel                     | Carries                     | Delivery                          |
| --------------------------- | --------------------------- | --------------------------------- |
| `astroturbomaxisolver`      | Control messages, JSON text | Reliable, ordered (as Two phones) |
| `astroturbomaxisolver-view` | View messages, binary       | Never resent, any order           |

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

The puck talks to one phone only, its **host**: the phone on the telescope in normal mode, or
the screen phone in Two phones (see "Who the puck links to"). The puck mirrors the host's map,
and the host's map already follows the finder in Two phones, so the messages are the same in
both cases. The host passes on to the finder what needs it, as the screen does for its own
taps.

The puck's link is its own: none of Two phones' messages between finder and screen (`hello`,
`site`, `alignment`, `pause`, `resume`, `fullscreen`, `dataOn`, `dataManifest`,
`dataRecords`) go to or come from the puck. Closing the puck's link ends it; the host's own
link to a finder, if any, carries on.

| From | Message       | Meaning                                                                                                                                                             |
| ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Puck | `puckHello`   | Sent first: `{ t: 'puckHello', version: 1, screenPx: 466 }`, so the host knows it is a puck and projects for its screen. A finder answers `puckRefused` and closes. |
| Host | `puckRefused` | `{ t: 'puckRefused', reason: 'finder' }`: this phone is a finder, which a puck can't link to. The puck says so on its screen.                                       |
| Host | `state`       | What the puck shows besides the map: `{ t: 'state', night, solving, sensorsOn, aligned }`. Sent once linked and on every change.                                    |
| Host | `targetInfo`  | The target's name to show: `{ t: 'targetInfo', id: string \| null, name: string }`. Sent once linked and on every change.                                           |
| Host | `solveLog`    | Each plate solve attempt, as Two phones sends it, so the puck can show "solved" or why not.                                                                         |
| Puck | `solveNow`    | A tap on the reticle: `{ t: 'solveNow', trigger: 'tap' }`. The host solves, or asks its finder to, as for its own tap.                                              |
| Puck | `step`        | The left or right arrow: `{ t: 'step', by: -1 \| 1 }`: the previous or next target of the list playing on the host.                                                 |
| Puck | `zoom`        | `{ t: 'zoom', by: -1 \| 1 }`: the host's map zooms out or in one step, as its zoom buttons do; the next `view` shows it.                                            |
| Puck | `night`       | `{ t: 'night', on: boolean }`: night mode on the host, which passes it on to its finder as usual.                                                                   |

The map itself, where it points and its zoom, reaches the puck only in the binary `view` and
`stars` messages; the `pose` channel isn't used with a puck.

Still to define, with the puck's menu (see its `docs/screen-layout.md`): messages for sensors on
and off, the eyepiece, choosing a list or target, and alignment.

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
- The messages for the rest of the puck's menu, under "Control messages".
