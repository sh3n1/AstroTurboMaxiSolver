# UI coherence review

AstroTurboMaxiSolver, 11 November 2026. Reviewed from the code of every page and shared component (`src/app/pages`, `src/app/core`, `src/global.scss`, `src/theme`), plus screenshots of the new details panel. Not every screen was looked at on a phone, so the findings are about what the code draws.

Two questions:

1. Does each icon mean one thing everywhere, and is it a good symbol for it?
2. Does the same kind of control look and behave the same everywhere?

## Summary

- **9 icons have two or more meanings.** The worst:
  - `sparkles` means four things;
  - the moon means both night mode and "Best right now";
  - the crosshair means both alignment and "In the reticle";
  - the cloud means both weather and file import or export.
- **5 symbols are weak** for what they show. Among them: the ellipsis for "Other" objects looks like a "more" menu, the planet icon on the Sky tab is the same idea as the planet icons in lists, and the cross on the planning band means "back to now", not close.
- **Colours drift.** The app has its own green (`#6fcf9f`) and amber (`#ffb454`), but list badges, the new details panel and some warnings use Ionic's own success and warning colours, which are different shades. The same goes for borders (`#232a3d` and `#2a3350`) and light blues (`#8fb7ff` and `#a9cbff`).
- **Closing things works five different ways:** "Done", "Close", a cross, a filled cross in a circle, and a chevron.
- **Smaller points:** two icons for "new list", two back buttons without a screen-reader label, and two different constellation symbols.

Text sizes are consistent: everything uses `--af-scale`, nothing is below 13 px, and the fixed sizes in Settings are the text-size samples, which are meant to be fixed.

## 1. Icons with more than one meaning

| Icon | Meanings today | Where | Suggestion |
|---|---|---|---|
| `sparkles-outline` | Open cluster; every catalogue list; seeing (forecast row) | target lists and details; `target-lists.ts`; time control | Keep for open clusters. Catalogue lists: `book-outline` (the Catalogues row already uses `library-outline`, so a book fits). Seeing: the app's own wavy-air icon. |
| `moon-outline` | Red night mode; "Best right now" | sky map button, Settings; Bookmarks | Keep for night mode. "Best right now": `ribbon-outline` or the app's own "best" mark. The Moon itself already uses its live phase icon. |
| `locate-outline` (crosshair) | Telescope alignment; "In the reticle" | sky map, Settings, Align page; Bookmarks | Keep for alignment. "In the reticle": the app's own three-ring reticle icon, which is what the list is about. |
| `cloud-outline`, `cloud-download-outline`, `cloud-upload-outline` | Cloud cover (weather); import and export of lists | time control; Bookmarks | Files never touch a cloud. Import: `download-outline`; export or save: `share-outline`; the Bookmarks header button: `swap-vertical-outline`. |
| `contrast-outline` | Sky darkness (Bortle); "% lit" | Settings; details | Bortle: the three-bar light-pollution gauge from the details design. % lit: the body's own phase icon. |
| `star-outline` | Star (object kind); magnitude | lists, details; details chip | Magnitude: a brightness icon, such as three dots of shrinking size. Keep the star for stars. |
| `scan-outline` | Aim the map at the target; plate solve when still | sky target bar; Settings | Keep for aim. Plate solving uses the camera, so `camera-outline`. |
| `sunny-outline` | Keep screen on; Sun angle; summer | Settings; details; season lists | The Sun angle and summer are both the Sun. Keep screen on: `phone-portrait-outline`, and give Phone mount the app's own phone-on-tube icon. |
| `globe-outline` | Latitude and longitude; RA and Dec | Settings; details | Two different coordinate systems. RA and Dec: `grid-outline`, which the "Show RA and Dec" setting already uses. Keep the globe for your place on Earth. |
| `ellipse-outline` | Globular cluster; fallback for an unknown kind | lists, details | A globular cluster deserves its own drawn icon (a dense ball of dots); the fallback can stay generic. |
| Constellation | The app's own constellation icon; a zigzag line in the details' constellation chip | lists; details | Use the app's own constellation icon in the chip too. |

Consistent today, worth keeping: `time-outline` for "change the time" (4 places), `bookmark` and `bookmarks` for bookmarks (filled when saved), `trash-outline` for delete, `library-outline` for Catalogues, `folder-outline` for your own lists, `share-social-outline` for share.

## 2. Weak symbols

| Icon | Meaning | Problem | Suggestion |
|---|---|---|---|
| `ellipsis-horizontal-outline` | Object of kind "Other" | Reads as a "more" menu; `ellipsis-vertical` is the list actions menu | `shapes-outline`, or another neutral shape |
| `planet-outline` (Sky tab) | The sky map tab | The same idea as the planet icons in lists. The view switcher calls the same map `map-outline` | One icon for the sky map everywhere: the app's own star-chart icon, or `map-outline` on the tab too |
| `close` on the planning band | Back to the real time | A cross means close or clear elsewhere | The words "Now", as on the time control's own button |
| `eye-outline` / `eye-off-outline` | Eyepiece view; below the horizon | One eye family, two ideas (and the saved observing-log design adds "seen") | Eyepiece view: the app's own eyepiece icon (a circle with a short barrel). Keep the crossed eye for "can't be seen from here" |
| `refresh` / `refresh-outline` | Retry a plate solve; reset the star limit to your sky | Same arrow for "do again" and "go back to default"; one filled, one outline | Retry: `refresh`. Reset: `arrow-undo-outline` |

## 3. Controls that look or behave differently

**Closing and dismissing.** AGENTS.md asks for "a cross to close". Today:

- bookmark sheet: a "Done" text button;
- day picker: a "Close" text button;
- planning band: a cross, which means "back to now";
- target bar: a filled cross in a circle, for "clear target";
- time control: a chevron down.

Suggestion: every sheet and popover closes with the same plain cross in its top corner. "Clear target" uses that cross too. The planning band says "Now". The chevron stays for collapsing the time control, which slides down.

**Filled means "on".** The info, cloud and bookmark buttons fill when their thing is on, which is a good rule. The filled `close-circle` breaks it, because it's filled without being "on". Use the plain cross.

**New list.** It's `add` on the Bookmarks page and `add-circle-outline` in the bookmark sheet. Use one of them in both places. `add` and `remove` for zoom are fine, since + and − are universal there.

**Back buttons.** Align and Device test give theirs `aria-label="Back"`; the list page and the Catalogues page don't. Give all of them the label.

**Chevron down.** In Settings it opens the plate solving log; in the time control it hides the panel. That follows each one's direction of movement, so it's acceptable, but worth knowing.

**Chips.** Interactive chips (Targets filters, recent equipment) are Ionic's filled `ion-chip`; the new details panel uses outlined, non-tappable chips. The difference is right (tappable versus information). Keep it, and don't make outlined chips tappable later without changing their look.

**Section headers.** Settings and Bookmarks style `ion-list-header` the same way (14 px, uppercase, muted), but each page repeats the CSS. Move it to `global.scss`, so new pages (Catalogues has no headers yet) get it for free.

## 4. Colours

| Role | Values in use | Suggestion |
|---|---|---|
| Good / on target | `#6fcf9f` (map, align, Settings, sky test), Ionic `success` (list height badges, new details panel) | Set Ionic's `--ion-color-success` to `#6fcf9f` in `variables.scss`, so both are the same green |
| Warning | `#ffb454` (14 uses), Ionic `warning` (list height badges, "bright sky" on Align) | Set `--ion-color-warning` to `#ffb454` |
| Danger | `#e5484d` (reticle), Ionic `danger` (errors) | Set `--ion-color-danger` to the same red, or keep the reticle red as the one exception and say so |
| Borders | `#232a3d` (5 uses, same as `--ion-border-color`), `#2a3350` (new details chips) | Use `var(--ion-border-color)` everywhere |
| Light blue | `#8fb7ff` (accent), `#a9cbff` (directions, guidance) | Both are fine, but give them names: `--af-accent` and `--af-guidance`, and use the names |

Defining these once also makes night mode safer, since the red filter is applied to whatever colours the page uses.

## 5. Suggested order

1. The theme colours: `--ion-color-success`, `--ion-color-warning`, `--ion-color-danger` and two named blues. A small change in one file that fixes the drift everywhere.
2. The icon clashes in section 1. Most are a one-word change. A few need new drawn icons for the app's set: reticle, light-pollution gauge, magnitude, seeing, eyepiece, globular cluster.
3. Dismissing: one cross; "Now" on the planning band.
4. The small ones: one "new list" icon, back button labels, shared header style.
