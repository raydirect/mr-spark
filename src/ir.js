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

export const IR_VERSION = '0.1';

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
 * The content address: SHA-256 over the IR with volatile provenance removed.
 *
 * Two runs over the same page must yield the same handle, or the handle is useless as a
 * cache key, a shareable id, or the "explicit handle" the MCP server hands back instead of a
 * session. So `collectedAt` is provenance, not content, and it is excluded.
 */
export async function contentHash(ir) {
  const { provenance, ...content } = ir;
  const { collectedAt, ...stableProvenance } = provenance ?? {};
  return hashIR({ ...content, provenance: stableProvenance });
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
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000).toISOString();
  return new Date().toISOString();
}

export function createIR({ source, uri }) {
  return {
    ir: IR_VERSION,
    provenance: {
      source, // 'file' | 'url' | 'capture'
      uri,
      collectedAt: collectedAt(),
      collector: 'spark-cli',
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
    coverage: finding.coverage ?? 'automated',
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
