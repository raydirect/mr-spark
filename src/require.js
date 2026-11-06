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

/** Declared dependencies the engine needs in order to produce any findings at all. */
export const REQUIRED = Object.freeze(['jsdom', 'axe-core']);

/**
 * @param {{resolve?: (name: string) => string, cwd?: string}} [probe] injectable for tests
 * @returns {{ok: boolean, missing: string[], cwd: string}}
 */
export function checkInstall({ resolve, cwd = process.cwd() } = {}) {
  const resolver = resolve ?? ((name) => createRequire(`${cwd}/`).resolve(name));
  const missing = [];
  for (const name of REQUIRED) {
    try {
      resolver(name);
    } catch {
      missing.push(name);
    }
  }
  return { ok: missing.length === 0, missing, cwd };
}

/** The message a user can act on. Deliberately one paragraph, no stack trace. */
export function installMessage({ missing, cwd }) {
  const list = missing.join('", "');
  return [
    `Dependencies are not installed in ${cwd} — cannot load "${list}".`,
    'Run `npm ci` in the project root, then run this command again from that same directory.',
    'If you are not sure where the project root is: it is the folder that contains package.json.',
  ].join(' ');
}
