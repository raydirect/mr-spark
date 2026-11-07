/**
 * JSON reporter — the machine face of the CLI.
 *
 * Stable ordering, no ANSI, and the score spec version included, so a consumer (CI, an
 * agent, a saved baseline) can reason about whether the number it read is comparable to
 * the number it is about to write.
 *
 * `engine.name` is the product name, not the CLI verb: `spark` is what a person types, `MR-Spark` is what
 * a report says produced it, and the baseline and the SARIF run both name the producer the same way.
 *
 * This is a contract, not a debug dump: field names and shapes are stable, and the same
 * numbers appear here as on screen because both come from src/view-model.js.
 */

import { SCORE_SPEC_VERSION, AUTOMATION_COVERAGE } from '../score.js';
import { IR_VERSION, PILLARS } from '../ir.js';
import { NAME, VERSION } from '../config/brand.js';
import { band } from '../config/thresholds.js';
import { buildView } from '../view-model.js';

export function buildJsonReport({ ir, scores, hash }) {
  const view = buildView(ir, scores);
  return {
    engine: { name: NAME, version: VERSION },
    irVersion: IR_VERSION,
    scoreSpec: SCORE_SPEC_VERSION,
    ir: hash,
    provenance: ir.provenance,
    document: ir.document,
    scores: Object.fromEntries(
      PILLARS.map((p) => [p, { score: scores[p] ?? null, band: band(scores[p] ?? null) }])
    ),
    conformance: {
      score: view.overall.score,
      band: view.overall.band,
      pillarsMeasured: view.coverage.measured,
      pillarsTotal: view.coverage.total,
    },
    coverage: AUTOMATION_COVERAGE,
    findings: ir.findings,
    summary: {
      total: ir.findings.length,
      decided: view.findings.decided.length,
      suppressed: view.findings.suppressed.length,
      undecided: view.findings.undecided.length,
      byImpact: countBy(ir.findings, (f) => f.impact),
      byRule: countBy(ir.findings, (f) => f.ruleId),
    },
    // Suppressions are a first-class part of the contract: a consumer that only reads `summary`
    // still learns that findings exist which the score does not price, and why.
    suppressions: view.findings.suppressed.map((finding) => ({
      id: finding.id,
      ruleId: finding.ruleId,
      impact: finding.impact,
      selector: finding.selector ?? null,
      reason: finding.suppressionReason ?? null,
    })),
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
