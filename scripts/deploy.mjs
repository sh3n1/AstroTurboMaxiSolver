// Publishes a version of the app, wherever it is hosted. See docs/deploy.md.
//
//   npm run deploy            the development copy, for trying out
//   npm run deploy -- prod    production, after typing "yes"
//
// 1. Checks the code: lint and unit tests, so a broken version is never published.
// 2. Builds it, into www/.
// 3. Runs the target's upload command from deploy.local.json, which only this computer has,
//    so the project itself names no host and no account.
// 4. If the target gives its published address, waits a moment for the new version to
//    settle, then checks the host serves the app as it needs, and that it still loads and
//    works offline there.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const CONFIG_FILE = 'deploy.local.json';
/** The everyday target. Production must be named, so it is never published by mistake. */
const DEFAULT_TARGET = 'dev';
/** Targets that ask before publishing. */
const CONFIRMED_TARGETS = ['prod'];

/** Runs a command in this folder, showing its output, and stops everything if it fails. */
function run(title, command, env = {}) {
  console.log(`\n== ${title}\n> ${command}`);
  const { status } = spawnSync(command, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (status !== 0) {
    console.error(`\n${title}: failed. Nothing more was done.`);
    process.exit(status ?? 1);
  }
}

/** Stops with a message, before anything is done. */
function stop(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(CONFIG_FILE)) stop(`No ${CONFIG_FILE}. Create one as docs/deploy.md shows, with your host's upload commands.`);

/**
 * Each target: its upload command, its published address, and headers the checks send,
 * for a copy kept private behind a login.
 * @type {Record<string, { command: string, url?: string, headers?: Record<string, string> }>}
 */
const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
const name = process.argv[2] ?? DEFAULT_TARGET;
const target = config[name];
if (!target?.command) {
  stop(`${CONFIG_FILE} has no "${name}" target with a "command". Targets there: ${Object.keys(config).join(', ')}.`);
}

if (CONFIRMED_TARGETS.includes(name)) {
  if (!process.stdin.isTTY) stop(`Publishing to ${name} needs someone to type "yes", in a terminal.`);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`Publish to ${name}${target.url ? `, ${target.url}` : ''}? Type yes: `);
  prompt.close();
  if (answer.trim().toLowerCase() !== 'yes') stop('Not published.');
}

run('Lint', 'npm run lint');
run('Unit tests', 'npm run test:unit');
run('Build', 'npm run build');
// The command gets the folder to upload, as DEPLOY_DIR, so it needs no path of its own.
run(`Upload to ${name}`, target.command, { DEPLOY_DIR: 'www' });

/**
 * How long to wait after the upload before checking the published copy. For a few seconds
 * a host can still serve some files of the previous version, which made the checks fail
 * once and pass moments later.
 */
const SETTLE_SECONDS = 30;

if (target.url) {
  // The checks pass the target's headers on with every request: see check-deploy.mjs.
  const checkEnv = { DEPLOY_HEADERS: JSON.stringify(target.headers ?? {}) };
  console.log(`\n== Waiting ${SETTLE_SECONDS} s for the new version to settle`);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_SECONDS * 1000));
  run('Hosting checks', `node scripts/check-deploy.mjs ${target.url}`, checkEnv);
  run('Published app works offline', 'npx playwright test --project=published', {
    ...checkEnv,
    DEPLOY_URL: target.url,
  });
} else {
  console.log(`\nNo "url" for ${name} in ${CONFIG_FILE}, so the published copy wasn't checked.`);
}
console.log(`\nPublished to ${name}.`);
