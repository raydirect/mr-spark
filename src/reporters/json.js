/**
 * JSON reporter — the machine face of the CLI.
 *
 * Stable ordering, no ANSI, and the score spec version included, so a consumer (CI, an
 * agent, a saved baseline) can reason about whether the number it read is comparable to
 * the number it is about to write.
 */

import { SCORE_SPEC_VERSION, AUTOMATION_COVERAGE, band } from '../score.js';
import { IR_VERSION, PILLARS } from '../ir.js';

export function buildJsonReport({ ir, scores, hash }) {
  const measured = PILLARS.filter((p) => scores[p] !== null);
  const overall =
    measured.length === 0
      ? null
      : Math.round(measured.reduce((sum, p) => sum + scores[p], 0) / measured.length);

  return {
    irVersion: IR_VERSION,
    scoreSpec: SCORE_SPEC_VERSION,
    ir: hash,
    provenance: ir.provenance,
    document: ir.document,
    scores: Object.fromEntries(
      PILLARS.map((p) => [p, { score: scores[p], band: band(scores[p]) }])
    ),
    conformance: { score: overall, band: band(overall), pillarsMeasured: measured.length },
    coverage: AUTOMATION_COVERAGE,
    findings: ir.findings,
    summary: {
      total: ir.findings.length,
      byImpact: countBy(ir.findings, (f) => f.impact),
      byRule: countBy(ir.findings, (f) => f.ruleId),
    },
  };
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
}

export function renderJson(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}
