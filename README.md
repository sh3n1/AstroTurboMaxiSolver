# AstroTurboMaxiSolver

A telescope PWA finder app for your phone.

Fix the phone to the telescope with its camera looking at the sky, and the app shows where the telescope points on a live sky map and guides you to your target.

Move the telescope and the phone's sensors move the map with it. Every plate solve from the camera fine-tunes the position.

**Try it:** open [astroturbomaxisolver.app/app/](https://astroturbomaxisolver.app/app/) in your phone's
browser, and install it from there. More about it at [astroturbomaxisolver.app](https://astroturbomaxisolver.app).

## What it does

- **Plate solving** in the browser, with no server and no internet, designed for bright city skies.
- **Alignment** with the telescope from a single plate solve, then syncs on targets to refine it.
- **Guidance** to the selected target, with arrows on the sky map.
- **Targets** from Messier, NGC and IC, Caldwell, bright double stars, named stars, the planets,
  the Moon and bright asteroids.
- **Eyepiece view**, from your telescope and eyepieces.
- **Planning**: what is up tonight, the weather forecast, and how dark your sky is.
- **Observing log**, synced between your devices through your own Google Drive.
- **Two phones**: one on the telescope, the other in your hand, linked directly.
- **Night mode** in full red.

## Building it

You need Node.js and npm.

```
npm install
npx ionic serve        # dev server
npm run build          # production build, into www/
npm run lint           # lint, type check and formatting
npm run test:unit      # unit tests (Vitest)
npm run test:e2e       # end-to-end tests (Playwright)
```

Camera and motion sensors only work over HTTPS. `npm run start:phone` serves the app to a phone
on the same Wi-Fi, at `https://<your computer's address>:8443`.

How the code is organised, and the rules it follows, are in [AGENTS.md](AGENTS.md). More
documentation is in [docs/](docs/): hosting and publishing in [deploy.md](docs/deploy.md), saved
data in [local-data.md](docs/local-data.md), sync in [sync-plan.md](docs/sync-plan.md), and the
two-phone link in [two-phones.md](docs/two-phones.md).

## Licence

Copyright The AstroTurboMaxiSolver authors.

AstroTurboMaxiSolver is free software under the GNU General Public License, version 3 only
(`GPL-3.0-only`). See [LICENSE](LICENSE).

Some data travels with the app as a separate work under its own licence.

The weather forecast comes from [Open-Meteo](https://open-meteo.com/), whose free service is
for non-commercial use.

## Contact

astroturbomaxisolver@gmail.com
