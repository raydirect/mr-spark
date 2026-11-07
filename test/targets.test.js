/**
 * Turning arguments into pages.
 *
 * These tests are mostly about the *keys*, because a key is what a committed baseline is made of: if
 * `spark baseline .` on a laptop and `spark baseline dist` in CI disagree about what a page is called, every
 * page in the repo reads as new and the gate becomes a wall nobody can pass. The second theme is refusal — an
 * empty directory, a doubled argument and a command that cannot take a set have to say so rather than report
 * zero findings, which is the same sentence from the outside.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { isUrl, resolveTargets, urlKey } from '../src/targets.js';
import { snapshot } from '../src/baseline.js';

const HTML = '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>hi</h1></main></body></html>';

/** A temp tree, a callback that gets it, and cleanup on both paths. */
async function withTree(build, body) {
  const dir = mkdtempSync(join(tmpdir(), 'mrspark-targets-'));
  const write = (rel, html = HTML) => {
    const path = join(dir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html);
  };
  try {
    build(write);
    return await body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const keysOf = (inputs) => async (cwd) => (await resolveTargets(inputs, { cwd })).pages.map((entry) => entry.key);

test('a page is named by its path from the directory the command ran in', async () => {
  await withTree(
    (write) => {
      write('index.html');
      write('elsewhere.html');
      write('sub/here.html');
    },
    async (dir) => {
      assert.deepEqual(await keysOf(['index.html'])(dir), ['index.html']);
      const { root } = await resolveTargets(['index.html'], { cwd: dir });
      assert.equal(root, dir, 'the frame is the working directory, not the argument');
      // From inside a subdirectory, the same file on disk is a different page as far as the baseline is
      // concerned — which is why `docs/GATE.md` tells a team to run both commands from the project root, and
      // why a run that overlaps its baseline on nothing refuses to report a pass.
      assert.deepEqual(await keysOf(['../index.html'])(join(dir, 'sub')), ['index.html']);
      // A page above the run root has no repo-relative name worth committing, so it is named by its own.
      assert.deepEqual(await keysOf(['../elsewhere.html'])(join(dir, 'sub')), ['elsewhere.html']);
    }
  );
});

test('a directory argument lists every page under it, sorted, and names them from the run root', async () => {
  await withTree(
    (write) => {
      write('dist/index.html');
      write('dist/blog/a.html');
      write('dist/blog/deep/b.htm');
      write('dist/notes.xhtml');
      write('dist/readme.md');
      write('about.html');
    },
    async (dir) => {
      assert.deepEqual(await keysOf(['dist'])(dir), [
        'dist/blog/a.html',
        'dist/blog/deep/b.htm',
        'dist/index.html',
        'dist/notes.xhtml',
      ]);
      assert.deepEqual(await keysOf(['.'])(dir), [
        'about.html',
        'dist/blog/a.html',
        'dist/blog/deep/b.htm',
        'dist/index.html',
        'dist/notes.xhtml',
      ]);
      // Two of those four pages, named directly, keep the names the whole directory gave them.
      assert.deepEqual(await keysOf(['dist/blog/a.html', 'dist/index.html'])(dir), [
        'dist/blog/a.html',
        'dist/index.html',
      ]);
    }
  );
});

test('the names do not move when the list grows, which is the whole point', async () => {
  await withTree(
    (write) => {
      write('dist/a.html');
      write('dist/b.html');
      write('index.html');
    },
    async (dir) => {
      const every = await keysOf(['dist'])(dir);
      // The set a directory names, and the same pages named one at a time, are the same keys. Keying off a
      // common ancestor instead would call `a.html` by one name here and another there, and a page that
      // changes its name is a page the baseline never saw — reported as new, and never as a regression.
      assert.deepEqual(await keysOf(['dist/a.html', 'dist/b.html'])(dir), every);
      assert.deepEqual(await keysOf(['dist/a.html'])(dir), ['dist/a.html']);
      assert.deepEqual(await keysOf(['.'])(dir), ['dist/a.html', 'dist/b.html', 'index.html']);
      assert.deepEqual(
        await keysOf(['dist/a.html', 'dist/a.html'])(dir),
        ['dist/a.html'],
        'repeating an argument changes nothing, including the key'
      );
    }
  );
});

test('the walk skips what a build gate must not reach into', async () => {
  await withTree(
    (write) => {
      write('index.html');
      write('node_modules/pkg/page.html');
      write('spark-report.html');
      write('.spark/report.html');
      write('.spark-cache/page.html');
      write('.git/worktree.html');
    },
    async (dir) => {
      assert.deepEqual(await keysOf(['.'])(dir), ['index.html']);
      // A report the tool wrote is not a page the project ships: gating it would mean a finding changing a
      // file whose only content is findings. Explicitly passed, it is audited — `--out spark-report.html`
      // names a page, and the default merely leaves one lying around.
      assert.deepEqual(await keysOf(['spark-report.html'])(dir), ['spark-report.html']);
    }
  );
});

test('two arguments that reach one file is a mistake we say out loud', async () => {
  await withTree(
    (write) => {
      write('dist/a.html');
      write('dist/b.html');
    },
    async (dir) => {
      await assert.rejects(
        () => resolveTargets(['dist', 'dist/a.html'], { cwd: dir }),
        /two arguments name the same page \("dist\/a\.html"\)/,
        'silently dropping one of them would drop half of that page history, and the key in the file'
      );
      const both = await resolveTargets(['dist', 'dist'], { cwd: dir });
      assert.equal(both.pages.length, 2, 'the same *argument* twice is one page, and not an error');
    }
  );
});

test('one URL has one key, whichever way it was reached', () => {
  // `snapshot()` derives a page's key itself when a caller hands it an IR with no explicit page, and the CLI
  // derives it from the argument. Two spellings of that rule is how a committed baseline ends up never
  // matching the run that produced it, so both call this function and this test says so.
  assert.equal(urlKey('https://example.com/'), 'example.com/');
  assert.equal(urlKey('https://example.com/a/'), 'example.com/a', 'a trailing slash is the same page');
  assert.equal(urlKey('http://example.com/a?x=1'), 'example.com/a', 'a query is not a different document here');
  const ir = { findings: [], provenance: { uri: 'https://example.com/', source: 'url', kind: 'document' } };
  assert.equal(snapshot({ ir, scores: {}, hash: 'h' }).pages[0].page, urlKey('https://example.com/'));
});

test('a directory with no pages in it is an error, not a clean build', async () => {
  await withTree(
    (write) => {
      write('emptyhere/style.css', 'body{}');
    },
    async (dir) => {
      await assert.rejects(() => resolveTargets(['emptyhere'], { cwd: dir }), /no HTML found/i);
      await assert.rejects(() => resolveTargets(['nothing-here.html'], { cwd: dir }), /no such file/i);
    }
  );
});

test('a URL keys on host plus pathname, and can share a run with files', async () => {
  await withTree((write) => write('index.html'), async (dir) => {
    assert.ok(isUrl('https://example.com/a'));
    assert.ok(isUrl('http://example.com/a'), 'plain http is a fetch, not a path that happens to contain ://');
    assert.equal(isUrl('example.com/a'), false, 'a path that mentions a domain is still a path');
    assert.equal(isUrl('https://example.com/https:/x'), true, 'and a path that starts like a URL is a URL');
    assert.deepEqual(await keysOf(['https://example.com/', 'http://other.test/deep/page.html'])(dir), [
      'example.com/',
      'other.test/deep/page.html',
    ]);
    assert.deepEqual(await keysOf(['index.html', 'https://example.com/a'])(dir), ['example.com/a', 'index.html']);
    assert.deepEqual(
      await keysOf(['https://example.com/a/', 'https://example.com/a'])(dir),
      ['example.com/a'],
      'a trailing slash is the same page, so it is the same key'
    );
  });
});
