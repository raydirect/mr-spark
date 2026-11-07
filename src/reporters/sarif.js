/**
 * SARIF 2.1.0 — the finding list in the shape a code-scanning tool already understands.
 *
 * Why this exists rather than "just parse the JSON": a project that puts a gate in CI wants the results
 * to live where its developers look (the Files tab, the security pane, a blocking check), not in a log
 * they have to expand. That is also the discipline: the same findings have to survive being rendered by
 * somebody else's viewer, with our line about what we could not decide attached.
 *
 * Three decisions worth stating, because the spec offers a tempting shortcut for each:
 *
 *  1. **No invented line numbers.** The browserless path reports a selector and a snippet, not a source
 *     position, and a `region` we guessed would put the annotation on the wrong line of the wrong file —
 *     a confident lie in the one format people act on without reading the tool. So `physicalLocation`
 *     carries the artifact only, and the anchor and snippet go in the message text.
 *  2. **Suppressed findings are NOT emitted with SARIF's `suppressions` array.** That array tells the
 *     consumer to hide the result. `docs/SUPPRESSION.md` exists to make a waiver visible in review, so a
 *     waived finding is emitted as a `note` carrying its reason, and a code scanner that groups notes
 *     still shows it. A tool that disagrees can filter it — that is its call to make, not ours to make
 *     for it by omission.
 *  3. **Undecided checks are emitted**, as `informational`. Dropping them would make a run with no canvas
 *     look like a clean one to the viewer, which is the exact failure `docs/UNDECIDED.md` was written
 *     about. `properties.sparkUndecidedKind` says whether it is our blindness or a human question.
 *
 * Deterministic and timestamp-free like every other artifact here: rules sorted by id, results sorted by
 * identity key then input order (which `src/ir.js` already fixes), and no clock anywhere — so two runs on
 * one page diff empty, and `git diff` on a committed `.sarif` means something.
 */

import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NAME, VERSION, HOMEPAGE } from '../config/brand.js';
import { SCORE_SPEC_VERSION } from '../score.js';
import { IR_VERSION } from '../ir.js';
import { identityOf } from '../identity.js';

export const SARIF_VERSION = '2.1.0';
export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

/** impact → SARIF level. `minor` is still worth seeing, so nothing is demoted below `note`. */
const LEVEL = {
  critical: 'error',
  serious: 'error',
  moderate: 'warning',
  minor: 'note',
};

function artifactUri(ir) {
  const uri = ir?.provenance?.uri ?? '';
  if (/^file:\/\//.test(uri)) {
    // A repo-relative path is what a reviewer's diff can click. Absolute paths also put a username in
    // a file people commit, which is the same mistake `src/baseline.js` refuses to make.
    return basename(fileURLToPath(uri));
  }
  return uri || 'unknown';
}

/**
 * The rule descriptors: one per rule id seen anywhere in this run, sorted so the array is stable.
 *
 * `defaultConfiguration.level` is the *worst* impact that rule produced here, not the first one: a rule
 * that reported one `critical` and nine `minor` findings is a critical rule, and a viewer that colours the
 * whole rule note-grey because of an ordering accident hides the finding that mattered.
 */
function buildRules(findings) {
  const byRule = new Map();
  const RANK = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  for (const finding of findings) {
    if (!finding.ruleId) continue;
    const help = typeof finding.help === 'string' ? finding.help : null;
    const previous = byRule.get(finding.ruleId);
    const rankOf = (impact) => RANK[impact] ?? 99;
    const worst = !previous ? finding.impact : rankOf(finding.impact) < rankOf(previous.impact) ? finding.impact : previous.impact;
    byRule.set(finding.ruleId, {
      id: finding.ruleId,
      name: finding.ruleId,
      shortDescription: { text: finding.message ?? finding.ruleId },
      fullDescription: { text: finding.message ?? finding.ruleId },
      ...(help ? { helpUri: help } : {}),
      help: { text: finding.message ?? finding.ruleId },
      impact: worst,
      properties: {
        tags: ['a11y', 'mr-spark', finding.pillar ?? 'accessible'].filter(Boolean),
      },
    });
  }
  return [...byRule.values()]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ impact, ...rule }) => ({ ...rule, defaultConfiguration: { level: LEVEL[impact] ?? 'warning' } }));
}

/**
 * One result per finding, in a stable order.
 *
 * `partialFingerprints.sparkKey` carries `src/identity.js`'s key, which is the piece a scanner needs to
 * recognise "same problem as last week" without an anchor heuristic of its own — and the reason the
 * baseline and the code-scanning view agree instead of reporting two different diffs of one commit.
 */
function buildResults(findings, { artifact = 'unknown', baselineStates = new Map() } = {}) {
  const rows = [];
  findings.forEach((finding, inputIndex) => {
    const { key, anchor } = identityOf(finding);
    const undecided = finding.coverage === 'incomplete';
    const parts = [finding.message ?? finding.ruleId];
    // A viewer that shows only `message.text` must still be able to tell a violation from a check we could
    // not answer, so the distinction is in the sentence and not only in a property nobody reads.
    if (undecided && !/could not be decided/i.test(parts[0])) parts.push('could not be decided automatically — not a violation');
    if (finding.selector) parts.push(`at ${finding.selector}`);
    if (finding.snippet) parts.push(finding.snippet);
    if (finding.suppressionReason) parts.push(`waived by configuration: ${finding.suppressionReason}`);

    rows.push({
      order: `${key}\u0000${String(inputIndex).padStart(6, '0')}`,
      ruleId: finding.ruleId,
      level: undecided ? 'note' : finding.suppressed ? 'note' : (LEVEL[finding.impact] ?? 'warning'),
      ...(undecided ? { kind: 'informational' } : {}),
      message: { text: parts.join('\n  ') },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: artifact },
          },
        },
      ],
      partialFingerprints: { sparkKey: key },
      ...(baselineStates.has(key) ? { baselineState: baselineStates.get(key) } : {}),
      properties: {
        sparkKey: key,
        sparkAnchor: anchor,
        sparkPillar: finding.pillar ?? null,
        sparkImpact: finding.impact ?? null,
        sparkCoverage: undecided ? 'incomplete' : 'decided',
        ...(undecided ? { sparkUndecidedKind: finding.undecidedKind ?? 'judgement' } : {}),
        ...(finding.suppressed ? { sparkStatus: 'suppressed' } : {}),
      },
    });
  });
  rows.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  return rows.map(({ order, ...row }) => row);
}

/**
 * Build the SARIF document.
 *
 * `diff` is the optional result of `src/baseline.js`'s `compare`: when a baseline was in play, each
 * result is stamped `new` / `unchanged` / `absent`, because a PR comment that says "3 findings" and one
 * that says "3 findings, 2 of them yours" are different products wearing the same format.
 */
export function buildSarif({ ir, scores, hash, diff = null }) {
  const findings = ir?.findings ?? [];
  const rules = buildRules(findings);
  const indexByRule = new Map(rules.map((rule, index) => [rule.id, index]));

  const states = new Map();
  if (diff) {
    for (const entry of diff.blocking ?? []) states.set(entry.key, 'new');
    for (const entry of diff.adoptable ?? []) states.set(entry.key, 'new');
    for (const entry of diff.escalated ?? []) states.set(entry.key, 'updated');
    for (const entry of diff.resolved ?? []) states.set(entry.key, 'absent');
  }

  const uri = artifactUri(ir);
  const results = buildResults(findings, { artifact: uri, baselineStates: states }).map((result) => ({
    ...result,
    ruleIndex: indexByRule.get(result.ruleId),
  }));

  return {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: NAME,
            version: VERSION,
            ...(HOMEPAGE ? { informationUri: HOMEPAGE } : {}),
            rules,
          },
        },
        artifacts: [
          {
            location: { uri },
            // SARIF wants a source location for the run; the file audited is the source, and there is no
            // build step between the two. Naming it beats leaving a consumer to infer it.
            sourceLocation: { uri },
            roles: ['analysisTarget'],
          },
        ],
        results,
        columnKind: 'unicodeCodePointsPerLine',
        properties: {
          sparkIr: hash ?? null,
          sparkScore: scores?.accessible ?? null,
          sparkScoreSpec: SCORE_SPEC_VERSION,
          sparkIrVersion: IR_VERSION,
          sparkProvenance: {
            source: ir?.provenance?.source ?? null,
            kind: ir?.provenance?.kind ?? null,
          },
          ...(diff
            ? {
                sparkGate: {
                  ok: diff.ok,
                  blocking: diff.counts.blocking,
                  escalated: diff.counts.escalated,
                  adoptable: diff.counts.adoptable,
                  resolved: diff.counts.resolved,
                  unchanged: diff.counts.unchanged,
                },
              }
            : {}),
        },
      },
    ],
  };
}

export function renderSarif(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}
