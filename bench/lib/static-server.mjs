// Minimal zero-dep static file server. Serves `rootDir` mounted at `urlBase`
// (e.g. "/EmbeddedChartsDemos/"), which is how the production vite builds in
// this repo expect their assets to be addressed.

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

export function startServer({ rootDir, urlBase = '/' }) {
  rootDir = path.resolve(rootDir);
  const base = urlBase.endsWith('/') ? urlBase : urlBase + '/';

  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    // Strip the mount base.
    if (base !== '/' && urlPath.startsWith(base)) urlPath = '/' + urlPath.slice(base.length);
    else if (base !== '/' && urlPath === base.slice(0, -1)) urlPath = '/';
    if (urlPath.endsWith('/')) urlPath += 'index.html';

    const filePath = path.join(rootDir, path.normalize(urlPath));
    if (!filePath.startsWith(rootDir)) { res.writeHead(403); res.end('forbidden'); return; }

    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        port,
        base,
        url: (p) => `http://127.0.0.1:${port}${base}${p.replace(/^\//, '')}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
