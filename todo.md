# AstroTurboMaxiSolver TODO

What is done and what is next. Decisions and rules are in `AGENTS.md`; technical approaches here
are proposals until recorded there. Last reviewed 2026-11-18.

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
- [x] Google Drive sync, hidden behind five taps on the Settings title while tried out
- [x] Two phones linked by WebRTC after swapping QR codes
- [ ] Mark log entries edited on two phones
- [ ] Dropbox and OneDrive, behind `SyncProvider`
- [ ] Snapshots and purging old deletions

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
- [ ] Spanish language
- [ ] ESP32 round AMOLED hand remote showing the sky map (brainstorm only, open decisions first)
