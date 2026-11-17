// Serves the production build for end-to-end tests, the way the site must be hosted (see
// docs/deploy.md): the landing page at the root, and the app at /app/, where any address
// with no file of its own gets the app's index.html.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve('www');
const port = Number(process.argv[2] ?? 4211);
const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
};

/** The file for a path inside the build, or null if there is none. */
function fileFor(pathname) {
  const file = join(root, pathname);
  if (!file.startsWith(root + sep) && file !== root) return null;
  if (existsSync(file) && statSync(file).isFile()) return file;
  // A folder's address gets its index.html.
  const index = join(file, 'index.html');
  return pathname.endsWith('/') && existsSync(index) ? index : null;
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (pathname === '/app') {
    response.writeHead(301, { location: '/app/' });
    response.end();
    return;
  }
  let file = fileFor(pathname);
  let status = 200;
  if (!file && pathname.startsWith('/app/')) file = join(root, 'app', 'index.html');
  if (!file) {
    status = 404;
    file = fileFor('/404.html');
  }
  if (!file) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(status, { 'content-type': contentTypes[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(port);
