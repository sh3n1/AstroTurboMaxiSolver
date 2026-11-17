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

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  const drawing = svg(icon).replace('width="100" height="100">', `width="${icon.size}" height="${icon.size}">`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${drawing}</body></html>`);
  await page.locator('svg').screenshot({ path: icon.file, omitBackground: true });
  console.log(`${icon.file} (${icon.size} px)`);
}
await browser.close();
