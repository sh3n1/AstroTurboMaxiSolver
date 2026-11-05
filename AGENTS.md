# AGENTS.md

Guidance for coding agents working in this repository.

<!-- Replace every TODO. Delete any section that turns out not to be useful. -->

## Project

AstroFinder is a smartphone telescope finder that combines plate solving with sensor fusion.
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

## Stack

- Ionic 9 and Angular 22 with standalone components
- TypeScript
- Vitest for unit tests, Playwright for end-to-end tests

## Commands

| Task | Command |
| --- | --- |
| Run the dev server | `ionic serve` |
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
- `src/assets/data/` - generated star data, built by `scripts/build-star-data.mjs`

## PWA constraints

- Camera and motion sensor APIs need a secure context, so deployed builds must be served over HTTPS.
- Offline behaviour: The app should be able to run offline
- Star catalogue or index storage and size limits: TODO
- Permission handling for camera, motion and location: TODO

## Domain

- **Mounting:** The camera always looks at the sky, not through the eyepiece. Support these setups:
  - Camera pointing directly at the sky, with or without a small add-on phone telescope, so the field of view varies by setup.
  - Phone parallel to the tube with a mirror, like the Celestron StarSense Explorer. The mirror flips the image, and the camera points at a large angle to the telescope.
- **Plate solving approach:** Must run in the browser and work offline. Astrometry.net can't be used because its distribution is GPL. tetra3 and cedar-solve are Apache-2.0 candidates. TODO: final choice after the solver spike.
  - Use a strict confidence check. Weak frames can produce wrong matches, and the app must never show an unverified position as correct.
  - Record in each mount profile whether the image is flipped, so the solver doesn't have to try both.
- **Camera approach:** Simulated, not yet measured. See `spikes/sky-sim/RESULTS.md`.
  - Default to the main camera. The telephoto and ultrawide needed much longer exposures in simulation.
  - Aim for at least 1/8 s per frame, with stacked frames as the fallback.
  - Design for a bright city sky. The reference case is central Valencia, about 17.5 mag/arcsec², on an Honor Magic5 Pro.
- **Sensor fusion approach:** Sensors give live movement between solves and a hint that narrows the search. Plate solves correct drift. Treat the compass as a coarse hint only. TODO: choose the filter after the sensor spike.
- **Coordinate systems and units:** TODO
- **Accuracy and performance targets:** Target within 0.5° of centre, so it lands in a low-power eyepiece field. About 2 s to solve on a still phone using the sensor hint. Live sensor updates while moving. Revisit after the feasibility spikes.

## Conventions

- Code style: Clean code, kiss, dont reinvent the wheel, human readable, very commented
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

- Add copyleft code or data
- Deploy
- Commit secrets
- Force-push `main`
