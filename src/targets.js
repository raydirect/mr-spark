/**
 * Turning what a person typed into a list of pages to audit.
 *
 * `spark check dist/index.html` and `spark check dist` are the same command; one lists a page, the other
 * lists every page under a directory. That is the difference between "we gate this page" and "we gate this
 * repo", and Phase 2's exit criterion — a repo with 400 findings goes green in one commit — is not
 * reachable without it.
 *
 * Two rules here are load-bearing for the baseline file, not for the CLI:
 *
 *  - **A page's key is its path relative to the directory the command was run in**, POSIX-separated, never
 *    absolute. That frame is chosen for one reason: it does not move when the argument list does. Keying off
 *    the common ancestor of the arguments would name a page `a.html` under `spark check dist`, `dist/a.html`
 *    under `spark check .`, and — worst of all — `a.html` again for `spark check dist/a.html`, so the "go look
 *    at one page" command a failed gate tells you to run would read as a page nobody had ever baselined. One
 *    spelling, `from the project root`, keys every page identically however many of them you name, and the
 *    project root is where `.spark-baseline.json` and `spark.config.json` are looked up anyway.
 *    A path outside that directory keys on its basename, so nothing ever writes a `../..` chain or a
 *    username into a committed file.
 *  - **The list is sorted and de-duplicated.** A directory walk is a sibling list `readdir` does not
 *    guarantee in the same order across filesystems, so an unsorted run would order its findings differently
 *    on a Mac and on Linux, and the gate output would diff for no reason.
 *
 * Directories skip `node_modules`, `.spark-cache`, `.spark` and any dot-directory: not a policy about what
 * counts as project code, just a refusal to fetch a thousand third-party pages because someone passed `.`.
 * An ignore file is a separate decision and is still open — `docs/GATE.md` says so rather than pretending.
 */

import { readdir, stat } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';

import { copy } from './config/copy.js';
import { DEFAULTS } from './config/constants.js';

const HTML = /\.(?:html?|xhtml)$/i;
const SKIP = new Set(['node_modules', '.spark-cache', '.spark']);

/** Keys use `/` on every platform, so one committed file is stable from a Windows checkout too. */
function toKey(path, root) {
  const rel = relative(root, path).split(sep).join('/');
  // A page outside the directory the command ran in has no repo-relative name worth writing down, and its
  // basename beats a `../../../` chain in a file people commit.
  return rel && !rel.startsWith('..') ? rel : basename(path);
}

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new Error(copy('errors.cannotRead', basename(dir)));
  }
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    // The HTML report `spark report` writes by default, if it is sitting where the walk can see it. A tool
    // that gates its own output is a tool that fails its own build: the report is made of findings, so a new
    // finding would change a file that is itself a page, and the baseline would record a number that only
    // exists because the baseline exists. A report pointed at `--out docs/report.html` is the user's page
    // and is audited like one — only our own default name is exempt, and only by name.
    if (entry.name === DEFAULTS.out) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else if (HTML.test(entry.name)) out.push(path);
  }
}

/** Is this argument a URL rather than a path? */
export function isUrl(input) {
  return /^https?:\/\//i.test(input);
}

/**
 * The key for a fetched page: host plus pathname, because `/index.html` on two hosts is not the same page
 * and a baseline must not blur them.
 *
 * Exported because `src/baseline.js` derives the same key when a caller hands it an IR with no explicit page
 * — two spellings of one rule is how a committed file ends up never matching the run it came from.
 */
export function urlKey(input) {
  const url = new URL(input);
  return `${url.host}${url.pathname.replace(/\/$/, '') || '/'}`;
}

/**
 * Resolve every argument into `{ pages, root }`, `pages` sorted by key.
 *
 * Each page is `{ key, path }`, or `{ key, url }` for a fetched page — its key is host plus pathname,
 * because `/index.html` on two hosts is not the same page and a baseline must not blur them.
 */
export async function resolveTargets(inputs, { cwd = process.cwd() } = {}) {
  const dirs = [];
  const files = [];
  const urls = [];

  for (const input of inputs) {
    if (isUrl(input)) {
      // A URL names exactly one page, so two spellings of it (`/a` and `/a/`) are one page, not an overlap
      // of scopes — unlike two paths that reach one file, which is why that case still errors below.
      const key = urlKey(input);
      if (!urls.some((entry) => entry.key === key)) urls.push({ key, url: input });
      continue;
    }
    const path = resolve(cwd, input);
    let info;
    try {
      info = await stat(path);
    } catch {
      throw new Error(copy('errors.cannotRead', basename(path)));
    }
    if (info.isDirectory()) {
      const found = [];
      await walk(path, found);
      dirs.push(path);
      for (const each of found) files.push({ from: input, path: each });
    } else {
      files.push({ from: input, path });
    }
  }

  // The same file named twice is one page, and deciding that here — rather than in the parser — is what
  // lets a programmatic caller pass a list assembled from two sources. Two *different* inputs that collide
  // on one key (a directory, and a file inside it) still error below, because that is a question about
  // intent and not about spelling.
  const seenInput = new Map();
  for (const entry of files) {
    // Identical *argument* twice is one page. Two *different* arguments reaching the same file are not:
    // that is an overlapping list, and an overlap moves the common root, which silently re-keys every
    // other page in the run — `spark baseline dist` and `spark baseline dist dist/a.html` would then
    // describe the same site under two different names, and a run that uses the second spelling gates
    // nothing while looking green. The collision check after the keys are built turns that into an error.
    const id = `${entry.from}\u0000${entry.path}`;
    if (!seenInput.has(id)) seenInput.set(id, entry);
  }
  files.length = 0;
  files.push(...seenInput.values());

  // The frame is the working directory, always, whatever the arguments were — see the module comment for
  // why that is the only stable choice. URL-only runs have no path frame at all (they key off host plus
  // pathname), so `root` reports the working directory for them too, which costs nothing and keeps the
  // return shape one thing rather than two.
  const root = resolve(cwd);

  const pages = [...files.map((entry) => ({ key: toKey(entry.path, root), path: entry.path })), ...urls];

  const byKey = new Map();
  for (const page of pages) {
    if (byKey.has(page.key)) {
      // Two arguments naming one page — a directory plus a file inside it — is worth seeing rather than
      // tidying away: dropping the duplicate silently would also drop half of that page's history.
      throw new Error(copy('errors.duplicatePage', page.key));
    }
    byKey.set(page.key, page);
  }

  const sorted = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (!sorted.length) throw new Error(copy('errors.noPages', inputs.join(', ')));
  return { pages: sorted, root };
}
