# Browser compute options for star detection and plate solving (as of November 2026)

Scope: whether WebGPU, WebAssembly (SIMD, threads), WebGL, OffscreenCanvas, WebCodecs and ImageCapture can speed up AstroTurboMaxiSolver's pipeline. The pipeline is a TypeScript Web Worker working on 1080x1920 8-bit greyscale frames: 32 px block median background, MAD noise, bilinear background subtraction, threshold, connected components, then a hash or index pattern solver. Targets are Android Chrome first and iOS Safari 17+.

## 1. WebGPU availability and suitability

### Takeaway
WebGPU now works by default on Chrome for Android (121+, Android 12+, Qualcomm or ARM GPUs) and on Safari in iOS 26 and later, but not on iOS 17 or 18. It can only be an optional fast path with a CPU fallback. Its gain for our workload is uncertain because there are no published mobile readback numbers, and connected components does not map well to the GPU.

### Cited Findings
- On Android, WebGPU needs Chrome 121 or later, Android 12 or later, and a Qualcomm or ARM GPU. Safari supports it on macOS Tahoe 26, iOS 26, iPadOS 26 and visionOS 26. Firefox has it on Windows (141+) and Apple-silicon macOS (145+), while Android is still "in progress". The post is dated 25 November 2025 — [web.dev: WebGPU is now supported in major browsers](https://web.dev/blog/webgpu-supported-major-browsers)
- Every iOS browser uses WebKit, so WebGPU on iOS 26 also covers third-party iOS browsers — [AppDeveloperMagazine: WebGPU in iOS 26](https://appdevelopermagazine.com/webgpu-in-ios-26/)
- Chrome 121 turned WebGPU on by default for Android 12+ devices with Qualcomm and ARM GPUs, with wider device support planned. Timestamp queries can time compute passes, but the values are coarsened unless a developer flag is on — [Chrome for Developers: New in WebGPU 121](https://developer.chrome.com/blog/new-in-webgpu-121)
- There is a public micro-benchmark that times `mapAsync` readback (MAP_READ buffer) against WebGL `readPixels`, but it publishes no mobile results — [austinEng gist](https://gist.github.com/austinEng/846910477361fa240ddf2cea047514cd)
- I found no published Android benchmark of `mapAsync` readback latency, Adreno against Mali, or a full WebGPU image pipeline (search on 2026-11-07).

### Inferences
- **Fits the GPU well:** per-pixel background subtraction, thresholding, and per-block reductions (one workgroup per 32x32 block gives 1,024 pixels, which fits a workgroup well).
- **Fits poorly:**
  - An exact median per block needs a histogram per workgroup. With 8-bit data, a 256-bin histogram in workgroup shared memory gives an exact median and MAD, so this is doable.
  - Connected-component labelling needs iterative label propagation or union-find with atomics. That means several passes, and mobile GPUs pay a lot per dispatch.
- **Practical split:** do background, noise and threshold on the GPU, read back a small list of candidate pixels or a downsampled mask, and do connected components on the CPU. Reading back a full 2 MP frame each time would eat into the gain.
- **iOS 17 and 18 have no WebGPU**, and some Android devices (older OS versions, other GPU vendors) are also left out. A full CPU path is needed whatever we do.
- **WebGL2 is the older alternative.** It is widely supported (assumed from general knowledge; not re-verified for this note), and fragment shaders can do the per-pixel passes. It has no compute shaders or shared memory, though, so medians and connected components are awkward. Readback is a synchronous `readPixels` that stalls. It is not worth building a separate WebGL path.

### Gaps
- Real `mapAsync` readback latency on mid-range Adreno and Mali phones, and on iPhones running iOS 26.
- Whether WebGPU works in a Web Worker on iOS Safari 26. Not checked.

## 2. WebAssembly SIMD and threads

### Takeaway
Fixed-width WASM SIMD works on every target, including Safari 16.4+, with no deployment cost. It is the cheapest large gain for per-pixel and block work. Threads also work everywhere, but they need cross-origin isolation through COOP and COEP headers, which adds friction for the PWA and especially for iOS.

### Cited Findings
- Browser support from WebAssembly feature data:

  | Feature | Chrome | Firefox | Safari |
  | --- | --- | --- | --- |
  | Fixed-width SIMD | 91 | 89 | 16.4 |
  | Threads and atomics | 74 | 79 | 14.1 |
  | Relaxed SIMD | 114 | 145 | Behind a flag only |
  | Memory64 | 133 | 134 | Behind a flag only |

  — [WebAssembly/website features.json](https://raw.githubusercontent.com/WebAssembly/website/main/features.json); runtime detection with [wasm-feature-detect](https://github.com/GoogleChromeLabs/wasm-feature-detect)
- TensorFlow.js found that SIMD made plain WASM 1.7–4.5x faster in desktop Chrome on ML models such as BlazeFace, and that multithreading added more. These are neural-network kernels, not image filters, measured in 2020 — [TensorFlow blog, Sept 2020](https://blog.tensorflow.org/2020/09/supercharging-tensorflowjs-webassembly.html)
- An OpenCV.js Google Summer of Code project measured speedups over a scalar WASM build on a kernel benchmark (Chrome 78, Emscripten 1.38.42, desktop, 2019):

  | Build | Speedup |
  | --- | --- |
  | Threads only | about 4.5x |
  | SIMD only | about 9.5x |
  | Threads and SIMD | about 30x |

  The face-recognition demo went from 3 to 26 FPS — [GSoC OpenCV.js report gist](https://gist.github.com/Wenzhao-Xiang/8636e239c20e0eda839833f9d363828e)
- SharedArrayBuffer, which WASM threads need, is only available when the page is cross-origin isolated:
  - The usual headers are `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. If the host can't set headers, a service-worker shim such as coi-serviceworker can add them — [dev.to practical guide](https://dev.to/osidorkin/fix-sharedarraybuffer-is-not-defined-a-practical-guide-to-cross-origin-isolation-1neh); [Zoom developer blog](https://developers.zoom.us/blog/sharedarraybuffer-overview-and-implementation)
  - `COEP: credentialless` is reported as unreliable on Safari and iOS — [Shen.ai troubleshooting](https://developer.shen.ai/getting-started/web-troubleshooting). One unofficial code comment says iOS Safari supports it from 17.5, which I could not confirm.
- The "Prism" README claims a 2–5x gain from Rayon multithreading for webcam filters. It is not a reproducible benchmark — [GitHub Prism](https://github.com/DivyamSamarwal/Prism)

### Inferences
- **What we control:**
  - The app serves its own static files, and AGENTS.md says HTTPS hosting comes later, so COOP and COEP headers can be set in the dev server and on the future host.
  - The headers mainly get in the way of cross-origin resources: map tiles, CDN fonts, and so on. AstroTurboMaxiSolver bundles its data locally, so the risk is low.
- **Gains to expect on our pipeline:**
  - The 9.5x and 30x figures are best cases for desktop kernels.
  - Our block median and connected components branch heavily and access memory irregularly. A realistic expectation is 1.5–3x from plain WASM plus SIMD over well-tuned TypeScript, and less where the JS is already tight typed-array code.
  - Threads could add up to roughly the number of big cores, about 2–4x, on the parallel passes.
  - These estimates are mine. No phone benchmark for this workload was found.
- **Toolchains:** Rust compiles with `wasm-pack` or `wasm-bindgen` (`-C target-feature=+simd128`). C or C++ compiles with Emscripten (`-msimd128`, `-pthread`). Both are permissively licensed (assumed from general knowledge; not re-verified for this note).

### Gaps
- No published WASM SIMD against JS benchmark for image filters on phones was found.
- Whether iOS 17 Safari supports COEP credentialless is not confirmed by Apple or WebKit.

## 3. Candidate libraries and licences

### Takeaway
cedar-solve is Apache-2.0 and safe as a reference to port. cedar-detect is NOT Apache-2.0: it is under the Functional Source License (FSL-1.1-MIT), whose non-compete clause is risky for a commercial star-finding app, so use it as a design reference only unless the author grants permission. SEP is LGPLv3, which is a poor fit for a statically linked WASM build in a closed app. OpenCV.js is Apache-2.0 but large, about 6.4 MB of WASM for a default build.

### Cited Findings
- **cedar-detect**
  - What it does: local thresholding, noise-based detection threshold, hot-pixel filtering, rejection of satellite and aircraft streaks, and handling of the Moon and streetlights.
  - Speed: "On a Raspberry Pi 4B, the execution time per 1M image pixels is usually less than 10ms". Our 2 MP frame would therefore take about 20 ms on a Pi 4.
  - No WASM build is mentioned; it ships as Rust plus a gRPC server — [GitHub smroid/cedar-detect](https://github.com/smroid/cedar-detect)
- **cedar-detect licence:** "Copyright 2025 Steven Rosenthal … Functional Source License, Version 1.1, MIT Future License".
  - A "Competing Use" is offering it in a commercial product or service that substitutes for it or "offers the same or substantially similar functionality as the Software".
  - It changes to MIT on an anniversary of each release. The fetched text said "fifth anniversary"; the standard FSL template uses two years, so read the file directly to confirm — [cedar-detect LICENSE.md](https://raw.githubusercontent.com/smroid/cedar-detect/main/LICENSE.md)
- **cedar-solve:** Apache-2.0, a fork of esa/tetra3 ("A fast lost-in-space plate solver for star trackers"), written in Python. No Rust or WASM port is mentioned — [GitHub smroid/cedar-solve](https://github.com/smroid/cedar-solve)
- **SEP:** code derived from Source Extractor is LGPLv3, and `src/overlap.h` (from photutils) is BSD-3. Development has moved to sep-developers/sep (1.4.0 and later) — [PyPI sep](https://pypi.org/project/sep/); [sep-pjw docs](https://sep-pjw.readthedocs.io/en/latest/)
- **OpenCV.js:** an example build was a 170 kB .js file plus a 6.43 MB .wasm file. Inlining the WASM as base64 makes it about 32–33% larger. The build offers `--threads` and `--simd` options — [OpenCV PR #23344](https://github.com/opencv/opencv/pull/23344/files/6c763e1ea509404465e79e0556a0d02b7921b8e3); [GSoC gist](https://gist.github.com/Wenzhao-Xiang/8636e239c20e0eda839833f9d363828e)
- **stardetect** (crates.io) is a different Rust star-detection crate (wavelet, multiscale). Its Cargo.toml lists Apache-2.0 — [lib.rs stardetect](https://lib.rs/crates/stardetect)

### Inferences
- **cedar-detect:** AstroTurboMaxiSolver is a commercial-style closed app that detects stars, so it could plausibly count as "substantially similar functionality". Treat cedar-detect as off-limits for bundling without written permission or until its MIT change date. Its published algorithm ideas (local threshold, noise estimate, hot-pixel and streak rejection) can still inform our own code. This is not legal advice.
- **cedar-solve or tetra3 (Apache-2.0):** the right base for a TypeScript or Rust-to-WASM port of the solver. Keep the Apache NOTICE and attribution.
- **SEP:** LGPLv3 in a static WASM bundle would require letting users relink, which is impractical. Avoid it.
- **astrometry.net and its WASM ports** are GPL, as AGENTS.md already notes, so they are unusable.
- **OpenCV.js:** connectedComponentsWithStats and medianBlur would help, but 6+ MB is a lot for a PWA. A custom minimal OpenCV build would be needed. Our pipeline is small enough that a focused Rust or C kernel of about 100 kB is simpler.

### Gaps
- The exact FSL change period for cedar-detect versions. Whether the author offers other licensing terms.
- Whether stardetect is maintained, and how fast it is.
- Minimal OpenCV.js build sizes with only the imgproc module.

## 4. Faster frame acquisition

### Takeaway
On Chrome, and on Safari 18+, MediaStreamTrackProcessor in a worker gives VideoFrames directly. `VideoFrame.copyTo()` with no `format` option returns the native planar layout, usually NV12 or I420, so the Y plane is already our greyscale image, with no RGBA conversion and no canvas. On iOS 17 we need a canvas fallback. ImageCapture.grabFrame only reached Safari in 26.

### Cited Findings
- **MediaStreamTrackProcessor:**
  - Limited availability, and only in Dedicated Web Workers in the standard version. Browsers differ in which global they expose it on — [MDN MediaStreamTrackProcessor](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrackProcessor)
  - Shipped in Safari 18, worker-only and video-only (audio needs Safari 26) — [Mozilla WebRTC blog](https://blog.mozilla.org/webrtc/unbundling-mediastreamtrackprocessor-and-videotrackgenerator/); [WebKit bug 241124](https://bugs.webkit.org/show_bug.cgi?id=241124)
  - VideoFrame arrived in Safari 16.4, and MediaStreamTrackProcessor in Safari 18+. Firefox does not support it — [OpenReplay WebCodecs guide](https://blog.openreplay.com/real-time-video-processing-webcodecs-api/)
- **VideoFrame.copyTo(destination, {rect, layout, format, colorSpace}):**
  - If `format` is omitted, the frame's own `format` is used. The `format` option only accepts RGBA, RGBX, BGRA and BGRX, so you can't ask for a YUV conversion.
  - `rect` limits the copy to a region.
  - Baseline 2024 and available in workers — [MDN VideoFrame.copyTo](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame/copyTo)
- **ImageCapture.grabFrame:** supported since Chrome 59 and Safari or iOS 26.0, not in Firefox — [caniuse](https://caniuse.com/mdn-api_imagecapture_grabframe)

### Inferences
- **Chrome Android and Safari 18+:** transfer the track to the worker, read VideoFrames, `copyTo` an ArrayBuffer, and take the Y plane using the returned layout's offset and stride. This drops the drawImage, getImageData and RGBA-to-grey steps, which saves several ms per frame and avoids main-thread work. Close each frame with `frame.close()` right away, or the camera stalls.
  - Check that `frame.format` is NV12 or I420. Some platforms may give RGBA or BGRA, so keep a luminance-from-RGB fallback.
  - Using `rect` to copy only the region of interest, such as a centre crop, lowers cost further.
- **iOS 17:** keep the current path of video to OffscreenCanvas or a canvas, then getImageData. OffscreenCanvas 2D works in workers on Safari 16.4+ (assumed from general knowledge; not re-verified for this note).
- **Exposure and ISO:** ImageCapture and track constraints (exposureMode, exposureTime, iso) work in Chrome Android. Whether iOS Safari honours manual exposure was not confirmed here. Assume it does not and degrade gracefully.

### Gaps
- Which VideoFrame pixel format Android Chrome and iOS Safari actually deliver from a camera track. It needs measuring on device.
- Whether iOS Safari applies manual exposure constraints. Not verified in this session.

## 5. Published benchmarks

### Takeaway
No credible published benchmarks exist for WASM SIMD against JS, or WebGPU against CPU, for image processing on phones. The only figures are desktop ones from 2019–2020, so we have to measure ourselves.

### Cited Findings
- Desktop OpenCV.js kernel speedups: threads 4.45x, SIMD 9.46x, both 29.84x over scalar WASM (2019) — [GSoC gist](https://gist.github.com/Wenzhao-Xiang/8636e239c20e0eda839833f9d363828e)
- TensorFlow.js SIMD speedup of 1.7–4.5x over plain WASM, on desktop — [TensorFlow blog](https://blog.tensorflow.org/2020/09/supercharging-tensorflowjs-webassembly.html)
- cedar-detect takes under 10 ms per megapixel on a Raspberry Pi 4B, as native Rust — [cedar-detect README](https://github.com/smroid/cedar-detect)

### Inferences
- A Pi 4 (Cortex-A72) is slower than a 2022+ mid-range phone's big cores. A tuned native-style detector should therefore reach about 20 ms or less per 2 MP frame natively, and maybe 30–60 ms in WASM SIMD (WASM is often quoted at 1.2–2x native, which I did not re-verify here).
- Our current 150–300 ms per frame on desktop suggests large algorithmic headroom. It is worth profiling first: per-block median by sorting, versus a histogram or quickselect, and connected components on the whole image, versus only on above-threshold pixels.

### Gaps
- Phone measurements of all of the above, using the device-report tooling already in the repo (`npm run phone:reports`).

## 6. Recommendation for a 2–4x gain with the least complexity

### Takeaway
In order: (1) fix the algorithm in TypeScript, (2) take the Y plane from MediaStreamTrackProcessor and VideoFrame, (3) move hot kernels to single-threaded Rust or C compiled to WASM with SIMD. Leave WASM threads (COOP and COEP) and WebGPU for later, as optional extras behind feature detection.

### Cited Findings
- WASM SIMD is supported on every target, including iOS 16.4+, with no header requirements — [features.json](https://raw.githubusercontent.com/WebAssembly/website/main/features.json)
- Threads need cross-origin isolation, and Safari handling of COEP credentialless is reported as inconsistent — [Shen.ai troubleshooting](https://developer.shen.ai/getting-started/web-troubleshooting)
- WebGPU is missing on iOS 17 and 18 and limited to some Android devices — [web.dev](https://web.dev/blog/webgpu-supported-major-browsers)
- Zero-copy luminance acquisition is available on Chrome and Safari 18+ — [MDN copyTo](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame/copyTo); [Mozilla blog](https://blog.mozilla.org/webrtc/unbundling-mediastreamtrackprocessor-and-videotrackgenerator/)

### Inferences
1. **Algorithm in TypeScript, no new dependencies:**
   - Compute block median and MAD with a 256-bin histogram per 32x32 block. For 8-bit data this takes linear time with no sort.
   - Run connected components only from seed pixels above the threshold, as a single-pass scan with union-find.
   - Optionally detect on a 2x binned frame first. This is probably the biggest gain for the least risk.
2. **Acquisition:** read frames with MediaStreamTrackProcessor and take the Y plane through `copyTo`. Fall back to OffscreenCanvas and getImageData on iOS 17 and where the format isn't YUV.
3. **WASM SIMD kernel:** port background, noise, subtraction, threshold and connected components to a small Rust crate using `wasm-bindgen` and `+simd128`, or AssemblyScript (Apache-2.0, assumed from general knowledge; not re-verified for this note). Run it single-threaded in the existing worker. Expect roughly 1.5–3x over optimised TypeScript.
4. **Later:**
   - WASM threads, once the HTTPS host sends COOP and COEP.
   - A WebGPU pre-pass for subtraction and thresholding on iOS 26+ and supported Android, keeping connected components on the CPU.
   - Feature-detect both, and measure each on real phones before adopting.
5. **Solver:** port cedar-solve or tetra3 (Apache-2.0). Do not bundle cedar-detect (FSL non-compete) or SEP (LGPLv3).
6. **Dependencies:** each of steps 3–5 adds a dependency or toolchain, and AGENTS.md requires asking first.

### Gaps
- None of the speedup estimates above was measured on a phone. Benchmark them on the Honor Magic5 Pro and on an iPhone running iOS 17 before committing.
