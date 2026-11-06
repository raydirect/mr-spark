/**
 * The shared vocabulary.
 *
 * These were previously re-derived in four files: the "undecided" test appeared in the
 * terminal reporter, the HTML reporter, the score and the JSON reporter, each written as its
 * own string comparison. Vocabulary drift is how two surfaces start disagreeing about the same
 * IR. One definition, imported everywhere.
 */

import { PILLARS, COVERAGE as IR_COVERAGE } from './ir.js';

/** Coverage values. Re-exported from the IR, which owns the artifact's own enum. */
export const COVERAGE = IR_COVERAGE;

/** Impact values, worst first. Rank is derived from position so it cannot drift. */
export const IMPACTS = Object.freeze(['critical', 'serious', 'moderate', 'minor']);

export const IMPACT_RANK = Object.freeze(
  Object.fromEntries(IMPACTS.map((impact, index) => [impact, index]))
);

/** Rank of a pillar for deterministic ordering; unknown pillars sort last. */
export const PILLAR_RANK = Object.freeze(
  Object.fromEntries(PILLARS.map((pillar, index) => [pillar, index]))
);

/** The one test for "this finding was decided". */
export function isDecided(finding) {
  return finding?.coverage !== COVERAGE.incomplete;
}

/**
 * Whether a finding should move the score: decided, and not deliberately suppressed.
 *
 * Suppression is a separate axis from decidedness on purpose. "We could not tell" and "we were
 * told this is deliberate" are different facts, and a reader deserves to see which is which.
 */
export function countsTowardScore(finding) {
  return isDecided(finding) && finding?.suppressed !== true;
}

/** Split findings into decided and undecided, preserving order. */
export function partitionByCoverage(findings) {
  const decided = [];
  const undecided = [];
  for (const finding of findings) (isDecided(finding) ? decided : undecided).push(finding);
  return { decided, undecided };
}

/** Worst-first, then by id for a stable order. Never mutates the input. */
export function sortByImpact(findings) {
  return [...findings].sort(
    (a, b) =>
      (IMPACT_RANK[a.impact] ?? IMPACTS.length) - (IMPACT_RANK[b.impact] ?? IMPACTS.length) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Findings for one pillar, partitioned three ways.
 *
 * `suppressed` is its own bucket, never folded into `decided`. A reader looking at a pillar that
 * reads "clean" has to be able to see that two critical findings are there and were deliberately
 * waived; burying them inside `decided` would make the pillar line contradict its own score.
 */
export function findingsFor(ir, pillar) {
  const scoped = pillar ? ir.findings.filter((finding) => finding.pillar === pillar) : ir.findings;
  const { decided, undecided } = partitionByCoverage(scoped);
  return {
    decided: decided.filter((finding) => finding.suppressed !== true),
    suppressed: decided.filter((finding) => finding.suppressed === true),
    undecided,
  };
}
