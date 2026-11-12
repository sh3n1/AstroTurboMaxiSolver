# Star-identification and plate-solving algorithms for a browser-based phone finder

Context: closed-source PWA, TypeScript in a Web Worker, offline. Phone main camera, 1080x1920, about 60°x34° field, 15–60 usable stars at mag ~4 under a Bortle 8 sky. Current solver: a pattern index from bright stars, the top 12 detected stars for patterns, 25 stars checked, a ±15% focal-length search, an optional sensor hint (±20–30°), and a binomial chance-match test (<1e-12, at least 8 matches).

## 1. How the established solvers work, and which are permissively licensed

### Takeaway
Every serious solver uses the same two stages: (a) a cheap hypothesis from a small asterism, usually 4 stars, hashed into a table or kd-tree; (b) a strict verification that projects many catalogue stars and counts matches against a chance model. tetra3 and cedar-solve (Apache-2.0) are the closest fit for our setting and licence. Astrometry.net as distributed is GPL-3, so its code is unusable, but its published method and verification maths are ideas we can reimplement. ASTAP is MPL-2.0. MPL is weak copyleft at the file level, so treat its code as off-limits for a closed-source app unless the user decides otherwise. Its method description is CC-BY-4.0.

### Cited Findings
**Astrometry.net (Lang, Hogg, Mierle, Blanton, Roweis 2010, AJ; arXiv:0910.2233)**
- It solves blind ("not even the image scale is known"). It hashes asterisms of 4 or 5 stars and accepts a hypothesis only if it passes a Bayesian decision test against a null hypothesis. The paper reports >99.9% success on survey data "with no false positives". — [arXiv abstract](https://arxiv.org/abs/0910.2233)
- **Quad hash:** the most widely separated pair, A and B, defines a local frame. The code is the 4-vector (xC, yC, xD, yD) of the other two stars. C and D must lie inside the circle with AB as its diameter. Symmetry is broken by requiring xC ≤ xD and xC + xD ≤ 1. The code is invariant to translation, rotation and scale, and codes are spread uniformly through the 4-D space. — [Lang et al. 2010 PDF](https://arxiv.org/pdf/0910.2233)
- **Why quads, not triangles:** triangle codes each take up a large share of code space, so the space becomes "heavily oversubscribed" and queries match many codes by chance. A quad is roughly two triangles sharing an edge, which "nearly square[s] the distinctiveness". Quints are more distinctive still, but all k stars are less likely to be detected, and kd-tree search slows in 6-D. — [Lang et al. 2010](https://arxiv.org/pdf/0910.2233)
- **Matching tolerances** that cover 95% of correct matches: 0.0064 for triangles, 0.0095 for quads and 0.011 for quints, as distances in code space. The authors expect triangle indices to beat quads "above some angular size", because a wide-field index needs fewer features. — [Lang et al. 2010](https://arxiv.org/pdf/0910.2233)
- **Index build:** a HEALPix grid with cells about 1/3 the image size. The brightest N stars per cell are kept (typically 10) for uniform coverage. Quads have a diameter of 1–2× the cell size. Each star is reused at most 8 times, over 16 passes. Going from 16 to 9 quads per cell "has almost no effect on recognition rate but takes only two-thirds as much CPU time". Lower densities hurt. The sub-indices go up to quads of 20–30° diameter. — [Lang et al. 2010](https://arxiv.org/pdf/0910.2233)
- **Verification:** a Bayes factor K that compares a foreground model with a background model. The foreground model is a mixture: a uniform "distractor" term, for stars with no counterpart such as planets, satellites and artefacts, plus a Gaussian blob around each projected catalogue star. The background model is uniform. The prior p(F)/p(B) = 1e-6 and the utilities are u(FP) = −1999 and u(TP) = u(TN) = +1, u(FN) = −1, which gives **accept if K > 1e9**. Query stars are added in order of brightness until K crosses the threshold. — [Lang et al. 2010](https://arxiv.org/pdf/0910.2233)
- **False positives in practice:** images "that do not conform to the assumptions in our model can yield false positive matches at much higher rates than predicted". Lines of detected sources, such as satellite trails or diffraction spikes, matched linear flaws in USNO-B. — [Lang et al. 2010 §3.5](https://arxiv.org/pdf/0910.2233)
- **Licence:** the BSD-3 parts are written by the team, but the whole work "must be distributed under the GPL version 3 or later" because it uses GPL libraries, including a vendored GSL. **GPL, so unusable for us.** — [astrometry.net LICENSE](https://github.com/dstndstn/astrometry.net/blob/main/LICENSE)

**tetra3 (ESA) and cedar-solve (Steven Rosenthal's fork)**
- tetra3 is Apache-2.0 (ESA), a "pure lost-in-space solver". The README says "in general solutions will take 10 milliseconds (excluding time to extract star positions)" with "10 arcsecond accuracy". The default database covers a 10–30° field, mag ≤7. — [esa/tetra3](https://github.com/esa/tetra3)
- cedar-solve is Apache-2.0, a fork of esa/tetra3 that aims at "significant improvements … while maintaining compatibility". The file headers credit © 2019 ESA (Apache-2.0), © 2023 Steven Rosenthal (Apache-2.0) and the original Tetra © 2016 brownj4 (MIT-style). — [cedar-solve repo](https://github.com/smroid/cedar-solve); [tetra3.py source](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- **Pattern:** 4 stars. The six pairwise angular edges are computed and the five shorter ones divided by the longest, giving five ratios between 0 and 1. These are sorted and quantised into `pattern_bins = round(1/4/pattern_max_error)` bins (250 bins at the cedar default of 0.001), then hashed into an open-addressing table. The table size is the next prime above 2× the pattern count for quadratic probing, or 3× for linear probing. — [tetra3 docs](https://tetra3.readthedocs.io/en/latest/api_docs.html); [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- **Database parameters:** `max_fov` and `min_fov` (a multiscale database with `multiscale_step` 1.5), `pattern_stars_per_fov` (default 10), `verification_stars_per_fov` (default 30), `star_max_magnitude` (in cedar, computed from `min_fov` and `verification_stars_per_fov` with an empirical 0.7 factor), and `lattice_field_oversampling` (default 100). Cedar reports pattern yields relative to 100,000 of 0.61 at 100, 0.86 at 1,000 and 0.96 at 10,000. — [tetra3 docs](https://tetra3.readthedocs.io/en/latest/api_docs.html); [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- **Patterns are presorted** by distance from the pattern centroid, so image and catalogue star orders line up without trying permutations. — [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- **Verification in cedar:** `prob_single_star_mismatch = num_nearby_catalog_stars * match_radius**2`, the fraction of the field "that are stars". Then `prob_mismatch = binom.cdf(n − (num_star_matches − 2), n, 1 − prob_single_star_mismatch)`, where n is the number of extracted centroids and "−2" removes the degrees of freedom used by the fit. A hypothesis is rejected if `prob_mismatch >= match_threshold`. The reported `Prob` is `prob_mismatch * num_patterns`, a Bonferroni-style correction for database size. The defaults are `match_threshold` 1e-5 in cedar (1e-3 in the tetra3 docs, "corrected for the database size") and `match_radius` 0.01 of the field width. Nearby catalogue stars are capped at 2× the centroid count. — [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py); [tetra3 docs](https://tetra3.readthedocs.io/en/latest/api_docs.html)
- **Field-of-view estimation:** with no estimate, f = image_pattern_largest_distance / 2 / tan(catalog_largest_edge / 2). With an estimate, fov = catalog_edge / image_edge × fov_initial, constrained by `fov_max_error`. It is then refined by the mean ratio of catalogue angles to camera angles, or by a least-squares fit of (f, k) when distortion is on. — [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- **Distortion:** a one-parameter radial model, with k as the distortion at half-width (negative for barrel). The undistortion formula is r_u = r_d(1 − k′r_d²)/(1 − k), with k′ = k(2/width)². It is inverted by Newton–Raphson (tolerance 1e-6, up to 30 iterations). The `distortion` setting can be a (min, max) range so that k is fitted. — [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- **Mirror images:** `if np.linalg.det(rotation_matrix) < 0: continue`. A reflected (improper) rotation is rejected, so a mirrored image must be flipped before solving. — [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- `solve_timeout` defaults to 5000 ms. The first hypothesis that passes the probability test returns immediately. — [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- **Catalogue sizes listed in the tetra3 docs:** BSC5 has 9,110 stars (285 KB), Hipparcos 118,218 (51 MB) and Tycho 1,058,332 (355 MB). A large-field database builds in minutes, a small-field one in hours. — [tetra3 docs](https://tetra3.readthedocs.io/en/latest/api_docs.html)

**Rust "tetra3" crate (follows cedar-solve)**
- Its tracking mode takes an attitude quaternion hint and `hint_uncertainty_rad` and skips the pattern hash. It queries a catalogue cone of radius half-diagonal + uncertainty + margin, projects the stars, and matches nearest neighbours within max(hint uncertainty, match radius). With at least 3 pairs it solves a Wahba SVD, then runs binomial verification **without** the num_patterns division, since no hash trials took place. The docs say it "succeeds with as few as 3 matched stars (LIS needs 4)" and is "robust to pattern-hash failures from sparse / low-SNR fields". On a parity mismatch it fails, and the "caller may still fall back to LIS". — [tetra3 crate 0.5.1, track.rs](https://docs.rs/crate/tetra3/0.5.1/source/src/solver/track.rs)
- The crate credits ESA and Steven Rosenthal's cedar-solve "which this implementation closely follows". — [tetra3 crate docs](https://docs.rs/crate/tetra3/0.5.1/source/src/solver/mod.rs)

**ASTAP (Han Kleijn)**
- **Method:** for each star, take the 4 nearest stars to form a quad. The hash is the longest distance d1 plus the five ratios d2/d1 … d6/d1, which are invariant to rotation, scale and **flip**. Ratios are matched within a "small tolerance" (no number given). Outlier quads are removed with the median of the d1 ratio, which acts as a scale-consistency filter. A 6-parameter linear plate solution is then fitted by least squares to the quad centres. Its search tries positions around the initial RA/Dec hint. For images with few stars it suggests building quads from the 5, 6 or 7 nearest stars. The method page is CC-BY-4.0. — [hnsky.org ASTAP method](https://www.hnsky.org/astap_astrometric_solving.htm)
- **Licence:** the openSUSE changelog says ASTAP moved to MPL-2.0 in 1.0.0RC10, but the AUR listing says GPL, which conflicts and is probably stale. — [openSUSE package](https://build-test-1.opensuse.org/package/show/Application:Astrophotography/ASTAP?rev=36); [AUR astap-cli](https://aur.archlinux.org/packages/astap-cli)

**Star-tracker lost-in-space algorithms**
- **Pyramid (Mortari et al. 2004, Navigation 51(3)):** it uses a k-vector for search-free range lookup of catalogue pairs by angle. A triangle counts only if it is unique within tolerance, and a fourth "pyramid" star must confirm it, which lets it discard many false stars. It is robust to false stars but may not converge when true stars are scarce. — [search summary of Pyramid/k-vector literature](https://www.space-flight.org/AAS_meetings/1999_winter/abstracts/99-181.html); [MDPI comparison](https://mdpi.com/2226-4310/10/9/748)
- One empirical study of six subgraph-isomorphism methods found that Pyramid, given false stars, had the highest average accuracy and was the fastest. A survey warns that comparisons in the literature often reach inconsistent conclusions. — [Empirical analysis (deepai)](https://api.deepai.org/publication/empirical-analysis-of-common-subgraph-isomorphism-approaches-to-the-lost-in-space-star-identification-problem); [PMC survey](https://pmc.ncbi.nlm.nih.gov/articles/PMC7070887)
- **Tetra (Brown, USU SmallSat 2017):** a directly addressed hash table, so one database access per pattern. It was compared against Pyramid and non-dimensional star ID. — [USU SmallSat 2017](https://digitalcommons.usu.edu/smallsat/2017/all2017/124)
- **Geometric voting (LOST, UW CubeSat, open source):** "the simplest true star-id algorithm … quite fast," but it "has some reliability issues and there are no statistical guarantees on how often it will return the wrong result". — [LOST docs](https://uwcubesat.github.io/lost/classlost_1_1_geometric_voting_star_id_algorithm.html)
- **Non-Dimensional Star-ID** (Leake, Arnas, Mortari) is aimed at cases where the focal length and optical-axis offset are poorly known. — [MIT DSpace](https://dspace.mit.edu/handle/1721.1/125244)
- **ROSIA (Chng et al., IEEE TAES 2023), quantitative.** Tests used a 14° field, mag 6 and about 21 detected stars per image, with 1,000 images per noise level.
  - **Added false stars (0, 5, 10):** best ID rates fell from 97.8% to 86% to 74.3% for ROSIA, and from 98.4% to 89.9% to 78.1% for the Multi-Poles Algorithm (MPA). At bad thresholds MPA dropped to 32.3%. Total false positives were 16 for ROSIA and 62 for MPA.
  - **Magnitude noise σ = 1.0:** best rates were 82.1% for ROSIA and 61.9% for MPA. Across all 11,000 instances there were 22 false positives for ROSIA and 19 for MPA.
  - **Size and speed:** ROSIA's catalogue is about 0.24 MB at mag 6, against 6.8 MB for MPA. ROSIA ran in 13–60 ms on an i5 and 50–800 ms on a Raspberry Pi A72.
  - — [arXiv 2210.00429](https://ar5iv.labs.arxiv.org/html/2210.00429)

### Inferences
- **Usable code or ports:** tetra3, cedar-solve (both Apache-2.0) and Tetra (MIT-style).
- **Ideas only:** astrometry.net is GPL and ASTAP is MPL. Algorithms described in papers can be reimplemented, but we should not copy their code.
- **Our design is already tetra3-like.** The biggest differences are as follows.
  - **Bonferroni correction:** tetra3 corrects for the number of hypotheses (database patterns); our 1e-12 is a fixed number. A per-hypothesis threshold of about 1e-5/num_patterns, or our 1e-12, is in the same spirit.
  - **Parity:** tetra3 rejects mirrored solutions, so mirror-mount frames must be flipped first, which matches our mount-profile flag.
  - **Ratio choice for flipped images:** edge-ratio hashes are flip-invariant, unlike astrometry.net's (xC, yC, xD, yD) codes, which change under reflection. That makes edge ratios the natural choice when parity is uncertain, with the determinant check afterwards.

### Gaps
- I couldn't read the Spratling & Mortari survey, Padgett's grid algorithm paper, or the PMC survey text (blocked by a CAPTCHA). Their quantitative tables are not included.
- There is no published false-positive rate for tetra3 or cedar-solve beyond the verification formula itself.
- I didn't confirm the exact ASTAP licence from its own source tree. The sources conflict between MPL-2.0 and GPL.

## 2. Unknown focal length, distortion, mirrors, few stars, false stars and verification thresholds

### Takeaway
Solvers handle unknown scale by making hashes scale-invariant and recovering the field of view from the matched pattern, optionally bounded by an estimate. They handle distortion with one radial parameter, mirrors with a parity (determinant) check, and false stars by verifying against many stars with a chance model that tolerates distractors. Real-world false positives come mostly from model violations such as linear features, not from the statistics.

### Cited Findings
- **Scale:** the ratios are scale-free. The field of view comes from catalogue edge ÷ image edge, bounded by `fov_estimate` ± `fov_max_error`, or from the database's min/max midpoint if no estimate is given. — [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- Astrometry.net discards hypotheses whose implied scale is outside the user's range before verification. In SDSS runs, 77M quad matches led to only 6M verifications. — [Lang et al. 2010](https://arxiv.org/pdf/0910.2233)
- ASTAP rejects quads whose d1 scale ratio differs from the median, a consensus filter on scale. — [hnsky.org](https://www.hnsky.org/astap_astrometric_solving.htm)
- **Distortion:** cedar fits the one-parameter radial k jointly with f by least squares. — [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- **Mirror:** cedar and the Rust tracker reject det < 0. ASTAP's ratios are flip-invariant. — [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py); [track.rs](https://docs.rs/crate/tetra3/0.5.1/source/src/solver/track.rs); [hnsky.org](https://www.hnsky.org/astap_astrometric_solving.htm)
- **False stars:** astrometry.net's foreground model includes a uniform distractor term for "planet, satellite, comet" or detection errors. Pyramid's uniqueness and fourth-star confirmation "can identify and discard even a high number of spikes". — [Lang et al. 2010](https://arxiv.org/pdf/0910.2233); [Pyramid summary](https://www.space-flight.org/AAS_meetings/1999_winter/abstracts/99-181.html)
- **Thresholds:**
  - Astrometry.net accepts when K > 1e9 (prior 1e-6, FP utility −1999).
  - cedar uses binomial chance < `match_threshold`. Its default of 1e-5 is reported ×num_patterns.
  - The tetra3 docs' default is 1e-3, "corrected for the database size".
  - — [Lang et al. 2010](https://arxiv.org/pdf/0910.2233); [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py); [tetra3 docs](https://tetra3.readthedocs.io/en/latest/api_docs.html)
- **Observed false-positive rates:**
  - Astrometry.net: 0 false positives in 182,221 excellent SDSS images (100% recognised with 2MASS added). The statistics hold, but linear-feature images give false positives "at much higher rates than predicted".
  - ROSIA and MPA: 16 and 62 false positives respectively, out of about 3,000 trials with false stars.
  - PiFinder's light-pollution PR: the author reports zero false solves across all sessions.
  - — [Lang et al. 2010](https://arxiv.org/pdf/0910.2233); [arXiv 2210.00429](https://ar5iv.labs.arxiv.org/html/2210.00429); [PiFinder PR #566](https://github.com/brickbots/PiFinder/pull/566)

### Inferences
- **The 1e-12 threshold.** With 8 matches, a 1e-12 binomial threshold is likely stricter than cedar in effect: cedar uses about 1e-5 per hypothesis, divided by the number of patterns (around 1e5–1e6). Both are in the 1e-10 to 1e-11 range overall. We could make the threshold explicitly "1e-5 / (database patterns × focal steps × hypotheses tried)" instead of a fixed number.
- **The 8-match minimum may cost solves on sparse frames, where only 8–12 stars match.** We could replace it with "8 matches, or 6 plus a sensor-hint agreement". This must be justified by the binomial maths, not by intuition.
- **Satellite and aircraft trails can mimic linear catalogue structures,** which was astrometry.net's main false-positive mode. We should reject elongated blobs and collinear runs of detections before pattern building.

### Gaps
- None of the sources quantify false-match rates for 60°-wide fields with only 15 stars. We will need our own Monte Carlo on simulated frames.

## 3. Hinted (tracking) solving vs lost-in-space solving, and what commercial and hobby products do

### Takeaway
Star trackers and the tetra3 Rust port use a cheap tracking path when a prior attitude exists: project catalogue stars from the hint, nearest-neighbour match, fit, then verify without the multiple-hypothesis penalty. It needs as few as 3 stars, compared with 4 for lost-in-space. PiFinder solves up to 20 times a second and bridges the gaps with the IMU. StarSense Explorer combines a lost-in-space solve with the gyro and accelerometer.

### Cited Findings
- **Rust tetra3 tracking mode:** see section 1. It uses the quaternion hint and its uncertainty for the cone, requires at least 3 matches, and skips the num_patterns Bonferroni factor. — [track.rs](https://docs.rs/crate/tetra3/0.5.1/source/src/solver/track.rs)
- **PiFinder:** "solves up to 20 times per second". The accelerometer "estimates how far the telescope has moved since the last solve … the moment you stop, a fresh photo corrects it". The display shows the solve type, i (IMU) or C (camera). — [PiFinder user guide](https://pifinder.readthedocs.io/en/release/user_guide.html)
- **PiFinder light-pollution draft PR #566.** Under a bright sky, cedar-detect on a 512×512 8-bit frame found only 0–2 stars.
  - **Fallback:** if that solve fails, the uncropped 12-bit raw frame goes to SEP with mesh background subtraction, 2×2 binning and quality gates for edge, saturation, shape, isolation and warm pixels. With at least 5 stars it solves with tetra3.
  - **Bench results (Seoul, 50 frames):** 0/50 on the current path, 9/50 with cedar on the full frame, 44/50 hybrid. Median detections rose from 1 to 17, with a median of 10 matched stars.
  - **Live results:** 89.5% of 1,632 attempts solved in a bright-sky session, with zero false solves.
  - It is a draft, not merged.
  - — [PiFinder PR #566](https://github.com/brickbots/PiFinder/pull/566)
- **Celestron StarSense Explorer:** the phone sits over a mirror in a dock. Marketing says it uses plate solving with a "lost-in-space algorithm (LISA)" and combines the results with the phone's gyroscope and accelerometer. Arrows guide the user, and a bullseye turns green when the target is in a low-power eyepiece. It was developed with Simulation Curriculum, the SkySafari makers. No algorithm details are public. — [astroshop blog](https://www.astroshop.eu/blog/?p=43390); [Celestron product page](https://www.celestron.com/products/celestron-starsense-explorer-dx-100az-smartphone-app-enabled-refractor-telescope-lunar-edition)
- ASTAP uses the RA/Dec hint by searching sky positions around it. — [hnsky.org](https://www.hnsky.org/astap_astrometric_solving.htm)

### Inferences
- **Two paths.** With a recent verified solve and only gyro motion since, a tracking solve (project, match, Wahba/SVD fit, binomial verify) should be far faster and work with 3–6 stars. A ±20–30° compass hint is too coarse for direct projection matching across a 60° field. In that case, use the hint to **filter** pattern-hash candidates to catalogue patterns within the hint cone. This cuts the effective hypothesis count, and with it the Bonferroni penalty and the false-match risk.
- **Keep lost-in-space as the fallback.** The Rust crate does the same ("caller may still fall back to LIS").

### Gaps
- There is no public technical documentation of StarSense's solver, its database or its false-match handling. SkySafari's role beyond co-development is unknown.
- PiFinder's licence and default database field/magnitude were not confirmed in this pass.

## 4. Database size for a ~60° field at mag ~5, and keeping it small

### Takeaway
For very wide fields the catalogue is tiny: a few thousand stars to mag 5–6, which is BSC5 scale (9,110 stars, 285 KB raw). Pattern tables scale with patterns per field times the number of fields, which is small at 60°. A wide-field index should fit in well under 1–2 MB, comfortable for a PWA download and offline cache.

### Cited Findings
- BSC5 has 9,110 stars and takes 285 KB. Hipparcos takes 51 MB and Tycho 355 MB. Large-field databases build in minutes. — [tetra3 docs](https://tetra3.readthedocs.io/en/latest/api_docs.html)
- tetra3 defaults to `pattern_stars_per_fov` 10 and `verification_stars_per_fov` 30. Its table holds 2–3× the pattern count, as a prime size. — [tetra3 docs](https://tetra3.readthedocs.io/en/latest/api_docs.html); [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- Astrometry.net builds indices for each scale band. Its largest sub-index has quads 20–30° in diameter. Halving the quad density cost little in recognition. — [Lang et al. 2010](https://arxiv.org/pdf/0910.2233)
- ROSIA's catalogue is 0.24 MB at mag 6 and 1.23 MB at mag 7.5. Pair-angle style catalogues (MPA) grew to 13 MB at a 20° field and 174 MB at mag 7.5, which shows that pair or k-vector databases grow quickly with field and depth. — [arXiv 2210.00429](https://ar5iv.labs.arxiv.org/html/2210.00429)

### Inferences
- **The sky divides into roughly 40–100 overlapping 60° fields.** With about 10 pattern stars per field, you get C(10,4) = 210 patterns per field, or about 1e4–1e5 patterns with lattice oversampling. At 5 bytes of ratios (or a hash key) plus 4 × 2-byte star indices per pattern, that is roughly 0.15–1.5 MB. Ship it as a binary `ArrayBuffer`/`Uint16Array` and cache it with the service worker.
- **Phone fields from about 25° to 70°** can be covered with one multiscale build, like cedar's `min_fov`/`max_fov` with a 1.5 step. Our ±15% focal-length search fits inside a single scale band.
- **Pair-angle or k-vector databases** would be larger than 4-star hash tables at 60°, which is another reason to prefer tetra-style tables.

### Gaps
- The sources gave no measured tetra3 database file size for a 60° field. The figures above are my own estimates.

## 5. Concrete improvements for few-star frames

### Takeaway
The biggest wins found are in detection (background subtraction and higher bit depth, as in PiFinder's 0/50 → 44/50 result), not in matching. After that come: using the hint to shrink the candidate set, brightness-ordered pattern enumeration with early exit, a fitted radial distortion term, a match radius tied to centroid accuracy, and a tracking path that needs only 3–6 stars.

### Cited Findings
- **Detection:** PiFinder found that 8-bit stretching "compresses faint stars on a bright background". Mesh background subtraction, binning and quality gates on the full frame raised the solve rate from 0/50 to 44/50 and the median detections from 1 to 17. — [PiFinder PR #566](https://github.com/brickbots/PiFinder/pull/566)
- **Brightness ordering:** astrometry.net verifies stars in brightness order and builds quads from the brightest first. In some cases the brightest 4 stars matched at once. Its index is built from the brightest stars per HEALPix cell, for uniformity. — [Lang et al. 2010](https://arxiv.org/pdf/0910.2233)
- **Magnitude noise hurts methods that rely on brightness.** At magnitude noise σ = 1, MPA fell to 61.9% while ROSIA held 82.1%. Use brightness to order candidates, not as a hard match criterion. — [arXiv 2210.00429](https://ar5iv.labs.arxiv.org/html/2210.00429)
- **Tolerance:** astrometry.net set its tolerance to cover 95% of correct-match distances, measured empirically, and found that density and tolerance trade speed against recognition. cedar defaults to `match_radius` 0.01 of the field width (about 0.6° at 60°) and a `match_max_error` of 0.002 on edge ratios. — [Lang et al. 2010](https://arxiv.org/pdf/0910.2233); [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)
- **Few stars:** ASTAP suggests forming quads from the 5–7 nearest stars when stars are sparse. The Rust tracking path works with 3 matches. — [hnsky.org](https://www.hnsky.org/astap_astrometric_solving.htm); [track.rs](https://docs.rs/crate/tetra3/0.5.1/source/src/solver/track.rs)
- **Distortion fit:** cedar's (f, k) least squares, with a k range, is a single parameter and cheap. — [cedar tetra3.py](https://raw.githubusercontent.com/smroid/cedar-solve/master/tetra3/tetra3.py)

### Inferences
These are suggestions for AstroFinder. None of them has been tested yet.
1. **Detection first:** do background mesh subtraction on the stacked frame before 8-bit conversion, filter elongated and saturated blobs, and filter hot pixels with a per-device dark map built from stacked frames.
2. **Hint as a candidate filter:** discard hash hits whose catalogue pattern centre is outside the hint cone (±30° plus the field radius). This shrinks the hypothesis count, so the Bonferroni-corrected threshold can be looser for the same false-positive rate.
3. **Wider-field caution:** at 60°, phone lens distortion at the corners is likely several percent. Without a k term, edge stars miss the match radius and edge ratios drift. Fit k per device and store it in the mount profile.
4. **Match radius from centroid accuracy:** stacked, background-subtracted centroids should reach under a pixel. At about 0.031°/px (60°/1920), a 2–3 px radius is about 0.1°. That is much tighter than cedar's 0.6° default, and it lowers the per-star chance probability (∝ r²) by about 30×. Fewer matches would then pass the same threshold.
5. **Tracking solve after the first verified solve:** use gyro attitude (accurate to a fraction of a degree over seconds) to project and match, which needs 3–6 stars and much less computation.
6. **Pattern enumeration:** enumerate patterns from the brightest image stars outward (cedar presorts), stop at the first verified hit, and cap with a time budget like cedar's 5 s timeout.

### Gaps
- No source quantifies phone main-camera radial distortion at a 60° field, or centroid accuracy for 1/8–1/3 s phone exposures. These need measurement on the Magic5 Pro.
