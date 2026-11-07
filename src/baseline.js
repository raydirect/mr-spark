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
 *    `target.file` is a basename for the human reading the diff, and is never compared.
 *  - **Counts, not identities of individuals.** See `src/identity.js`: three sibling cards with the same
 *    problem are `count: 3`, so fixing any one of them moves the number without inventing a name.
 *
 * A rule that did not exist when the baseline was written does not fail the build by default: shipping a
 * new rule must not turn every existing repo red on the day we release it. Those findings are reported
 * and adoptable with one command, and `--strict` makes them block anyway for a repo that wants that.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

import { groupByIdentity, identityFragility, isEscalation } from './identity.js';
import { countsTowardScore } from './vocabulary.js';
import { SCORE_SPEC_VERSION } from './score.js';
import { IR_VERSION } from './ir.js';
import { NAME, VERSION } from './config/brand.js';
import { copy } from './config/copy.js';

export const BASELINE_FILENAME = '.spark-baseline.json';
export const BASELINE_VERSION = 1;

const TOP_KEYS = new Set(['baseline', 'engine', 'target', 'score', 'ir', 'rules', 'anchors', 'findings']);
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

/** Snapshot the current run into a baseline object. Deterministic by construction: sorted, no clock. */
export function snapshot({ ir, scores, hash }) {
  const entries = gateEntries(ir);
  const rules = [...new Set(entries.map((entry) => entry.ruleId))].sort();
  const uri = String(ir?.provenance?.uri ?? '');
  return {
    baseline: BASELINE_VERSION,
    engine: { name: NAME, version: VERSION, scoreSpec: SCORE_SPEC_VERSION, irVersion: IR_VERSION },
    target: {
      source: ir?.provenance?.source ?? null,
      // Compared, because a fragment and a whole page are not the same measurement — see `comparable`.
      kind: ir?.provenance?.kind ?? null,
      // Never compared: renaming a file is not an accessibility regression.
      file: basename(uri.replace(/^file:\/\//, '')) || null,
    },
    // Stored for the reader of the diff, not used by the comparison: the score is re-derived from the
    // findings on every run, and a baseline that pinned an old score would invite somebody to gate on it.
    score: { accessible: scores?.accessible ?? null },
    ir: hash ?? null,
    rules,
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

/**
 * Validate a parsed baseline. Fails loudly rather than half-working, because a silently-ignored field
 * in a gate file is a rule nobody is enforcing.
 */
export function parseBaseline(raw, path = BASELINE_FILENAME) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BaselineError(copy('errors.baselineShape'), path);
  }
  for (const key of Object.keys(raw)) {
    if (!TOP_KEYS.has(key)) throw new BaselineError(copy('errors.baselineUnknownKey', key), path);
  }
  if (raw.baseline !== BASELINE_VERSION) {
    throw new BaselineError(copy('errors.baselineVersion', String(raw.baseline ?? 'missing'), BASELINE_VERSION), path);
  }
  if (!Array.isArray(raw.findings)) throw new BaselineError(copy('errors.baselineNoFindings'), path);

  const findings = raw.findings.map((entry, index) => {
    const where = copy('errors.baselineEntry', index);
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new BaselineError(where, path);
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
  });

  // Duplicate keys would make the counts meaningless, and a duplicate can only come from a hand edit.
  const seen = new Set();
  for (const entry of findings) {
    if (seen.has(entry.key)) throw new BaselineError(copy('errors.baselineDuplicate', entry.key), path);
    seen.add(entry.key);
  }

  return {
    baseline: raw.baseline,
    engine: raw.engine ?? {},
    target: raw.target ?? {},
    score: raw.score ?? {},
    ir: raw.ir ?? null,
    rules: Array.isArray(raw.rules) ? [...raw.rules].sort() : [...new Set(findings.map((f) => f.ruleId))].sort(),
    anchors: raw.anchors ?? null,
    findings,
  };
}

/**
 * Whether two runs may be compared at all.
 *
 * `kind` is the one that silently corrupts a verdict: a fragment skips the document-level rules, so
 * comparing a page baseline against a component run finds "0 new" while the page's real problems were
 * never looked at. That is not a pass, so it is not reported as one.
 */
export function comparable(baseline, ir) {
  const kind = ir?.provenance?.kind ?? null;
  if (baseline.target?.kind && baseline.target.kind !== kind) {
    return { ok: false, why: copy('errors.baselineKindMismatch', baseline.target.kind, kind) };
  }
  return { ok: true, why: null };
}

/**
 * Compare a run against its baseline.
 *
 * Returns the arithmetic plus the words the reader needs to act: `blocking` (new findings on rules the
 * baseline knew about, and escalations), `adoptable` (new findings on rules the baseline had never seen),
 * `resolved` (things that got better). `ok` is `blocking.length === 0`, and nothing else can set it.
 */
export function compare(baseline, ir, { strict = false } = {}) {
  const check = comparable(baseline, ir);
  if (!check.ok) throw new BaselineError(check.why);

  const known = new Set(baseline.rules);
  const byKey = new Map(baseline.findings.map((entry) => [entry.key, entry]));
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
    const knownRule = before !== null || known.has(entry.ruleId);
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

  // Both lists are the same field read two ways, so `--strict` moving a row from one to the other cannot
  // desynchronise the counts from the verdict.
  const blocking = entries.filter((entry) => entry.added > 0 && entry.blocking);
  const adoptable = entries.filter((entry) => entry.added > 0 && !entry.blocking);
  const escalated = entries
    .filter((entry) => entry.escalated)
    .map((entry) => ({ ...entry, from: entry.fromImpact, to: entry.impact }));

  const resolved = baseline.findings
    .map((before) => {
      const now = entries.find((entry) => entry.key === before.key);
      return { ...before, gone: before.count - (now?.count ?? 0) };
    })
    .filter((entry) => entry.gone > 0);

  const counts = {
    blocking: blocking.reduce((sum, entry) => sum + entry.added, 0),
    adoptable: adoptable.reduce((sum, entry) => sum + entry.added, 0),
    escalated: escalated.length,
    resolved: resolved.reduce((sum, entry) => sum + entry.gone, 0),
    unchanged: entries.reduce((sum, entry) => sum + Math.min(entry.count, entry.from), 0),
  };

  return {
    ok: counts.blocking + counts.escalated === 0,
    strict,
    entries: entries.filter((entry) => entry.state !== 'unchanged'),
    states: Object.fromEntries(entries.map((entry) => [entry.key, entry.state])),
    blocking,
    adoptable,
    escalated,
    resolved,
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
 * then what to do about it. A new rule is never folded into the "new" count, because that would hide the
 * one fact a maintainer needs: these findings are ours, not theirs.
 */
export function renderGate(diff, { color = null } = {}) {
  const { counts } = diff;
  const mark = diff.ok ? '✓' : '✗';
  const lines = [
    `  ${mark} ${copy('gate.summary', counts.blocking, counts.escalated, counts.resolved, counts.unchanged)}`,
  ];

  const show = (entry) =>
    `      ${copy('gate.entry', entry.ruleId, entry.added, entry.anchor ?? '(document)', entry.impact ?? 'unknown')}`;
  for (const entry of diff.blocking.slice(0, 5)) lines.push(show(entry));
  if (diff.blocking.length > 5) lines.push(`      ${copy('gate.more', diff.blocking.length - 5)}`);
  for (const entry of diff.escalated.slice(0, 3)) {
    lines.push(`      ${copy('gate.escalated', entry.ruleId, entry.from, entry.to, entry.anchor ?? '(document)')}`);
  }
  if (counts.adoptable > 0) {
    lines.push(
      `  ${copy('gate.adoptable', counts.adoptable, diff.adoptable.map((entry) => entry.ruleId).join(', '))}`,
    );
  }
  if (diff.spec.changed) {
    lines.push(`  ${copy('gate.specChanged', diff.spec.baseline ?? '?', diff.spec.current)}`);
  }
  if (!diff.ok) lines.push(`  ${copy('gate.howToFix')}`);
  return lines;
}
