// Publishes a development version of the app, wherever it is hosted. See docs/deploy.md.
//
//   npm run deploy
//
// 1. Checks the code: lint and unit tests, so a broken version is never published.
// 2. Builds it, into www/.
// 3. Runs the upload command from deploy.local.json, which only this computer has, so the
//    project itself names no host and no account.
// 4. If that file gives the published address, waits a moment for the new version to settle,
//    then checks the host serves the app as it needs, and that it still loads and works
//    offline there.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const CONFIG_FILE = 'deploy.local.json';

/** Runs a command in this folder, showing its output, and stops everything if it fails. */
function run(title, command, env = {}) {
  console.log(`\n== ${title}\n> ${command}`);
  const { status } = spawnSync(command, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (status !== 0) {
    console.error(`\n${title}: failed. Nothing more was done.`);
    process.exit(status ?? 1);
  }
}

if (!existsSync(CONFIG_FILE)) {
  console.error(`No ${CONFIG_FILE}. Create one as docs/deploy.md shows, with your host's upload command.`);
  process.exit(1);
}
/** @type {{ command: string, url?: string }} */
const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
if (!config.command) {
  console.error(`${CONFIG_FILE} has no "command" to upload the build with.`);
  process.exit(1);
}

run('Lint', 'npm run lint');
run('Unit tests', 'npm run test:unit');
run('Build', 'npm run build');
// The command gets the folder to upload, as DEPLOY_DIR, so it needs no path of its own.
run('Upload', config.command, { DEPLOY_DIR: 'www' });

/**
 * How long to wait after the upload before checking the published copy. For a few seconds
 * a host can still serve some files of the previous version, which made the checks fail
 * once and pass moments later.
 */
const SETTLE_SECONDS = 30;

if (config.url) {
  console.log(`
== Waiting ${SETTLE_SECONDS} s for the new version to settle`);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_SECONDS * 1000));
  run('Hosting checks', `node scripts/check-deploy.mjs ${config.url}`);
  run('Published app works offline', 'npx playwright test --project=published', { DEPLOY_URL: config.url });
} else {
  console.log(`\nNo "url" in ${CONFIG_FILE}, so the published copy wasn't checked.`);
}
console.log('\nPublished.');
