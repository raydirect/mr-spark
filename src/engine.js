/**
 * Engine wiring. The engine owns analysis; surfaces own presentation.
 *
 * This module is the seam every surface goes through — CLI today, CI action and MCP server
 * next, editor later. It imports no surface code (no process.argv, no console, no fs beyond
 * what a caller passes in), which is the rule that keeps the four surfaces from drifting.
 */

import { sortFindings, hashIR } from './ir.js';
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
  } catch {
    throw new Error(
      'Missing dependency: jsdom. Install it with `npm i jsdom axe-core` to run accessibility checks.'
    );
  }
  try {
    axe = (await import('axe-core')).default;
  } catch {
    throw new Error(
      'Missing dependency: axe-core. Install it with `npm i jsdom axe-core` to run accessibility checks.'
    );
  }
  return { JSDOM, VirtualConsole, axe };
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
  const hash = await hashIR(ir);
  return { ir, scores, hash };
}

export { PILLARS } from './ir.js';
export { scoreAll, band, SCORE_SPEC_VERSION, AUTOMATION_COVERAGE } from './score.js';
