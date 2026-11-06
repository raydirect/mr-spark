import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { analyze, loadEngines } from '../src/engine.js';
import { renderReport, escapeHtml } from '../src/reporters/html.js';
import { serveReport } from '../src/reporters/serve.js';

const engines = await loadEngines();
const read = (name) => readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
const build = async (name) =>
  analyze({ html: await read(name), uri: `file:///fixtures/${name}`, engines });

test('escaping is total for the characters that matter', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml("a & b 'c'"), 'a &amp; b &#39;c&#39;');
  assert.equal(escapeHtml(null), '');
});

test('the report is a complete document with no client-side script', async () => {
  const html = renderReport(await build('bad.html'), { reproduceCommand: 'spark check x' });
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<\/html>\s*$/);
  assert.ok(!/<script/i.test(html), 'report must not require client JS');
  assert.ok(!/https?:\/\//.test(html.replace(/<code>.*?<\/code>/g, '')), 'report must not fetch external resources');
  assert.match(html, /<html lang="en">/);
});

test('a target value cannot inject markup into the report', async () => {
  const evil = ['evil"><script>alert(1)</script>.html'];
  const { ir, scores, hash } = await build('good.html');
  ir.provenance.uri = evil[0];
  const html = renderReport({ ir, scores, hash }, { reproduceCommand: 'spark check x' });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'), 'the value should appear escaped');
});

test('the report shows raw findings, the caveat, and provenance', async () => {
  const { ir, scores, hash } = await build('bad.html');
  const html = renderReport({ ir, scores, hash }, { reproduceCommand: 'spark check fixtures/bad.html' });
  assert.match(html, /Findings \(\d+ violations(, \d+ undecided)?\)/);
  assert.match(html, /Absence of findings does not mean this page is accessible/);
  // The spec version is printed, whatever it currently is — a score without it is not a score.
  assert.match(html, /score spec <code>\d+\.\d+\.\d+<\/code>/);
  assert.ok(html.includes(hash));
  assert.match(html, /spark check fixtures\/bad\.html/);
});

test('unmeasured pillars are shown as —, never as a number', async () => {
  const { ir, scores, hash } = await build('bad.html');
  const html = renderReport({ ir, scores, hash }, {});
  assert.match(html, /not measured in this build/);
  assert.match(html, /<span class="num none">—<\/span>/);
});

test('the report is byte-identical for the same input and a fixed clock', async () => {
  const result = await build('bad.html');
  const at = '2026-01-01T00:00:00.000Z';
  const a = renderReport(result, { reproduceCommand: 'c', generatedAt: at });
  const b = renderReport(result, { reproduceCommand: 'c', generatedAt: at });
  assert.equal(a, b);
});

test('our own report passes our own tool', async () => {
  const { ir, scores, hash } = await build('bad.html');
  const html = renderReport({ ir, scores, hash }, { reproduceCommand: 'spark check x' });
  const audit = await analyze({ html, uri: 'file:///spark-report.html', engines });
  const decided = audit.ir.findings.filter((f) => f.coverage !== 'incomplete');
  assert.deepEqual(decided.map((f) => `${f.ruleId}@${f.selector}`), []);
  assert.ok(audit.scores.accessible >= 95);
});

test('the report server serves the report and nothing else', async () => {
  const html = '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>x</h1></main></body></html>';
  const { url, port, close } = await serveReport({ html, port: 0 });
  // The URL we print must be the one that answers. `localhost` can resolve to ::1, which we do
  // not listen on, so it is refused on some systems while the server is healthy.
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal(url, `http://127.0.0.1:${port}/`);
  const base = `http://127.0.0.1:${port}`;
  let response = await fetch(base + '/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(await response.text(), html);
  response = await fetch(`${base}/healthz`);
  assert.equal(await response.text(), 'ok\n');
  response = await fetch(`${base}/nope`);
  assert.equal(response.status, 404);
  await close();
});

test('listed plus hidden always equals the total, so the count cannot be invented', async () => {
  // A real page printed "… 3 more finding(s)" while every decided finding was on screen, because
  // the count subtracted the listed findings from ALL findings. The number a reader uses to decide
  // whether to keep looking must be arithmetic, not arithmetic on the wrong operand.
  const { ir, scores, hash } = await build('bad.html');
  const { renderTerminal } = await import('../src/reporters/terminal.js');
  const out = renderTerminal({ ir, scores, hash }, { color: false });
  // The legend line also starts with "? " — it explains the marker, it is not a finding.
  const listed = (out.match(/^\s+[✗?] (?!=\s)/gm) ?? []).length;
  const hidden = Number(out.match(/… (\d+) more finding/)?.[1] ?? 0);
  assert.equal(listed + hidden, ir.findings.length);
});

test('undecided checks stay in the list, marked with a question rather than a cross', async () => {
  // Splitting them into a footnote pushed a CRITICAL undecided check (contrast) below three
  // decided serious ones. They belong in the order their severity earns.
  const { ir, scores, hash } = await build('bad.html');
  const { renderTerminal } = await import('../src/reporters/terminal.js');
  const out = renderTerminal({ ir, scores, hash }, { color: false });
  assert.ok(!/not decided here:/.test(out), 'undecided findings are no longer a separate footnote');
  assert.match(out, /\? color-contrast/, 'the undecided check must appear in the list, as a question');
  assert.match(out, /could not be decided in this environment/);
});

test('an unmeasured pillar never claims it found nothing', async () => {
  // "not measured in this build — no decided findings" reads as four passes.
  const { ir, scores, hash } = await build('bad.html');
  const { renderTerminal } = await import('../src/reporters/terminal.js');
  const { renderReport } = await import('../src/reporters/html.js');
  const term = renderTerminal({ ir, scores, hash }, { color: false });
  const html = renderReport({ ir, scores, hash }, {});
  for (const output of [term, html]) {
    assert.ok(!/not measured in this build — no decided findings/.test(output));
    assert.ok(!/not measured in this build — no findings/.test(output));
  }
  assert.match(term, /FAST\s+—\s+·\s+not measured in this build/);
});

test('a fragment is not a page, and does not claim to be', async () => {
  // A user pasted one component and was told their page had no title and no language. Those
  // findings are about the surrounding document, which was never in the input.
  const html = await readFile(new URL('../fixtures/fragment.html', import.meta.url), 'utf8');
  const { ir, scores, hash } = await analyze({ html, uri: 'file:///fragment.html', engines });
  assert.equal(ir.provenance.kind, 'fragment');
  const documentLevel = ir.findings.filter((f) =>
    ['document-title', 'html-has-lang'].includes(f.ruleId)
  );
  assert.ok(documentLevel.length > 0, 'the checks still run');
  for (const finding of documentLevel) {
    assert.equal(finding.coverage, 'incomplete', 'but their answer is not about this input');
    assert.match(finding.coverageReason, /fragment/);
  }
  const { renderTerminal } = await import('../src/reporters/terminal.js');
  const out = renderTerminal({ ir, scores, hash }, { color: false });
  assert.match(out, /this input is a fragment, not a whole page/);
});

test('a whole document is still checked as a document', async () => {
  const { ir } = await build('bad.html');
  assert.equal(ir.provenance.kind, 'document');
  const lang = ir.findings.find((f) => f.ruleId === 'html-has-lang');
  assert.equal(lang.coverage, 'automated', 'a real page without a language is a real finding');
});

test('best-practice rules run, so a page cannot pass by skipping landmarks', async () => {
  // Only WCAG-tagged rules were being run, which excluded 30 rules including region,
  // heading-order, landmark-one-main and page-has-heading-one. A page with content outside any
  // landmark scored as if nothing were wrong. This asserts the rule set, not a number.
  const html = `<!doctype html><html lang="en"><head><title>t</title></head>
<body><h1>a</h1><h3>skipped</h3><p>outside any landmark</p></body></html>`;
  const { ir } = await analyze({ html, uri: 'file:///bp.html', engines });
  const rules = new Set(ir.findings.map((f) => f.ruleId));
  assert.ok(rules.has('region'), 'content outside a landmark must be found');
  assert.ok(rules.has('heading-order'), 'a skipped heading level must be found');
});
