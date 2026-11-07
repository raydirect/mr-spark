/**
 * The publisher: does the address the format promises match the address this server answers?
 *
 * `$schema` is a required `const`, so `src/publish.js` is not a convenience — it is the thing that makes
 * the promise in every document testable. These tests assert the promise rather than the plumbing: the
 * URLs the server publishes are exactly the URLs the published schemas *name themselves as*, the
 * cache-control on a versioned file is a claim about permanence, and the server refuses to publish bytes
 * the generator disagrees with.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';import { once } from 'node:events';

import { PUBLISHED, resolveName, headersFor, expectedUrls, drift, indexPage, main } from '../src/publish.js';
import { SCHEMA_HOST } from '../src/formats/generate.js';
import { VERSION } from '../src/formats/common.js';

test('the published set is the generated set, and nothing else is reachable', () => {
  assert.deepEqual(PUBLISHED, [...PUBLISHED].sort(), 'the route table is deterministic, like the bytes it serves');
  for (const name of PUBLISHED) assert.equal(resolveName(`/schema/${name}`), name);
  // A whitelist, so these are not "guard cases" to remember — they are simply not in the set.
  for (const path of [
    '/schema/package.json',
    '/schema//index.json',
    '/schema/./index.json',
    '/schema/../src/publish.js',
    '/schema/%2e%2e/package.json',
    '/schema/scene-0.2.json',
    '/',
    '/ir-0.1.json',
  ]) {
    assert.equal(resolveName(path), null, `${path} must not resolve`);
  }
});

test('the addresses a document may name are exactly the ones the schemas claim to be', () => {
  // The whole point of the publisher. If a published `$id` ever disagreed with the URL in a document's
  // `$schema`, editors would validate against one file and authors would be writing against another,
  // which is the two-resolvers failure with a network hop added.
  const published = new Set(expectedUrls(new URL(SCHEMA_HOST).origin));
  // `common` is in the list because a document never names it but every schema `$ref`s it: an editor
  // that resolves a reference over the network has to land on a URL this server answers.
  assert.deepEqual([...published].sort(), ['common', 'motion', 'scene', 'settings'].map((kind) => `${SCHEMA_HOST}/${kind}-${VERSION}.json`).sort());
  for (const kind of ['scene', 'motion', 'settings']) {
    const schema = JSON.parse(readArtifact(`schema/${kind}-${VERSION}.json`));
    assert.equal(schema.$id, `${SCHEMA_HOST}/${kind}-${VERSION}.json`, `${kind}'s $id must be the address it is served from`);
    assert.equal(schema.properties.$schema.const, schema.$id, "a document's required $schema and the schema's own $id are the same string");
  }
  assert.ok(![...published].some((url) => url.endsWith('index.json')), 'the catalogue is not a vocabulary to validate against');

  // No dangling reference: every `$ref` that names the public host must be a file that host publishes.
  const text = PUBLISHED.filter((n) => n.endsWith('.json')).map((n) => readArtifact(`schema/${n}`)).join('');
  for (const ref of new Set([...text.matchAll(/"\$ref":\s*"([^"]+)"/g)].map((m) => m[1]))) {
    if (!ref.startsWith(`${SCHEMA_HOST}/`)) continue;
    assert.ok(published.has(ref), `a published schema $refs ${ref}, which this server does not serve`);
  }
});

test('the headers say what they mean', () => {
  // `immutable` on a versioned file name is a promise that the bytes behind that name never change — the
  // property that lets a document written in 2027 still validate. Asserting it here is what keeps the
  // promise from being quietly widened to a file that gets rewritten (index.json).
  for (const name of PUBLISHED.filter((n) => n !== 'index.json')) {
    assert.match(headersFor(name)['cache-control'], /immutable/, name);
    assert.equal(headersFor(name)['access-control-allow-origin'], '*', name);
  }
  assert.equal(headersFor('index.json')['cache-control'], 'no-store');
  assert.match(headersFor('scene-0.1.json')['content-type'], /^application\/schema\+json/);
  assert.match(headersFor('index.json')['content-type'], /^application\/json/);
  assert.match(headersFor('types-0.1.d.ts')['content-type'], /^text\/plain/, 'a .d.ts is not JSON, and lying about it breaks nothing so far as a browser is concerned and everything for an editor');
});

test('the server refuses to publish a schema the generator disagrees with', () => {
  // Same fact `npm run formats:check` asserts, but the publisher cannot rely on someone having run it.
  assert.deepEqual(drift(), []);
});

test('the directory page lists what exists, and is generated from the same set', () => {
  const page = indexPage();
  for (const name of PUBLISHED) assert.ok(page.includes(`/schema/${name}`), `${name} missing from the index`);
  assert.match(page, /generated from/i);
  assert.ok(page.includes('src/formats/'), 'the page tells a reader these bytes are generated');
  assert.match(page, new RegExp(`format ${VERSION}`), 'the page says which format version it is describing');
});

test('serve, then verify: the bytes over the wire equal the bytes in the repository', async () => {
  const child = spawn(process.execPath, ['src/publish.js', 'serve', '--port', '0'], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server never reported a socket; output:\n${out}`)), 8000);
      child.stdout.on('data', (chunk) => {
        out += chunk;
        const found = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out);
        if (found) {
          clearTimeout(timer);
          resolve(`http://127.0.0.1:${found[1]}`);
        }
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited early with ${code}; output:\n${out}`));
      });
    });

    assert.equal(await main(['verify', '--base', url]), 0, 'every published file round-trips byte for byte');

    const res = await fetch(`${url}/schema/scene-${VERSION}.json`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/schema\+json/);
    assert.deepEqual(await res.json(), JSON.parse(readArtifact(`schema/scene-${VERSION}.json`)), 'parsed identically, so the bytes are not being mangled in transit');

    const missing = await fetch(`${url}/schema/scene-9.9.json`);
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /this server publishes/, 'a 404 that lists the alternatives is how a typo in $schema gets fixed in one round trip');

    const landing = await fetch(`${url}/`);
    assert.match(landing.headers.get('content-type'), /text\/html/);
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await once(child, 'exit');
  }
});

test('verify reports an unreachable server instead of passing quietly', async () => {
  // The silence this guard exists for: a nightly parity job that cannot connect must not print a green
  // line, and it must name the address it tried.
  const code = await main(['verify', '--base', 'http://127.0.0.1:1']);
  assert.equal(code, 1);
});

test('urls mode can point at the loopback origin, for the hosts-file test', () => {
  assert.deepEqual(
    expectedUrls('http://127.0.0.1:8788'),
    ['common', 'motion', 'scene', 'settings'].map((kind) => `http://127.0.0.1:8788/schema/${kind}-${VERSION}.json`).sort(),
  );
});

function readArtifact(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
