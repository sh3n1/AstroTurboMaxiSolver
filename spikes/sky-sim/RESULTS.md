# Sky simulation results

Simulated feasibility of plate solving on an Honor Magic5 Pro from central Valencia, through a 1920×1080 browser video stream. **These are model results, not measurements. Nothing here has been checked against a real night-sky image.**

Run with `node simulate.mjs <stars.8.json> 200 results.json`. The star file comes from `data/stars.8.json` in [d3-celestial](https://github.com/ofrohn/d3-celestial) and is used for analysis only. All assumptions are at the top of `simulate.mjs`.

## Measured on the real phone

From the device test on the Honor Magic5 Pro in Chrome, in daylight. These are real measurements, and they replace the simulation's assumptions where they differ.

| Rear camera in the browser | Measured |
| --- | --- |
| Cameras offered | One rear camera and one front camera. The telephoto and ultrawide are not offered separately |
| Longest manual exposure | 0.332 s, about 1/3 s |
| Manual exposure takes effect | Yes. Brightness went from 2.5 to 194.9 out of 255 between the shortest and longest exposure |
| ISO range | 100 to 96,000 |
| Largest image | 4032×3024. The test ran at 1080×1920 |
| Zoom | 1× to 8×. Whether this switches lens or is digital is unknown |
| Manual focus | Available and applied, up to a focus distance of 12.96 |

| Sensors, phone resting still for 30 s | Measured |
| --- | --- |
| Gyroscope drift rate, worst axis | 0.0034°/s, about 12° per hour. The other two axes were about 0.0001°/s |
| Gyroscope noise, worst axis | 0.07°/s standard deviation |
| Tilt noise | 0.08° standard deviation |
| Compass heading noise | 0.37° standard deviation |
| Absolute orientation (uses the compass) | Available, about 13 readings per second |
| Motion readings (gyroscope) | 60 per second |

- These show how steady the sensors are at rest, not how accurate. Drift while moving is likely to be worse, and the compass could be steady but wrong. Compass error on a telescope is unmeasured.
- At the measured rate, drift would take about 2 minutes to reach the 0.5° target, so a plate solve whenever the phone is still should comfortably correct it.
- 1/3 s is above the 1/8 s minimum, so the browser exposure question in the decision point is answered for this phone.
- Telephoto and ultrawide results below don't apply to this phone in a browser, unless zoom turns out to switch lens.
- Still unmeasured: how much image processing reduces signal to noise, whether the longest focus setting is sharp on stars, and real star counts. These need a clear night.

## Clear-sky test

The app now has a real test on its device test page: four captures, star detection and a plate solve. Its results will replace the simulated figures below. It has only run on rendered images and a fake camera so far, not on a real sky.

Testing it found that a fixed match count gave confident wrong answers on a starless image. Answers now need matches that are very unlikely by chance. Expect to tune this on real images, because lens distortion may reduce real matches.

The first real run was indoors under white artificial light, so its frames were overexposed and say nothing about the night sky. It did confirm that manual settings work in this test, and it exposed a false solve on overexposed frames, now fixed and kept as a regression test.

## Solve rate

Percentage of frames solved correctly with no sensor hint, for two levels of signal lost to the phone's image processing: nominal (SNR × 0.7) / pessimistic (SNR × 0.4).

| Exposure | Main 23 mm | Mirror mount | 8×30 clip-on | Telephoto 90 mm | Ultrawide 13 mm |
| --- | --- | --- | --- | --- | --- |
| 1/30 s | 74 / 6 | 58 / 5 | 94 / 36 | 0 / 0 | 0 / 0 |
| 1/15 s | 99 / 68 | 99 / 52 | 100 / 92 | 1 / 0 | 0 / 0 |
| 1/8 s | 100 / 98 | 100 / 94 | 100 / 98 | 33 / 3 | 3 / 0 |
| 1/4 s | 100 / 100 | 100 / not run | 100 / 100 | 92 / 21 | 10 / 2 |
| 1 s | 100 / 100 | not run | 100 / 100 | 100 / 100 | 99 / 57 |
| 1/15 s × 30 stacked | 100 / 100 | not run | 100 / 98 | 100 / 93 | 76 / 9 |

Median pointing error when solved: about 0.03° for main and mirror, 0.01° for telephoto, 0.005° for the clip-on.

## Stress tests

Main camera with a compass hint. Solved percentage, with wrong matches in brackets where there were any.

| Condition | 1/15 s | 1/8 s | 1/4 s | 1/15 s × 30 |
| --- | --- | --- | --- | --- |
| Baseline | 99 | 100 | 100 | 100 |
| Sky 1 mag brighter (16.5) | 99 | 100 | 100 | 100 |
| Focus off, stars 3× wider | 79 (2.5) | 100 | 100 | 100 |
| Heavy processing (SNR × 0.2) | 5 | 26 (3) | 85 (0.5) | 100 |
| 30 false detections per frame | 63 | 99 | 100 | 100 |
| All bad: sky 17, stars 2× wider, SNR × 0.4, 10 false | 24 (19) | 68 (4.5) | 94 | 100 |

## Conclusions

- The main camera is the best built-in choice. A wider field finds enough bright stars, even in a bright sky.
- Aim for at least 1/8 s per frame. Stacking about 2 s of 1/15 s frames survived every stress test.
- Image processing matters much more than sky brightness, so it is the first thing to measure.
- Sensor hints don't increase the solve rate when too few stars are visible. They make solving faster and remove most wrong matches. In this solver, median time at the clip-on's narrow field fell from 355 ms to 31 ms with a 10° hint, and to 2 ms with a 1° hint. The main camera took 2 ms or less in all cases, so the benefit grows as the field narrows.
- Weak frames can produce wrong answers (19% in the worst case), so the solver needs a strict confidence check.
- Not knowing a mirror mount's image flip made solving far slower, so the mount profile should record it.
- Solver error is far below the 0.5° target, so alignment and mechanical flex are likely to limit accuracy.

## Limits of this simulation

- The largest unknowns are assumed: maximum exposure available in the browser, image processing losses, focus and lens quality.
- No pixels are rendered. Merged stars, lens aberrations, clouds, the Moon, aircraft and streetlights in frame are not modelled.
- Stacking assumes frames can be aligned and that frames keep the stars.
- Sky brightness is a single 2014 reading of about 17.5 mag/arcsec². Newer LED lighting may affect it.
- The solver is a simple test solver, not a candidate for the app. Times are from a PC, not a phone.
- Most scenarios used 200 trials and the clip-on used 50, so small differences are not meaningful.
- The star file stops at magnitude 8, which limits star counts for the clip-on.
- The mirror run hit a time limit, so its longest exposures were not run.

## Sources

- Camera specs: [GSMArena](https://m.gsmarena.com/honor_magic5_pro_unveiled_with_a_custom_1_112_camera_sensor_vanilla_magic5_follows-amp-57710.php), [Beebom](https://gadgets.beebom.com/?p=2555), [Amateur Photographer](https://amateurphotographer.com/review/honor-magic-5-pro-review/)
- Valencia sky brightness: [13th European Symposium for the Protection of the Night Sky](https://salvemlanit.blogs.uv.es/2013/09/15/13th-european-symposium-for-the-protection-of-the-night-sky/)
- Browser camera controls: [W3C implementation status](https://github.com/w3c/mediacapture-image/blob/main/implementation-status.md)
