/**
 * Finding identity: the anchor a baseline, a diff and a code-scanning annotation hang on.
 *
 * Why this is a module and not a field on the finding. The IR records *facts about the page*; an
 * identity is a judgement about which fact is the same fact next Tuesday. Putting it in the IR would
 * put that judgement inside the content address (`contentHash` walks every finding), so two engine
 * versions that disagree about anchoring would produce different IR handles for one page — and the
 * handle is the thing caches, share links and studio "has this changed" all depend on. Kept beside the
 * IR, identity can evolve without invalidating a single artifact.
 *
 * Why not the existing `finding.id`. It is `ruleId:selector`, and axe selectors are positional:
 * `body > div:nth-child(4) > a`. Insert an unrelated banner above that div and every finding on the
 * page gets a new id, which under a naive diff reads as "41 regressions, 41 fixes" on a commit that
 * added a header. A gate that lies like that gets switched off — the #1 failure mode `docs/PLAN.md`
 * §3.2 names — so the anchor deliberately throws away exactly the part that drifts.
 *
 * What "stable" means here, concretely:
 *
 *  - **Position is dropped.** `:nth-child`, `:nth-of-type` and friends carry no information about the
 *    author's intent, only about what the renderer saw first.
 *  - **The path is cut at the nearest id.** An `id` already pins an element, so its ancestors add
 *    nothing except opportunities to change.
 *  - **`html`/`body` are dropped.** They are the document, not a location in it.
 *  - **Multiplicity is counted, not distinguished.** Three identical `<div class="card">` siblings with
 *    the same problem produce one entry with `count: 3`. Which of the three you fixed is not knowledge
 *    anyone needs, and pretending to track it is how an anchor becomes a lie.
 *
 * What it does NOT buy: an anchor with no id and no named attribute is `shape` — tag and class only. Two
 * structurally identical elements are then the same entry, and a rename in the CSS moves one. That is
 * recorded per entry (`anchorKind`) and summarised by `identityFragility`, because a gate whose anchors
 * are all `shape` is softer than its green checkmark implies, and the reader should be able to find that
 * out without reading this file.
 */

import { createHash } from 'node:crypto';

import { ID_LENGTH } from './config/brand.js';
import { IMPACT_RANK } from './vocabulary.js';

/** Selector pieces that describe render order rather than the document. */
const POSITIONAL =
  /:(?:nth-(?:last-)?(?:child|of-type)|first-(?:child|of-type)|last-(?:child|of-type)|only-(?:child|of-type)|eq|index)\([^)]*\)/gi;

/** Elements that are the document rather than a place in it. */
const ROOTS = new Set(['html', 'body', '#document', '#root']);

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * The structural anchor of one finding, and how much it can be trusted.
 *
 * Returns `kind: 'document'` for the findings that describe the page as a whole (`document-title`),
 * which have no element to anchor on — they are stable by nature, and saying so beats inventing a
 * selector for them.
 */
export function anchorOf(finding) {
  const selector = typeof finding?.selector === 'string' ? finding.selector.trim() : '';
  if (!selector) return { anchor: '(document)', kind: 'document' };

  const parts = selector
    .split('>')
    .map((part) => part.replace(POSITIONAL, '').trim())
    .filter(Boolean);

  // A finding whose only location *is* the document (`html-has-lang` reports on `html`) is a document fact:
  // there is one `html` element per page, so it needs no anchor and none should be invented for it.
  if (parts.every((part) => ROOTS.has(part.toLowerCase()))) return { anchor: '(document)', kind: 'document' };
  while (parts.length > 1 && ROOTS.has(parts[0].toLowerCase())) parts.shift();

  // Cut at the first component that carries an id — either `#hero` or `[id="hero"]`.
  const idAt = parts.findIndex((part) => /#|\[id[~=^|$*]?=/i.test(part));
  const kept = idAt > 0 ? parts.slice(idAt) : parts;

  const anchor = kept.length ? kept.join(' > ') : parts.join(' > ');
  const kind = idAt !== -1 ? 'id' : /\[[^\]]*=/.test(anchor) ? 'named' : 'shape';
  return { anchor, kind };
}

/**
 * The key a baseline stores and a diff compares.
 *
 * The rule id is kept in plain text on the left of `@` so a `git diff` of a baseline file reads as
 * "region@… +1" rather than an opaque blob — the file is committed and reviewed by humans, and an
 * unreadable gate file is a gate nobody audits.
 */
export function identityOf(finding) {
  const { anchor, kind } = anchorOf(finding);
  const digest = sha256(`${finding.ruleId}\u0000${anchor}`).slice(0, ID_LENGTH);
  return { key: `${finding.ruleId}@${digest}`, anchor, kind };
}

/**
 * Findings collapsed to entries: one row per identity, with a count and the worst impact seen.
 *
 * Sorted by key, because the baseline file is a committed artifact and a reorder in it is noise in
 * every later diff. `sha256` of the same facts is the same string on every machine, which is the whole
 * reason the file can be written on a laptop and trusted in CI.
 */
export function groupByIdentity(findings) {
  const byKey = new Map();
  for (const finding of findings ?? []) {
    const { key, anchor, kind } = identityOf(finding);
    const entry =
      byKey.get(key) ??
      { key, ruleId: finding.ruleId, pillar: finding.pillar ?? null, anchor, anchorKind: kind, impact: null, count: 0 };
    entry.count += 1;
    if (worseImpact(finding.impact, entry.impact) === finding.impact) entry.impact = finding.impact;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The more severe of two impacts, with unknown impacts ranked last. */
export function worseImpact(a, b) {
  const rank = (impact) => IMPACT_RANK[impact] ?? IMPACTS.length;
  if (b === null || b === undefined) return a;
  if (a === null || a === undefined) return b;
  return rank(a) <= rank(b) ? a : b;
}

/**
 * True when `candidate` is strictly more severe than `current`.
 *
 * An impact either side does not know is *not* an escalation. A gate that blocks on "we have no idea what
 * it was before" is indistinguishable from a gate that blocks on everything, and the second one gets
 * switched off — so unknown data reports, it does not decide.
 */
export function isEscalation(candidate, current) {
  const rank = (impact) => IMPACT_RANK[impact];
  if (rank(candidate) === undefined || rank(current) === undefined) return false;
  return rank(candidate) < rank(current);
}

/**
 * How much of an entry set rests on `shape` anchors.
 *
 * Printed next to the gate result, so "green" never quietly means "green on anchors that a class
 * rename could shuffle".
 */
export function identityFragility(entries) {
  const total = entries.length;
  const byKind = { id: 0, named: 0, shape: 0, document: 0 };
  for (const entry of entries) byKind[entry.anchorKind] = (byKind[entry.anchorKind] ?? 0) + 1;
  return { total, byKind, positional: byKind.shape ?? 0 };
}
