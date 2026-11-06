/**
 * Collectors turn a source into IR facts. They are the ONLY place a DOM is allowed.
 *
 * Contract: a collector receives text/bytes and returns facts. It never scores, never
 * decides what matters, and never knows about a reporter. That separation is what lets the
 * CLI, the CI action, the shared report and the MCP server share one engine — and what will
 * let the snippet and the extension reuse the same capture format later.
 */

import { createIR, addFinding } from '../ir.js';
import { DISPLAY } from '../config/constants.js';

/**
 * Extract document facts from an HTML string using a DOM implementation.
 * Kept deliberately small: this is the shape a remote capture will also produce.
 */
export function collectDocumentFacts({ html, url, JSDOM, VirtualConsole, onEnvironmentIssue }) {
  // jsdom reports "not implemented" features by throwing on stderr. Those are environment
  // limits (e.g. no canvas in Node), not findings, so they are captured and reported
  // separately rather than allowed to look like crashes.
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => onEnvironmentIssue?.(error.message));

  // `outside-only` gives the window an `eval` without executing the document's own scripts —
  // we need to inject the rules engine into the page realm, but we never run the page's JS.
  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { document } = dom.window;
  return { dom, document, window: dom.window };
}

/** Count elements — a cheap complexity signal, and what the accessibility research keys on. */
export function countElements(document) {
  return document.getElementsByTagName('*').length;
}

/**
 * Run the accessibility rules engine over a document and translate its output into
 * Spark findings. The engine is injected so this module never hard-depends on it.
 */
export async function collectAccessibility({ document, window, axe }) {
  // The rules engine needs to dedupe its globals from the target document's own realm, so it
  // must be executed *inside* the jsdom window rather than imported into Node's global scope.
  runInWindow(window, axe);
  const results = await window.axe.run(document, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
    },
    // Nothing to point at when there is no rendering surface; keep signals truthful.
    resultTypes: ['violations', 'incomplete'],
  });

  const findings = [];
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      findings.push({
        ruleId: violation.id,
        impact: violation.impact ?? 'serious',
        pillar: 'accessible',
        message: violation.help ?? violation.description,
        selector: (node.target && node.target.join(' ')) || null,
        snippet: typeof node.html === 'string' ? node.html.slice(0, DISPLAY.snippetLength) : null,
        help: violation.helpUrl ?? null,
        coverage: 'automated',
      });
    }
  }

  // `incomplete` is where automation admits it cannot decide (e.g. contrast without a
  // canvas). Two rules apply:
  //
  //  1. Keep the engine's OWN impact. Forcing `minor` made an undecided CRITICAL check sort
  //     below decided serious ones, so it vanished from the top of a report. The severity of a
  //     question does not drop because this environment could not answer it.
  //  2. Keep the reason. "Could not be decided" without saying why is a shrug; the engine gives
  //     a specific message ("no canvas", "element is not visible") and the reader deserves it.
  for (const partial of results.incomplete) {
    for (const node of partial.nodes) {
      findings.push({
        ruleId: partial.id,
        impact: partial.impact ?? 'serious',
        pillar: 'accessible',
        message: `${partial.help ?? partial.id} (could not be decided automatically)`,
        selector: (node.target && node.target.join(' ')) || null,
        snippet: typeof node.html === 'string' ? node.html.slice(0, DISPLAY.snippetLength) : null,
        help: partial.helpUrl ?? null,
        coverage: 'incomplete',
        coverageReason: firstUsefulLine(node.failureSummary ?? node.any?.[0]?.message),
      });
    }
  }

  return findings;
}

/**
 * The engine's failure summaries start with boilerplate ("Fix any of the following:", "Fix all
 * of the following:"). Skipping it is the difference between a reason a reader can use and one
 * that looks like a formatting artefact.
 */
function firstUsefulLine(summary) {
  if (typeof summary !== 'string') return null;
  const line = summary
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part && !/^Fix (any|all) of the following:?$/.test(part));
  return line ? line.slice(0, DISPLAY.reasonLength) : null;
}

/**
 * Attach the rules engine to a jsdom window exactly once. Kept in one place because it is the
 * single most environment-sensitive operation in the engine, and every surface must do it
 * identically or scores will not be comparable.
 */
function runInWindow(window, axe) {
  if (!window.__sparkAxe) {
    window.eval(axe.source);
    window.__sparkAxe = window.axe;
  }
  return window.__sparkAxe;
}

/** Build a complete accessibility IR from an HTML string. */
export async function collect({ html, uri, source = 'file', axe, JSDOM, VirtualConsole }) {
  const ir = createIR({ source, uri });
  const environmentIssues = [];
  const { document, window } = collectDocumentFacts({
    html,
    url: uri,
    JSDOM,
    VirtualConsole,
    onEnvironmentIssue: (message) => {
      const id = message.split('\n')[0];
      if (!environmentIssues.includes(id)) environmentIssues.push(id);
    },
  });

  ir.document = {
    title: document.title || null,
    lang: document.documentElement.getAttribute('lang'),
    elements: countElements(document),
  };

  const findings = await collectAccessibility({ document, window, axe });
  for (const finding of findings) addFinding(ir, finding);

  // Recorded on the IR so a report can state what this environment could not evaluate.
  ir.environment = { issues: environmentIssues };

  return ir;
}
