// Receives device test reports from a phone during development, so they don't have
// to be copied by hand. It only listens on this PC. The phone reaches it through the
// dev server's proxy, using scripts/dev-proxy.json.
// Usage: node scripts/device-report-receiver.mjs <folder to save reports in>
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const [, , folder] = process.argv;
if (!folder) throw new Error('Usage: node scripts/device-report-receiver.mjs <folder>');

mkdirSync(folder, { recursive: true });

const PORT = 8445;
const MAX_BYTES = 30_000_000; // Sky test reports hold a few images, so anything bigger is rejected

const server = createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== '/device-report') {
    response.writeHead(404).end();
    return;
  }

  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size <= MAX_BYTES) chunks.push(chunk);
  });
  request.on('end', () => {
    try {
      if (size > MAX_BYTES) throw new Error('Too large');
      // Only valid JSON gets saved, under a name chosen here rather than by the sender.
      const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const stamp = Date.now();

      // Sky test previews are easier to use as image files, so they are saved separately.
      for (const [index, step] of (Array.isArray(report.steps) ? report.steps : []).entries()) {
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(step?.image ?? '');
        if (!match) continue;
        const imagePath = join(folder, `sky-test-${stamp}-step${index + 1}.jpg`);
        writeFileSync(imagePath, Buffer.from(match[1], 'base64'));
        step.image = imagePath;
        console.log(`Received image: ${imagePath}`);
      }

      // Sky map solve reports carry one preview and the raw frame, saved as files too.
      if (report.kind === 'live-solve') {
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(report.image ?? '');
        if (match) {
          report.image = join(folder, `live-solve-${stamp}.jpg`);
          writeFileSync(report.image, Buffer.from(match[1], 'base64'));
        }
        if (typeof report.raw === 'string') {
          // 32-bit floats, little-endian, row by row: inputs.width × inputs.height values.
          const rawPath = join(folder, `live-solve-${stamp}.f32`);
          writeFileSync(rawPath, Buffer.from(report.raw, 'base64'));
          report.raw = rawPath;
        }
        const path = join(folder, `live-solve-${stamp}.json`);
        writeFileSync(path, JSON.stringify(report, null, 1));
        console.log(`Received solve: ${path} (${report.outcome}, ${report.message})`);
        response.writeHead(200).end('OK');
        return;
      }

      const path = join(folder, `device-report-${stamp}.json`);
      writeFileSync(path, JSON.stringify(report, null, 1));
      console.log(`Received report: ${path}`);
      response.writeHead(200).end('OK');
    } catch (error) {
      console.log(`Rejected a report: ${error.message}`);
      response.writeHead(400).end('Rejected');
    }
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`Waiting for reports on port ${PORT}`));
