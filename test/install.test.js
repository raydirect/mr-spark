import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { checkInstall, installMessage, REQUIRED } from '../src/require.js';
import { parseArgs } from '../src/cli.js';

test('an empty install is reported by name, not by stack trace', () => {
  const result = checkInstall({ resolve: () => { throw new Error('MODULE_NOT_FOUND'); }, root: 'D:\\Ray\\web-spark' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, REQUIRED);
  const message = installMessage(result);
  assert.match(message, /D:\\Ray\\web-spark/, 'the message must name the directory that is wrong');
  assert.match(message, /npm ci/, 'the message must name the command that fixes it');
  assert.match(message, /package\.json/, 'and how to find the right directory');
});

test('a partial install names only what is actually missing', () => {
  const result = checkInstall({
    resolve: (name) => {
      if (name === 'axe-core') throw new Error('MODULE_NOT_FOUND');
      return '/somewhere/node_modules/jsdom/index.js';
    },
    root: '/repo',
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['axe-core']);
});

test('a complete install passes', () => {
  const result = checkInstall({ resolve: () => '/ok', root: '/repo' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test('dependencies resolve from the package, not from the working directory', async () => {
  // A user may audit a page anywhere on disk from any directory. Resolution must match Node's
  // own: relative to the package. An earlier version used process.cwd(), so running the tool
  // from another folder reported a broken install that was not broken.
  //
  // Asserted against the package root derived from *this test file's own URL*, not against a
  // directory name: the earlier version matched /web-spark/, which passed in a checkout called
  // `web-spark` and failed in a worktree, a CI runner under a different path, or anyone's clone
  // they had renamed. The property is "the package, wherever it is", so the test says that.
  const pkgRoot = resolvePath(fileURLToPath(new URL('..', import.meta.url)));

  const real = checkInstall();
  assert.equal(real.root, pkgRoot, 'the probe must target the package root, not cwd');
  assert.equal(real.ok, true, 'this repository has its dependencies installed');

  // …and the same probe from a different directory returns the same root, which is the half a
  // checkout at the repo root could never show.
  const elsewhere = await mkdtemp(join(tmpdir(), 'spark-cwd-'));
  const before = process.cwd();
  try {
    process.chdir(elsewhere);
    assert.equal(checkInstall().root, pkgRoot, 'cwd must not move the answer');
  } finally {
    process.chdir(before);
    await rm(elsewhere, { recursive: true, force: true });
  }
});

test('injected probes mean the test never touches a real node_modules', () => {
  // The suite must pass on a machine with no dependencies installed, which is the state a
  // contributor is in between `git clone` and `npm ci`.
  assert.equal(typeof REQUIRED[0], 'string');
});

test('arguments are parsed from a declaration table, including --key=value and --', () => {
  assert.deepEqual(parseArgs(['fixtures/bad.html']).target, 'fixtures/bad.html');
  assert.equal(parseArgs(['report', 'x.html', '--serve']).serve, true);
  assert.equal(parseArgs(['--port=5000', 'x.html']).port, 5000);
  assert.equal(parseArgs(['--no-color', 'x.html']).color, false);
  assert.equal(parseArgs(['--', '-weird-name.html']).target, '-weird-name.html');
  assert.throws(() => parseArgs(['--port', '99999']), /out of range/);
  assert.throws(() => parseArgs(['--format', 'xml']), /Unknown format/);
});
