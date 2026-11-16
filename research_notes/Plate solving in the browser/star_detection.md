# Star detection, centroiding and image filtering for urban phone-camera sky images

Context: the current AstroTurboMaxiSolver detector (TypeScript) uses a 32 px block-median background with bilinear blending, per-block MAD noise (floor 0.25), a 4-sigma threshold and 4-connected components. It then applies filters for elongation >3, broad flat patches, a local ring background check, flat-topped lights, glare masks, a size limit of 150 px and cluster rejection, and ranks by flux. Real tests found three problems: edge smears along the vignetting, quantization patches one grey level above the sky, and buildings or lit windows outranking stars.

## 1. Background estimation (SExtractor/SEP mesh, photutils Background2D, mesh size, sharp foreground edges)

### Takeaway
The standard tools all work the same way. They build a coarse mesh with a sigma-clipped, mode-like estimate per cell and median filter the mesh, typically 3x3, to remove cells contaminated by bright objects. They interpolate smoothly between cells and estimate noise separately. Mesh size trades bias from sources against tracking of gradients. None of these tools handle sharp foreground edges well, so the standard fix is to mask them before the background is estimated.

### Cited Findings
- SExtractor estimates the background on a grid of meshes. Each mesh histogram is clipped "until convergence at ±3σ around its median". The mode is then estimated as Mode = 2.5 × Median − 1.5 × Mean. In crowded fields the mode is about 30% noisier, and if mode and median disagree by more than 30% it falls back to the median — [SExtractor docs: Background](https://sextractor.readthedocs.io/en/latest/Background.html)
- SExtractor on mesh size (BACK_SIZE): too small and objects and noise bias the estimate, with extended-object flux leaking into the background; too large and small-scale background variation is lost. 32 to 512 px is typical for reasonably sampled images — [SExtractor docs](https://sextractor.readthedocs.io/en/latest/Background.html)
- SExtractor median filters the mesh (BACK_FILTERSIZE). 3x3 "suffices in most cases", and larger filters help with small meshes or large artefacts. BACK_FILTERTHRESH restricts filtering to meshes that exceed the filtered value by more than a threshold. The final map is a natural bicubic-spline interpolation between meshes, and median filtering reduces ringing around bright features. An RMS map is produced in parallel — [SExtractor docs](https://sextractor.readthedocs.io/en/latest/Background.html)
- photutils Background2D: "The box size should generally be larger than the typical size of sources in the image, but small enough to encapsulate any background variations." Defaults are sigma clipping with sigma=3 and maxiters=10, a median `filter_size` (3x3 in the example), and `SExtractorBackground`, which uses 2.5·median − 1.5·mean but switches to the median when |mean − median|/std ≥ 0.3. RMS estimators include `MADStdBackgroundRMS`. The low-res map is upsampled by spline zoom — [photutils background guide](https://docs.astropy.org/projects/photutils/en/stable/user_guide/background.html)
- photutils recommends masking sources before estimating the background. Its example detects at 2σ, segments, then dilates the mask with a circular footprint of radius 10. A separate `coverage_mask` marks regions without valid data and is applied to the output maps, and `exclude_percentile` controls how many masked pixels a box may contain before it is excluded — [photutils](https://docs.astropy.org/projects/photutils/en/stable/user_guide/background.html)
- SEP (the library version of SExtractor) exposes `sep.Background(data, mask=..., bw=64, bh=64, fw=3, fh=3)` as its tutorial example, with outputs `globalback`, `globalrms`, `back()` and `rms()` — [SEP tutorial](https://sep.readthedocs.io/en/stable/tutorial.html)
- Licence: SEP's C library is LGPLv3 because it is derived from Source Extractor. The Python wrapper is MIT, and `overlap.h` is BSD-3 — [SEP GitHub](https://github.com/kbarbary/sep). photutils is BSD-licensed (Astropy-affiliated; not verified on the fetched page).
- tetra3 does not use a mesh. Its background is a dense sliding filter: `bg_sub_mode` is 'local_mean' by default, or 'local_median', 'global_median' or 'global_mean', with `filtsize=25` (must be odd). Noise `sigma_mode` options include 'local_median_abs' (median absolute value × 1.48 in the window) and the default 'global_root_square' — [tetra3.py source](https://raw.githubusercontent.com/esa/tetra3/master/tetra3/tetra3.py)
- cedar-detect also avoids a global background map. It measures background locally from the perimeter ring around each candidate box ("localized thresholding to tolerate changes in background levels across the image"). It estimates noise once by sampling three areas on each of five horizontal cuts (cut size min(50, width/4)), taking the darkest sample, removing outliers (8σ) and flooring the noise at 0.2 for images "crushed to black" — [cedar-detect README](https://github.com/smroid/cedar-detect), [cedar-detect algorithm.rs](https://raw.githubusercontent.com/smroid/cedar-detect/main/src/algorithm.rs)
- Siril's findstar uses the image median as background and noise from global image statistics, and its documentation admits that detection is less efficient in heavily vignetted corners — [Siril Dynamic PSF docs](https://siril.readthedocs.io/en/latest/Dynamic-PSF.html)

### Inferences
- AstroTurboMaxiSolver's 32 px block median is at the small end of SExtractor's 32 to 512 px range. On a 1080x1920 frame that gives about a 34x60 mesh. It lacks two things the reference tools have: sigma clipping with a mode estimate per cell, and a 3x3 median filter of the mesh. Without the mesh filter, one cell over a lit window or a building edge raises the local background, then bilinear blending smears it into neighbours. The result is halos and "edge smear" artefacts. Adding a 3x3 (or 5x5) median filter over the mesh is the cheapest fix with the best evidence behind it.
- Vignetting edge smears happen because bilinear interpolation between 32 px cells cannot follow a steep radial falloff near the corners. Two options:
  - (a) Divide out a smooth vignetting model, either a per-mount-profile flat or a fitted radial polynomial r², r⁴, before detection.
  - (b) Mark the corners where the gradient across one cell exceeds several σ as low-confidence or masked. The photutils `coverage_mask` concept is the template for this.
- Quantization patches one grey level above sky come from the 8-bit staircase. With MAD on denoised 8-bit data, MAD is often 0, which is why the floor of 0.25 exists. A 0.25 DN noise floor makes a 4σ threshold equal 1 DN, so a step of one grey level passes. The floor should sit at or above the quantization noise of a uniform 1 DN step, 1/√12 ≈ 0.29 DN (standard result, not from a fetched source). In practice it should probably be at least 0.5 to 1 DN for denoised phone frames. Alternatively, require a minimum peak excess in DN, such as ≥3 DN above local background, as well as the σ test. cedar-detect does something similar: its 2σ/3σ noise terms are floored at absolute minimums of 2 and 3 DN ([algorithm.rs](https://raw.githubusercontent.com/smroid/cedar-detect/main/src/algorithm.rs)).
- For sharp foreground edges such as rooftops and trees, the best evidence supports masking before background estimation. Detect large bright regions (buildings, terrace beams), dilate generously (photutils uses radius 10), and exclude them from the mesh statistics and from detection. A horizon mask from the IMU attitude (below altitude ≈ 5 to 10°) is a cheap extra mask.
- An alternative for strong gradients is cedar-detect's approach: never build a global background, and judge each candidate against its own perimeter ring. AstroTurboMaxiSolver already has a "local ring background check", and it could be promoted from a filter to the primary test.

### Gaps
- I couldn't find documented default `exclude_percentile` and `box_size` values for photutils on the fetched page.
- I found no published study of mesh-background behaviour on phone-camera or denoised 8-bit data specifically.

## 2. Detection: matched filtering, DoG/LoG, top-hat, local maxima versus thresholded components, deblending

### Takeaway
Convolving with a PSF-sized kernel before thresholding is the theoretically optimal detector for point sources in white noise. SEP enables it by default with a 3x3 kernel. Production star-finders (cedar-detect, Siril, tetra3 with binary opening) also add a shape-specific gate that tests whether the peak is compact and surrounded by flat sky. That gate is what rejects extended light, and AstroTurboMaxiSolver lacks it as a first-class step.

### Cited Findings
- Matched filtering, meaning convolution with the PSF, is the optimal detector for a known-shape signal in stationary white noise. A circular Gaussian is a good approximation to a stellar PSF near its centre — [Optimal Addition of Images for Detection and Photometry (astro-ph/9310031)](https://arxiv.org/pdf/astro-ph/9310031)
- The measured gain from a proper matched filter over the plain PSF in Herschel-ATLAS was S/N ×1.22 to 1.25, with a "small but useful gain" — [H-ATLAS DR1 paper](https://arxiv.org/pdf/1606.09615). Gains depend on noise: with correlated residuals, as in high-contrast imaging, a full matched filter did not outperform aperture photometry — [ACORNS-ADI](https://arxiv.org/pdf/1209.3014)
- SEP `extract` defaults:
  - `filter_kernel` = 3x3 [[1,2,1],[2,4,2],[1,2,1]]
  - `filter_type='matched'`, which accounts for pixel-to-pixel noise variation
  - `minarea=5`, `deblend_nthresh=32`, `deblend_cont=0.005` (1.0 disables deblending)
  - `clean=True`, `clean_param=1.0`
  - masked pixels treated as zero data with infinite noise, before filtering

  The tutorial example extracts at only 1.5σ with the global RMS, which is feasible because of the filtering — [SEP extract API](https://sep.readthedocs.io/en/stable/api/sep.extract.html), [SEP tutorial](https://sep.readthedocs.io/en/stable/tutorial.html)
- Siril smooths with a fixed-size Gaussian kernel rather than one matched to the image FWHM, and says this works across a wide range of conditions. It then keeps local maxima above background + X·noise that are also the maximum in a `radius` box (radius range 3 to 50). Candidates must stand out from surrounding pixels, which rejects bright nebula patches — [Siril Dynamic PSF](https://siril.readthedocs.io/en/latest/Dynamic-PSF.html)
- tetra3 thresholds at `sigma=2` noise σ by default after local-mean subtraction (filtsize 25). It applies binary opening with a 3x3 cross to clean the mask, labels connected regions, and rejects by `min_area=5`, `max_area=100`, optional `min_sum`/`max_sum`/`max_axis_ratio`. It sorts by sum and optionally re-centroids in a square `centroid_window` — [tetra3.py](https://raw.githubusercontent.com/esa/tetra3/master/tetra3/tetra3.py)
- The cedar-detect detection pipeline ([algorithm.rs](https://raw.githubusercontent.com/smroid/cedar-detect/main/src/algorithm.rs)):
  - **1D gate.** It runs a 7-pixel horizontal gate `|lb lm l C r rm rb|` along rows. The centre must exceed the border average significantly, the borders must be uniform (difference ≤ 3·sigma·noise), and a cheap row-minimum pre-threshold (row_min + sigma_noise_2/2) prunes most pixels.
  - **Blobs.** Candidates are merged into blobs only across vertical adjacency within 3 px.
  - **2D gate.** Each blob has a bounding-box "core" with successive neighbour, margin and perimeter rings. The core must be at least as bright as the neighbour and margin means, perimeter variation must be ≤ 1.5·sigma·noise, and the core mean must exceed background by sigma·noise.
  - **Size and settings.** Blobs larger than `max_size = image_width/100` are rejected. Typical sigma is 5 to 10. Detection can run on 2x2-binned images (bin 1, 2, 4, 8) with centroiding on full resolution.
- cedar-detect reports under 10 ms per megapixel on a Raspberry Pi 4B — [cedar-detect README](https://github.com/smroid/cedar-detect)
- Deblending: SExtractor/SEP use a multi-threshold tree (32 levels) with a minimum contrast of 0.005 — [SEP extract API](https://sep.readthedocs.io/en/stable/api/sep.extract.html)

### Inferences
- **Matched filter.** With a 1080x1920 phone frame, star FWHM is likely about 2 to 4 px, depending on focus and denoising. Replace "threshold raw pixels at 4σ" with "convolve with a 3x3 or 5x5 Gaussian, σ ≈ FWHM/2.355, then threshold the filtered image against the filtered noise". The noise of the filtered image is σ·sqrt(Σk²)/Σk, not σ. This should gain roughly 1.2 to 2× in S/N for faint point sources, a few tenths of a magnitude. It also suppresses single-pixel and quantization speckle, because a one-grey-level step patch has low curvature. This is cheap in JS: a separable 1D convolution in two passes.
- **Local-maximum (peak) detection on the filtered image** instead of connected components is more robust. Take pixels that are the maximum in a 5x5 or 7x7 window and exceed the threshold, then grow a small fixed window around each for centroiding. Lit windows and building edges then produce at most a few peaks rather than one huge component. Large components are what AstroTurboMaxiSolver currently ranks by flux, which is how buildings outrank stars.
- **Compactness gate (cedar-detect / Siril style).** A strong discriminator is "peak minus mean of an annulus at 3 to 5 px must be significant, AND the annulus must be flat (its std ≈ sky noise)". Edges of buildings and window grids fail because their annulus is non-uniform. A DoG or LoG (difference of two Gaussians, e.g. σ1≈1, σ2≈3 px) implements a similar band-pass in one step and also rejects smooth gradients and vignetting. A white top-hat (opening with a disk bigger than a star, radius ~4 to 5 px, then subtract) removes structures wider than the disk and is a standard morphological alternative.
- **Thresholds.** AstroTurboMaxiSolver uses 4σ on raw pixels with a MAD that may be underestimated, so its effective significance is unclear. cedar-detect's typical sigma of 5 to 10 is higher, but on its gated statistic.
- **Deblending** is not needed for a finder. Stars close enough to blend on a phone frame are not useful for solving anyway. Simply reject blends: cluster rejection already does this.

### Gaps
- No published numbers were found for matched-filter gain specifically on phone (denoised, JPEG) images, where noise is spatially correlated and the theoretical gain will be lower.
- I could not fetch SExtractor's own filtering and detection documentation pages (both 404), so the default kernel guidance (FWHM ≈ seeing) is not cited here.

## 3. Rejection of non-stars: hot pixels, cosmic rays, extended objects, terrestrial foreground, FWHM consistency, horizon/sky masking

### Takeaway
The reference tools reject non-stars with three tests:
- a shape and compactness test: a flat surround ring, a size limit and a roundness or axis ratio
- a hot-pixel test: neighbours must carry a reasonable fraction of the centre flux
- for astrometry, PSF-fit statistics such as roundness and Moffat β

None of them uses scene understanding. Urban foreground is best handled by masking with IMU attitude and a "large bright region" mask, plus a consistency check that a candidate's width matches the median star width.

### Cited Findings
- cedar-detect hot-pixel rule: the neighbours "must exceed 0.5 * center (minus background). Otherwise, the center is a hot pixel." It uses an 8-neighbour sum floor of ≈1.5σ "to roughly equalize the two error rates" and interpolates hot pixels from neighbours. The README says it classifies and rejects hot pixels automatically, rejects trailed objects (aircraft, satellites), and tolerates "bright interlopers such as the moon, streetlights, or lit foreground objects" — [cedar-detect README](https://github.com/smroid/cedar-detect), [algorithm.rs](https://raw.githubusercontent.com/smroid/cedar-detect/main/src/algorithm.rs)
- cedar-detect also has these checks — [algorithm.rs](https://raw.githubusercontent.com/smroid/cedar-detect/main/src/algorithm.rs):
  - It rejects blobs whose core is too close to the image edge.
  - It rejects cores larger than width/100, which is ~11 px on a 1080-px-wide frame.
  - It measures each neighbour against its own row's background, which cancels row offsets.
- Siril accepts candidates by roundness (0 to 0.95), amplitude limits and PSF-fit sanity checks. A Moffat fit's β helps reject galaxies, which typically have β < 1.5. Siril recommends against removing saturated stars because this can break astrometry — [Siril Dynamic PSF](https://siril.readthedocs.io/en/latest/Dynamic-PSF.html)
- tetra3 rejects by area (5 to 100 px default), sum and major/minor axis ratio, after a 3x3-cross binary opening that removes 1-px features — [tetra3.py](https://raw.githubusercontent.com/esa/tetra3/master/tetra3/tetra3.py)
- Star-tracker literature on stray light:
  - Stray light often exceeds background brightness, so threshold-based detectors can't tell false detections from stars. A CNN trained on synthetic stray light (lens flare, moonlight) kept rejecting false detections in tests — [arXiv 2404.19108](https://arxiv.org/pdf/2404.19108)
  - A local-contrast "grayscale iterative" preprocessing step reduced false star spots — [MDPI Appl. Sci. 14(20):9207](https://mdpi.com/2076-3417/14/20/9207)
  - Region labelling separates stars from Sun, Earth and Moon interference — [STELLA, DGLR 2011](https://www.fzt.haw-hamburg.de/pers/Scholz/dglr/dlrk2011/Papers/241260.pdf)

### Inferences (recommended rejection order for AstroTurboMaxiSolver)
1. **Horizon/foreground mask from the IMU.** Using the current attitude and camera FOV, compute the altitude of each pixel row or column and mask everything below ~8 to 10° altitude, plus a margin. This is cheap and removes most buildings when aiming high. I found no source describing this for phone finders; it is standard practice in star-tracker Earth-limb exclusion.
2. **Bright-region mask.** Flag connected regions above a high threshold (e.g. >30σ or within ~10 DN of saturation) with area > ~4× the typical star area, and dilate them by ~10 to 20 px. This follows photutils' dilated source mask. Exclude them from both background estimation and detection. This replaces the current glare masks with a more general rule. Lit windows (flat-topped, saturated, rectangular) and terrace beams (elongated) fall in here.
3. **Shape gates** on remaining candidates:
   - peak is a strict local maximum
   - annulus flatness (cedar-detect style)
   - area ≤ ~width/100 core (≈11 px) or ≤ ~50 px total
   - axis ratio ≤ ~1.5 to 2: 3 is too permissive for a still phone, though trailing during 1/3 s handheld can elongate stars
4. **Population consistency.** Compute the median FWHM, or second-moment size, of the top ~20 candidates and reject those whose size is outside ~0.5× to 2× the median. Real stars all share the optics' PSF, whereas windows, lamps and noise blobs do not. This directly addresses "buildings outranking stars".
5. **Hot pixels.** Use the cedar-detect neighbour rule. In stacked frames hot pixels stay fixed while stars move slightly, so a "did it move with the stack alignment" test is also available.
6. **Ranking.** Rank by peak S/N or filtered peak rather than total flux, and cap flux at some multiple of the star-like median. Total flux rewards extended objects. The solver only needs the 10 to 30 brightest *star-like* sources.
7. **Sky segmentation.** Sky segmentation with a CNN is possible, but per AGENTS.md it would need a permissive model and adds weight. The IMU horizon mask plus the bright-region mask probably covers most cases.

### Gaps
- No public documentation was found on how Celestron StarSense Explorer, SkySafari's plate-solve or other phone astronomy apps detect stars or reject urban foreground. They are closed source.
- No quantitative false-positive rates were found for phone urban scenes.

## 4. How existing tools handle this, and their licences

### Takeaway
cedar-detect is the most relevant design because it is built for city-tolerant, fast star-finder use. Its licence is now FSL-1.1-MIT (source-available, not Apache-2.0), so AstroTurboMaxiSolver should learn from its ideas rather than port its code. tetra3 and cedar-solve are Apache-2.0 and safe to port. SEP's C core is LGPLv3, Siril, ASTAP and PiFinder are GPL, and all of these are concept-only for a closed-source app.

### Cited Findings
- **cedar-detect:** LICENSE.md is **FSL-1.1-MIT** (Functional Source License, copyright 2025 Steven Rosenthal). It allows any purpose except a "competing use", meaning a commercial product that offers substantially similar functionality. It converts to MIT on the fifth anniversary of each release. This contradicts the task brief's assumption that it is Apache-2.0 — [cedar-detect LICENSE.md](https://github.com/smroid/cedar-detect/blob/main/LICENSE.md)
- **PiFinder** uses Cedar Detect and Cedar Solve. PiFinder itself is GPL-3.0, "Cedar Solve is licensed under Apache-2.0", and Cedar Detect is FSL-1.1-MIT, with PiFinder distributing its binaries under a separate grant from the copyright holder. It uses an IMX296 (or RPi HQ) camera — [PiFinder GitHub](https://github.com/brickbots/PiFinder)
- **cedar-solve** is an Apache-2.0 fork of esa/tetra3 focused on "significant improvements while maintaining compatibility" — [cedar-solve GitHub](https://github.com/smroid/cedar-solve)
- **tetra3** (`tetra3.py`) is Apache-2.0, © 2019 ESA, and based on the original MIT-style Tetra (brownj4, 2016) — [tetra3.py](https://raw.githubusercontent.com/esa/tetra3/master/tetra3/tetra3.py)
- **SEP:** the C library is LGPLv3 (SExtractor-derived), the Python wrapper is MIT and `overlap.h` is BSD-3 — [SEP GitHub](https://github.com/kbarbary/sep)
- **ASTAP:** star extraction outputs HFD and x/y and has a minimum-SNR option (e.g. `-extract 10`). A developer reported it detects about 5× more stars than SGP's detector — [SGP forum thread](https://forum.sequencegeneratorpro.com/t/does-sgp-talk-to-planewaves-pwi-autofocus/7027/35). Its background and noise algorithm was not documented in the sources found.
- **Siril:** Gaussian-smoothed local maxima, then elliptical Gaussian or Moffat fit with roundness and β checks — [Siril docs](https://siril.readthedocs.io/en/latest/Dynamic-PSF.html). Siril is GPL-3.0 (well known; licence not on the fetched page).

### Inferences
- Port only from tetra3 or cedar-solve, which are Apache-2.0; keep the ESA and Tetra notices. Reimplement the cedar-detect ideas from the published description: the gate, the perimeter ring, hot-pixel classification, binning for detection with full-resolution centroiding, and the max_size = width/100 rule. Do not translate its code: FSL forbids competing commercial use and AstroTurboMaxiSolver is closed source. A legal check is advisable if anything close to a port is planned.
- The tetra3 defaults (sigma=2, filtsize=25 local mean, 3x3 binary opening, area 5 to 100) were tuned for clean, dark, raw sensor images. They are too permissive for urban phone frames without the extra gates above.

### Gaps
- Whether earlier cedar-detect versions were released under Apache-2.0, which would let older code be used under that licence, was not verified.
- No technical information was found for Celestron StarSense, SkySafari or other phone plate-solving apps.

## 5. Stacking, 8-bit/denoised/JPEG phone video, exposure versus stacking, centroiding accuracy

### Takeaway
Stack in floating point, never in 8-bit. Mean stacking of N frames cuts random noise by √N and lets the background mean resolve below 1 DN when there is enough noise to dither. Phone denoising and JPEG remove that noise, which limits the gain and creates the flat quantized patches seen in tests. Intensity-weighted centre of mass with a background-subtracted soft threshold (the cedar-detect method) gives ~0.05 to 0.1 px, ample for a 0.5° target, so Gaussian fitting is unnecessary.

### Cited Findings
- **Stacking 8-bit input.** Siril recommends *summing* for 8-bit input because mean or median "would only decrease the noise but not improve the dynamic of the image, the result would still be 8 bits deep". Siril sums in 64-bit integers and outputs 16-bit or float — [Siril stacking docs](https://siril.readthedocs.io/de/latest/_sources/preprocessing/stacking.rst.txt)
- **Dither.** Noise ahead of quantization acts as dither: averaging can then recover sub-step resolution — [ZWO forum](https://bbs.zwoastro.com/d/11716/1). A sceptical view holds that stacking reduces quantization error but adds no information beyond the bit depth when noise is insufficient, and that integer accumulators cap the gain — [SGP forum](https://forum.sequencegeneratorpro.com/t/added-zwo-settings-dialog/7704?page=8). Saving intermediate integer stacks adds rounding noise — [CrowdSky](https://crowdsky.univie.ac.at/stacking-quality.php)
- **Phone and JPEG processing.** Noise reduction is the main risk to faint stars: dim stars "can be treated as noise" — [Imaging Resource](https://www.imaging-resource.com/?p=17398), and noise reduction "smears the stars while it's killing the grain" — [PetaPixel 2026](https://petapixel.com/2026/06/24/how-to-turn-a-flat-noisy-raw-into-a-finished-milky-way-photograph/). By contrast, Clark's test on a dedicated camera found out-of-camera 8-bit JPEGs and raw showed "about the same faint stars" — [ClarkVision](https://clarkvision.com/articles/astrophotography-with-rawtherapee/). The evidence is anecdotal and conflicting, and I found no controlled phone study.
- **cedar-detect centroiding** uses a soft threshold of background + 1.0·noise, with each pixel contributing max(value − threshold, 0). Brightness is a background-subtracted sum with no per-pixel clamping, to keep the noise unbiased. Detection may run on a 2x2/4x4-binned image while the centroid is computed at full resolution — [algorithm.rs](https://raw.githubusercontent.com/smroid/cedar-detect/main/src/algorithm.rs)
- **tetra3 centroid** is the first moment over the labelled region, optionally recomputed in a square `centroid_window` — [tetra3.py](https://raw.githubusercontent.com/esa/tetra3/master/tetra3/tetra3.py)
- **Moment (centre-of-mass) centroiding** typically gives ~0.05 to 0.1 px, and the star image should cover ≥2 pixels for good estimation — [ISPRS paper](https://WWW.ISPRS.org/proceedings/XXXV/congress/comm3/papers/341.pdf). Gaussian fitting is reported as the most accurate, with Gaussian Grid/Analytic variants for real-time use — [Springer JRTIP 2023](https://link.springer.com/10.1007/s11554-023-01391-8), [Gaussian Grid](https://core.ac.uk/works/73281877). Defocus is used deliberately to spread stars and improve centroids — [Rufino & Accardo 2003](https://www.iris.unina.it/handle/11588/159934). A 2025 comparison of six centroid algorithms against an lsqnonlin fit exists, but numbers were not extractable — [arXiv 2507.17560](https://arxiv.org/abs/2507.17560)
- **Window size and shape** affect sub-pixel accuracy — [NASA NTRS 19940011517](https://ntrs.nasa.gov/api/citations/19940011517/downloads/19940011517.pdf)

### Inferences
- **Plate scale.** 1080 px across a main-camera FOV of ~65 to 70° is ~3.6 arcmin/px. A 0.1 px centroid error is ~0.4 arcmin, which is negligible against the 0.5° (30 arcmin) target. The solve is limited by star count and false matches, not centroid precision, so effort should go into detection and rejection, not fitting.
- **Centroid method.** Use cedar-detect-style soft-threshold centre of mass in a fixed window of ~2×FWHM around the filtered peak. This avoids the bias that occurs when the window is the irregular thresholded component, and stops a nearby lit edge being pulled into the centroid.
- **Stacking 6 frames.** Accumulate in Float32, register each frame by the gyro delta or a quick star-shift estimate, and use a mean or sigma-clipped mean. Noise falls ~√6 ≈ 2.45×, about +1 mag. Re-estimate noise on the stack itself; do not scale the single-frame value, because denoised frames have correlated noise. Use the stack's fractional DN values when setting the noise floor.
- **Longer exposure versus stacking.** With heavily processed 8-bit frames, read noise is not the limiting factor. In a Bortle 8 sky, sky shot noise dominates even at 1/8 s, so N stacked exposures ≈ one exposure of N× length in S/N. The exceptions are that longer single exposures survive the phone's denoiser and quantization better, since stars are lifted above 1 to 2 DN before processing, and that handheld trailing grows. This supports the AGENTS.md choice of the longest exposure that does not trail (up to 1/3 s), then stacking. The reasoning is standard photon statistics; no phone-specific source was found.
- **Video versus ImageCapture.** Video paths usually apply stronger temporal and spatial denoise and lower-quality compression than still capture. Prefer ImageCapture or the least-processed path, and avoid JPEG-heavy paths for detection where possible. This is not verified by a source.

### Gaps
- No controlled measurement was found of faint-star loss from phone video compression or denoising versus raw.
- The numeric results of arXiv 2507.17560 could not be extracted.

## 6. Concrete recommended parameters for a city sky (synthesis)

### Takeaway
A proposed starting configuration, derived from the cited defaults and adapted to 1080x1920, 8-bit, denoised Bortle 8 frames. These values are inferences to validate on the real Valencia and Magic5 Pro test frames, not values taken from any source.

### Cited Findings (the anchoring defaults)
- SExtractor: mesh 32 to 512 px, 3x3 mesh median filter, ±3σ clip, mode = 2.5·med − 1.5·mean with a median fallback — [SExtractor](https://sextractor.readthedocs.io/en/latest/Background.html)
- photutils: sigma=3, maxiters=10, MAD-std RMS option, dilated source mask of radius 10 — [photutils](https://docs.astropy.org/projects/photutils/en/stable/user_guide/background.html)
- SEP: 3x3 [1,2,1] matched kernel, minarea 5 — [SEP](https://sep.readthedocs.io/en/stable/api/sep.extract.html)
- tetra3: sigma 2, filtsize 25, area 5 to 100, 3x3 opening — [tetra3](https://raw.githubusercontent.com/esa/tetra3/master/tetra3/tetra3.py)
- cedar-detect: sigma typically 5 to 10, noise floor 0.2 with absolute DN minimums of 2 and 3, max_size = width/100, hot-pixel neighbour ratio 0.5, centroid soft threshold of bg + 1σ — [cedar-detect](https://raw.githubusercontent.com/smroid/cedar-detect/main/src/algorithm.rs)

### Inferences (recommended AstroTurboMaxiSolver parameters)
- **Pre-mask:**
  - IMU horizon mask below about 8° altitude.
  - Bright-region mask: pixels ≥ 240 DN, or components above 20σ with area > 40 px, dilated by 15 px. Exclude these from background and detection.
  - Ignore a 3 to 4 px frame border.
- **Vignetting:** divide by a per-mount-profile radial flat, or a fitted r²/r⁴ model, before background estimation. Otherwise mark corners with a high gradient as low-confidence.
- **Background mesh:**
  - 64 px cells, giving 17x30. 32 px is acceptable if the median filter is added.
  - Per cell: masked pixels excluded, ±3σ clip around the median for 3 to 5 iterations, SExtractor mode with the median fallback.
  - Drop cells with more than 50% masked and fill them from neighbours.
  - 3x3 median filter of the mesh (5x5 near large masked regions), then bicubic or bilinear upsampling.
- **Noise:** per-cell MAD×1.4826 from clipped pixels, then median filtered like the background. Floor at max(0.5 DN, 0.3 DN/√Nstack) for single denoised 8-bit frames. For stacks, compute the noise from the float stack.
- **Detection:**
  - Separable Gaussian matched filter with σ = 1.0 to 1.3 px (5x5).
  - Threshold the filtered image at 5σ_filtered (σ_filtered = σ·sqrt(Σk²)/Σk).
  - Also require a raw peak excess ≥ 3 DN on single frames, or ≥ 2 DN on a 6-stack.
  - Candidates are local maxima in a 7x7 window.
  - As a faster alternative, run the same pipeline on a 2x2-binned image and centroid at full resolution, the cedar-detect idea.
- **Compactness gate:**
  - Annulus at r = 4 to 6 px: its median sets the local background, and its robust std must be ≤ 2× the expected sky noise, so the surround is flat.
  - Core peak − annulus median ≥ 5σ.
  - Hot pixel if the 8-neighbour mean excess is < 0.3 to 0.5× the centre excess.
- **Shape and size:**
  - Thresholded area 3 to 60 px.
  - Second-moment axis ratio ≤ 2.0 when still.
  - FWHM within 0.5 to 2× the median FWHM of the top 20 candidates.
  - Reject flat-topped saturated plateaus of ≥ 4 px at ≥ 250 DN unless round and isolated. Bright stars and planets can saturate, so do not reject all saturated objects; Siril warns this harms astrometry.
- **Clustering:** reject candidates with more than 3 other candidates within 15 px. Window grids and tree glints cluster; stars at this scale rarely do.
- **Ranking:** by matched-filter peak S/N, capped. Return the top 20 to 40 to the solver.
- **Centroid:** a 7x7 or 9x9 window, or 2.5×FWHM, centred on the peak, using weight max(I − (bg + 1σ), 0) as in cedar-detect.
- **Stacking:** a Float32 accumulator of up to 6 frames registered by gyro or star shift, mean or 2.5σ-clipped mean. Detect on the stack and use single frames only for timing.

### Gaps
- All the numbers above are untested on AstroTurboMaxiSolver's frames. They should be tuned with the existing device-report pipeline (`npm run phone:reports`) by counting true and false detections against catalogue overlays from successful solves.
