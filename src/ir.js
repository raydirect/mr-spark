/**
 * Spark IR 0.1 — the standard-shaped artifact.
 *
 * Design rules (see docs/VISION.md):
 *  - An IR is a pure value: plain JSON, deterministic, byte-diffable, content-addressable.
 *  - Absent facts are ABSENT, never invented. `null` means "asked and not available";
 *    a missing key means "this pillar was not collected".
 *  - Every fact carries provenance so a finding can always be traced to where it came from.
 *
 * A collector (CLI, snippet, extension, CI) builds facts. The engine only ever reads facts.
 */

import { ENV } from './config/constants.js';

export const IR_VERSION = '0.1';

/**
 * Coverage values a finding may carry. Defined here because the IR owns its own enum: the
 * artifact must be valid without importing a scoring module. `src/vocabulary.js` re-exports
 * these so consumers have one import for the shared vocabulary.
 */
export const COVERAGE = Object.freeze({
  /** The check ran and reached a verdict. Counts as damage. */
  automated: 'automated',
  /** The check could not be decided in this environment. Never damage, never a violation. */
  incomplete: 'incomplete',
});

/**
 * Why a check was not decided. Two different questions wear the same `incomplete` coverage, and
 * conflating them was a real defect: a static-DOM analysis reported `aria-label on a div` as
 * "this environment has no canvas", which is false and made every undecided count untrustworthy.
 *
 * `environment` — the answer needs a capability this run did not have. Computed contrast needs a
 *   canvas. The page might be perfectly accessible; we simply cannot see it.
 * `judgement`   — the answer needs a rendering surface or a human eye. "Is this label well
 *   supported on this element" and "is this element visible" cannot be answered from markup at all,
 *   in any environment, because they depend on the browser's accessibility tree and on layout.
 *
 * The distinction matters downstream: a `judgement` finding usually points at a real problem that
 * the author can go and look at, while an `environment` finding is our blindness, not theirs.
 */
export const UNDECIDED = Object.freeze({
  environment: 'environment',
  judgement: 'judgement',
});

/** Pillars, in the order they are reported. */
export const PILLARS = ['accessible', 'fast', 'safe', 'legible', 'resilient'];

/** Which pillars this build can actually collect. Everything else reports as unmeasured. */
export const COLLECTABLE = new Set(['accessible']);

const encoder = new TextEncoder();

/**
 * Stable stringify: sorted keys, no whitespace, so the hash is reproducible across
 * machines and locales. This is what makes `spark://ir/<sha256>` a real content address.
 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * Fields that record *where* something was read from, not *what* it says.
 *
 * They belong in an IR file — a studio needs the path to open the right document — and not in its
 * content address. Absolute paths in the handle made two checkouts of byte-identical documents hash
 * differently, which quietly destroys every use the handle has off one machine: a CI cache key, a
 * shareable `spark://ir/<sha256>`, a studio's "has this changed since I opened it". Extending these
 * lists is the price of keeping "content address" true instead of a fingerprint of one directory layout.
 */
const VOLATILE = {
  provenance: ['collectedAt', 'uri', 'documents'],
  assets: ['resolvedPath'],
};

/**
 * A canonical view for hashing: same facts, no machine-local paths, at any depth.
 *
 * Keyed by the *property name that holds them* rather than a hardcoded walk, because collectors nest
 * provenance and assets freely (the document block carries its own `assets`). A field is volatile
 * wherever it appears under that name; that is what makes the name worth defining.
 */
function canonical(value, key = null) {
  if (Array.isArray(value)) return value.map((item) => canonical(item, key));
  if (!value || typeof value !== 'object') return value;
  const drop = VOLATILE[key] ?? [];
  const out = {};
  for (const [name, child] of Object.entries(value)) {
    if (drop.includes(name)) continue;
    out[name] = canonical(child, name);
  }
  return out;
}

/**
 * The content address: SHA-256 over the IR with volatile provenance removed.
 *
 * Two runs over the same page must yield the same handle, or the handle is useless as a cache key or a
 * shareable id. `collectedAt` is provenance, not content, and neither a document's `uri` nor an asset's
 * resolved path is a fact about the design.
 */
export async function contentHash(ir) {
  const { provenance, ...content } = ir;
  const { collectedAt, uri, documents, ...stableProvenance } = provenance ?? {};
  // Sources stay in the handle by kind and basename — the same identity the emitted page prints in its
  // header — so two clones agree while the handle still says *which* documents it came from.
  const sources = Object.keys(documents ?? {})
    .sort()
    .map((kind) => `${kind}:${String(documents[kind]).split(/[\\/]/).pop()}`);
  return hashIR(canonical({ ...content, provenance: { ...stableProvenance, sources } }));
}

/** SHA-256 of the canonical form. Used as the IR handle — never a session id. */
export async function hashIR(ir) {
  const bytes = encoder.encode(stableStringify(ir));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Create an empty IR shell. Collectors attach facts to it. */
/**
 * Collection time, reproducible on request.
 *
 * Honouring SOURCE_DATE_EPOCH (the reproducible-builds convention) is what lets two runs
 * produce byte-identical reports, including the timestamp — which is the only way a "diff two
 * reports" test can be honest.
 */
function collectedAt() {
  const epoch = process.env[ENV.sourceDateEpoch];
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000).toISOString();
  return new Date().toISOString();
}

export function createIR({ source, uri, kind = 'document' }) {
  return {
    ir: IR_VERSION,
    provenance: {
      source, // 'file' | 'url' | 'capture'
      uri,
      collectedAt: collectedAt(),
      collector: 'spark-cli',
      /**
       * 'document' - a complete page: document-level checks are meaningful.
       * 'fragment' - an excerpt or component: checks that describe a DOCUMENT (a title, a
       * language) are not evidence about the page that contains it, and saying so is the whole
       * point of the field. A developer who pastes one component should not be told their page
       * has no title.
       */
      kind,
    },
    document: null,
    tokens: null,
    motion: null,
    data: null,
    tools: null,
    findings: [],
  };
}

/**
 * Attach a finding. Ids are stable and content-derived so baselines and diffs are
 * trustworthy: the same problem in the same place always yields the same id.
 */
export function addFinding(ir, finding) {
  const normalized = {
    ruleId: finding.ruleId,
    impact: finding.impact ?? 'serious',
    pillar: finding.pillar ?? 'accessible',
    message: finding.message,
    selector: finding.selector ?? null,
    snippet: finding.snippet ?? null,
    help: finding.help ?? null,
    coverage: finding.coverage ?? COVERAGE.automated,
    /** Why a check could not be decided. Null when it was decided. */
    coverageReason: finding.coverageReason ?? null,
    /**
     * Which KIND of undecided this is: `environment` (we lacked a capability) or `judgement` (no
     * environment could answer it from markup). Null when the finding was decided.
     */
    undecidedKind: finding.coverage === COVERAGE.incomplete ? finding.undecidedKind ?? UNDECIDED.judgement : null,
    /**
     * True when a project config suppressed this finding. Suppressed findings stay in the IR -
     * deleting them would make the report lie about what the page contains - but they never
     * count toward the score, and every surface counts them out loud.
     */
    suppressed: finding.suppressed === true,
    /** Why somebody decided this is deliberate. Required by the config schema. */
    suppressionReason: finding.suppressionReason ?? null,
    locations: finding.locations ?? [],
  };
  normalized.id = `${normalized.ruleId}:${normalized.selector ?? ''}`;
  ir.findings.push(normalized);
  return normalized;
}

/** Deterministic ordering: by pillar, then rule, then selector. */
export function sortFindings(ir) {
  const pillarRank = new Map(PILLARS.map((p, i) => [p, i]));
  ir.findings.sort((a, b) => {
    const p = (pillarRank.get(a.pillar) ?? 99) - (pillarRank.get(b.pillar) ?? 99);
    if (p !== 0) return p;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return ir;
}
