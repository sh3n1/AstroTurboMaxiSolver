# AstroFinder TODO

Suggested tasks, in order. Technical approaches are proposals until recorded in `AGENTS.md`.

## 1. Project setup

- [x] Initialise Git and make the first commit
- [x] Review the `npm audit` findings: high and low fixed by updating Angular; 17 moderate remain from one `minimatch` advisory in lint tooling, with 0 in production dependencies. Recheck when ESLint updates its dependency
- [ ] Choose an HTTPS host and deploy `www/`, with unknown routes falling back to `index.html`
- [ ] Add CI that runs lint, unit tests, the build and end-to-end tests (`.github/workflows/ci.yml` is written, but has not run because the repository has no GitHub remote yet)
- [ ] Install the deployed app on a real Android phone and a real iPhone
- [x] Add an automated offline test against the production build

## 2. Decisions to make

Record each answer in `AGENTS.md`.

- [x] Target users and minimum supported phones
As old as possible without being frustrated
- [x] Android and iOS priority, since browser camera and sensor support differs
Android priority but should support both
- [x] How the phone mounts on the telescope, and which optics or field of view to support
Pointing with camera directly to the sky, maybe with little phone telescope, or parallel to the tube and a mirror like starsense explorer
- [x] Accuracy and speed targets, such as pointing error and time to solve
Target within 0.5° of centre, so it lands in a low-power eyepiece field. About 2 s to solve on a still phone using the sensor hint. Live sensor updates while moving. Revisit after the spikes.
- [x] Project conventions, Git rules and agent boundaries
  - Naming: Angular defaults
  - Testing: unit tests for astronomy, solver and fusion logic, end-to-end tests for main flows
  - Before finishing a change: run lint, unit tests and end-to-end tests
  - Git: `main` plus short-lived feature branches, short imperative commit messages
  - Agents must ask before: adding a dependency, committing or pushing, changing the PWA-only or hosting rules
  - Agents must never: add copyleft code or data, deploy, commit secrets, force-push `main`
- [x] Project licence, which also affects which solvers and catalogues can be used
Our app will be closed source 

## 3. Feasibility spikes

Do these before building features, because they could change the design.

- [ ] **Camera:** test whether `getUserMedia` can capture enough stars at night on target phones
  - Check exposure, ISO and focus control on each browser
  - Test whether stacking video frames recovers enough faint stars
  - Test each mount: direct, with a small add-on phone telescope, and with a mirror
  - Collect the results and sample images as test data
- [ ] **Solver:** compare a TypeScript solver with a WebAssembly build of an existing one
  - Candidates to evaluate: tetra3 and cedar-solve (both Apache-2.0, written in Python, so they would need porting). Astrometry.net is ruled out because its distribution is GPL
  - Compare speed on a phone and index size across the fields of view each mount gives
  - Check that mirrored images from a mirror mount can be solved
- [ ] **Sensors:** log orientation data on target phones
  - Compare Android with iOS, which needs a permission request from a user gesture
  - Measure gyroscope drift over time
  - Measure compass error when the phone is mounted near the telescope

**Decision point:** if the browser can't capture enough stars on a target platform, review the scope or the PWA-only choice for that platform.

## 4. Astronomy core

Keep this as plain TypeScript with no Angular dependency, so it is easy to test.

- [ ] Evaluate `astronomy-engine` (MIT) for coordinates and ephemerides before writing any of this ourselves
- [ ] Define coordinate types and units (RA/Dec, alt/az, quaternions)
- [ ] Convert between RA/Dec and alt/az using time and location
- [ ] Decide how to handle precession and atmospheric refraction
- [ ] Add unit tests checked against reference values from a trusted source
- [ ] Calculate rise, set and transit times, altitude and airmass for a time and place

## 5. Camera and star detection

- [ ] Build a camera service with permission, error and restart handling
- [ ] Build a live camera page
- [ ] Add frame capture and optional stacking
- [ ] Detect star centroids in a Web Worker, so the UI stays responsive
- [ ] Add a calibration flow for the camera's field of view, with a profile for each mount

## 6. Plate solving

- [ ] Choose a star catalogue and check its licence
- [ ] Build the star index and keep the build script in the repository
- [ ] Download the index and store it for offline use, with progress and storage-limit handling
- [ ] Request persistent storage and handle data being evicted, especially on iOS
- [ ] Run the solver in a Web Worker
- [ ] Use the sensor estimate to narrow the search, with a fallback to a full-sky solve
- [ ] Add regression tests using real sky images with known solutions
- [ ] Add a page that shows the solved position and a confidence value

## 7. Sensor fusion

- [ ] Build a sensor service that handles permissions and differences between browsers
- [ ] Get a location from GPS, with manual entry as a fallback
- [ ] Track orientation between solves using the gyroscope
- [ ] Detect when the phone is still, and start a plate solve automatically
- [ ] Correct drift with each plate solve, starting with a complementary filter
- [ ] Move to a Kalman filter only if testing shows it is needed
- [ ] Limit how much the compass is trusted, because the telescope can disturb it
- [ ] Show the estimate's quality and prompt for a new solve when it degrades
- [ ] Test the filter with recorded sensor logs

## 8. Telescope alignment

- [ ] Propose the most visible alignment stars for the current time and place
- [ ] Guide the user to centre a proposed star in the eyepiece and confirm it
- [ ] Calculate the offset between the phone's camera and the telescope's optical axis, including the large angle of a mirror mount
- [ ] Save the alignment, so no further alignment is needed while the phone stays in its mount
- [ ] Decide how to handle a phone removed and refitted between sessions, since this changes the offset
- [ ] Add equipment profiles for telescope, eyepieces and mount type

## 9. Catalogues and search

- [ ] Choose catalogues, such as Messier, NGC, IC, Caldwell and named stars, and check each licence
- [ ] Decide whether to include planets and the Moon
- [ ] Store catalogues for offline use
- [ ] Add search across all catalogues by name and designation
- [ ] Show each target's details and whether it is above the horizon

## 10. Real-time sky map and guidance (first usable version)

- [ ] Evaluate sky map libraries, starting with `d3-celestial` (BSD-3-Clause), for phone performance and offline use
- [ ] Show a sky map that follows the phone's sensors in real time while moving
- [ ] Recalibrate the map with a plate solve when the phone is still
- [ ] Show an aiming circle for where the telescope is pointing
- [ ] Add an arrow on the aiming circle that guides the user to the target, with the remaining angle
- [ ] Confirm arrival with a plate solve
- [ ] Show how reliable the current position is
- [ ] Add a guided first-run setup: permissions, mounting, alignment and index download
- [ ] Add a red night mode that protects dark adaptation
- [ ] Keep the screen on with the Wake Lock API
- [ ] Test a full session outdoors under a real sky

## 11. Telescope eyepiece view

- [ ] Calculate true field of view and magnification from the equipment profile
- [ ] Show the simulated eyepiece field around the current target or pointing position
- [ ] Match the image orientation of the telescope type, such as inverted or mirrored views

## 12. Session planning

- [ ] Calculate tonight's darkness window and Moon phase and position
- [ ] Create and save a session plan with a list of chosen targets
- [ ] Suggest a session, ranking targets by altitude, timing, brightness and the user's equipment
- [ ] Order targets by when each is best placed
- [ ] Open a planned target directly in the finder

## 13. Polish

- [ ] Replace the placeholder icon if wanted
- [ ] Prompt users when a new app version is ready
- [ ] Add install instructions, particularly for iOS, which has no install prompt
- [ ] Add a settings page for location and display options
- [ ] Add an accessibility pass and larger touch targets for use in the dark
- [ ] Write a README and credit catalogues and libraries as their licences require
