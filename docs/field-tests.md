# Field tests: the app's side

A field test is a guided night under the sky, recorded in full, to find what fails and why:
the app's pointing and plate solving, the puck's link, and the whole system together. An
agent on the laptop leads it step by step. The whole method, the collector and the puck's
side are in the puck's repository, [AstroTurboMaxiPuck](https://github.com/sh3n1/AstroTurboMaxiPuck):
its `docs/field-tests.md` and `tools/field/`. This file covers only what is in this repository.

A session uses one telescope, phone and sky, but what it finds is fixed for every setup,
never tuned to the one tested.

## Never in a release

A production build swaps `field-test.ts` and `field-log.ts` in `src/app/core/dev-tools/` for
the empty `field-test.prod.ts` and `field-log.prod.ts` (`angular.json`, `fileReplacements`),
so none of the recorder reaches users, nor the dev copy, which is a production build. The
production build's type check fails if a `.prod.ts` file stops matching its original.

Only the solver's general `withCameraFree` stays in production builds: it frees the camera
for other work after any solve under way.

## What the app does

Only under the development server, served to the phone by `npm run start:phone`:

- `FieldTestService` (`field-test.service.ts`) asks for a collector at `/field/hello` every
  15 seconds. The dev server's proxy (`scripts/dev-proxy.json`) passes `/field/…` to the
  laptop's port 8445. With no collector, nothing else happens.
- While a collector answers, it sends the app's events once a second (`/field/events`):
  where the telescope and camera point twice a second, and every change of target,
  alignment, view, sensors, equipment, plate solve and puck link. It also asks for the
  agent's commands (`/field/commands`): a snapshot, a plate solve or a normal photo for a
  step.
- `field-log.ts` holds the events until they are sent, and tells the collector at once
  when a plate solve starts (`/field/solve-start`), so the telescope's own camera takes its
  picture at the same moment.
- After each plate solve, it takes a normal colour photo with the phone's automatic
  exposure (`/field/context`), to show what was in front of the camera. This closes the
  solver's camera and opens another for 2 seconds, which changes the solver's timing: the
  agent can turn it off with a `config` command when measuring solve times or stillness.
- Each solve's report (`solve-report.ts`) carries the step and the solve's id, so the
  collector files it with that step's pictures.

The location, settings, equipment and photos go only to the laptop, at `127.0.0.1`, through
the dev server. Nothing goes to the internet.

## Ports

The collector listens on 8445, the same port as `npm run phone:reports`
(`scripts/device-report-receiver.mjs`), and takes its place while it runs, device reports
included. Stop one before starting the other.

## The night's plan

`scripts/field-plan.mjs` picks the steps for a night from what is up at the site: bright
stars to align on, stars low, middle and high in every direction, the Moon and planets, a
few deep-sky objects, and steps for the puck's link. It reads `src/assets/data/targets.json`.

```
node scripts/field-plan.mjs --lat 39.47 --lon -0.38 [--time 2026-11-24T22:00] [--count 12]
node scripts/field-plan.mjs --session <field session folder>
```

It writes the plan as JSON on stdout, and a readable version on stderr.
