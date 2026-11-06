/**
 * HTML report — the front door (rung 1 of the ease model).
 *
 * Requirements this file exists to satisfy (docs/PHASE-PLAN.md §1b, docs/DESIGN-REVIEW.md):
 *  - complete on the server: no client JS, readable with scripting disabled
 *  - deterministic: a pure function of the IR (no clock, no locale, no randomness)
 *  - provenance printed on the page, including how to reproduce it locally
 *  - raw findings shown, not just a number; undecided checks counted separately
 *  - safe: everything interpolated from the scanned page is escaped, and rule text is
 *    derived from the rule id, never taken from the target
 *  - accessible: this document must pass our own tool, in both colour themes
 *  - tokenised: no colour, size, spacing or radius literal appears in this file
 *
 * Every judgement here comes from src/view-model.js. This file only decides presentation.
 */

import { IR_VERSION } from '../ir.js';
import { SCORE_SPEC_VERSION, AUTOMATION_COVERAGE } from '../score.js';
import { VERSION, ID_LENGTH } from '../config/brand.js';
import { copy } from '../config/copy.js';
import { buildView } from '../view-model.js';
import { sortByImpact } from '../vocabulary.js';
import { renderStyles } from './styles.js';

/** Total escaping. Everything from the target goes through this. */
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
export function ruleLabel(ruleId) {
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
    'aria-input-field-name': 'Custom input fields must have an accessible name',
    'aria-command-name': 'Custom buttons and links must have an accessible name',
    'aria-required-attr': 'ARIA roles must carry their required attributes',
    'aria-valid-attr-value': 'ARIA attribute values must be valid',
    'aria-allowed-attr': 'ARIA attributes must be allowed on their role',
    'duplicate-id-aria': 'Ids referenced by ARIA must be unique',
    'target-size': 'Touch targets must be large enough to hit',
    'frame-title': 'Frames must have a title',
    'html-has-lang-bcp47': 'The declared language must be a valid language tag',
  };
  if (known[ruleId]) return known[ruleId];
  // Deterministic fallback: turn the id into words without inventing meaning.
  return ruleId.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** A CSS-only meter. Conveys the same information as the number, without scripting. */
function meter(score, tone) {
  if (score === null) return '';
  const percent = Math.max(0, Math.min(100, score));
  return `      <span class="meter ${escapeHtml(tone)}" role="img" aria-label="${percent} out of 100">
        <span class="meter-fill" style="inline-size: ${percent}%"></span>
      </span>`;
}

function findingItem(finding) {
  const decided = finding.coverage !== 'incomplete';
  const suppressed = finding.suppressed === true;
  return `      <li class="${escapeHtml(finding.impact)}${decided ? '' : ' undecided'}${suppressed ? ' suppressed' : ''}">
        <div class="rule">${decided ? '' : '<span class="question" aria-hidden="true">?</span> '}${escapeHtml(ruleLabel(finding.ruleId))}</div>
        <p class="small muted">
          <span class="tag">${escapeHtml(finding.impact)}</span>
          ${
            decided
              ? ''
              : `<span class="tag undecided-tag">${escapeHtml(copy('labels.undecided'))}</span> `
          }${
            suppressed
              ? `<span class="tag suppressed-tag">${escapeHtml(copy('labels.suppressed'))}</span> `
              : ''
          }${escapeHtml(copy('labels.rule'))} <code>${escapeHtml(finding.ruleId)}</code>${
            finding.selector ? ` · <code>${escapeHtml(finding.selector)}</code>` : ''
          }
        </p>
        ${
          finding.coverageReason
            ? `<p class="small muted">${escapeHtml(finding.coverageReason)}</p>`
            : ''
        }
        ${
          suppressed && finding.suppressionReason
            ? `<p class="small muted">${escapeHtml(copy('labels.suppressedBecause', finding.suppressionReason))}</p>`
            : ''
        }
        ${finding.snippet ? `<pre>${escapeHtml(finding.snippet)}</pre>` : ''}
      </li>`;
}

/**
 * Render the report. `reproduceCommand` is passed in rather than derived, so the page tells
 * the reader exactly what to run.
 */
export function renderReport({ ir, scores, hash }, { reproduceCommand, generatedAt } = {}) {
  const view = buildView(ir, scores);
  const identifier = hash.slice(0, ID_LENGTH);
  const target = view.target;
  const timestamp = generatedAt ?? ir.provenance.collectedAt;
  const { decided, undecided } = view.findings;

  const pillarRows = view.rows
    .map(
      (row) => `      <div class="score-row">
        <span class="pillar">${escapeHtml(row.pillar)}</span>
        <span class="num ${escapeHtml(row.tone)}">${
          row.score !== null && row.undecidedCount > 0
            ? `<span class="bound">${escapeHtml(copy('state.upperBound'))}</span>`
            : ''
        }${escapeHtml(row.value)}</span>
        <span class="small ${row.tone === 'none' ? 'muted' : escapeHtml(row.tone)}">${escapeHtml(
          row.score === null ? copy('state.notMeasured') : row.band
        )}${row.summaryProse ? ` — ${escapeHtml(row.summaryProse)}` : ''}</span>
      </div>`
    )
    .join('\n');

  // One list, worst first, with undecided checks IN PLACE. A separate section below the
  // violations pushed a critical undecided check (contrast) out of sight, which is the opposite
  // of what a report should do with something it could not answer.
  const allFindings = sortByImpact(ir.findings);
  const findingItems = allFindings.map(findingItem).join('\n');

  const undecidedNote = undecided.length
    ? `    <p class="small muted">
      ${escapeHtml(copy('state.undecidedExplanation'))}
    </p>`
    : '';

  // A count and an explanation, not a separate list: the waived findings are still in the list
  // above, marked, with their reason inline. Hiding them in a section would let a reader skim the
  // violations and never learn that two criticals were waived.
  const suppressedNote = view.findings.suppressed.length
    ? `    <p class="small muted">
      ${escapeHtml(copy('state.suppressedExplanation'))}
    </p>`
    : '';

  const envNote = ir.environment?.issues?.length
    ? `    <p class="small muted">${escapeHtml(
        copy(
          'state.environmentLimits',
          ir.environment.issues.length,
          ir.environment.issues[0].split('\n')[0]
        )
      )}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(copy('headings.conformance'))} — ${escapeHtml(target)}</title>
  <style>${renderStyles()}</style>
</head>
<body>
  <a class="skip-link" href="#main">${escapeHtml(copy('labels.skipToContent'))}</a>

  <header class="header">
    <h1>${escapeHtml(copy('headings.conformance'))}</h1>
    <p class="small muted"><code>${escapeHtml(target)}</code></p>
${
  view.kind === 'fragment'
    ? `    <p class="small fragment-notice">${escapeHtml(copy('state.fragmentNotice'))}</p>`
    : ''
}
  </header>

  <main id="main">
    <h2>${escapeHtml(copy('headings.result'))}</h2>
    <div class="result">
      <span class="big ${escapeHtml(view.overallTone)}">${
        view.overallUpperBound ? `<span class="bound">${escapeHtml(copy('state.upperBound'))}</span>` : ''
      }${escapeHtml(
        view.overall.score === null ? copy('state.unmeasured') : String(view.overall.score)
      )}</span>
      <span class="${escapeHtml(view.overallTone)}"><strong>${escapeHtml(view.overall.band)}</strong></span>
      <span class="small muted">(conformance, ${escapeHtml(view.coverage.plainLabel)})</span>
    </div>
${meter(view.overall.score, view.overallTone)}
    <p class="meter-legend"><span>0</span><span>50</span><span>100</span></p>
${
  view.overallUpperBound
    ? `    <p class="small muted bound-note">${escapeHtml(copy('state.upperBoundNote', view.undecidedCount))}</p>`
    : ''
}

    <h2>${escapeHtml(copy('headings.scores'))}</h2>
${pillarRows}

    <h2>${escapeHtml(copy('state.findingsHeading', decided.length, undecided.length))}</h2>${
      view.findings.suppressed.length
        ? `\n    <p class="small muted">${escapeHtml(copy('state.suppressedHeading', view.findings.suppressed.length))}</p>`
        : ''
    }
${
  allFindings.length
    ? `    <ul class="findings" role="list">\n${findingItems}\n    </ul>`
    : `    <p class="small muted">${escapeHtml(copy('state.noFindingsBody'))}</p>`
}

${undecidedNote}
${suppressedNote}

    <h2>${escapeHtml(copy('headings.interpretation'))}</h2>
    <p class="small">
      ${escapeHtml(copy('caveat.long', AUTOMATION_COVERAGE.criteriaShare, AUTOMATION_COVERAGE.volumeShare))}
    </p>

    <div class="two-col">
      <div>
        <h2>${escapeHtml(copy('headings.provenance'))}</h2>
        <p class="small muted">
          ${escapeHtml(copy('labels.engine'))} <code>${escapeHtml(VERSION)}</code> ·
          ${escapeHtml(copy('labels.ir'))} <code>${escapeHtml(IR_VERSION)}</code> ·
          ${escapeHtml(copy('labels.scoreSpec'))} <code>${escapeHtml(SCORE_SPEC_VERSION)}</code><br>
          ${escapeHtml(copy('labels.source'))} <code>${escapeHtml(ir.provenance.source)}</code> ·
          ${escapeHtml(copy('labels.collected'))} <code>${escapeHtml(timestamp)}</code><br>
          ${escapeHtml(copy('labels.irHash'))} <code>${escapeHtml(hash)}</code>
        </p>
      </div>
      <div>
        <h2>${escapeHtml(copy('headings.reproduce'))}</h2>
        <pre>${escapeHtml(reproduceCommand ?? `spark check ${target}`)}</pre>
        <p class="small muted">
          ${escapeHtml(copy('caveat.determinism'))}
        </p>
      </div>
    </div>

${envNote}
  </main>

  <footer>
    <p class="small muted">
      ${escapeHtml(copy('labels.generatedBy', VERSION))}
      ${escapeHtml(copy('labels.identifier'))} <code>${escapeHtml(identifier)}</code>.
    </p>
  </footer>
</body>
</html>
`;
}
