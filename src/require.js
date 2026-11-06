/**
 * Check the install before doing any work, and fail with the command that fixes it.
 *
 * Why this exists. The engine loads its two dependencies lazily, which is right for startup
 * cost but wrong for diagnosis: a user who has not installed yet gets an error from deep inside
 * a module import, phrased as if a package were missing, when the real problem is that
 * `npm ci` never ran in this directory. That is exactly what happens when someone types
 * `npm ci` in the wrong folder and then runs the tool from a clone that has no dependencies.
 *
 * Resolving the dependency by name from the working directory turns "something inside an import
 * failed" into "this directory has no node_modules" — which is a sentence a person can act on.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

/** Declared dependencies the engine needs in order to produce any findings at all. */
export const REQUIRED = Object.freeze(['jsdom', 'axe-core']);

/**
 * The directory dependencies are resolved FROM. This must be the package, not the user's
 * current directory.
 *
 * `import('jsdom')` inside src/engine.js resolves relative to that file — i.e. relative to the
 * installed package — so a user may audit a page anywhere on disk, from any working directory,
 * and still find the dependencies. An earlier version of this preflight resolved from
 * `process.cwd()`, which meant `sudo spark check /var/www/x.html` or simply running the tool
 * from another folder reported a broken install that was not broken. The check must use the
 * same base directory Node's own resolution uses.
 */
const PACKAGE_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {{resolve?: (name: string) => string, root?: string}} [probe] injectable for tests
 * @returns {{ok: boolean, missing: string[], root: string}}
 */
export function checkInstall({ resolve, root = PACKAGE_ROOT } = {}) {
  const resolver = resolve ?? ((name) => createRequire(`${root}/`).resolve(name));
  const missing = [];
  for (const name of REQUIRED) {
    try {
      resolver(name);
    } catch {
      missing.push(name);
    }
  }
  return { ok: missing.length === 0, missing, root };
}

/** The message a user can act on. Deliberately one paragraph, no stack trace. */
export function installMessage({ missing, root }) {
  const list = missing.join('", "');
  return [
    `Dependencies are not installed for the copy at ${root} — cannot load "${list}".`,
    `Run \`npm ci\` in ${root}.`,
    'The folder must contain package.json and package-lock.json.',
  ].join(' ');
}
