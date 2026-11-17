# AGENTS.md

Guidance for coding agents working in this repository.

<!-- Replace every TODO. Delete any section that turns out not to be useful. -->

## Project

AstroTurboMaxiSolver is a smartphone telescope finder that combines plate solving with sensor fusion.
The mission is to reduce plate solving time by reducing it to our current sensor fussion coordiantes information, plus an offset, and gps location.
So with sensor fussion + gps + plate solving we will have our location and a fast sky position.
Features:
- Alignament with telescope. Propose the most visible stars for that moment at that place.
- Once aligned with telescope no more alignment will be needed as the rest will be done by the app
- We will need to be able to search on different catalogs for the target object
- An skymap will be show in realtime when moving, on still, plate solving will recalibrate.
- Some kind of arrow on the aiming circle will guide the user to the target object
- Telescope eye piece point of view will be offered, setting telescope type and eyepiece.
- Session planing and suggested session wil be offered. 
.

- **Platform:** PWA only. Do not add native iOS or Android projects, native plugins, or anything that needs an app store build.
- **Hosting:** localhost only for now. Do not set up or run a deployment.
- **Current state:** Work in progress
- **Target users:** Amateur astronomers
- **Supported devices and browsers:** Only pwa, targeted on smartphones
  - Android Chrome is the priority. iOS Safari must also be supported, and any feature it can't fully do must degrade gracefully.
  - Support phones as old as possible without the experience becoming frustrating. Set the exact minimum by measuring performance on real phones.
  - The browser floor is in `.browserslistrc` (currently Chrome, Edge and Firefox 119+, Safari and iOS 17+).
- **Licence:** Closed source. Never add GPL, AGPL or other copyleft code or data. Check the licence of every library and catalogue before using it, and keep required attributions.
  - One approved exception: OpenNGC data (CC-BY-SA-4.0). Keep it in its own file, `src/assets/data/openngc.json`, which is itself CC-BY-SA, and keep its credit in Settings. Don't merge other data into that file.
  - A second approved exception: the HYG Database's star names (CC-BY-SA-4.0), in its own file, `src/assets/data/hyg.json`, built by `scripts/build-hyg.mjs`, with its credit in Settings. The same rules apply: only HYG data in that file.

## Stack

- Ionic 9 and Angular 22 with standalone components
- TypeScript
- `astronomy-engine` for sky positions, the Sun and the Moon
- Vitest for unit tests, Playwright for end-to-end tests

## Commands

| Task | Command |
| --- | --- |
| Run the dev server | `ionic serve` |
| Run the dev server for a phone on the same Wi-Fi, at `https://<PC address>:8443` | `npm run start:phone` |
| Receive device test reports from the phone, in `device-reports/` | `npm run phone:reports` |
| Production build (output in `www/`) | `npm run build` |
| Lint, type check and format check | `npm run lint` |
| Fix lint and formatting | `npm run lint:fix` |
| Unit tests | `npm run test:unit` |
| End-to-end tests (ports 4210 and 4211, includes a production build) | `npm run test:e2e` |

Before finishing a change, run: `npm run lint`, `npm run test:unit` and `npm run test:e2e`

## Project structure

- `src/app/` - application code
- `e2e/` - Playwright tests
- `spikes/` - feasibility experiments, not part of the app build
- `src/app/core/` - shared state, astronomy maths and shared components
- `src/app/pages/` - one file per tab
- `src/app/core/sky-map/` - the sky map's drawing, star data, gestures and look, as plain code the sky page uses
- `src/assets/data/` - generated star and target data, built by the scripts in `scripts/`

## PWA constraints

- Camera and motion sensor APIs need a secure context, so deployed builds must be served over HTTPS.
- Offline behaviour: The app should be able to run offline
- User data: the log, lists and equipment kit are in IndexedDB through Dexie, as sync-ready records with UUID ids, device id, timestamps, revision, hash and tombstones. Settings for this device stay in localStorage. Read `docs/local-data.md` before adding anything that is saved.
- Star catalogue or index storage and size limits: TODO
- Permission handling for camera, motion and location: TODO

## Domain

- **Mounting:** The camera always looks at the sky, not through the eyepiece. Support these setups:
  - Camera pointing directly at the sky, with or without a small add-on phone telescope, so the field of view varies by setup.
  - Phone parallel to the tube with a mirror, like the Celestron StarSense Explorer. The mirror flips the image, and the camera points at a large angle to the telescope.
- **Plate solving approach:** Must run in the browser and work offline. Astrometry.net can't be used because its distribution is GPL. tetra3 and cedar-solve are Apache-2.0 candidates. TODO: final choice after the solver spike.
  - Use a strict confidence check. Weak frames can produce wrong matches, and the app must never show an unverified position as correct.
  - Record in each mount profile whether the image is flipped, so the solver doesn't have to try both.
  - Patents (checked 2026-11-08, not legal advice). Ask before changing the solver's matching method, and before publishing outside localhost:
    - US 8,401,307 (Celestron, until about 2031, US only) claims solving from a star-group signature, such as sorted pair distances divided by the largest, with a database search and an affine fit. That is close to tetra3/cedar-solve pattern hashing. The current solver (sensor hint, star pairs, match counting) doesn't work that way.
    - US 11,181,606 (Celestron StarSense Explorer, until about 2038, US only) claims a mirror holder with an adjustable phone whose rear camera sees the sky, plus plate solving and guidance. It concerns the mirror mount, not the camera-straight-up setup.
    - EP 2472471 (Celestron auto-align, until about 2031, granted in Europe) adjusts time and latitude to fit a mount model. The app takes time and location from the phone instead.
- **Camera approach:** Simulated, not yet measured. See `spikes/sky-sim/RESULTS.md`.
  - Default to the main camera. The telephoto and ultrawide needed much longer exposures in simulation, and Chrome on the Magic5 Pro only offers one rear camera anyway.
  - Aim for at least 1/8 s per frame, with stacked frames as the fallback. The Honor Magic5 Pro allows up to 1/3 s in Chrome, measured.
  - Design for a bright city sky. The reference case is central Valencia, about 17.5 mag/arcsec², on an Honor Magic5 Pro.
- **Alignment:** Uses a plate solve to measure where the camera points. The sensors are only a marked, less accurate fallback.
- **Live plate solving:** `live-solver.service.ts` solves in a Web Worker whenever sensors are on and the phone is still, then corrects the sensors and learns the compass error. It only runs with the camera pointing straight at the sky for now.
- **Two phones:** one phone can be the finder on the telescope (sensors and plate solving) and another the screen in the hand, linked by WebRTC after swapping QR codes, with no server. Alignment and tap-to-solve work from the screen. See `docs/two-phones.md`.
- **Sensor fusion approach:** A complementary filter in `src/app/core/attitude.ts`. The gyroscope follows movement, and compass-based orientation slowly corrects drift. Plate solves will correct it when the phone is still. Treat the compass as a coarse hint only. Phones report magnetic headings, so `sensor.service.ts` turns them to true north with the World Magnetic Model (the `geomagnetism` library, Apache-2.0) once a location is set.
- **Coordinate systems and units:** Catalogue positions are J2000. `astronomy-engine` converts them to the local sky, including precession. Angles are in degrees, and azimuth runs from north through east. Local positions include atmospheric refraction (astronomy-engine's `normal` model): `toApparent`, `refract` and `unrefract` in `astronomy.ts` convert between real and apparent directions.
- **Accuracy and performance targets:** Target within 0.5° of centre, so it lands in a low-power eyepiece field. About 2 s to solve on a still phone using the sensor hint. Live sensor updates while moving. Revisit after the feasibility spikes.

## Visual design

The app has its own look, not a copy of other astronomy apps. Other apps may inform what is useful, but not how it looks. The reticle is three plain rings at 0.5°, 2° and 4°, the same sizes as a Telrad finder. Its rings fade in and out while plate solving. The selected target is marked by a crosshair of four short rounded strokes with a gap in the middle, in the same green the rings turn when on target. The selected object keeps its own colour, such as yellow for planets. Guidance is a trail of fading chevrons with a dashed guide line, in light blue. Galaxies, nebulae, the planets, Pluto, Ceres, the bright asteroids and the Moon have the app's own line icons, in `src/app/core/target-icons.ts`. The Moon and Venus show their current phase, turned towards the Sun on the map. Avoid orange guidance, which other apps use. The chevrons spread further apart the farther away the target is.

The layout works like a car's navigation screen, since the phone is often on the telescope: the sky map is home, with no tab bar. The map shows no buttons until it is tapped. A tap on the map, away from the rings, opens the menu: big tiles with words over the bottom of the map (sensors, view, Lists, alignment, night, time, full screen, two phones, Settings), with the zoom buttons top right. Another tap on the map closes both, and they go by themselves after a while without a touch. Lists and Settings open full screen, with an arrow back to the map. Searching every target is part of Lists. Tapping a target in any list plays that list on the map, like a music playlist, with buttons to the next and previous target above the horizon (`playlist.service.ts`). Keep it working in portrait and landscape.

## Readability

Many users are past forty and read the screen at arm's length in the dark. Use the --af-scale text sizes, never text below 13 px at standard size, outlined labels on the map, and no grey text in night mode, where everything becomes red and greys turn hard to read. Night mode uses full-strength red: dimming is left to the phone's screen brightness.

Keep on-screen text short. Don't over-explain: say what matters in a few words, and drop explanations the user doesn't need to act on. Prefer an icon over text wherever one is clear, such as a cross to close, and give icon-only buttons a hidden label for screen readers.

## Conventions

- Code style: Clean code, kiss, dont reinvent the wheel, human readable, very commented
- File size: aim for under 500 lines a file, and never grow one past 800. Before adding to a big file, split it: logic into plain functions in their own files, parts of a screen into their own components. `docs/sky-page-split.md` shows how `sky.page.ts` was split.
- Naming: Angular defaults
- Testing expectations: Unit tests for astronomy, solver and fusion logic. End-to-end tests for main flows.
- Dependencies: Ask before adding one. Prefer a well-maintained, permissively licensed library over custom code.

## Git

- Branching: `main` plus short-lived feature branches
- Commit messages: Short and imperative

## Boundaries

Agents must ask before:

- Adding a dependency
- Committing or pushing
- Changing the PWA-only or hosting rules

Agents must never:

- Add copyleft code or data, apart from the OpenNGC and HYG exceptions under Licence
- Deploy
- Commit secrets
- Force-push `main`
