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
  - Exception: the **puck**, a hand remote on an ESP32-S3 (approved 2026-11-20). Its firmware lives in its own public repository, [AstroTurboMaxiPuck](https://github.com/sh3n1/AstroTurboMaxiPuck) (the `AstroTurboMaxiPuck/` folder, ignored by this repository's git), never in this one. Only its built image travels with the landing, under `src/landing/firmware/`, for installing it from the puck's page. What the app and the puck send each other is in `docs/puck.md`.
- **Hosting:** on the project's own domain, on Cloudflare, over HTTPS, as two copies: dev (`dev.astroturbomaxisolver.app`, private behind Cloudflare Access, for trying versions on phones) and production (`astroturbomaxisolver.app`, public). The code must not depend on the host: no host's files or settings in the project. What any host must do, and how to publish, is in `docs/deploy.md`.
- **Site layout:** a static landing page at `/`, for people and search engines, and the app at `/app/` (Angular's base address in production builds). The dev server still serves the app at `/`.
- **Current state:** Work in progress
- **Target users:** Amateur astronomers
- **Supported devices and browsers:** Only pwa, targeted on smartphones
  - Android Chrome is the priority. iOS Safari must also be supported, and any feature it can't fully do must degrade gracefully.
  - Support phones as old as possible without the experience becoming frustrating. Set the exact minimum by measuring performance on real phones.
  - The browser floor is in `.browserslistrc` (currently Chrome, Edge and Firefox 119+, Safari and iOS 17+).
- **Licence:** GNU GPL version 3 only (`GPL-3.0-only`, in `LICENSE`), copyright "The AstroTurboMaxiSolver authors". Decided on 2026-11-18; until then the project was closed source.
  - The app's code reaches every user's browser, which under the GPL is distributing it: whenever a version is published, its full source must be available to its users, from a public repository linked in the app and on the landing page. TODO: create that repository; until then, publish only to the private dev copy, which no one else can open.
  - Any library or code, and any data built into the app, must have a licence compatible with GPL-3.0-only: permissive ones (MIT, BSD, Apache-2.0, CC0, CC BY), the GPL-3.0 itself or "GPL-2.0-or-later". Never use code that is "non-commercial", "GPL-2.0-only", or under any extra restriction: it can't be combined with the GPL. Check the licence before using anything, and keep required attributions.
  - **Aggregate data:** data under another licence (CC BY-SA, or non-commercial such as CC BY-NC) may travel with the app only as a separate work, which the GPL calls an "aggregate":
    - Each source has its own folder under `src/assets/data/aggregate/`, holding only that source's data, with a `LICENSE.txt` (its licence and required credits) and a `SOURCE.md` (where it comes from, when it was downloaded, the script that builds it and what was changed).
    - The app only reads it, and must keep working without it. Non-commercial data must be optional: the feature it serves goes away, nothing else does.
    - Its credit is in Settings, under Data credits.
    - Today: `openngc/` (OpenNGC, CC BY-SA 4.0), `hyg/` (the HYG Database's star names, CC BY-SA 4.0) and `falchi/` (the light pollution atlas for automatic Bortle, CC BY-NC 4.0).
  - Non-commercial data binds the whole site: while any is in the app, nothing about the site or the app may earn money (no ads, sales or paid features). The Open-Meteo forecast is under the same condition. If that ever changes, replace the data first: the Bortle tiles could be rebuilt in the same format from NASA's public domain Black Marble data.

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
| Plan a night's field test, from what is up at the site (`docs/field-tests.md`) | `node scripts/field-plan.mjs --lat <deg> --lon <deg>` |
| Production build (output in `www/`) | `npm run build` |
| Lint, type check and format check | `npm run lint` |
| Fix lint and formatting | `npm run lint:fix` |
| Unit tests | `npm run test:unit` |
| End-to-end tests (ports 4210 and 4211, includes a production build) | `npm run test:e2e` |
| Publish to the private dev copy (ask first; see `docs/deploy.md`) | `npm run deploy` |
| Publish to production (ask first; it asks you to type yes) | `npm run deploy -- prod` |
| Check a published copy is hosted as the app needs | `npm run deploy:check -- <address>` |

Before finishing a change, run: `npm run lint`, `npm run test:unit` and `npm run test:e2e`

## Project structure

- `src/app/` - application code
- `e2e/` - Playwright tests
- `spikes/` - feasibility experiments, not part of the app build
- `src/app/pages/` - one file per page
- `src/app/core/` - everything the pages share, in one folder per feature. Only the app-wide state (`app-state.service.ts`), icons, theme colours and the local time pipe sit at its top. A new file goes in the folder of its feature, with its spec beside it; add a folder only when no existing one fits.
  - `alignment/` - telescope alignment and syncs
  - `astronomy/` - sky positions and projections, the planets, Moon and asteroids, double stars
  - `catalog/` - the targets: loading and joining the catalogue files, searching, names, details and icons
  - `dev-tools/` - the device test, the clear-sky test and field tests (`docs/field-tests.md`), for development only
  - `equipment/` - telescopes, eyepieces and the rest of the kit
  - `i18n/` - the app's languages: ngx-translate's setup, and `t()` for plain code
  - `lists/` - the user's lists, the shared list view, the playlist; `lists/programs/` holds the observing programmes' lists
  - `log/` - the observing log and its export
  - `planning/` - tonight's visibility and the planning chart
  - `platform/` - the browser's features: install, updates, full screen, screen wake, permissions and sounds
  - `remote/` - the two-phone link
  - `sensors/` - sensor fusion and the phone's orientation
  - `settings/` - sections of the Settings page, each its own component
  - `sky-conditions/` - weather forecast, seeing, sky brightness and how faint the eye and telescope reach
  - `sky-map/` - the sky map: its canvas component, and its drawing, star data, gestures and look as plain code
  - `sky-page/` - the parts around the sky map on the home page: target bar, details, menu, time control, eyepiece panel, reticle and guidance
  - `solver/` - star detection, plate solving, its worker and the camera
  - `storage/` - the database on the device and its sync-ready records
  - `sync/` - device sync through the user's cloud storage or the two-phone link
- `src/assets/data/` - generated star and target data, built by the scripts in `scripts/`
- `src/assets/data/aggregate/` - data under its own licence, not the GPL, one folder per source (see Licence)
- `src/landing/` - the landing page: plain HTML, CSS and pictures, built into the root of `www/` by `scripts/build-landing.mjs`. Its pages (`index`, `puck`, `privacy`, `terms`) are templates whose texts are in `src/landing/i18n/<language>.json`: English is written as `index.html`, each other language as `index.<language>.html`. The English home page sends a browser in another of its languages to it, unless the visitor chose a language with the links at the top. The build fails if a language lacks a text.

## PWA constraints

- Camera and motion sensor APIs need a secure context, so deployed builds must be served over HTTPS.
- Offline behaviour: The app should be able to run offline
- User data: the log, lists and equipment kit are in IndexedDB through Dexie, as sync-ready records with UUID ids, device id, timestamps, revision, hash and tombstones. Settings for this device stay in localStorage. Read `docs/local-data.md` before adding anything that is saved.
- Star catalogue or index storage and size limits: TODO
- Permissions: the camera, the location and the motion sensors are each asked for when first needed, never all at once on opening, through `permissions.service.ts`. The first time, a line says why, just before the browser asks; a refusal shows how to allow it again. The first time the app opens with no location, a welcome offers to take it from the GPS.

## Domain

- **Mounting:** The phone's main camera always looks straight at the sky, fixed to the telescope: never through the eyepiece, and with no mirror or add-on lens. There is no mount setting.
- **Plate solving approach:** Must run in the browser and work offline. Astrometry.net can't be used because its distribution is GPL. In use: the app's own triangle-matching solver (`plate-solver.ts`, in a Web Worker), which solves real city skies on the Honor Magic5 Pro. tetra3 and cedar-solve (Apache-2.0) are still to be evaluated before a final choice.
  - Use a strict confidence check. Weak frames can produce wrong matches, and the app must never show an unverified position as correct.
- **Camera approach:** Simulated, not yet measured. See `spikes/sky-sim/RESULTS.md`.
  - Default to the main camera. The telephoto and ultrawide needed much longer exposures in simulation, and Chrome on the Magic5 Pro only offers one rear camera anyway.
  - Aim for at least 1/8 s per frame, with stacked frames as the fallback. The Honor Magic5 Pro allows up to 1/3 s in Chrome, measured.
  - Design for a bright city sky. The reference case is central Valencia, about 17.5 mag/arcsec², on an Honor Magic5 Pro.
- **Alignment:** Uses a plate solve to measure where the camera points. The sensors are only a marked, less accurate fallback.
- **Sync:** with a target centred in the eyepiece, a tap in its bar plate solves and corrects the alignment there. Syncs are kept for the night where they were made, and the nearest count most, to follow the holder bending across the sky (`alignment-sync.ts`).
- **Device sync:** the log, lists and kit sync between a user's devices through their own Google Drive (Dropbox and OneDrive to follow, behind the `SyncProvider` interface), with no server of ours. Two linked phones can also sync straight over their link, when both have it on (`docs/two-phones.md`). Code in `src/app/core/sync/`, design in `docs/sync-plan.md`.
- **Live plate solving:** `live-solver.service.ts` solves in a Web Worker whenever sensors are on and the phone is still, then corrects the sensors and learns the compass error.
- **Sky darkness:** the Bortle class is set from the location with the light pollution atlas in `src/assets/data/aggregate/falchi/` (`sky-brightness.service.ts`), only the 10° tile for the location being downloaded. Auto is the default, and choosing a class by hand in Settings turns it off. Without the atlas the class is chosen by hand.
- **Two phones:** one phone can be the finder on the telescope (sensors and plate solving) and another the screen in the hand, linked by WebRTC after swapping QR codes, with no server. Alignment and tap-to-solve work from the screen. See `docs/two-phones.md`.
- **Sensor fusion approach:** A complementary filter in `src/app/core/sensors/attitude.ts`. The gyroscope follows movement, and compass-based orientation slowly corrects drift. Plate solves will correct it when the phone is still. Treat the compass as a coarse hint only. Phones report magnetic headings, so `sensor.service.ts` turns them to true north with the World Magnetic Model (the `geomagnetism` library, Apache-2.0) once a location is set.
- **Coordinate systems and units:** Catalogue positions are J2000. `astronomy-engine` converts them to the local sky, including precession. Angles are in degrees, and azimuth runs from north through east. Local positions include atmospheric refraction (astronomy-engine's `normal` model): `toApparent`, `refract` and `unrefract` in `astronomy.ts` convert between real and apparent directions.
- **Accuracy and performance targets:** Target within 0.5° of centre, so it lands in a low-power eyepiece field. About 2 s to solve on a still phone using the sensor hint. Live sensor updates while moving. Revisit after the feasibility spikes.

## Visual design

The app has its own look, not a copy of other astronomy apps. Other apps may inform what is useful, but not how it looks. The reticle is three plain rings at 0.5°, 2° and 4°. Its rings fade in and out while plate solving. The selected target is marked by a crosshair of four short rounded strokes with a gap in the middle, in the same green the rings turn when on target. The selected object keeps its own colour, such as yellow for planets. Guidance is a trail of fading chevrons with a dashed guide line, in light blue. Galaxies, nebulae, the planets, Pluto, Ceres, the bright asteroids and the Moon have the app's own line icons, in `src/app/core/catalog/target-icons.ts`. The Moon and Venus show their current phase, turned towards the Sun on the map. Avoid orange guidance, which other apps use. The chevrons spread further apart the farther away the target is.

The layout works like a car's navigation screen, since the phone is often on the telescope: the sky map is home, with no tab bar. The map shows no buttons until it is tapped. A tap on the map, away from the rings, opens the menu: big tiles with words over the bottom of the map (sensors, view, Lists, alignment, night, time, full screen, Remote, Settings), with the zoom buttons top right. Another tap on the map closes both, and they go by themselves after a while without a touch. Lists and Settings open full screen, with an arrow back to the map. Searching every target is part of Lists. Tapping a target in any list plays that list on the map, like a music playlist, with buttons to the next and previous target above the horizon (`playlist.service.ts`). Keep it working in portrait and landscape.

## Readability

Many users are past forty and read the screen at arm's length in the dark. Use the --af-scale text sizes, never text below 13 px at standard size, outlined labels on the map, and no grey text in night mode, where everything becomes red and greys turn hard to read. Night mode uses full-strength red: dimming is left to the phone's screen brightness.

Keep on-screen text short. Don't over-explain: say what matters in a few words, and drop explanations the user doesn't need to act on. Prefer an icon over text wherever one is clear, such as a cross to close, and give icon-only buttons a hidden label for screen readers.

## Conventions

- Code style: Clean code, kiss, dont reinvent the wheel, human readable, very commented
- File size: aim for under 500 lines a file, and never grow one past 800. Before adding to a big file, split it: logic into plain functions in their own files, parts of a screen into their own components. `docs/sky-page-split.md` shows how `sky.page.ts` was split.
- Colours: use the `--af-*` variables in `src/theme/variables.scss`, never a colour written out in a component. Canvases take theirs from `src/app/core/theme.ts`, which repeats a few of the variables and is checked against them by an end-to-end test.
- Naming: Angular defaults
- Language: code comments, documentation and every Markdown file are in English, whatever language the conversation is in.
- On-screen text: every text the app shows is in `src/assets/i18n/en.json` (ngx-translate), never written in a component or a service. Keys are grouped by area, such as `settings.title`. Templates use the `translate` pipe; plain code uses `t()` from `core/i18n/t.ts`, and `i18n()` marks a key kept in a constant. `npm run lint` checks that every key used exists, and every key is used.
  - Never translate catalogue data: target names, designations, star and constellation names, programme titles and club names. Where they sit inside a sentence, pass them as parameters, such as `"{{first}} to {{last}}"`.
  - Words saved in the user's data or written into exported files (log tags, ratings, the Saved for later list's name, CSV and OAL columns) stay in English; the screens show them translated.
  - The device test and the sky test, which only run under the dev server, may stay in English.
  - Numbers on screen go through the `num` pipe or `num()`, never `toFixed()` or Angular's number pipe, so decimals follow the language ("4,5" in Spanish); files and saved data keep a decimal point. Dates use `appLocale()`. A text with a count has `one` and `other` forms (and the language's others), shown with the `plural` pipe or `tn()`.
  - The language shown is the one chosen in Settings, otherwise the phone's, otherwise English (`core/i18n/languages.ts`). Adding a language is its own `<code>.json` beside `en.json`, plus a line in `LANGUAGES`.
- Testing expectations: Unit tests for astronomy, solver and fusion logic. End-to-end tests for main flows.
- Dependencies: Ask before adding one. Prefer a well-maintained, permissively licensed library over custom code.

## Git

- Branching:
  - `develop` is where work goes, published to the private dev copy. Short-lived feature branches start from it and merge back into it.
  - `main` holds only released versions, published to production. A release merges `develop` into `main`, and production can only be published from `main`, pushed to the public repository.
- Commit messages: Short and imperative

## Boundaries

Agents must ask before:

- Adding a dependency
- Committing or pushing
- Deploying a version
- Changing the PWA-only or hosting rules

Agents must never:

- Add code or data whose licence isn't compatible with GPL-3.0-only, except data kept apart as aggregate data (see Licence)
- Commit secrets
- Force-push `main` or `develop`
