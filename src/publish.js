/**
 * Serving `schema/` — the address that every document names.
 *
 * `$schema` is a required `const` in all three formats (`src/formats/common.js`), so the string
 * `https://mr-spark.pages.dev/schema/scene-0.1.json` is not a comment about where the schema lives: it is
 * part of what a valid document *is*, and every document ever written will carry it. An address that is
 * part of a format has to be reachable and permanent, which is why `docs/DOCUMENTS.md` treats it as
 * frozen. This file does not decide the permanent host — it makes the address *testable* today, on a
 * machine you control, so the day someone does decide, there is a server that already answers correctly
 * and a check that proves it.
 *
 * Three modes:
 *
 * - `serve`  a static server for the generated set, with a startup guard that refuses to publish bytes
 *            the generator disagrees with (`npm run formats:generate` fixes it). A publishing tool that
 *            will serve stale or hand-edited schemas is worse than no publishing tool.
 * - `verify` fetch a running server and diff every byte against `schema/` — the parity check a permanent
 *            host will need in a nightly job, runnable now against `127.0.0.1`.
 * - `urls`   print the exact addresses documents will ask for, for `/etc/hosts` (or the Windows hosts
 *            file) experiments. See docs/HOSTING.md.
 *
 * Deliberate limits, because a local server invites the wrong conclusion: it is reachable from your
 * network, not from the internet. A document you email to someone else will still name an address that
 * answers for you and nobody else. That is what the "no public URL" row in `PHASE-PLAN §9` is about, and
 * no amount of `netsh` changes it.
 */

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

import { render, readCommitted, SCHEMA_HOST } from './formats/generate.js';
import { VERSION } from './formats/common.js';
import { NAME } from './config/brand.js';

/**
 * The files the generator owns, as bare names. The server's whole surface, so a request cannot name
 * anything else — and everything under `schema/` is addressed at `/schema/<name>`, which is why the
 * generator's `schema/` prefixes are stripped here rather than repeated in every route.
 */
export const PUBLISHED = Object.keys(render())
  .map((path) => path.split('/').pop())
  .sort();

/**
 * Content types, and why two of them are not `application/json`.
 *
 * `application/schema+json` is the media type a JSON Schema-aware editor looks for, and it is the
 * difference between VS Code validating a document and shrugging. `types-*.d.ts` is not JSON at all.
 * `index.json` is the one file that is *about* versions rather than being one, so it must not be
 * cached forever while the versioned files can be.
 */
const MEDIA = {
  json: 'application/schema+json; charset=utf-8',
  'd.ts': 'text/plain; charset=utf-8',
};

const CACHE = {
  'index.json': 'no-store',
};

export function headersFor(name) {
  // `index.json` is a catalogue *of* schemas, not a schema — announcing it as one would invite an editor
  // to try to validate it.
  const type =
    name === 'index.json'
      ? 'application/json; charset=utf-8'
      : name.endsWith('.d.ts')
        ? MEDIA['d.ts']
        : MEDIA.json;
  return {
    'content-type': type,
    // A versioned file name is a promise that its bytes never change. `immutable` is how an editor or a
    // proxy is allowed to stop asking, and it is the property that makes a published schema safe to
    // depend on for a decade.
    'cache-control': CACHE[name] ?? 'public, max-age=31536000, immutable',
    // Editors fetch this URL from a different origin than the document's. Without this they fail, and
    // the failure looks like a broken schema.
    'access-control-allow-origin': '*',
  };
}

/**
 * Route a request path to a published file name, or `null`.
 *
 * A whitelist built from the generator's own output, not a pattern matched against user input: the
 * server can only ever answer with a file this build produced, which is also what makes `..` and
 * friends a non-event rather than something to remember to guard.
 */
export function resolveName(pathname) {
  const path = decodeURIComponent(pathname.split('?')[0]);
  if (path === '/' || path === '/schema' || path === '/schema/') return null;
  const name = path.startsWith('/schema/') ? path.slice('/schema/'.length) : null;
  if (!name || name.includes('/') || name.includes('\\') || name.includes('\0')) return null;
  return PUBLISHED.includes(name) ? name : null;
}

/**
 * The paths that mean "show me what is here".
 *
 * `/schema/index.html` is in the list because `bundle()` writes that file. Cloudflare Pages answers it and
 * this server used to 404 it, which made one path mean two things depending on which of the two was
 * running — and a check that probes it to ask "is this host routing at all" would have failed locally
 * while passing in production. One tree, one set of answers, so the rehearsal and the deployment agree.
 */
const INDEX_PATHS = ['/', '/schema', '/schema/', '/schema/index.html'];

/** The directory page, so a human who pastes the URL learns something instead of meeting a 404. */
export function indexPage() {
  const rows = PUBLISHED.map((name) => {
    const bytes = readCommitted(`schema/${name}`) ?? '';
    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    return `<li><a href="/schema/${name}">${name}</a> · ${bytes.length} bytes · sha256:${digest}</li>`;
  }).join('\n      ');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${NAME} schema ${VERSION}</title>
    <style>body{font:15px/1.6 ui-sans-serif,system-ui;max-width:46rem;padding:2rem;margin:auto}
      code{background:#f4f4f5;padding:.1em .3em}li{margin:.35em 0}</style>
  </head>
  <body>
    <h1>${NAME} schemas · format ${VERSION}</h1>
    <p>
      Generated from <code>src/formats/</code> — the committed files are artifacts, not sources. Every
      ${NAME} document names one of these URLs in its required <code>$schema</code> field, so the
      address is part of the format and does not move.
    </p>
    <ul>
      ${rows}
    </ul>
    <p>Serve it yourself with <code>npm run schema:serve</code>; see <code>docs/HOSTING.md</code>.</p>
  </body>
</html>
`;
}

/**
 * Does `schema/` on disk match what the generator produces right now?
 *
 * The check `npm run formats:check` already does, expressed as a refusal to publish. Repeated here on
 * purpose rather than shelled out to, so the server's guarantee does not depend on a script someone ran
 * at some point.
 */
/**
 * The `_headers` file that Cloudflare Pages and Netlify both read from the deploy root.
 *
 * A static host is the right answer for a schema set precisely because there is nothing to run: no
 * process to keep alive, no TLS to renew. The cost is that the media types and cache policy this
 * project treats as interface (`docs/HOSTING.md` §5) have to be written down in a file instead of in
 * code, which is how they get out of sync. So they are derived here, from `headersFor` — the same
 * function the local publisher answers with — and `schema:verify --base <deployed>` checks the result
 * over the wire. One definition, two hosts, one test that proves they agree.
 */
export function headersFile(names = PUBLISHED) {
  const block = (path, headers) => [path, ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`)].join('\n');
  const blocks = [];
  // The human-facing index is the only path that is allowed to change without a version bump, so it
  // is cached like `index.json` and served as HTML.
  blocks.push(block('/schema/index.html', {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  }));
  for (const name of names) blocks.push(block(`/schema/${name}`, headersFor(name)));
  // Applies to everything, including paths a client invents. `nosniff` is the one header a static host
  // should always send, and it does not conflict with the exact-path blocks above.
  blocks.push(block('/*', { 'x-content-type-options': 'nosniff' }));
  return `${blocks.join('\n\n')}\n`;
}

/**
 * Write the deployable tree: `schema/…` exactly as committed, plus the index page and `_headers`.
 *
 * Nothing here is generated from a template — `drift()` has already run by the time this is called, so
 * the bytes on disk are the bytes the generator claims. That is the whole property: `dist/` can be
 * uploaded by hand from a laptop or by CI from a runner and be identical either way.
 */
export function bundle(outDir) {
  const dir = join(outDir, 'schema');
  mkdirSync(dir, { recursive: true });
  const written = [];
  for (const name of PUBLISHED) {
    const body = readCommitted(`schema/${name}`) ?? '';
    writeFileSync(join(dir, name), body);
    written.push(`schema/${name}`);
  }
  writeFileSync(join(dir, 'index.html'), indexPage());
  written.push('schema/index.html');
  writeFileSync(join(outDir, '_headers'), headersFile());
  written.push('_headers');
  return written;
}

export function drift() {
  const files = render();
  return Object.entries(files)
    .filter(([path, text]) => readCommitted(path) !== text)
    .map(([path]) => path);
}

/**
 * Every address a *document* may name, for hosts-file setup.
 *
 * `index.json` is excluded even though it is published: it is a catalogue of versions, not a vocabulary
 * a document validates against, so listing it here would imply authors should put it in `$schema`.
 */
export function expectedUrls(origin = new URL(SCHEMA_HOST).origin) {
  return PUBLISHED.filter((name) => name.endsWith(`-${VERSION}.json`)).map((name) => `${origin}/schema/${name}`);
}

export function requestHandler({ onNotFound } = {}) {
  return function handle(req, res) {
    const pathname = new URL(req.url, 'http://placeholder').pathname;
    if (INDEX_PATHS.includes(pathname)) {
      // Someone pastes the bare URL to ask "is anything home". A 404 there answers nothing; this answers
      // with the catalogue, and costs one branch.
      const page = indexPage();
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(page),
      });
      res.end(req.method === 'HEAD' ? undefined : page);
      return;
    }
    const name = resolveName(pathname);
    if (!name) {
      const wanted = req.url.split('?')[0];
      // A refusal that names what exists, because the common case is a typo in a document's `$schema`
      // and a bare 404 sends the author to search.
      const body = onNotFound
        ? onNotFound(wanted)
        : `no published schema at ${wanted}\nthis server publishes:\n${PUBLISHED.map((n) => `  /schema/${n}`).join('\n')}\n`;
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    const bytes = readCommitted(`schema/${name}`);
    if (bytes === null) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`schema/${name} is in the generated set but not on disk — run \`npm run formats:generate\`\n`);
      return;
    }
    res.writeHead(200, { ...headersFor(name), 'content-length': Buffer.byteLength(bytes) });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  };
}

/** LAN addresses worth printing, so "open it from the phone" works without guessing an IP. */
export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

async function fetchBytes(url) {
  const res = await fetch(url);
  return { status: res.status, text: await res.text(), headers: res.headers };
}

/**
 * Does a deployed host keep the contract, or only serve the bytes?
 *
 * Deliberately a check of properties rather than exact strings: a CDN is allowed to add `public` and a
 * `max-age` in front of `immutable`, and that is not a defect worth a red build. Dropping `immutable`,
 * answering `application/json` where an editor probes for `application/schema+json`, or forgetting the
 * CORS header all are: each one makes a schema that is byte-perfect in the repository fail for a
 * stranger. See docs/HOSTING.md §5.3.
 */
export function headerVerdict(name, headers) {
  const want = headersFor(name);
  const problems = [];
  const gotType = (headers.get('content-type') ?? '').split(';')[0].trim();
  if (gotType !== want['content-type'].split(';')[0]) {
    problems.push(`serves ${gotType || 'no content-type'}, documents expect ${want['content-type'].split(';')[0]}`);
  }
  const gotCache = headers.get('cache-control') ?? '';
  for (const directive of ['immutable', 'no-store']) {
    if (want['cache-control'].includes(directive) !== gotCache.includes(directive)) {
      problems.push(`cache-control must say "${directive}" for this path (got "${gotCache || 'nothing'}")`);
    }
  }
  if ((headers.get('access-control-allow-origin') ?? '') !== '*') {
    problems.push('access-control-allow-origin must be * — editors validate documents on file:// and https://');
  }
  return problems;
}

export async function main(argv = process.argv.slice(2)) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args.set(key, next && !next.startsWith('--') ? (i += 1, next) : true);
  }
  const mode = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'serve';

  if (mode === 'urls') {
    const origin = args.get('origin') ? String(args.get('origin')) : new URL(SCHEMA_HOST).origin;
    for (const url of expectedUrls(origin)) process.stdout.write(`${url}\n`);
    return 0;
  }

  const outOfDate = drift();
  if (outOfDate.length && !args.get('allow-drift')) {
    process.stderr.write(
      `spark: refusing to publish a schema the generator disagrees with (${outOfDate.join(', ')}).\n` +
        '  run `npm run formats:generate` and commit the result — schema/ is a projection of src/formats/.\n' +
        '  (--allow-drift serves the bytes on disk anyway, for when you are mid-edit.)\n',
    );
    return 2;
  }

  if (mode === 'verify') {
    const base = String(args.get('base') ?? 'http://127.0.0.1:8788').replace(/\/$/, '');
    const bad = [];
    for (const name of PUBLISHED) {
      const url = `${base}/schema/${name}`;
      let res;
      try {
        res = await fetchBytes(url);
      } catch (error) {
        bad.push([name, `unreachable: ${error.cause?.code ?? error.message}`]);
        continue;
      }
      if (res.status !== 200) bad.push([name, `HTTP ${res.status}`]);
      else if (res.text !== readCommitted(`schema/${name}`)) bad.push([name, 'bytes differ from the repository']);
      else if (!args.get('bytes-only')) {
        for (const problem of headerVerdict(name, res.headers)) bad.push([name, problem]);
      }
    }
    for (const [name, why] of bad) process.stdout.write(`  ✗ ${name} — ${why}\n`);
    // "did not match" and "did not answer" are different problems, and the nightly message is the only
    // place either gets read. Calling a 403 a mismatch sends someone to diff bytes that were never served.
    //
    // Every count in the summary is per *file*. One file answering with the wrong media type is three
    // findings, and counting findings where the sentence says files printed "17 of 6 files did not
    // verify" — which sends the reader looking for a seventh file instead of at the headers.
    const silent = new Set(
      bad.filter(([, why]) => /unreachable|HTTP [3-9]\d\d/.test(why)).map(([name]) => name),
    );
    const failed = new Set(bad.map(([name]) => name));
    const parts = [];
    if (silent.size > 0) parts.push(`${silent.size} did not answer`);
    if (failed.size - silent.size > 0) parts.push(`${failed.size - silent.size} did not match`);
    const summary =
      bad.length === 0
        ? `  ✓ ${PUBLISHED.length} files at ${base} are byte-identical to schema/ in this checkout${
            args.get('bytes-only') ? ' (headers not checked)' : ', with the media types and cache policy §5 requires'
          }`
        : `  ${failed.size} of ${PUBLISHED.length} files did not verify at ${base}: ${parts.join(', ')}` +
          ` — ${bad.length} finding(s) across them`;
    process.stdout.write(`${summary}\n`);
    return bad.length ? 1 : 0;
  }

  if (mode === 'bundle') {
    const out = String(args.get('out') ?? 'dist');
    const written = bundle(out);
    process.stdout.write(
      `  wrote ${written.length} files under ${out}/ for a static host (Cloudflare Pages, Netlify, or any\n` +
      `  directory a server can serve): the committed schema/ bytes, the index page, and _headers.\n` +
      `  deploy it, then check what answers: node src/publish.js verify --base ${new URL(SCHEMA_HOST).origin}\n`,
    );
    return 0;
  }

  if (mode !== 'serve') {
    process.stderr.write(`spark: unknown publish mode "${mode}" — expected serve, verify, urls or bundle\n`);
    return 2;
  }

  // TLS is not decoration. The address inside the format is `https://`, so a server reached over plain
  // http has proved routing and not the promise; with the hosts-file trick an editor refuses a
  // non-TLS answer outright. `mkcert` writes a locally-trusted certificate — docs/HOSTING.md, step 3.
  // Reaching this path at all is tested: docs/HOSTING.md step 3 is the same command line.
  const certPath = args.get('cert') ? String(args.get('cert')) : null;
  const tls = certPath ? { cert: readFileSync(certPath), key: readFileSync(String(args.get('key'))) } : null;
  const port = Number(args.get('port') ?? (tls ? 443 : 8788));
  const host = String(args.get('host') ?? '0.0.0.0');
  const scheme = tls ? 'https' : 'http';
  const handle = requestHandler({
    onNotFound: (wanted) =>
      `no published schema at ${wanted}\n\nthis server publishes:\n${PUBLISHED.map((n) => `  ${SCHEMA_HOST}/${n}`).join('\n')}\n\n` +
      `(your document's $schema must match one of those addresses exactly — it is a const, not a hint.)\n`,
  });
  // `node:http`'s createServer also takes an options object and will happily ignore `cert`/`key` —
  // which is how this printed `https://` while speaking plain HTTP, an error the first TLS smoke test
  // caught as ERR_SSL_WRONG_VERSION_NUMBER. The secure server is a different module.
  const server = tls ? createSecureServer(tls, handle) : createServer(handle);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const actual = server.address().port;
  process.stdout.write(
    `  serving ${PUBLISHED.length} generated files · schema format ${VERSION} · ${scheme}${tls ? '' : ' (no --cert: routing only, not the const URL)'}\n` +
      `  ${scheme}://127.0.0.1:${actual}/schema/\n` +
      lanAddresses().map((ip) => `  ${scheme}://${ip}:${actual}/schema/\n`).join('') +
      (outOfDate.length ? `  ⚠ serving bytes that differ from the generator (${outOfDate.join(', ')})\n` : '') +
      `  check it: node src/publish.js verify --base ${scheme}://127.0.0.1:${actual}\n`,
  );
  // Block, or the promise resolves and the CLI exits with the socket half-open. `listen` does not keep
  // an async main alive on its own, which is exactly how the first version of this command printed a
  // URL and then refused connections.
  await new Promise((resolve) => {
    const stop = () => resolve(undefined);
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  });
  server.close();
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  main().then((code) => process.exit(code));
}
