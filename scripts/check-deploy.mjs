// Checks that a published copy of the app is hosted the way it needs, whoever hosts it.
// See docs/deploy.md for why each rule matters.
//
//   node scripts/check-deploy.mjs https://example.org
//
// Prints each check, and ends with an error if any failed.

const base = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!base) {
  console.error('Usage: node scripts/check-deploy.mjs <published address>');
  process.exit(2);
}

/** Longest a file that names the current version may be kept by browsers, in seconds. */
const MAX_FRESH_SECONDS = 600;
let failures = 0;

function report(ok, text) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${text}`);
  if (!ok) failures++;
}

/** Whether a Cache-Control header lets browsers reuse the file without asking for a while. */
function cachedTooLong(header) {
  if (!header) return false;
  const value = header.toLowerCase();
  if (value.includes('no-cache') || value.includes('no-store') || value.includes('must-revalidate')) return false;
  const maxAge = /max-age=(\d+)/.exec(value);
  return !!maxAge && Number(maxAge[1]) > MAX_FRESH_SECONDS;
}

async function get(path) {
  return fetch(`${base}${path}`, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
}

try {
  report(base.startsWith('https://'), 'Served over HTTPS, which the camera and sensors need');

  const home = await get('/');
  const homeText = await home.text();
  report(home.ok && homeText.includes('<app-root'), 'The app loads at the address');

  // A page opened or reloaded at an address inside the app must get the app too.
  const deep = await get('/tabs/sky');
  report(deep.ok && (await deep.text()).includes('<app-root'), 'Addresses inside the app, such as /tabs/sky, load it');

  // The service worker downloads /index.html to keep the app for offline use, and a redirect
  // to / leaves it without one.
  const index = await fetch(`${base}/index.html`, { redirect: 'manual', headers: { 'cache-control': 'no-cache' } });
  report(index.status === 200, `/index.html is served as itself, not redirected (${index.status})`);

  // These name the current version: kept too long, phones would miss new versions.
  for (const path of ['/index.html', '/ngsw.json', '/ngsw-worker.js']) {
    const response = await get(path);
    const header = response.headers.get('cache-control');
    report(response.ok && !cachedTooLong(header), `${path} is not cached for long (${header ?? 'no Cache-Control'})`);
  }

  // Only the build may be published, never the project's files: the code is closed source.
  // With the app's addresses all loading index.html, a published file shows by its content.
  let sourceShown = false;
  for (const path of ['/package.json', '/src/app/app.routes.ts', '/app/app.routes.ts', '/AGENTS.md']) {
    const text = await (await get(path)).text();
    if (/"devDependencies"|export const routes|# AGENTS\.md/.test(text)) sourceShown = true;
  }
  report(!sourceShown, "The project's own files, such as its source code, are not published");

  const manifest = await get('/manifest.webmanifest');
  const type = manifest.headers.get('content-type') ?? '';
  report(manifest.ok && /json/.test(type), `The web app manifest is served as JSON (${type || 'no type'})`);

  const info = await get('/assets/build-info.json');
  if (info.ok) {
    const { version, commit, builtAt } = await info.json();
    console.log(`\n  Published: version ${version}, commit ${commit}, built ${builtAt}`);
  } else {
    report(false, 'The build says which version it is (assets/build-info.json)');
  }
} catch (error) {
  report(false, `Could not reach ${base}: ${error.message}`);
}

// An exit code rather than process.exit(), which on Windows can crash Node while fetch is
// still closing its connections.
if (failures > 0) {
  console.error(`\n${failures} check(s) failed. See docs/deploy.md.`);
  process.exitCode = 1;
} else {
  console.log('\nThe host serves the app as it needs.');
}
