/**
 * HTML report — the front door (rung 1 of the ease model).
 *
 * Requirements this file exists to satisfy, from docs/PHASE-PLAN.md §1b:
 *  - complete on the server: no client JS, readable with scripting disabled
 *  - deterministic: a pure function of the IR (no clock, no locale, no randomness)
 *  - provenance printed on the page, including how to reproduce it locally
 *  - raw findings shown, not just a number; undecided checks counted separately
 *  - safe: everything interpolated from the scanned page is escaped, and rule text is
 *    derived from the rule id, never taken from the target
 *  - accessible: this document must pass our own tool
 */

import { PILLARS, IR_VERSION } from '../ir.js';
import { SCORE_SPEC_VERSION, AUTOMATION_COVERAGE, band, IMPACT_WEIGHT, SATURATION } from '../score.js';

const ENGINE_VERSION = '0.1.0';

/** Minimal, total escaping. Everything from the target goes through this. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

/**
 * Human-readable text for a rule, derived from the rule id only. We deliberately do not echo
 * the engine's message verbatim into the page, because the engine's message can embed text
 * from the scanned document — which would make the report an injection vector.
 */
function ruleLabel(ruleId) {
  const known = {
    'image-alt': 'Images must have alternative text',
    'link-name': 'Links must have a discernible name',
    'button-name': 'Buttons must have a discernible name',
    'html-has-lang': 'The page must declare a language',
    'document-title': 'The page must have a title',
    'label': 'Form fields must have labels',
    'color-contrast': 'Text must have sufficient contrast',
    'bypass': 'The page must offer a way to skip repeated content',
    'landmark-one-main': 'The page should have one main landmark',
    'region': 'All content should be inside a landmark',
    'heading-order': 'Headings must not skip levels',
  };
  if (known[ruleId]) return known[ruleId];
  // Deterministic fallback: turn the id into words without inventing meaning.
  return ruleId.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

const STYLE = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2rem 1.25rem 4rem;
  font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: #fff; color: #14181d;
  max-width: 60rem; margin-inline: auto;
}
h1 { font-size: 1.5rem; margin: 0 0 .25rem; letter-spacing: -.01em; }
h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: .07em; margin: 2.5rem 0 .75rem;
     color: #4a525c; }
p { margin: .5rem 0; }
a { color: #0b5fd0; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .875rem; }
pre { background: #f4f6f8; border: 1px solid #dde2e8; border-radius: 8px; padding: .75rem 1rem;
      overflow-x: auto; }
.muted { color: #4a525c; }
.small { font-size: .875rem; }
.header { border-bottom: 1px solid #dde2e8; padding-bottom: 1rem; margin-bottom: .5rem; }
.score-row { display: grid; grid-template-columns: 9rem 4rem 1fr; gap: .75rem;
             align-items: baseline; padding: .5rem 0; border-bottom: 1px solid #eef1f4; }
.score-row:last-child { border-bottom: 0; }
.pillar { font-weight: 600; text-transform: capitalize; }
.num { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 1.125rem; }
.good { color: #0a6b32; } .warn { color: #8a5a00; } .bad { color: #a01b1b; } .none { color: #4a525c; }
.big { font-size: 3rem; line-height: 1; font-variant-numeric: tabular-nums; }
.findings { list-style: none; margin: 0; padding: 0; }
.findings li { border: 1px solid #dde2e8; border-left-width: 4px; border-radius: 6px;
                padding: .75rem 1rem; margin-bottom: .5rem; }
.findings li.critical { border-left-color: #a01b1b; }
.findings li.serious { border-left-color: #c2410c; }
.findings li.moderate { border-left-color: #8a5a00; }
.findings li.minor { border-left-color: #9aa4b0; }
.rule { font-weight: 600; }
.tag { display: inline-block; font-size: .75rem; text-transform: uppercase; letter-spacing: .05em;
       border: 1px solid currentColor; border-radius: 999px; padding: .05rem .5rem; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
@media (max-width: 40rem) { .two-col { grid-template-columns: 1fr; } .score-row { grid-template-columns: 7rem 3rem 1fr; } }
footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #dde2e8; }
`;
void IMPACT_WEIGHT;
void SATURATION;

function bandClass(score) {
  if (score === null) return 'none';
  if (score >= 90) return 'good';
  if (score >= 70) return 'warn';
  return 'bad';
}

function overallScore(scores) {
  const measured = PILLARS.filter((p) => scores[p] !== null);
  if (measured.length === 0) return null;
  return Math.round(measured.reduce((sum, p) => sum + scores[p], 0) / measured.length);
}

function summarize(ir, pillar) {
  const all = ir.findings.filter((f) => f.pillar === pillar);
  const decided = all.filter((f) => f.coverage !== 'incomplete');
  const parts = [];
  if (decided.length === 0) parts.push(all.length === 0 ? 'no findings' : 'no decided findings');
  else {
    const byRule = new Map();
    for (const f of decided) byRule.set(f.ruleId, (byRule.get(f.ruleId) ?? 0) + 1);
    parts.push(
      [...byRule.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 3)
        .map(([rule, n]) => `${ruleLabel(rule).toLowerCase()} (${n})`)
        .join(' · ')
    );
  }
  const undecided = all.length - decided.length;
  if (undecided > 0) parts.push(`${undecided} undecided`);
  return parts.join(' · ');
}

/**
 * Render the report. `reproduceCommand` is passed in rather than derived, so the page tells
 * the reader exactly what to run.
 */
export function renderReport({ ir, scores, hash }, { reproduceCommand, generatedAt } = {}) {
  const overall = overallScore(scores);
  const identifier = hash.slice(0, 12);
  const target = ir.provenance.uri ?? 'unknown target';
  const timestamp = generatedAt ?? ir.provenance.collectedAt;

  const decided = ir.findings.filter((f) => f.coverage !== 'incomplete');
  const undecided = ir.findings.filter((f) => f.coverage === 'incomplete');
  const impactRank = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const sorted = [...decided].sort(
    (a, b) => (impactRank[a.impact] ?? 9) - (impactRank[b.impact] ?? 9) || (a.id < b.id ? -1 : 1)
  );

  const pillarRows = PILLARS.map((pillar) => {
    const score = scores[pillar];
    const cls = bandClass(score);
    const value = score === null ? '—' : String(score);
    const label = score === null ? 'not measured in this build' : band(score);
    return `      <div class="score-row">
        <span class="pillar">${escapeHtml(pillar)}</span>
        <span class="num ${cls}">${escapeHtml(value)}</span>
        <span class="small ${cls === 'none' ? 'muted' : cls}">${escapeHtml(label)} — ${escapeHtml(summarize(ir, pillar))}</span>
      </div>`;
  }).join('\n');

  const findingItems = sorted
    .map(
      (f) => `      <li class="${escapeHtml(f.impact)}">
        <div class="rule">${escapeHtml(ruleLabel(f.ruleId))}</div>
        <p class="small muted">
          <span class="tag">${escapeHtml(f.impact)}</span>
          rule <code>${escapeHtml(f.ruleId)}</code>${f.selector ? ` · <code>${escapeHtml(f.selector)}</code>` : ''}
        </p>
        ${f.snippet ? `<pre>${escapeHtml(f.snippet)}</pre>` : ''}
      </li>`
    )
    .join('\n');

  const undecidedNote = undecided.length
    ? `    <h2>Could not be decided automatically (${undecided.length})</h2>
    <p class="small muted">
      These checks need a rendering surface this run did not have (for example, computed
      contrast requires a canvas). They are excluded from the score and are <strong>not</strong>
      violations — they are questions this environment could not answer.
    </p>
    <ul class="findings">
${undecided
  .map(
    (f) => `      <li class="minor">
        <div class="rule">${escapeHtml(ruleLabel(f.ruleId))}</div>
        <p class="small muted">rule <code>${escapeHtml(f.ruleId)}</code>${f.selector ? ` · <code>${escapeHtml(f.selector)}</code>` : ''}</p>
      </li>`
  )
  .join('\n')}
    </ul>`
    : '';

  const envNote = ir.environment?.issues?.length
    ? `    <p class="small muted">Environment limits encountered: ${ir.environment.issues.length}
      (for example: <code>${escapeHtml(ir.environment.issues[0].split('\n')[0])}</code>).</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>web-spark report — ${escapeHtml(target)}</title>
  <style>${STYLE}</style>
</head>
<body>
  <header class="header">
    <h1>Conformance report</h1>
    <p class="small muted"><code>${escapeHtml(target)}</code></p>
  </header>

  <main>
    <h2>Result</h2>
    <p>
      <span class="big ${bandClass(overall)}">${overall === null ? '—' : escapeHtml(overall)}</span>
      <span class="${bandClass(overall)}"><strong>${escapeHtml(band(overall))}</strong></span>
      <span class="small muted">(conformance, ${PILLARS.filter((p) => scores[p] !== null).length} of ${PILLARS.length} pillars measured)</span>
    </p>

    <h2>Scores</h2>
${pillarRows}

    <h2>Findings (${decided.length})</h2>
${decided.length ? `    <ul class="findings">\n${findingItems}\n    </ul>` : '    <p class="small muted">No decided findings.</p>'}

${undecidedNote}

    <h2>What this score can and cannot tell you</h2>
    <p class="small">
      Automated checks cover roughly <strong>${escapeHtml(AUTOMATION_COVERAGE.criteriaShare)}</strong>
      of accessibility criteria (about ${escapeHtml(AUTOMATION_COVERAGE.volumeShare)} of issue volume,
      because the most common failures are the machine-detectable ones).
      <strong>Absence of findings does not mean this page is accessible.</strong>
      An unmeasured pillar is a gap in the tool, not a passing grade.
    </p>

    <div class="two-col">
      <div>
        <h2>Provenance</h2>
        <p class="small muted">
          engine <code>${escapeHtml(ENGINE_VERSION)}</code> ·
          IR <code>${escapeHtml(IR_VERSION)}</code> ·
          score spec <code>${escapeHtml(SCORE_SPEC_VERSION)}</code><br>
          source <code>${escapeHtml(ir.provenance.source)}</code> ·
          collected <code>${escapeHtml(timestamp)}</code><br>
          ir hash <code>${escapeHtml(hash)}</code>
        </p>
      </div>
      <div>
        <h2>Reproduce this</h2>
        <pre>${escapeHtml(reproduceCommand ?? `spark check ${target}`)}</pre>
        <p class="small muted">
          The report is a pure function of the target, the engine version and the score spec, so
          the same command produces the same findings — and the same score — anywhere.
        </p>
      </div>
    </div>

${envNote}
  </main>

  <footer>
    <p class="small muted">
      Generated by web-spark ${escapeHtml(ENGINE_VERSION)}. This report is a summary of automated
      findings, not a certification. Identifier <code>${escapeHtml(identifier)}</code>.
    </p>
  </footer>
</body>
</html>
`;
}
