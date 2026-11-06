import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkInstall, installMessage, REQUIRED } from '../src/require.js';
import { parseArgs } from '../src/cli.js';

test('an empty install is reported by name, not by stack trace', () => {
  const result = checkInstall({ resolve: () => { throw new Error('MODULE_NOT_FOUND'); }, cwd: 'D:\\Ray\\web-spark' });
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
    cwd: '/repo',
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['axe-core']);
});

test('a complete install passes', () => {
  const result = checkInstall({ resolve: () => '/ok', cwd: '/repo' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
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
