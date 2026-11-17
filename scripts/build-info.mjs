// Writes which version this build is, for Settings to show: the app's version, the git
// commit, whether there were changes not yet committed, and when it was built. With
// development versions published, it tells at a glance whether a phone has the new one.
//
// Runs before every production build (see "build" in package.json). The file is generated,
// so git ignores it, and without it, as under the dev server, Settings says "Development".

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/** A git command's answer, or empty where git isn't available. */
function git(args) {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const info = {
  version,
  commit: git('rev-parse --short HEAD'),
  // Built with changes not committed: such a build can't be traced back exactly.
  changed: git('status --porcelain') !== '',
  builtAt: new Date().toISOString(),
};
writeFileSync('src/assets/build-info.json', `${JSON.stringify(info, null, 2)}\n`);
console.log(`Build ${info.version} ${info.commit}${info.changed ? ' with changes' : ''}`);
