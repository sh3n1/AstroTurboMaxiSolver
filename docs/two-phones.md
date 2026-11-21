# Two phones

One phone sits on the telescope as the **finder**. Another, in the hand, is the **screen**.
The finder does what only the phone on the tube can do: read the sensors and plate solve.
The screen does everything else: the map, guidance, lists, the log and alignment.

A hand remote, the puck, is planned to take the screen's part: see [puck.md](puck.md).

## Pairing

There is no server, so the phones swap their WebRTC session descriptions as QR codes, once
per session, before the finder goes on the tube (the menu's Remote tile, Two devices):

1. The finder shows its code.
2. The screen reads it with its camera and shows a reply code.
3. The finder reads the reply.

A code can also be pasted, for when a camera can't read it.

- **What a code holds:** the session description with all its network candidates, compressed
  (`deflate-raw`) and in base64url, behind the prefix `AF1:` (`remote-link.ts`).
- **No STUN or TURN servers:** the phones only use their own addresses. So they must be on
  the same Wi-Fi, or one must share a hotspot with the other. No internet is needed.
- **Libraries:** QR codes are made with qrcode-generator (MIT) and read with the browser's
  `BarcodeDetector` where there is one (Chrome on Android), or with jsQR (Apache-2.0).

## Messages

JSON over one reliable, ordered data channel (`remote-link.ts`):

| From   | Message        | When                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Finder | `hello`        | Once linked: its alignment and location.                                                                                                                                                                                                                                                                                                                                       |
| Finder | `pose`         | Where the telescope and camera point, whether it is solving, and whether its sensors are steering. On every change, at most every 50 ms, and every second anyway. Numbered, on a channel of its own that never resends a lost one, so a lost pose never holds back the next. The screen drops any pose older than the last it used, and glides the map towards the newest one. |
| Finder | `site`         | Its location, when it changes. The screen uses it, since both are at the same telescope.                                                                                                                                                                                                                                                                                       |
| Finder | `solveLog`     | Each plate solve attempt, so the screen shows the same toasts and log.                                                                                                                                                                                                                                                                                                         |
| Finder | `solveResult`  | The answer to a `solveNow`.                                                                                                                                                                                                                                                                                                                                                    |
| Screen | `solveNow`     | Plate solve now, for alignment or a tap on the rings.                                                                                                                                                                                                                                                                                                                          |
| Screen | `night`        | Red night mode, on or off, so the finder's screen matches.                                                                                                                                                                                                                                                                                                                     |
| Screen | `fullscreen`   | Full screen, on or off, so the finder's screen matches.                                                                                                                                                                                                                                                                                                                        |
| Screen | `target`       | The target chosen, or null when cleared, so the finder's map guides to it too. Sent once linked, and on every change.                                                                                                                                                                                                                                                          |
| Either | `pause`        | The link is paused: each phone works on its own, and the link stays open underneath. Two phones offers Reconnect, which sends `resume` and needs no new codes. While paused, silence doesn't count as the link being lost. It lasts while both phones keep the app open.                                                                                                       |
| Either | `resume`       | The paused link is back: each phone takes its part again, and the finder sends `hello`.                                                                                                                                                                                                                                                                                        |
| Both   | `alignment`    | An alignment made or removed on either phone.                                                                                                                                                                                                                                                                                                                                  |
| Either | `dataOn`       | Whether "Sync with the linked phone" is on there. Sent once linked and on every change. Link sync runs only while both are on.                                                                                                                                                                                                                                                 |
| Either | `dataManifest` | Link sync: every record's type, id and revision, in parts, the last one marked.                                                                                                                                                                                                                                                                                                |
| Either | `dataRecords`  | Link sync: records the other phone lacks, or has in another revision, up to 100 a message, and each change as it happens.                                                                                                                                                                                                                                                      |

### Link sync

With "Sync with the linked phone" on in Settings on both phones (in the Sync section, hidden
for now behind five taps on the Settings title), the log, lists and kit sync straight over
the link, with no drive. Off by default, since a phone linked for a night may be someone
else's. Each phone sends its manifest, then the records the other lacks, then each change as
it happens, and remembers which revision the other has of each record so nothing goes twice.
Records merge by the same rules as a drive sync. Code: `sync/link-sync.ts` (messages, plain
functions) and `sync/link-sync.service.ts`, which uses `RemoteService`'s `dataHandler` and
`sendData`.

## How the app uses it

- **On the screen phone:**
  - `RemoteService` sets `pointing`, `cameraPointing` and `plateSolving` from
    the finder's messages. The rest of the app doesn't know the difference.
  - `state.remoteFinder` is true, which keeps the phone's own sensors and automatic solving
    off.
  - `LiveSolverService.solveNow` forwards to the finder (`remoteSolve`).
- **Remote alignment:** alignment runs on the screen phone, with the usual Align page. Its
  plate solve runs on the finder. The screen works out the alignment and sends it to the
  finder, which uses it to turn its camera's direction into the telescope's.
- **On the finder phone:** sensors and plate solving run as usual, but the sky map is in
  finder mode (`state.finderMode`):
  - No buttons, no tab bar, and the map takes no touches, so nothing touched by accident
    changes what the screen shows. It also stays on the map, which automatic solving needs.
  - A band at the bottom, in the time band's place, says it is in remote mode. Its cross
    pauses the link.
  - If its sensors aren't running, as when an iPhone needs a tap before it allows them, the
    band offers to start them.
  - Full screen follows the screen phone. Leaving it always works, but browsers only enter
    full screen straight after a tap on that same phone, so when the finder's browser refuses,
    its band says "Tap for full screen", and one tap anywhere on its screen does it. An installed app that opens
    full screen, and iPhones, which can't, are left as they are. Meanwhile the screen phone shows "Finder sensors off" rather
    than treating the position as live.
  - Showing another time is switched off when it links, since the finder must solve the real
    sky now.
- **Losing the link:** with no message for 4 s, the screen treats the link as lost. It never
  keeps showing an old position as current. It says so, and its own sensors can be used
  again.

## Limits

- Untested on two real phones so far. The end-to-end test links two browsers on one
  computer.
- WebRTC finds the other phone through mDNS (`.local`) names. Some networks block mDNS, and
  then the phones can't connect. A hotspot from one of the phones usually works.
- In night mode the QR code turns red on black, which is harder for a camera to read. Pair
  before switching to night mode, or paste the code instead.
