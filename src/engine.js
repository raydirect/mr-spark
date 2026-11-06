/**
 * Engine wiring. The engine owns analysis; surfaces own presentation.
 *
 * This module is the seam every surface goes through — CLI today, CI action and MCP server
 * next, editor later. It imports no surface code (no process.argv, no console, no fs beyond
 * what a caller passes in), which is the rule that keeps the four surfaces from drifting.
 */

import { sortFindings, contentHash } from './ir.js';
import { scoreAll } from './score.js';
import { collect } from './collectors/a11y.js';

/**
 * Load the optional engines. They are peer/optional dependencies so the core stays small and
 * an install without them still runs (with an honest error rather than a crash).
 */
export async function loadEngines() {
  let JSDOM;
  let VirtualConsole;
  let axe;
  try {
    ({ JSDOM, VirtualConsole } = await import('jsdom'));
  } catch (cause) {
    throw new Error(installHint('jsdom', cause));
  }
  try {
    axe = (await import('axe-core')).default;
  } catch (cause) {
    throw new Error(installHint('axe-core', cause));
  }
  return { JSDOM, VirtualConsole, axe };
}

/**
 * A dependency error is almost never "the dependency is missing" — which is why the original
 * message sent people to install two packages they had already declared, in the wrong place.
 * The common cases, in order of likelihood:
 *
 *   1. `npm ci` was never run, because it failed in this directory (no lockfile here).
 *   2. `npm ci` was run in a DIFFERENT directory than the one the command runs in.
 *   3. The dependency is genuinely absent.
 *
 * So the message names the directory we looked in. That one fact distinguishes all three.
 */
function installHint(name, cause) {
  const where = process.cwd();
  return [
    `Cannot load the "${name}" engine in ${where}.`,
    `Run \`npm ci\` from the project root (in Bash: \`cd /d/...\`, not as an argument to npm ci),`,
    `then run this command again from that same directory.`,
    `Underlying error: ${cause?.code ?? cause?.message ?? String(cause)}`,
  ].join(' ');
}

/**
 * Analyze an HTML string and return `{ ir, scores, hash }`.
 * Pure-ish: same input + same engine version => same output (modulo collectedAt).
 */
export async function analyze({ html, uri, source = 'file', engines }) {
  const { JSDOM, VirtualConsole, axe } = engines ?? (await loadEngines());
  const ir = await collect({ html, uri, source, axe, JSDOM, VirtualConsole });
  sortFindings(ir);
  const scores = scoreAll(ir);
  const hash = await contentHash(ir);
  return { ir, scores, hash };
}

export { PILLARS } from './ir.js';
export { scoreAll, band, SCORE_SPEC_VERSION, AUTOMATION_COVERAGE } from './score.js';
