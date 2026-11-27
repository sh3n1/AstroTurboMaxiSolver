# AstroTurboMaxiSolver TODO

What is done and what is next. Decisions and rules are in `AGENTS.md`; technical approaches here
are proposals until recorded there. Last reviewed 2026-11-27.

## Next up

- [ ] **Public source repository on GitHub.** The GPL needs it before any version reaches
      production. History rewritten to the project's name on 2026-11-18 (old history kept in
      the `backup-before-rewrite` branch and in a bundle outside the repo). Still to do:
  - [ ] Push `main` and the `v0.0.1` tag (not the backup or the old feature branches)
  - [ ] Link the repository in the app (Settings) and on the landing page
  - [ ] Let the CI in `.github/workflows/ci.yml` run for the first time, and fix what it finds
- [ ] **Night tests** on the terrace in Valencia
  - [ ] Pointing accuracy: targets miss a 6 mm eyepiece after solving. First measure how far the
        solved centre moves with different subsets of stars, on the saved solves
  - [ ] Sensor inertia: the map keeps moving after the telescope stops. Record the sensors after a
        stop first, then fix the smoothing and the compass pull
  - [ ] Clear-sky test: real star counts against the simulation, stacking, focus at infinity
  - [x] Screen rotation, sensors back on after a reload, settling after a screen lock,
        buildings in view, failure shown on the puck (field tests of 2026-11-26 and 27)
  - [ ] Still to try: night mode with the puck (red QR code, red start-up screen), two phones
        with the frame turn fix, the phone on its other side, the eyepiece in use set in the app
- [ ] **Suggested session** for tonight, which the user can edit into their own plan, in the
      common list view
- [ ] **Sync on real phones**: Google Drive sync between two phones, and over the two-phone link

## Publishing

- [x] Host on Cloudflare at the project's own domain, over HTTPS, with no host files in the repo
      (`docs/deploy.md`)
- [x] `npm run deploy`: lint, unit tests, build, upload, then hosting and offline checks
- [x] Private dev copy at `dev.astroturbomaxisolver.app` behind Cloudflare Access, the default
      target; production needs typing "yes"
- [x] Landing page at `/`, the app at `/app/`, privacy and terms pages
- [x] README
- [ ] Add the dev address to the Google OAuth client's origins, for sync on dev
- [ ] Google app verification, to open Drive sync beyond test users
- [ ] Publish to production again, once the public repository is linked

## Plate solving

- [x] Triangle-matching solver in a Web Worker, solving real city skies on the Honor Magic5 Pro
- [x] Live solving when the phone is still, correcting the sensors and learning the compass error
- [x] Remember the camera's real field of view after the first solve
- [x] Replay harness for saved solves (`spikes/solver-replay/`), and detector fixes for city skies
- [ ] Acceptance threshold as a false-alarm budget
- [ ] Tracking solve after a verified solve
- [ ] Timestamped sensor readings for each frame
- [ ] Fit the phone lens (field of view and distortion) over many solves, if the night test shows
      the centre moves
- [ ] Show the user when a frame could not be solved, and how reliable the position is
- [ ] Regression tests from real sky images with known solutions
- [ ] Check dark-sky risks with rendered frames before a dark-site trip: faint stars past the
      catalogue limit, the Milky Way's crowded fields
- [ ] Evaluate tetra3 and cedar-solve (Apache-2.0) against our solver before a final choice

## Camera

- [x] Device test: exposure, ISO, focus controls, resolutions (1/3 s and ISO 96,000 on the
      Magic5 Pro)
- [ ] Check that focus locks at infinity, on a distant building
- [ ] Find out whether zoom switches to the telephoto lens or is digital
- [ ] Repeat the checks on iOS Safari

## Sensors

- [x] Complementary filter: gyroscope with slow compass correction, true north from the World
      Magnetic Model
- [x] Detect when the phone is still
- [ ] Keep the gyroscope readings flowing during a solve: 124 of 145 gaps of 100 to 450 ms on
      2026-11-26 came while frames were captured and processed on the page's main thread. Move
      that work to a worker. It may be part of the 2 to 7° off after a long slew
- [ ] Measure drift while moving, and compass error near the telescope
- [ ] Limit how much the compass is trusted when the telescope disturbs it
- [ ] Move to a Kalman filter only if testing shows it is needed

## Alignment and guidance

- [x] Proposed alignment stars, alignment from a plate solve, sensors as a marked fallback
- [x] Syncs on centred targets, kept for the night and weighted by nearness
- [x] Reticle rings, target crosshair, chevron guidance on the map and in the eyepiece view
- [x] Playlist: next and previous target above the horizon
- [ ] Confirm arrival at the target with a plate solve
- [ ] Decide what happens when the phone is removed and refitted between sessions
- [ ] Tell the user when the alignment looks spoiled (the phone moved on the tube): solves keep
      putting a centred target off by more than the eyepiece's field. At least a line on the
      alignment page: don't move the phone after aligning
- [x] Guide along the mount's own motions (altitude and azimuth on an alt-az mount), never the
      shortest path over the zenith, on the phone and the puck (`mount-guidance.ts`)
- [ ] Make the eyepiece in use easier to see and change: on 2026-11-26 the app had the 25 mm
      52° while the 28 mm 82° was in, so the eyepiece circle was the wrong size

## Catalogues and lists

- [x] Messier, NGC and IC (OpenNGC), Caldwell, bright doubles, named stars, planets, Moon, bright
      asteroids
- [x] Observing programmes: Herschel 400 and II, SAC 110, RASC lists, Al Urban, ASSA, Hubble
- [x] Search, one common list view, own lists, share and import
- [ ] More observing lists, from `reports/Monthly observing lists and catalogues.md`
- [ ] Deeper stars than magnitude 8.5 for the eyepiece view, if wanted
- [ ] Check the terms of the star, constellation and Messier data before production

## Eyepiece view and sky

- [x] Field and magnification from the kit, recent combinations, star limit slider
- [x] Sky darkness from the location, from the Falchi atlas (optional, non-commercial data)
- [x] Forecast, seeing, darkness window and Moon
- [ ] Image orientation by telescope type: inverted or mirrored
- [ ] Measure the sky's darkness with the camera, once city solving is reliable

## Log, sync and two phones

- [x] Observing log with notes, ratings, export as CSV and JSON
- [x] Data in IndexedDB as sync-ready records, with persistent storage requested
- [x] Google Drive sync, shown to everyone in Settings
- [x] Two phones linked by WebRTC after swapping QR codes
- [x] The puck's map with the sky up (zenith up, horizon level), whatever the phone's screen or
      mount (decided 2026-11-26): the app no longer sends it the phone's roll (`puck-view.ts`)
- [ ] Slow link recovery: one loss in 50 minutes took 23 s and three tries to come back, two
      stuck at "ICE checking" (1 to 2 s on 2026-11-24). Watch it; likely the phone's Wi-Fi
- [x] Mark log entries edited on two phones, and choose a version in Settings, Conflicts
- [ ] Dropbox and OneDrive, behind `SyncProvider`
- [x] Snapshots of old sync files, and purging deletions over six months old

## Phones and PWA

- [x] Works offline, update button, install button and iOS steps, full manifest
- [x] Screen kept awake, full screen, night mode in full red, text size setting
- [ ] iPhone checks: status bar, launch screens, greyed Full screen tile, permissions in the
      installed app, screen wake on older iOS
- [ ] Performance on older phones, starting with the Poco F1
- [ ] Phone testing with the service worker: `chrome://inspect` forwarding or a local CA
- [ ] Accessibility pass and larger touch targets for the dark

## Ideas, later

- [ ] A guide for the first night
- [x] Spanish language
- [x] ESP32 round AMOLED hand remote showing the sky map: the puck, in its own repository

## History

The last 20 things done, newest first. Keep it at 20: add at the top, drop the last.

1. 2026-11-27 Night-tested branch `camera-frame-turn`: camera frames turned back with the
   screen, gyroscope gaps and settling after a pause, sensors back on after a reload, slimmer
   solve reports, solve results sent to the puck, whole-sky search after a wrong hint, and the
   detector dropping spots among windows and edges (field replay 82 of 84, was 54)
2. 2026-11-25 Field test logging, left out of production builds; the solver's worker and log
   split out (`docs/field-tests.md`)
3. 2026-11-23 Release 0.1.0 merged to `main` and tagged
4. 2026-11-23 The puck's landing page in English and Spanish, installing its firmware from the
   browser with ESP Web Tools
5. 2026-11-23 The puck's public repository linked, and the app on a telescope in the README
   and on the landing page
6. 2026-11-23 Alignment from the puck, as on the Align page
7. 2026-11-22 The telescope's position repeated to planetarium apps through the puck's LX200
8. 2026-11-22 The puck picks lists, aligns and reconnects by itself; it gets the app's icons and
   the lists' rows
9. 2026-11-21 The puck zooms on its own, with the eyepiece's field, faint stars and ring view
10. 2026-11-21 The puck gets the Moon, the planets, the sky catalogue and its words in the app's
    language
11. 2026-11-21 The puck's own link, by its QR code, with its messages defined in `docs/puck.md`
12. 2026-11-21 Two phones renamed Remote, with Two devices and Puck sections
13. 2026-11-20 In the reticle frozen as Lists opens, Best time ordered by the full night
14. 2026-11-19 Landing, privacy and terms pages built in each language from templates
15. 2026-11-19 A full backup saved and restored as one zip file, from Settings
16. 2026-11-19 Sync snapshots, old deletions purged, conflicts settled from Settings
17. 2026-11-19 Spanish, with numbers, dates and counts in the app's language
18. 2026-11-19 Every on-screen text moved into `en.json` with ngx-translate
19. 2026-11-19 Google Drive sync shown to everyone
20. 2026-11-18 Work on `develop`, releases from `main`, production published only from `main`
