/**
 * A tiny report server. Local only, no framework, no auth, no cache.
 *
 * Its whole job is to make the report reachable at a URL so the reader experience can be
 * judged honestly — `--serve` for local review today, and the same HTML is what a hosted
 * report would return later. Binding to 0.0.0.0 keeps it usable from a container or a
 * sandbox preview without changing any code.
 */

import { createServer } from 'node:http';

import { DEFAULTS } from '../config/constants.js';

export const HOST = DEFAULTS.host;

export function serveReport({ html, port = DEFAULTS.port, host = HOST, target = '' }) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.url === '/' || req.url?.startsWith('/r')) {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          // Self-contained document: no external requests are ever needed.
          'content-security-policy':
            "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        });
        res.end(html);
        return;
      }
      if (req.url === '/healthz') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok\n');
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`not found — the report is at /\n`);
    });

    server.on('error', reject);
    server.listen(port, host, () => {
      resolve({
        port: server.address()?.port ?? port,
        url: `http://localhost:${server.address()?.port ?? port}/`,
        // Close hard: a lingering keep-alive socket should not keep a CLI process alive.
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
        target,
      });
    });
  });
}
