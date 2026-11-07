/**
 * The baseline — the file that turns "fix everything" into "do not make it worse".
 *
 * The problem this exists for is not technical. A client repo has 400 findings on day one; a gate that
 * fails on all 400 gets `continue-error: true` added to the workflow inside a week, and then the tool is
 * dead in that project for good. `docs/PLAN.md` §3.2 calls this the #1 failure mode of every predecessor.
 * So the gate's first job is to be *green on the day you install it*, while still being honest about the
 * 400: the baseline commits them, with their counts, in a file a human can read in a pull request.
 *
 * What goes in the file, and what is deliberately left out:
 *
 *  - **Decided, unsuppressed findings only** (`countsTowardScore`). A suppressed finding is already
 *    waived with a stated reason and a printed count; putting it in the baseline would make the waiver
 *    do double duty as a gate policy.
 *  - **No undecided findings.** They measure *our* missing capability, not the page. A laptop with no
 *    canvas and a CI runner with one would disagree forever, and a gate that fails because the
 *    environment changed is a gate that gets removed. The count still appears in every report.
 *  - **No timestamp, no absolute paths.** This file is committed, so it must be byte-identical when two
 *    people generate it from the same page — the same rule `schema/` follows, and for the same reason.
 *  - **Counts, not identities of individuals.** See `src/identity.js`: three sibling cards with the same
 *    problem are `count: 3`, so fixing any one of them moves the number without inventing a name.
 *  - **One section per page, and no number for the set.** `pages[]` is keyed by each page's path from the
 *    directory the command ran in (`src/targets.js` owns that rule), because an anchor digest cannot say
 *    which document it came from. Scores stay per page: an average over pages is how a hundred-page site
 *    gets to ship one page at 12. `baseline: 1` files — the same content with one page at the top level —
 *    are promoted on read, never rejected, and a repo-wide run says so once.
 *
 * A rule the *file* never listed does not fail the build when the file came from a different build than this
 * one: shipping a new rule must not turn every existing repo red on the day we release it. Those findings are
 * reported and adoptable with one command, and `--strict` makes them block anyway. Same build, unrecorded rule
 * is a regression — see ADR 0007 for why the test is the engine stamp and not the page's rule list.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { groupByIdentity, identityFragility, isEscalation } from './identity.js';
import { countsTowardScore } from './vocabulary.js';
import { SCORE_SPEC_VERSION } from './score.js';
import { IR_VERSION } from './ir.js';
import { NAME, VERSION } from './config/brand.js';
import { copy } from './config/copy.js';
import { urlKey } from './targets.js';

/**
 * The gate file's name and version.
 *
 * `baseline: 2` is one shape: a list of pages, each with its own findings. `baseline: 1` described a single
 * target (`target`, `findings`, `rules` at the top level) and is *read* by promoting it to one page keyed by
 * the basename it recorded — the finding keys are unchanged between the two, because the key is
 * `rule@anchor-digest` and no anchor normalisation moved. So nobody has to regenerate a baseline to upgrade
 * the tool, and a project that only ever gates one page never sees a difference. Writing always produces 2.
 */
export const BASELINE_FILENAME = '.spark-baseline.json';
export const BASELINE_VERSION = 2;

/** Versions this build can read. `1` is promoted on load; anything else is refused rather than guessed at. */
export const BASELINE_VERSIONS_READ = [1, 2];

const TOP_KEYS = new Set(['baseline', 'engine', 'pages']);
const LEGACY_TOP_KEYS = new Set(['baseline', 'engine', 'target', 'score', 'ir', 'rules', 'anchors', 'findings']);
const PAGE_KEYS = new Set(['page', 'source', 'kind', 'ir', 'score', 'rules', 'anchors', 'findings']);
const ENTRY_KEYS = new Set(['key', 'ruleId', 'pillar', 'anchor', 'anchorKind', 'impact', 'count']);

/** Thrown for a baseline file that cannot be trusted, with the path so a wrong `--baseline` is obvious. */
export class BaselineError extends Error {
  constructor(message, path = BASELINE_FILENAME) {
    super(`${path}: ${message}`);
    this.name = 'BaselineError';
    this.path = path;
  }
}

/** The findings the gate prices: the same set the score is computed from, never a fourth definition. */
export function gateEntries(ir) {
  return groupByIdentity((ir?.findings ?? []).filter(countsTowardScore));
}

/**
 * Accept either one `{ ir, scores, hash }` run or a list of `{ page, ir, scores, hash }`.
 *
 * The single form is not a compatibility shim for old callers: it is the common case, and a page keyed by
 * its basename is what one file named on the command line *is*.
 */
export function normalizePages(input) {
  const one = (entry) => {
    // A bare IR — `{ findings, provenance }`, the shape `compare()` has taken since v1 and the shape a
    // caller building a synthetic page already has — is one page too. Accepting both costs one line and
    // saves every caller from inventing a wrapper.
    const ir = entry.ir ?? (entry.findings || entry.provenance ? entry : null);
    return { ...entry, ir, page: entry.page ?? pageKeyOf(ir) };
  };
  return Array.isArray(input) ? input.map(one) : [one(input)];
}

/**
 * A page's key when the caller did not name it — the same rule `src/targets.js` uses, on purpose.
 *
 * `spark baseline <page>` is how a baseline is written, and `serialize(snapshot(...))` is how our own tests
 * check that the committed file still matches the page. If the two derived names differently, the file would
 * be forever one byte out of date, so both sides ask this function.
 *
 * Inside the run's directory the name is the path relative to it; outside, the basename. A synthetic IR with
 * no file behind it therefore still gets a readable name (`page.html`) rather than a walk up the filesystem.
 */
function pageKeyOf(ir) {
  const uri = String(ir?.provenance?.uri ?? '');
  if (/^file:\/\//.test(uri)) {
    let path;
    try {
      path = fileURLToPath(uri);
    } catch {
      path = uri.replace(/^file:\/\//, '');
    }
    const rel = relative(process.cwd(), path).split(sep).join('/');
    if (rel && !rel.startsWith('..') && !rel.startsWith('/')) return rel;
    return basename(path) || null;
  }
  if (!uri) return null;
  // Same function the resolver uses, so a URL page is the same page in both directions.
  try {
    return urlKey(uri);
  } catch {
    return uri.replace(/\/$/, '') || '/';
  }
}

/** One page's section: the entries, the rules they came from, and how much the anchors can be trusted. */
export function snapshotPage({ page, ir, scores, hash }) {
  const entries = gateEntries(ir);
  return {
    page,
    source: ir?.provenance?.source ?? null,
    // Compared, because a fragment and a whole page are not the same measurement — see `comparable`.
    kind: ir?.provenance?.kind ?? null,
    // Never compared: renaming a file is not an accessibility regression, and a moved page is handled as a
    // new page rather than as 400 fixed ones.
    ir: hash ?? null,
    // Stored for the reader of the diff, not used by the comparison: the score is re-derived from the
    // findings on every run, and a baseline that pinned an old score invites somebody to gate on it.
    score: { accessible: scores?.accessible ?? null },
    rules: [...new Set(entries.map((entry) => entry.ruleId))].sort(),
    anchors: identityFragility(entries),
    findings: entries.map((entry) => ({
      key: entry.key,
      ruleId: entry.ruleId,
      pillar: entry.pillar,
      anchor: entry.anchor,
      anchorKind: entry.anchorKind,
      impact: entry.impact,
      count: entry.count,
    })),
  };
}

/** Snapshot a run into a baseline object. Deterministic by construction: sorted, no clock, no cwd. */
export function snapshot(input) {
  return {
    baseline: BASELINE_VERSION,
    engine: { name: NAME, version: VERSION, scoreSpec: SCORE_SPEC_VERSION, irVersion: IR_VERSION },
    pages: normalizePages(input).map(snapshotPage),
  };
}

/** Serialise for the disk. Two-space JSON, trailing newline, keys in declaration order. */
export function serialize(baseline) {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

/**
 * Write it. Parent directories are created, because a project that keeps the gate file under `gate/`
 * should not have to pre-create that directory before its own tool will write into it.
 */
export async function writeBaseline(path, baseline) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serialize(baseline), 'utf8');
  return path;
}

/** Read and validate a baseline. `null` when the file simply is not there — absence is a state, not an error. */
export async function readBaseline(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new BaselineError(copy('errors.baselineUnreadable', error.message), path);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new BaselineError(copy('errors.baselineNotJson', cause.message), path);
  }
  return parseBaseline(raw, path);
}

/** One `{ key, ruleId, … }` row, validated. `where` names the page and index so a hand edit is fixable. */
function parseEntry(entry, where, path) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new BaselineError(`${where}: ${copy('errors.baselineEntryShape')}`, path);
  }
  for (const key of Object.keys(entry)) {
    if (!ENTRY_KEYS.has(key)) throw new BaselineError(`${where}: ${copy('errors.baselineUnknownKey', key)}`, path);
  }
  if (typeof entry.key !== 'string' || !entry.key.includes('@')) {
    throw new BaselineError(`${where}: ${copy('errors.baselineEntryKey')}`, path);
  }
  if (!Number.isInteger(entry.count) || entry.count < 1) {
    throw new BaselineError(`${where}: ${copy('errors.baselineEntryCount')}`, path);
  }
  return {
    key: entry.key,
    ruleId: entry.ruleId ?? entry.key.split('@')[0],
    pillar: entry.pillar ?? null,
    anchor: entry.anchor ?? null,
    anchorKind: entry.anchorKind ?? 'unknown',
    impact: entry.impact ?? null,
    count: entry.count,
  };
}

/**
 * @param {string} label the page the list belongs to, or '' when the file predates pages — every message
 *   here is a locator first, because a person editing a 12-page baseline needs to know *which* page.
 */
function parseFindings(list, label, path) {
  const at = label ? `${label}: ` : '';
  if (!Array.isArray(list)) throw new BaselineError(`${at}${copy('errors.baselineNoFindings')}`, path);
  const findings = list.map((entry, index) =>
    parseEntry(entry, `${at ? `${label}:` : ''} findings[${index}]`.trim(), path)
  );
  // Duplicate keys would make the counts meaningless, and a duplicate can only come from a hand edit.
  const seen = new Set();
  for (const entry of findings) {
    if (seen.has(entry.key)) throw new BaselineError(`${at}${copy('errors.baselineDuplicate', entry.key)}`, path);
    seen.add(entry.key);
  }
  return findings;
}

function parsePage(raw, path) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BaselineError(copy('errors.baselinePageShape'), path);
  }
  for (const key of Object.keys(raw)) {
    if (!PAGE_KEYS.has(key)) throw new BaselineError(copy('errors.baselineUnknownKey', key), path);
  }
  if (typeof raw.page !== 'string' || !raw.page.trim()) {
    throw new BaselineError(copy('errors.baselinePageKey'), path);
  }
  const findings = parseFindings(raw.findings ?? [], raw.page, path);
  return {
    page: raw.page,
    source: raw.source ?? null,
    kind: raw.kind ?? null,
    ir: raw.ir ?? null,
    score: raw.score ?? { accessible: null },
    rules: Array.isArray(raw.rules)
      ? [...raw.rules].sort()
      : [...new Set(findings.map((entry) => entry.ruleId))].sort(),
    anchors: raw.anchors ?? null,
    findings,
  };
}

/** `baseline: 1` recorded one target at the top level; the finding keys themselves did not change. */
function promoteV1(raw, path) {
  const findings = parseFindings(raw.findings ?? [], '', path);
  return {
    page: raw.target?.file ?? null,
    source: raw.target?.source ?? null,
    kind: raw.target?.kind ?? null,
    ir: raw.ir ?? null,
    score: raw.score ?? { accessible: null },
    rules: Array.isArray(raw.rules) ? [...raw.rules].sort() : [...new Set(findings.map((entry) => entry.ruleId))].sort(),
    anchors: raw.anchors ?? null,
    findings,
  };
}

/**
 * Validate a parsed baseline, and promote a `baseline: 1` file to the current shape.
 *
 * Fails loudly rather than half-working, because a silently-ignored field in a gate file is a rule nobody is
 * enforcing. Promotion is the exception: a project that committed a v1 file has a *valid* decision recorded,
 * and refusing to read it would mean every such repository's gate goes red on the day we widen the format.
 */
export function parseBaseline(raw, path = BASELINE_FILENAME) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BaselineError(copy('errors.baselineShape'), path);
  }
  const version = raw.baseline;
  if (!BASELINE_VERSIONS_READ.includes(version)) {
    throw new BaselineError(
      copy(
        'errors.baselineVersion',
        String(version ?? 'missing'),
        BASELINE_VERSIONS_READ.join(' or '),
        BASELINE_VERSION
      ),
      path
    );
  }
  // Checked before the key whitelist on purpose: the likeliest way to write this file wrong is to bump
  // `baseline` to 2 and leave the v1 body underneath, and `unknown key "findings"` would blame the reader
  // for the one thing they were right to keep.
  if (version === 2 && (!Array.isArray(raw.pages) || raw.pages.length === 0)) {
    throw new BaselineError(copy('errors.baselineNoPages'), path);
  }

  const allowed = version === 1 ? LEGACY_TOP_KEYS : TOP_KEYS;
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new BaselineError(copy('errors.baselineUnknownKey', key), path);
  }

  let pages;
  if (version === 1) {
    const promoted = promoteV1(raw, path);
    if (!promoted.page) throw new BaselineError(copy('errors.baselinePageKey'), path);
    pages = [promoted];
  } else {
    if (!Array.isArray(raw.pages) || raw.pages.length === 0) {
      throw new BaselineError(copy('errors.baselineNoPages'), path);
    }
    pages = raw.pages.map((entry) => parsePage(entry, path));
  }

  const seen = new Set();
  for (const page of pages) {
    if (seen.has(page.page)) throw new BaselineError(copy('errors.baselineDuplicatePage', page.page), path);
    seen.add(page.page);
  }

  return {
    baseline: BASELINE_VERSION,
    promoted: version === 1,
    engine: raw.engine ?? {},
    pages,
  };
}

/**
 * Whether one page of a run may be compared to its recorded section at all.
 *
 * `kind` is the one that silently corrupts a verdict: a fragment skips the document-level rules, so
 * comparing a page baseline against a component run finds "0 new" while the page's real problems were never
 * looked at. That is not a pass, so it is not reported as one.
 */
export function comparable(baselinePage, ir) {
  const kind = ir?.provenance?.kind ?? null;
  if (baselinePage?.kind && baselinePage.kind !== kind) {
    return { ok: false, why: copy('errors.baselineKindMismatch', baselinePage.kind, kind) };
  }
  return { ok: true, why: null };
}

/**
 * One page against its section.
 *
 * Returns the arithmetic plus the words the reader needs to act: `blocking` (new findings on rules the
 * baseline knew about, and escalations), `adoptable` (new findings from something the baseline had never
 * seen), `resolved` (things that got better). `ok` is "nothing in `blocking`, nothing escalated".
 *
 * A page with no recorded section passes `null` here, which is what makes a new page behave exactly like a
 * rule we shipped since — reported, not charged, unless `--strict` says otherwise. That is ADR 0005's
 * reasoning applied to pages: neither a new check nor a new page is a regression in what was already there.
 *
 * `knownRules` is the union of every rule id the file recorded anywhere, not this page's own list, and that
 * distinction is the difference between a gate and a formality: a page that was clean when the baseline was
 * written has an empty rule list, so a per-page test would excuse adding an unlabelled image to it — the
 * textbook regression — as "a rule this baseline predates", and the build would go green. What the exemption
 * protects against is *us* shipping a new check, and the honest signal for that is a rule nobody recorded.
 */
export function comparePage(
  baselinePage,
  ir,
  { strict = false, page = null, knownRules = null, engineChanged = true } = {}
) {
  const known = knownRules ?? new Set(baselinePage?.rules ?? []);
  const byKey = new Map((baselinePage?.findings ?? []).map((entry) => [entry.key, entry]));
  const current = gateEntries(ir);

  /**
   * One delta table, so the gate line, the SARIF results and the step summary cannot each do their own
   * arithmetic and disagree. Everything below is derived from these rows.
   *
   * `state` is stamped per *key*, and a key with three identical siblings has no per-element identity to
   * stamp (see `src/identity.js`) — so a grown key is `updated`, not "one of these three is new". That is
   * also the most a SARIF `baselineState` may honestly say.
   */
  const entries = current.map((entry) => {
    const before = byKey.get(entry.key) ?? null;
    const added = before ? Math.max(0, entry.count - before.count) : entry.count;
    const escalated = before !== null && isEscalation(entry.impact, before.impact);
    // Two ways a finding is this build's fault rather than the page's: the anchor was already recorded, or
    // the rule was. The third case ADR 0005 carved out — "a rule this baseline predates" — only means
    // something when the file was written by a *different build*, because that is the only way a rule can
    // be new to a repo without the repo changing. Same build, unrecorded rule is the textbook regression:
    // somebody added an unlabelled image to a page that had been clean.
    const predated = !known.has(entry.ruleId) && engineChanged;
    // A page the file never listed is treated as wholly unknown, which is what makes a new page reported
    // rather than charged — the same rule ADR 0005 set for a new rule, applied to a new page.
    const knownRule = baselinePage !== null && (before !== null || !predated);
    return {
      // The one field a consumer most needs and least deserves to recompute: whether *this* delta is why
      // the build stops. It is `added` on a known rule, or any escalation, and the strictness of the run.
      blocking: (added > 0 && (strict || knownRule)) || escalated,
      key: entry.key,
      ruleId: entry.ruleId,
      anchor: entry.anchor,
      impact: entry.impact,
      fromImpact: before?.impact ?? null,
      from: before?.count ?? 0,
      count: entry.count,
      added,
      escalated,
      known: knownRule,
      state: before === null ? 'new' : added > 0 || escalated ? 'updated' : 'unchanged',
    };
  });

  const blocking = entries.filter((entry) => entry.added > 0 && entry.blocking);
  const adoptable = entries.filter((entry) => entry.added > 0 && !entry.blocking);
  const escalated = entries
    .filter((entry) => entry.escalated)
    .map((entry) => ({ ...entry, from: entry.fromImpact, to: entry.impact }));

  const resolved = (baselinePage?.findings ?? [])
    .map((before) => {
      const now = entries.find((entry) => entry.key === before.key);
      return { ...before, gone: before.count - (now?.count ?? 0) };
    })
    .filter((entry) => entry.gone > 0);

  const counts = {
    blocking: blocking.reduce((sum, entry) => sum + entry.added, 0),
    adoptable: adoptable.reduce((sum, entry) => sum + entry.added, 0),
    // Adoptable for which reason, because the two need different sentences. A rule the file never listed is
    // ours; a page the file never listed is theirs, tomorrow. Folding them into one count tells a maintainer
    // "these are our new checks" about a page they added five minutes ago, and they will not run the command.
    adoptableRule: baselinePage === null ? 0 : adoptable.reduce((sum, entry) => sum + entry.added, 0),
    adoptablePage: baselinePage === null ? adoptable.reduce((sum, entry) => sum + entry.added, 0) : 0,
    escalated: escalated.length,
    resolved: resolved.reduce((sum, entry) => sum + entry.gone, 0),
    unchanged: entries.reduce((sum, entry) => sum + Math.min(entry.count, entry.from), 0),
  };

  return {
    page,
    isNew: baselinePage === null,
    ok: counts.blocking + counts.escalated === 0,
    strict,
    entries: entries.filter((entry) => entry.state !== 'unchanged'),
    states: Object.fromEntries(entries.map((entry) => [entry.key, entry.state])),
    blocking,
    adoptable,
    escalated,
    resolved,
    counts,
  };
}

/**
 * Compare a run — one page or a hundred — against its baseline.
 *
 * The aggregate is the sum of the pages, and every page keeps its own diff so a consumer that needs to know
 * *which* page to blame (`--format sarif`, the step summary, the terminal) can read it without re-deriving
 * anything. Pages recorded in the file but absent from the run are reported as `gone`: they fixed nothing,
 * they were not audited, and counting them as resolved findings would let deleting a page look like an
 * improvement.
 */
export function compare(baseline, input, { strict = false } = {}) {
  const pages = normalizePages(input);
  const knownRules = new Set(baseline.pages.flatMap((entry) => entry.rules ?? []));
  // "Did a different build write this file?" is the question ADR 0005's exemption actually asks, so it is
  // asked of the engine stamp rather than of which findings happened to be in the page's list. A file with
  // no `engine` at all is treated as another build's: nobody is blamed for rules we may have shipped since.
  const engineChanged = (baseline.engine?.version ?? null) !== VERSION;
  const byPage = new Map(baseline.pages.map((entry) => [entry.page, entry]));
  // A promoted `baseline: 1` file named its one page by basename, because that is all v1 had; a run from the
  // project root calls the same page `dist/index.html`. Falling back to the basename for *promoted files
  // only* is the one-time leniency that keeps an upgrade from looking like a renamed repo — and a v2 file is
  // never lenient, because a v2 key is a path somebody chose and can be checked.
  const byBasename = new Map(
    baseline.promoted === true ? baseline.pages.map((entry) => [basename(entry.page), entry]) : []
  );

  const pageDiffs = pages.map(({ page, ir }) => {
    const before = byPage.get(page) ?? byBasename.get(basename(String(page ?? ''))) ?? null;
    const check = comparable(before, ir);
    if (!check.ok) throw new BaselineError(before ? `${page}: ${check.why}` : check.why);
    return comparePage(before, ir, { strict, page, knownRules, engineChanged });
  });

  // A fragment run against a page baseline is refused per pair above — except when the page keys do not
  // match at all, which is exactly what happens when the input is a stdin fragment with no URL to key on.
  // Mixing the two kinds invalidates the whole comparison, not one page of it, so it is checked for the run:
  // a fragment skips the document-level rules, and "0 new" from a run that never looked at them is not a
  // pass. One kind on each side keeps a deliberately mixed baseline (a repo of pages plus components) usable.
  const recorded = new Set(baseline.pages.map((entry) => entry.kind).filter(Boolean));
  const audited = new Set(pages.map((entry) => entry.ir?.provenance?.kind ?? null).filter(Boolean));
  if (recorded.size === 1 && audited.size === 1 && !recorded.has([...audited][0])) {
    throw new BaselineError(copy('errors.baselineKindMismatch', [...recorded][0], [...audited][0]));
  }

  const seen = new Set(pages.map((entry) => entry.page));
  const gone = baseline.pages.filter((entry) => !seen.has(entry.page));
  const newPages = pageDiffs.filter((entry) => entry.isNew);

  const counts = pageDiffs.reduce(
    (total, page) => {
      for (const key of Object.keys(total)) total[key] += page.counts[key];
      return total;
    },
    { blocking: 0, adoptable: 0, adoptableRule: 0, adoptablePage: 0, escalated: 0, resolved: 0, unchanged: 0 }
  );

  return {
    ok: pageDiffs.every((page) => page.ok),
    strict,
    pages: pageDiffs,
    // The flat lists are the per-page lists with their page stamped on, because a consumer that only wants
    // "what is new in this repo" should not have to know that pages exist — and must not be able to compute
    // a different total from the one the gate line printed.
    blocking: pageDiffs.flatMap((page) => page.blocking.map((entry) => ({ ...entry, page: page.page }))),
    adoptable: pageDiffs.flatMap((page) => page.adoptable.map((entry) => ({ ...entry, page: page.page }))),
    escalated: pageDiffs.flatMap((page) => page.escalated.map((entry) => ({ ...entry, page: page.page }))),
    resolved: pageDiffs.flatMap((page) => page.resolved.map((entry) => ({ ...entry, page: page.page }))),
    newPages,
    gone,
    // How many pages in the run the file actually had something to say about. Zero of them means the two
    // sides were keyed from different roots — a renamed page, or `dist` in one command and `.` in the
    // other — and there is no comparison to report. `src/cli.js` calls that a build that did not run.
    overlap: pageDiffs.filter((entry) => !entry.isNew).length,
    promoted: baseline.promoted === true,
    entries: pageDiffs.flatMap((page) => page.entries.map((entry) => ({ ...entry, page: page.page }))),
    // A repo-wide run keys a state by page then finding, because the same anchor digest on two pages is
    // two different facts. One page gets both spellings — the prefixed one and the bare key it has carried
    // since v1 — so a consumer written against the one-page shape keeps working, and cannot silently miss
    // the stamping on a run that happened to grow.
    states: Object.fromEntries(
      pageDiffs.flatMap((page) =>
        Object.entries(page.states).flatMap(([key, state]) =>
          pageDiffs.length === 1
            ? [
                [key, state],
                [`${page.page}\u0000${key}`, state],
              ]
            : [[`${page.page}\u0000${key}`, state]]
        )
      )
    ),
    counts,
    spec: {
      baseline: baseline.engine?.scoreSpec ?? null,
      current: SCORE_SPEC_VERSION,
      changed: (baseline.engine?.scoreSpec ?? null) !== SCORE_SPEC_VERSION,
      engine: { baseline: baseline.engine?.version ?? null, current: VERSION },
    },
  };
}

/**
 * The gate lines, terminal-shaped.
 *
 * Ordering is deliberate: the verdict sentence first (a reader scanning a failed build wants the count),
 * then where it is, then what to do about it. A new rule or a new page is never folded into the "new" count,
 * because that would hide the one fact a maintainer needs: these findings are ours, not theirs.
 *
 * Single-page runs print what they printed before `baseline: 2` existed — same lines, same order — so the
 * output a team has grepped for two releases does not move under them.
 */
export function renderGate(diff) {
  const { counts } = diff;
  const multi = diff.pages.length > 1;
  const mark = diff.ok ? '✓' : '✗';
  const lines = [
    `  ${mark} ${
      multi
        ? copy('gate.pagesSummary', diff.pages.length, counts.blocking, counts.escalated, counts.resolved, counts.unchanged)
        : copy('gate.summary', counts.blocking, counts.escalated, counts.resolved, counts.unchanged)
    }`,
  ];

  // Pages worth a line of their own: anything that blocks, anything new to the file, and anything that got
  // better — a team that deleted 400 findings should see that, or they will assume the gate ignored them.
  const moved = diff.pages.filter((page) => !page.ok || page.isNew || page.counts.resolved > 0);
  if (multi && moved.length) {
    for (const page of moved.slice(0, 5)) {
      lines.push(
        `    ${copy(
          'gate.page',
          page.page,
          page.counts.blocking,
          page.counts.escalated,
          page.counts.resolved,
          page.counts.adoptable,
          page.isNew
        )}`
      );
    }
    if (moved.length > 5) lines.push(`    ${copy('gate.morePages', moved.length - 5)}`);
  }

  const show = (entry) =>
    `      ${entry.page && multi ? `${entry.page} · ` : ''}${copy('gate.entry', entry.ruleId, entry.added, entry.anchor ?? '(document)', entry.impact ?? 'unknown')}`;
  for (const entry of diff.entries.filter((entry) => entry.blocking).slice(0, 5)) lines.push(show(entry));
  const hidden = diff.entries.filter((entry) => entry.blocking).length - 5;
  if (hidden > 0) lines.push(`      ${copy('gate.more', hidden)}`);
  for (const entry of diff.entries.filter((entry) => entry.escalated).slice(0, 3)) {
    lines.push(
      `      ${entry.page && multi ? `${entry.page} · ` : ''}${copy('gate.escalated', entry.ruleId, entry.fromImpact, entry.impact, entry.anchor ?? '(document)')}`
    );
  }

  // Only the rule-caused half gets this sentence: the page-caused half is the `gate.newPages` line below,
  // and printing both about the same findings would offer two different explanations of one number.
  if (counts.adoptableRule > 0) {
    lines.push(
      `  ${copy(
        'gate.adoptable',
        counts.adoptableRule,
        [...new Set(diff.entries.filter((entry) => !entry.blocking && entry.added > 0 && entry.known === false).map((entry) => entry.ruleId))].join(', ')
      )}`,
    );
  }
  if (diff.newPages.length) {
    lines.push(`  ${copy('gate.newPages', diff.newPages.map((page) => page.page))}`);
  }
  if (diff.gone.length) {
    lines.push(`  ${copy('gate.gonePages', diff.gone.map((page) => page.page))}`);
  }
  if (diff.promoted && multi) {
    lines.push(`  ${copy('gate.staleFormat', BASELINE_VERSION)}`);
  }
  if (diff.spec.changed) {
    lines.push(`  ${copy('gate.specChanged', diff.spec.baseline ?? '?', diff.spec.current)}`);
  }
  if (!diff.ok) lines.push(`  ${copy('gate.howToFix')}`);
  return lines;
}
