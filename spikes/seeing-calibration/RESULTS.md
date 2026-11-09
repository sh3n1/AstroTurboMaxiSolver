# Seeing forecast calibration

The time control's forecast rows show seeing worked out from Open-Meteo's GFS forecast
by `src/app/core/seeing.ts`. This spike checks it against 7Timer and meteoblue, and fits
its three constants.

## Model

The AXP model (Trinquet & Vernin 2006, PASP 118, 756), as 7Timer runs it on GFS
(Ye 2011, PASP 123, 113, Table 2):

- Each kilometre has CT² = ⟨CT²⟩(h)·[A(h)·dθ/dz]^p(h), using the potential-temperature
  gradient across it.
- The lowest kilometre has three sub-layers: 0–50 m, 50–100 m and 100–1,000 m. They use
  the gradient from 2 m to 80 m, then from 80 m to 400 m.
- Cn² = CT²·(7.9e-5 P/T²)². Summed up the column, it gives r0 and seeing = 0.98 λ/r0
  at 500 nm.

On top of the published model there are three fitted constants:
- a scale for the lowest kilometre;
- a scale for the air above it;
- a smallest gradient. Mixed air still has some turbulence, and the paper doesn't say
  how it treats negative gradients.

An earlier try used Tatarskii's formula with Dewan's wind-shear outer scale. It gave
nearly the same seeing all day, while both 7Timer and meteoblue swing between day and
night, so it was dropped.

## Data

- `fetch.mjs` downloads 7Timer ASTRO (3-hourly, 72 h) and Open-Meteo GFS for 14 places:
  Valencia, Madrid, London, Oslo, La Palma, Paranal, Mauna Kea, Denver, Chicago, Miami,
  Tokyo, Delhi, Sydney and Cape Town. It saves them to `data/<date-hour>/`.
- `meteoblue-valencia.json` holds meteoblue's hourly seeing for Valencia from
  9–11 Nov 2026, read off by hand from the user's phone screenshots of their seeing page.
  It was not downloaded automatically, since meteoblue's terms don't allow that.
- `fit.ts` runs the app's own model on the same hours and grid-searches the constants:
  `node spikes/seeing-calibration/fit.ts`.

## Results, 2026-11-09 (336 hours of 7Timer, 48 of meteoblue)

| Fit | 7Timer same class | 7Timer within one class | meteoblue mean difference | meteoblue RMS |
| --- | --- | --- | --- | --- |
| Published AXP, untuned | 26% | 69% | +0.21″ | 0.38″ |
| Fitted to 7Timer only | 20% | 63% | +0.05″ | 0.16″ |
| Fitted to meteoblue only | 18% | 65% | +0.05″ | 0.14″ |
| **Fitted to both (used)** | 20% | 63% | +0.05″ | 0.16″ |

The app uses `groundScale 0.56, freeAirScale 1.78, minGradient 0.003 K/m`.

- **meteoblue:** a close match. It follows Valencia's pattern: 1.5–1.6″ before dawn on
  the 10th, about 1.0″ at midday, and worse again in the evening.
- **7Timer:** a rougher match, for reasons on its side as much as ours:
  - 7Timer uses its coarse grid's height, so Mauna Kea and La Palma come out at sea
    level and class 6 all day. We use the real ground height and give class 2 there,
    which is the known good seeing of those summits.
  - It gives Miami class 6 at every hour.
  - Leaving these out, most places fall within one class.
- **Agreement:** the 7Timer-only and meteoblue-only fits land on nearly the same
  constants, so the two services agree with this model where they agree with each other.

## To do

- Repeat on other days and seasons. `fetch.mjs` can be run again, and `fit.ts` uses
  every folder in `data/`. meteoblue values need reading by hand.
- Compare with measured seeing, such as a DIMM log, if one becomes available.
