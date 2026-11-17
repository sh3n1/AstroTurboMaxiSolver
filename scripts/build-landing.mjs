// Copies the landing page into the build, next to the app. The landing is plain HTML and
// CSS in src/landing/, served at the site's root; the app is built into www/app/, served
// at /app/. See docs/deploy.md for how the two are hosted together.

import { cpSync, existsSync } from 'node:fs';

if (!existsSync('www/app/index.html')) {
  console.error('No app build in www/app/: run "ng build" first.');
  process.exit(1);
}
cpSync('src/landing', 'www', { recursive: true });
console.log('Landing copied to www/');
