# Splitting the sky page

Status: planned, not started. Written 2026-11-17.

`src/app/pages/sky.page.ts` is about 2,240 lines, three times the next largest file. It holds
the map's drawing, its gestures, its star data, its layout and three panels. This plan splits
it into files of a few hundred lines each, without changing what the app does.

## What is in the file now

| Part | Lines | About |
| --- | --- | --- |
| Constants, colours, small helpers | 80-265 | Zoom limits, palettes, `isShownAtField`, `magnitudeLimit` |
| Styles | 280-643 | About 360 lines, most of them for the panels |
| Template | 644-985 | Readout, zoom, menu, dock, eyepiece panel (130 lines), target bar (95 lines) |
| State, signals, constructor | 987-1290 | Wiring, effects, view mode |
| Menu, actions, gestures | 1290-1470 | Tap, drag, pinch, wheel, plate solve on tap |
| Star and constellation data | 1475-1560 | Loading, the grid of cells, `starsNear` |
| Frame timing and layout | 1563-1730 | Draw queue, sky turning, `clearSpan`, `clearBottom` |
| Drawing | 1734-2239 | Grid, constellations, stars, horizon, targets, marker, guidance |

## Where each part goes

New folder `src/app/core/sky-map/`.

| New file | Takes | Size |
| --- | --- | --- |
| `sky-map/sky-style.ts` | Colours for day and night, sizes, `isShownAtField`, `magnitudeLimit`, `starTintIndex`. Plain values and functions, with a spec for the two rules. | ~200 |
| `sky-map/star-field.service.ts` | Loading stars, deep stars and constellations, the cell grid, `starsNear`. | ~150 |
| `sky-map/draw-sky.ts` | `drawGrid`, `drawHorizon`, `drawStars`, `drawConstellationLines`, `drawConstellationNames`, `drawLabel`, `drawCurve`. | ~300 |
| `sky-map/draw-targets.ts` | `drawTargets`, `drawTargetMarker`, `drawEyepieceGuide`, `drawChevrons`, the icon path cache. | ~350 |
| `sky-map/map-gestures.ts` | Pointers, tap or drag or pinch, wheel. It calls back with `tap`, `dragTo`, `zoomTo`. | ~130 |
| `core/pointing-readout.component.ts` | The top-left readout, with its styles. | ~90 |
| `core/eyepiece-panel.component.ts` | The eyepiece panel, with its styles and the star limit and equipment actions. | ~300 |
| `core/target-bar.component.ts` | The target bar, with its styles and the log, clear and aim actions. | ~300 |
| `pages/sky.page.ts` | What is left: the canvas, the view mode, the layout, the draw loop, the menu and zoom. | ~500 |

The drawing functions are plain functions. Each takes the canvas context and one `Frame`
object, built once per draw: the projection, the size, the field, the colours, the text scale
and the roll. They hold no state, so they need nothing from Angular.

## Order of work

One step per commit. After each: `npm run lint`, `npm run test:unit`, `npm run test:e2e`.
No test should need to change, since the test ids and the behaviour stay the same. A test
that needs changing means the step changed behaviour.

1. `sky-style.ts`. Only moves constants and pure functions. Add the spec.
2. `star-field.service.ts`. The page keeps reading `stars()` and `constellations()` from it.
3. `draw-sky.ts`, introducing the `Frame` object.
4. `draw-targets.ts`, using the same `Frame`.
5. `map-gestures.ts`.
6. `pointing-readout.component.ts`, the smallest component, to settle the pattern.
7. `eyepiece-panel.component.ts`.
8. `target-bar.component.ts`, the riskiest, last.

Steps 1 to 5 bring the file to about 1,300 lines, and 6 to 8 to about 500.

## Risks

- **Layout reads the panels from outside.** `clearSpan` and `clearBottom` find `.bar` and
  `.eyepiece-panel` with `querySelector`, and the dock's ResizeObserver watches their size.
  Once they are components, query the component's own element instead, such as
  `app-target-bar`, and keep the observer on the dock.
- **Styles that cross parts.** Rules such as `.stage:has(.bar.detailed) .readout` and the
  landscape rules reach from the page into the panels. Angular scopes a component's styles to
  itself, so these become a class on the component's host, set from a signal, with the rule
  kept in the page.
- **Night mode.** `:host-context(html.night)` rules move with their panel. Check each panel in
  night mode after its step.
- **Drawing speed.** The map draws many times a second. Build the `Frame` once per draw, and
  don't create objects per star. Compare the frame time on a phone before and after step 3.
- **Landscape and portrait.** The end-to-end tests cover both, but look at both by hand after
  steps 7 and 8.

## Not part of this

No new features, no renamed test ids, no changed look. The repeated colours such as `#232a3d`
become theme tokens in a later change, not here.
