# AstroFinder TODO

Suggested tasks, in order. The domain sections of `AGENTS.md` are still blank, so the technical approaches below are proposals until confirmed.

## 1. Project setup

- [ ] Initialise Git and make the first commit
- [ ] Review the 19 `npm audit` findings (1 high, 17 moderate, 1 low)
- [ ] Choose an HTTPS host and deploy `www/`, with unknown routes falling back to `index.html`
- [ ] Add CI that runs lint, unit tests, the build and end-to-end tests
- [ ] Install the deployed app on a real Android phone and a real iPhone
- [ ] Add an automated offline test against the production build

## 2. Decisions to make

Record each answer in `AGENTS.md`.

- [ ] Target users and minimum supported phones
- [ ] Android and iOS priority, since browser camera and sensor support differs
- [ ] How the phone mounts on the telescope, and which optics or field of view to support
- [ ] Accuracy and speed targets, such as pointing error and time to solve
- [ ] Project conventions, Git rules and agent boundaries
- [ ] Project licence, which also affects which solvers and catalogues can be used

## 3. Feasibility spikes

Do these before building features, because they could change the design.

- [ ] **Camera:** test whether `getUserMedia` can capture enough stars at night on target phones
  - Check exposure, ISO and focus control on each browser
  - Test whether stacking video frames recovers enough faint stars
  - Collect the results and sample images as test data
- [ ] **Solver:** compare a TypeScript solver with a WebAssembly build of an existing one
  - Candidates to evaluate: astrometry.net and tetra3
  - Compare speed on a phone, index size and licence
- [ ] **Sensors:** log orientation data on target phones
  - Compare Android with iOS, which needs a permission request from a user gesture
  - Measure gyroscope drift over time
  - Measure compass error when the phone is mounted near the telescope

**Decision point:** if the browser can't capture enough stars on a target platform, review the scope or the PWA-only choice for that platform.

## 4. Astronomy core

Keep this as plain TypeScript with no Angular dependency, so it is easy to test.

- [ ] Define coordinate types and units (RA/Dec, alt/az, quaternions)
- [ ] Convert between RA/Dec and alt/az using time and location
- [ ] Decide how to handle precession and atmospheric refraction
- [ ] Add unit tests checked against reference values from a trusted source

## 5. Camera and star detection

- [ ] Build a camera service with permission, error and restart handling
- [ ] Build a live camera page
- [ ] Add frame capture and optional stacking
- [ ] Detect star centroids in a Web Worker, so the UI stays responsive
- [ ] Add a calibration flow for the camera's field of view

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
- [ ] Correct drift with each plate solve, starting with a complementary filter
- [ ] Move to a Kalman filter only if testing shows it is needed
- [ ] Limit how much the compass is trusted, because the telescope can disturb it
- [ ] Calibrate the offset between the phone's camera and the telescope's optical axis
- [ ] Show the estimate's quality and prompt for a new solve when it degrades
- [ ] Test the filter with recorded sensor logs

## 8. Finder experience (first usable version)

- [ ] Add a searchable target catalogue, such as Messier and bright stars, and check its licence
- [ ] Show which targets are currently above the horizon
- [ ] Show guidance arrows and the remaining angle to the target
- [ ] Confirm arrival with a plate solve
- [ ] Add a guided first-run setup: permissions, mounting, alignment and index download
- [ ] Add a red night mode that protects dark adaptation
- [ ] Keep the screen on with the Wake Lock API
- [ ] Test a full session outdoors under a real sky

## 9. Polish

- [ ] Replace the placeholder icon if wanted
- [ ] Prompt users when a new app version is ready
- [ ] Add install instructions, particularly for iOS, which has no install prompt
- [ ] Add a settings page for equipment profiles, location and display options
- [ ] Add an accessibility pass and larger touch targets for use in the dark
- [ ] Add a sky chart view
- [ ] Write a README and credit catalogues and libraries as their licences require
