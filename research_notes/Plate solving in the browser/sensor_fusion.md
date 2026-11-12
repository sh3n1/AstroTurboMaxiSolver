# Fusing phone sensors with plate solving for telescope pointing

Research notes, November 2026. These notes cover how existing finder products and the research literature combine IMU orientation with plate-solved attitude, and what that means for AstroFinder. AstroFinder is a PWA that uses DeviceOrientation events, a complementary filter, WMM declination and solves taken while the phone is still. Its measured compass error is about 7.5°.

## How do existing products (StarSense Explorer, SkySafari, PiFinder, Stellarium, SkEye and others) handle drift, magnetic interference and recalibration?

### Takeaway
PiFinder is the only product with a public, inspectable design. It treats the plate solve as the truth and the IMU as a relative-motion dead-reckoner. At each solve it re-anchors one "drifting reference-frame" quaternion and one fixed camera-to-eyepiece quaternion. It does not model gyro bias and does not use the compass for pointing. Celestron StarSense Explorer documents only its solve-based behaviour (about 0.25° accuracy, re-solves whenever the phone is repositioned). Its use of sensors between solves is not publicly documented. User reports say phone compass and gyro errors of up to about 10° are common, which matches our 7.5° measurement.

### Cited Findings
**PiFinder (open source, Raspberry Pi, IMU plus GPS on a HAT, cedar-detect and cedar-solve):**
- PiFinder uses the IMU because camera frames are too blurred to plate solve while the scope moves. An `integrator` process "estimates PiFinder's current pointing by merging platesolve information and IMU data" — [PiFinder dev architecture](https://pifinder.readthedocs.io/en/main/dev_arch.html)
- The solver is cedar-detect (a Rust centroider) plus cedar-solve, a fork of tetra3. Its database is stripped down to the focal lengths of compatible lenses to keep solves fast. The docs say a "very fast blind plate-solver MUST be used" — [PiFinder dev architecture](https://pifinder.readthedocs.io/en/main/dev_arch.html)
- The merge happens in quaternion space, never in alt/az. On a successful solve the integrator stores the IMU quaternion at that moment as an anchor and reseeds the dead-reckoner. Alt/az is computed only at publish time, from RA/Dec — [PiFinder integrator.py](https://raw.githubusercontent.com/brickbots/PiFinder/main/python/PiFinder/integrator.py)
- The core equations are in `imu_dead_reckoning.py`:
  - At a solve: `q_eq2x = q_eq2cam * (q_x2imu * q_imu2cam).conj()` and `q_cam2aligned = q_eq2cam.conj() * q_eq2aligned`.
  - At prediction: `q_eq2cam = q_eq2x * q_x2imu * q_imu2cam` and `q_eq2aligned = q_eq2cam * q_cam2aligned`.
  - `q_eq2x` is described as a "slowly-drifting reference-frame quaternion that is re-solved whenever a matched (plate-solve, IMU) pair is available" — [PiFinder imu_dead_reckoning.py](https://raw.githubusercontent.com/brickbots/PiFinder/main/python/PiFinder/pointing_model/imu_dead_reckoning.py)
- The IMU-to-camera rotation `q_imu2cam` is a fixed hardware lookup ("no per-unit calibration is applied"). Any mismatch is absorbed into `q_eq2x` at each solve. There is no explicit gyro-bias estimator, and drift is handled only by re-anchoring. A failed solve keeps the anchor, so dead-reckoning continues — [imu_dead_reckoning.py](https://raw.githubusercontent.com/brickbots/PiFinder/main/python/PiFinder/pointing_model/imu_dead_reckoning.py); [integrator.py](https://raw.githubusercontent.com/brickbots/PiFinder/main/python/PiFinder/integrator.py)
- Motion threshold: `IMU_MOVED_ANG_THRESHOLD = 0.06°`, measured as the angle between the anchor quaternion and the current IMU quaternion. Below it the solved position is kept; above it the estimate is switched to `SolveSource.IMU` — [integrator.py](https://raw.githubusercontent.com/brickbots/PiFinder/main/python/PiFinder/integrator.py)
- Timing: a solve's epoch is the frame's `exposure_end` rather than the time the solve completed, and an IMU update carries the IMU sample time. Only newer epochs are published — [integrator.py](https://raw.githubusercontent.com/brickbots/PiFinder/main/python/PiFinder/integrator.py)
- A user setting, "IMU Sensit." (Off to High), controls how readily motion switches pointing from the camera solve to the IMU estimate — [PiFinder menu map](https://pifinder.readthedocs.io/en/main/menu_map.html)
- PR #338, merged in March 2026, moved tracking to equatorial coordinates with quaternion dead-reckoning and made the IMU outputs raw — [PiFinder PR #338 (mirror)](https://gh.r-mj.com/brickbots/PiFinder/pull/338)

**Celestron StarSense Explorer (app by Simulation Curriculum, the SkySafari developer):**
- The dock holds the phone over a mirror, and the camera images the sky via that mirror. The mirror is tilted slightly to help with objects low in the sky. X-Y knobs position the camera — [Celestron StarSense Explorer technology](https://www.celestron.com/pages/starsense-explorer-technology)
- It plate solves "automatically (and quickly) each time the phone is repositioned" and needs no sky alignment. A "simple two-step procedure" aligns the phone camera to the telescope's field. Typical accuracy is about 0.25°. Celestron calls sensor-only apps "a few degrees at best" — [Celestron](https://www.celestron.com/pages/starsense-explorer-technology)
- Celestron says other apps "rely exclusively on the phone's gyros and accelerometers". It does not say what StarSense itself does between solves — [Simulation Curriculum StarSense page](https://store.simulationcurriculum.com/pages/starsense-explorer)
- The technology is described as patent-pending, while one retailer calls it "patented". I found no patent text — [Celestron](https://www.celestron.com/pages/starsense-explorer-technology); [Astronomics listing](https://astronomics.com/collections/celestron/products/celestron-starsense-explorer-10-smartphone-app-enabled-dobsonian-telescope)
- Anecdotal user reports on the Simulation Curriculum forum:
  - The app solves "every 10 seconds or sooner" when moved, and a solve can take about 1 s.
  - The phone's compass and gyro "can be off as much as 10 degrees".
  - A SkySafari user saw gyro drift with a phone mounted on a scope.
  - — [SC forum 1](https://support.simulationcurriculum.com/hc/en-us/community/posts/115000872787/comments/115001233868); [SC forum 2](https://support.simulationcurriculum.com/hc/en-us/community/posts/115009490788/comments/115005432287)

**Stellarium Mobile, SkEye, Sky Guide and Night Sky:**
- The Stellarium Labs FAQ has nothing on compass calibration or offsets — [Stellarium Labs FAQ](https://stellarium-labs.com/blog/faq/)
- A SkEye document lists nearby metal structures, electrical circuits and the phone's own induced fields as sources of magnetic interference. An IceInSpace user notes that the scope or mount itself causes interference, and that stability matters more than absolute accuracy — [SkEye intro (Scribd)](https://www.scribd.com/document/463062801/SkEyeIntro-pdf); [IceInSpace thread](https://www.iceinspace.com.au/forum/showthread.php?p=1145060)
- Seestar's guide says to calibrate the compass away from metal and power lines, and warns that magnetic phone mounts cause interference — [Seestar guide](https://store.seestar.com/blogs/tutorial/cant-locate-the-sun-or-moon-a-step-by-step-guide-to-diagnose-fix)

### Inferences
- PiFinder's model maps almost one-to-one onto AstroFinder:
  - `q_eq2x` corresponds to "sensor frame to sky frame", which absorbs compass heading error and drift.
  - `q_cam2aligned` corresponds to our alignment offset.
  - `q_imu2cam` corresponds to the fixed phone-to-camera geometry, including a mirror flip.

  Learning a full 3-D quaternion at each solve is more general than learning a heading-only compass offset. It also absorbs tilt errors and mount geometry errors.
- Having no gyro-bias model works for PiFinder because it solves often and its IMU fusion runs on the chip. A browser gets an OS-fused orientation that already includes magnetometer correction, so between solves the main error source is the compass, not gyro bias.
- Our 7.5° compass error is in line with field reports (about 10°). Never trust the compass for absolute azimuth once a solve exists.

### Gaps
- I found no public documentation of how StarSense Explorer, SkySafari, Sky Guide or Night Sky use sensors between solves, or whether they apply compass offsets. I found no patent text for StarSense.
- I could not read the SkEye/IceInSpace archive thread (HTTP 403).

## Best practices for fusing absolute fixes (plate solves) with gyro-integrated attitude

### Takeaway
Standard practice in spacecraft star trackers is a multiplicative EKF (MEKF). It keeps a quaternion plus a three-component error state and estimates gyro bias. Lightweight systems use a Mahony-style nonlinear complementary filter, where a PI correction on the gyro rate learns bias through the integral term. For a phone PWA with sparse but very accurate solves, PiFinder's approach is the simplest robust choice: re-anchor a reference-frame quaternion at each solve and timestamp it at the moment of exposure.

### Cited Findings
- The MEKF was formulated rigorously by Lefferts, Markley and Shuster (1982) and later refined by Markley (2003). Gyro-aided versions add bias states — [NASA NTRS slides](https://ntrs.nasa.gov/api/citations/20150023412/downloads/20150023412.pdf)
- Recent star-tracker work uses a 9-state MEKF (attitude, angular rate, gyro bias), adding multiple-model estimation for star-tracker misalignment — [arXiv 2601.01130](https://arxiv.org/html/2601.01130v1); [arXiv 2507.19838](https://arxiv.org/pdf/2507.19838)
- An MEKF can calibrate gyro bias, scale factor and misalignment from star tracker measurements — [Akca, Tirman, Söken](https://avesis.metu.edu.tr/yayin/0e7214e5-d7c3-4a4f-8989-786042fe7ef4/onboard-gyro-calibration-for-small-satellites-using-star-tracker-measurements)
- Mahony's complementary filter on SO(3):
  - The corrected rate is ω_gyro − b̂ + k_p·e, and the bias b̂ is integrated from the error with gain k_I.
  - The `ahrs` library defaults are k_p = 1.0 and k_I = 0.3. Implementations add an anti-windup clamp.
  - — [ahrs Mahony docs](https://ahrs.readthedocs.io/en/latest/filters/mahony.html); [Mahony et al. (ANU)](https://openresearch-repository.anu.edu.au/bitstream/1885/56301/2/01_Mahony_Robust_Nonlinear_Observers_for_2007.pdf); [Elixir port](https://preview.hex.pm/preview/bb_estimator_ahrs/show/lib/bb/estimator/ahrs/mahony.ex)
- Latency: PiFinder stamps solves with `exposure_end` and pairs each solve with the IMU quaternion captured with that frame (`result.imu_anchor`). The correction is therefore computed against the attitude at capture time, not at solve completion — [PiFinder integrator.py](https://raw.githubusercontent.com/brickbots/PiFinder/main/python/PiFinder/integrator.py)

### Inferences
Recommendations for AstroFinder:
1. **Keep the OS-fused orientation as the motion source and add a learned correction quaternion `q_corr`** (sensor frame to true sky frame), so that true attitude = `q_corr * q_sensor`. At each verified solve, set `q_corr = q_solve * inverse(q_sensor_at_capture)`, using the sensor quaternion buffered at the middle of the exposure. Blend toward it with a small time-constant rather than snapping, so the map does not visibly jump. When the solve agrees within a tolerance, snapping is fine.
   - This generalises "learn the compass offset" to all three axes.
   - Keep a separate heading-only offset only for display or diagnostics.
2. **Handle latency with a ring buffer** of timestamped sensor quaternions, for example 2–3 s at 60 Hz. Match the frame by its capture timestamp (`requestVideoFrameCallback` metadata `captureTime` or `expectedDisplayTime`, where available) rather than by solve-completion time. A solve may take 0.5–2 s while the user starts moving, and the PiFinder pattern avoids this error.
3. **Optionally decay `q_corr` confidence over time.** After a long time without solves, or after large motion, mark the position as "sensor estimate" (PiFinder's `solve_source`), consistent with the project's "never show an unverified position as correct" rule.
4. **A full MEKF is likely overkill.** The browser does not expose raw-gyro bias control inside the OS fusion. A full MEKF only pays off if we fuse raw `Gyroscope` readings ourselves. A Mahony-style PI on `q_corr` (P for the attitude, I for slow compass drift and offset) is a middle ground.
5. **Use quaternions internally.** Convert to alt/az only for display, as PiFinder does.

### Gaps
- I did not retrieve the exact Mahony update equations or measured MEKF-vs-complementary comparisons for phone-grade IMUs.
- I found no published study of plate-solve-plus-phone-IMU fusion accuracy.

## Browser sensor APIs in 2026 (DeviceOrientation vs Generic Sensor, Android Chrome vs iOS Safari)

### Takeaway
Use `deviceorientationabsolute` (or `AbsoluteOrientationSensor` for a quaternion at up to 60 Hz) on Android Chrome. On iOS Safari, use `deviceorientation` after `DeviceOrientationEvent.requestPermission()` is called from a tap. On iOS, alpha is relative to the start-up heading ("game" orientation), so the absolute heading must come from `webkitCompassHeading`, which is magnetic and has roughly ±10° accuracy. The Generic Sensor API is not Baseline. I found no source showing it in iOS Safari.

### Cited Findings
- **Angle definition.** DeviceOrientation uses intrinsic Z-X'-Y'' Tait-Bryan angles:
  - alpha is in [0, 360), beta in [−180, 180) and gamma in [−90, 90).
  - Alpha runs in the opposite sense to a compass heading.
  - The frame is fixed to the device's natural screen orientation and does not follow screen rotation.
  - Appendix A.2 warns of gimbal lock and suggests quaternions or matrices instead.
  - — [W3C Device Orientation and Motion](https://www.w3.org/TR/orientation-event/)
- **`absolute` flag and `deviceorientationabsolute`.** The `absolute` flag says whether the frame is Earth-referenced, which needs the magnetometer. `deviceorientationabsolute` always delivers absolute data but is marked "at risk" in the spec — [W3C spec](https://www.w3.org/TR/orientation-event/)
- **Permission.** `requestPermission()` rejects with NotAllowedError when the permission is still in the prompt state and the page has no transient user activation — [W3C spec](https://www.w3.org/TR/orientation-event/)
- **Event rate.** Events fire on a "significant change", and the spec recommends a threshold of at most 1°. No events fire when the page is hidden — [W3C spec](https://www.w3.org/TR/orientation-event/)
- **Precision limits.** Values are capped at 0.1° for angles and 0.1 deg/s for rotation rate (devicemotion) to reduce fingerprinting — [W3C spec](https://www.w3.org/TR/orientation-event/)
- **iOS alpha is relative.** iOS reports alpha relative to the heading at start-up ("game-based"), Android reports it relative to north, and alpha often drifts — [W3C alpha calibration note](https://www.w3.org/2008/geolocation/wiki/images/e/e0/Device_Orientation_%27alpha%27_Calibration-_Implementation_Status_and_Challenges.pdf)
- **iOS compass properties.** `webkitCompassHeading` is relative to magnetic north and runs opposite to alpha. `webkitCompassAccuracy` is typically about 10°, and Apple engineers noted that heading and accuracy can change during a session — [W3C list, Dean Jackson](https://lists.w3.org/Archives/Public/public-geolocation/2011Jul/0014.html); [dev.to write-up](https://dev.to/toolswebs1/building-a-compass-in-the-browser-how-the-deviceorientation-api-actually-works-3f37)
- **Common cross-platform pattern.** Use `deviceorientationabsolute` on Android Chrome and `webkitCompassHeading` on iOS — [react-world-compass](https://github.com/chunlaw/react-world-compass)
- **Generic Sensor API availability.** `AbsoluteOrientationSensor` has "Limited availability" (not Baseline). It needs HTTPS and the accelerometer, gyroscope and magnetometer permissions, can be blocked by Permissions Policy, and outputs `quaternion` and `populateMatrix()` — [MDN AbsoluteOrientationSensor](https://developer.mozilla.org/en-US/docs/Web/API/AbsoluteOrientationSensor)
- **Generic Sensor API behaviour.** `AbsoluteOrientationSensor` fuses the accelerometer, gyroscope and magnetometer. `referenceFrame: 'screen'` remaps readings to screen coordinates. Readings are only delivered to a visible page — [Chrome for Developers: Generic Sensor](https://developer.chrome.com/docs/capabilities/web-apis/generic-sensor)
- **Sampling rate.** Chromium caps Generic Sensor frequency at 60 Hz. The DeviceOrientation pump requests 60 Hz but clamps to the device maximum. An older bug fixed a fusion sensor defaulting to 5 Hz — [Chromium review 2353493002](https://codereview.chromium.org/2353493002); [crrev b29ba0d](https://crrev.com/b29ba0d062280291845dd8a5bd9dc052e439bbb5); [Mozilla bug 1515780](https://bugzilla.mozilla.org/show_bug.cgi?id=1515780)
  - An older Mozilla bug cites a 25 Hz Chrome cap, which conflicts with this and is likely outdated — [Mozilla bug 1292751](https://bugzilla.mozilla.org/show_bug.cgi?id=1292751)

### Inferences
- **On Android Chrome, prefer `AbsoluteOrientationSensor`** (quaternion, no gimbal lock, `referenceFrame:'screen'`) and fall back to `deviceorientationabsolute`. The quaternion path avoids the beta ≈ ±90° singularity. The camera looking up at the sky is close to that singularity: phone flat on its back with the screen facing down means beta ≈ ±180°, and a tilted mirror mount sits near ±90°.
  - If Euler angles are used, convert them to a quaternion immediately (Z-X'-Y'' order) and do all maths there.
- **On iOS, build absolute heading as `relative alpha + offset`, where the offset comes from `webkitCompassHeading`.** Sample the offset only when the phone is held in an orientation where the compass heading is well defined. Then let the plate solve replace it, since iOS alpha drifts. Because `webkitCompassHeading` is magnetic, the WMM declination still applies. With heading accuracy around ±10°, iOS will rely more heavily on solves.
- **Expect limited resolution for stillness detection.** The 0.1° and 0.1 deg/s precision limits, together with the "significant change" event firing, cap how finely sensors can detect stillness or small motions. PiFinder's 0.06° threshold is not achievable from rounded DeviceOrientation angles. Use a time window instead (for example, under 0.2° change over 0.5 s).
- **Pause and resume cleanly.** Pausing on hidden pages means `q_corr` should be kept but marked stale after the app is backgrounded.

### Gaps
- I found no current caniuse/MDN BCD data with exact version numbers for the Generic Sensor API on Chrome Android (it has been available since Chrome 67 by my prior knowledge, which is unverified here) or a definitive statement on iOS Safari (believed to be unsupported, unverified).
- I found no 2026 measurements of real DeviceOrientation event rates on specific phones.
- I found no source confirming whether Chrome applies the 0.1° rounding in practice.

## Detecting stillness and motion-blur limits for 1/8–1/3 s exposures

### Takeaway
PiFinder declares motion when the IMU quaternion moves more than 0.06° from the solve anchor. Browser precision limits make a windowed angular-change test more practical. Blur tolerance has to be derived from pixel scale (see the worked numbers below). No published source gives phone-specific blur limits.

### Cited Findings
- PiFinder threshold: 0.06°, measured as the angle between the anchor and the current IMU quaternion, with no separate stillness threshold — [PiFinder integrator.py](https://raw.githubusercontent.com/brickbots/PiFinder/main/python/PiFinder/integrator.py)
- PiFinder exists because frames blur during motion, and it relies on the IMU until the scope settles — [PiFinder dev arch](https://pifinder.readthedocs.io/en/main/dev_arch.html)
- devicemotion rotationRate is limited to 0.1 deg/s precision — [W3C spec](https://www.w3.org/TR/orientation-event/)

### Inferences (derived, not sourced)
- **Blur budget.** A main camera with about a 70° horizontal field across about 4000 px gives about 0.0175°/px (about 63″/px). To keep blur under about 2 px during a 1/3 s exposure, the angular rate must stay below about 0.1°/s. At 1/8 s the limit is about 0.28°/s. The 0.1 deg/s precision of `rotationRate` therefore sits right at the 1/3 s limit, so 1/3 s exposures need an image-based check as well. Two options:
  - Reject frames with elongated star PSFs.
  - Require two consecutive solves that agree.
- **Suggested trigger.**
  - Gyro magnitude below about 0.2°/s, and orientation change below about 0.1° over a 0.5–1 s window, before starting capture.
  - Abort or discard the solve if motion exceeds the threshold during the exposure, checked against the timestamped ring buffer.
  - A telescope on a Dobsonian vibrates for a short time after a push, so add a short settling delay (about 0.3–0.5 s) after motion stops. This figure is an engineering guess.

### Gaps
- I found no measured data on phone-on-telescope vibration settling times or on actual blur tolerance for tetra3/cedar centroiding.

## Mounting geometry: mapping camera attitude to the telescope axis, and mirror flips

### Takeaway
Model the mounting as fixed rotations composed with quaternions:
- sky ← sensor-frame correction (learned at each solve);
- sensor ← camera (fixed device geometry, plus a reflection for mirror mounts);
- camera ← telescope (learned once at alignment).

PiFinder does exactly this with `q_imu2cam` (a fixed table) and `q_cam2aligned` (learned from a solve paired with a user-aligned target). StarSense uses a two-step camera-to-scope alignment and a slightly tilted mirror.

### Cited Findings
- PiFinder's `q_cam2aligned = q_eq2cam.conj() * q_eq2aligned` is captured when a solve is paired with the aligned position. Prediction applies it as `q_eq2aligned = q_eq2cam * q_cam2aligned` — [imu_dead_reckoning.py](https://raw.githubusercontent.com/brickbots/PiFinder/main/python/PiFinder/pointing_model/imu_dead_reckoning.py)
- PiFinder's `q_imu2cam` comes from a lookup keyed by `screen_direction`, with no per-unit calibration. Errors are absorbed into the reference-frame quaternion at each solve — [imu_dead_reckoning.py](https://raw.githubusercontent.com/brickbots/PiFinder/main/python/PiFinder/pointing_model/imu_dead_reckoning.py)
- PiFinder's alignment asks the solver which pixel corresponds to a given position, through `alignment_command_queue` — [PiFinder dev arch](https://pifinder.readthedocs.io/en/main/dev_arch.html)
- StarSense uses a mirror tilted slightly for low-altitude objects and a "simple two-step procedure" to align the camera with the eyepiece field — [Celestron](https://www.celestron.com/pages/starsense-explorer-technology)

### Inferences
- **A mirror is an improper rotation (a reflection), so it cannot be a quaternion.** Handle it in image space by flipping the x pixel coordinates of centroids before solving, as the project rule "record flipped in the mount profile" already says. Then the solver returns a proper camera attitude for a virtual, unmirrored camera.
  - The virtual camera's boresight is the reflected boresight, so `q_device2cam` for a mirror mount is a large fixed rotation (about 90° plus the mirror tilt) rather than identity.
  - With a solve-learned full `q_corr`, small errors in that fixed rotation are absorbed automatically, as in PiFinder.
- **Store the alignment offset as a quaternion `q_cam2scope`** (or as a target pixel in the solved image, as PiFinder does with `solve_pixel`). A single pixel offset is enough for pointing. A full quaternion is also needed if the eyepiece view orientation (roll) matters.
- **Alignment with an expected accuracy.** Because the offset between camera and scope can be large (StarSense-style), any sensor-only fallback for alignment carries the full compass error. The solve-based alignment should therefore stay the default, as the project already specifies.

### Gaps
- I found no published StarSense mirror tilt angle or its exact alignment maths.
- I found no PiFinder documentation of how `q_imu2cam` values were derived for each screen direction beyond the code comment.
