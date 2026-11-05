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
- An skymap will be show in realtime when moving, on still plate solving will recalibrate.
- Some kind of arrow on the aiming circle will guide the user to the target object
- Telescope eye piece view will be offered.
- Session planing and suggested session wil be offered. 
.

- **Platform:** PWA only. Do not add native iOS or Android projects, native plugins, or anything that needs an app store build.
- **Current state:** Work in progress
- **Target users:** Amateur astronomers
- **Supported devices and browsers:** Only pwa, targeted on smartphones

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
| End-to-end tests (port 4210) | `npm run test:e2e` |

Before finishing a change, run: TODO

## Project structure

- `src/app/` - application code
- `e2e/` - Playwright tests
- TODO: describe where features, services and shared code should live

## PWA constraints

- Camera and motion sensor APIs need a secure context, so deployed builds must be served over HTTPS.
- Offline behaviour: The app should be able to run offline
- Star catalogue or index storage and size limits: TODO
- Permission handling for camera, motion and location: TODO

## Domain

- **Plate solving approach:** TODO (for example where it runs, which index data it uses)
- **Sensor fusion approach:** TODO
- **Coordinate systems and units:** TODO
- **Accuracy and performance targets:** TODO

## Conventions

- Code style: Clean code, kiss, dont reinvent the wheel, human readable, very commented
- Naming: TODO
- Testing expectations: TODO
- Dependencies: TODO (when an agent may add one)

## Git

- Branching: TODO
- Commit messages: TODO

## Boundaries

Agents must ask before:

- TODO

Agents must never:

- TODO
