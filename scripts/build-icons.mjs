// Draws the app's icon, a road into the night sky with the app's guidance chevrons leading to
// a star, and writes every size the app and the landing page use. The drawing is the SVG
// below; Playwright's Chromium, already used for the end-to-end tests, turns it into PNGs.
// Run it after changing the drawing: node scripts/build-icons.mjs

import { chromium } from 'playwright';

/** The icon's colours: the app's background, its guidance blue and its star colour. */
const NIGHT_TOP = '#16204a';
const NIGHT_BOTTOM = '#0b1026';
const ROAD = '#1d2752';
const ROAD_EDGE = '#3a4880';
const GUIDANCE = '#a9cbff';
const STAR = '#fff3c4';

/** A four-point star, as the app draws them, centred on x, y with points r away. */
function star(x, y, r) {
  return `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
}

/**
 * The icon on a 100 × 100 square.
 * @param rounded Rounded corners, with transparent corners outside them, for browsers that
 *   show the icon as it is. Square for iOS and for "maskable" icons, which the phone shapes.
 * @param scale How large the chevrons and the star are. Maskable icons need them smaller,
 *   inside the middle 80 %, which every phone's shape keeps.
 */
function svg({ rounded, scale }) {
  const shape = rounded ? '<rect width="100" height="100" rx="22"/>' : '<rect width="100" height="100"/>';
  const chevron = (y, half, rise, width, opacity) =>
    `<path d="M${50 - half} ${y}L50 ${y - rise}L${50 + half} ${y}" stroke="${GUIDANCE}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NIGHT_TOP}"/><stop offset="1" stop-color="${NIGHT_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="glow">
      <stop offset="0" stop-color="${STAR}" stop-opacity="0.5"/><stop offset="1" stop-color="${STAR}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="shape">${shape}</clipPath>
  </defs>
  <g clip-path="url(#shape)">
    <rect width="100" height="100" fill="url(#sky)"/>
    <g fill="${STAR}" opacity="0.6">
      <circle cx="16" cy="18" r="1"/><circle cx="84" cy="14" r="0.9"/><circle cx="10" cy="44" r="0.8"/>
      <circle cx="90" cy="40" r="0.8"/><circle cx="27" cy="31" r="0.6"/><circle cx="73" cy="29" r="0.6"/>
    </g>
    <!-- The road, from the bottom edge up to the horizon under the star. -->
    <polygon points="12,100 88,100 55,46 45,46" fill="${ROAD}"/>
    <path d="M12 100L45 46M88 100L55 46" stroke="${ROAD_EDGE}" stroke-width="1.6"/>
    <g transform="translate(50 52) scale(${scale}) translate(-50 -52)">
      ${chevron(91, 15, 11, 6, 1)}
      ${chevron(75, 10.5, 7.5, 5, 0.75)}
      ${chevron(62, 6.5, 4.5, 4, 0.5)}
      <circle cx="50" cy="27" r="20" fill="url(#glow)"/>
      <path d="${star(50, 27, 14)}" fill="${STAR}"/>
    </g>
  </g>
</svg>`;
}

/** Every icon file: where it goes, its size in pixels, and its kind. */
const ICONS = [
  { file: 'public/icons/icon-192x192.png', size: 192, rounded: true, scale: 1 },
  { file: 'public/icons/icon-512x512.png', size: 512, rounded: true, scale: 1 },
  { file: 'public/icons/maskable-192x192.png', size: 192, rounded: false, scale: 0.78 },
  { file: 'public/icons/maskable-512x512.png', size: 512, rounded: false, scale: 0.78 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, rounded: false, scale: 0.9 },
  { file: 'src/assets/icon/favicon.png', size: 64, rounded: true, scale: 1 },
];

/**
 * iPhones show a launch screen while an installed web app opens, but don't make one from the
 * manifest as Android does: without these, a white flash, bad at night. One per iPhone screen,
 * portrait, as CSS width × height at its pixel ratio. src/index.html links each one with a
 * media query for its screen; keep the two lists together.
 */
const LAUNCH_SCREENS = [
  { width: 375, height: 667, ratio: 2 }, // iPhone SE (2nd and 3rd), 8
  { width: 414, height: 736, ratio: 3 }, // iPhone 8 Plus
  { width: 375, height: 812, ratio: 3 }, // iPhone X, XS, 11 Pro, 12 mini, 13 mini
  { width: 414, height: 896, ratio: 2 }, // iPhone XR, 11
  { width: 414, height: 896, ratio: 3 }, // iPhone XS Max, 11 Pro Max
  { width: 390, height: 844, ratio: 3 }, // iPhone 12, 13, 14, 12 Pro, 13 Pro
  { width: 428, height: 926, ratio: 3 }, // iPhone 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 393, height: 852, ratio: 3 }, // iPhone 14 Pro, 15, 15 Pro, 16
  { width: 430, height: 932, ratio: 3 }, // iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 402, height: 874, ratio: 3 }, // iPhone 16 Pro
  { width: 440, height: 956, ratio: 3 }, // iPhone 16 Pro Max
];

/** A launch screen's file name, by its size in pixels. */
export function launchScreenFile({ width, height, ratio }) {
  return `splash/launch-${width * ratio}x${height * ratio}.png`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  const drawing = svg(icon).replace('width="100" height="100">', `width="${icon.size}" height="${icon.size}">`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${drawing}</body></html>`);
  await page.locator('svg').screenshot({ path: icon.file, omitBackground: true });
  console.log(`${icon.file} (${icon.size} px)`);
}

// The launch screens: the icon in the middle of the app's background, a third of the width.
for (const screen of LAUNCH_SCREENS) {
  await page.setViewportSize({ width: screen.width, height: screen.height });
  const side = Math.round(screen.width / 3);
  const drawing = svg({ rounded: true, scale: 1 }).replace(
    'width="100" height="100">',
    `width="${side}" height="${side}">`,
  );
  await page.setContent(
    `<html><body style="margin:0;height:100vh;display:grid;place-items:center;background:${NIGHT_BOTTOM}">${drawing}</body></html>`,
  );
  const file = `public/${launchScreenFile(screen)}`;
  // At the phone's own pixel ratio, so it is sharp on its screen.
  const shot = await browser.newPage({
    viewport: { width: screen.width, height: screen.height },
    deviceScaleFactor: screen.ratio,
  });
  await shot.setContent(await page.content());
  await shot.screenshot({ path: file });
  await shot.close();
  console.log(file);
}
await browser.close();

// The tags for src/index.html, printed so they can be pasted in when the list changes.
console.log('\nFor src/index.html:');
for (const screen of LAUNCH_SCREENS) {
  console.log(
    `    <link rel="apple-touch-startup-image" href="${launchScreenFile(screen)}" media="(device-width: ${screen.width}px) and (device-height: ${screen.height}px) and (-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait)" />`,
  );
}
