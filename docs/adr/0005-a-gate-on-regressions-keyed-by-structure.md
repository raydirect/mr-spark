# ADR 0005 — A gate on regressions, keyed by structure

**Date:** 2026-11-07
**Deciders:** repo maintainer, in review with Arena
**Supersedes:** nothing. It implements the gate that `docs/PLAN.md` §3.2 and §4 required, and it is the
reason `docs/SUPPRESSION.md`'s waivers can now stay out of the numbers: this decides what the *gate* is
allowed to see, which is a different question from what the *score* is allowed to see.

## Context

Four things arrived together while writing the gate, and each has an answer that is obviously convenient
and obviously wrong.

1. **A new project's first run is red.** A client repo has hundreds of findings on day one. `docs/PLAN.md`
   §3.2 calls "a build red forever" the most common failure mode of every predecessor in this space: the
   team adds `continue-on-error`, and the tool is dead in that project. So the gate must be able to be
   green on the day it is installed while still telling the truth about what is there.
2. **`finding.id` cannot be the key.** `src/ir.js` builds it as `ruleId:selector`, and axe's selectors are
   positional when nothing else distinguishes an element — `.row:nth-child(1) > input`. Insert a paragraph
   above that row and every id below it changes; a diff keyed on ids reports new findings and fixed
   findings for a commit that touched nothing accessible. `test/identity.test.js` demonstrates this on real
   engine output rather than on a fixture shaped like our assumption.
3. **The IR is a content address.** `contentHash` walks every finding. Anything stored on a finding is
   therefore part of the artifact's identity, and the identity is what the studio, the share links and
   `spark publish`'s verification all compare.
4. **CI wants annotations, not logs.** `docs/PLAN.md` states "no score without the raw findings, emitted
   alongside, in SARIF" as a principle. If the gate's verdict only exists as a line in a log, the pull
   request review does not see it.

## Decision

**Identity is computed on demand, from the finding, and never stored on it.**

`src/identity.js` returns `rule@digest` where the digest covers a *structural anchor* derived from the
selector: positional pseudo-classes dropped, path cut at the nearest `id`, `html`/`body` dropped,
document-level findings given the fixed anchor `(document)`, and identical siblings collapsed into one
entry with a `count`. The anchor and its kind (`id` / `named` / `shape` / `document`) are stored in the
baseline for the human reading the diff; the digest is what the comparison uses.

**The baseline is a committed, reviewed file**: `.spark-baseline.json`, `baseline: 1`, entries of
`{ key, ruleId, pillar, anchor, anchorKind, impact, count }`, deterministic serialisation, no timestamps and
no absolute paths — the same rules `schema/` follows, so two people generate one byte-identical file.
`score` is recorded as context and never compared.

**The gate prices exactly one set: `countsTowardScore`.** Decided and unsuppressed. That is the third
definition of nothing — it is the set the score already uses — and it is why two exclusions are
consequences rather than opinions:

- a *suppressed* finding is already a waiver with a stated reason and a printed count
  (`docs/SUPPRESSION.md`); letting one field act as both a waiver and gate policy means a config edit
  silently changes what the build enforces;
- an *undecided* finding measures our missing capability. Putting it in a baseline would make a laptop
  without a canvas disagree with a CI runner that has one, and a gate that fails because the environment
  changed is a gate that gets removed.

**Refusals and new rules are not failures.** `--ci` with no baseline file exits `2` (`couldNotRun`), not
`1`: "you have not set this up" and "you regressed" have to be distinguishable by a status check and by a
human. The same exit `2` applies when the *kind* of input changed — a fragment checked against a page's
baseline would find nothing to report and print a pass, which is the one outcome a gate must never
produce. A finding from a rule the baseline never listed is reported and adoptable, not blocking, because
shipping a rule must not redden every existing repo on the day we release it; `--strict` opts in for a repo
that wants the harder line.

**SARIF carries the verdict and the state.** Each result gets `partialFingerprints.sparkKey` (the same key
the baseline compares, so the code scanner and the gate cannot disagree about what is new),
`properties.sparkAnchor`, and — when a baseline was in play — `baselineState` of `new` / `updated` /
`absent`, which is how GitHub's diff-aware annotations come free. `runs[0].properties.sparkGate` mirrors
the exit code. Two things follow from this project's rules rather than from the format: undecided checks
are emitted as `informational`/`note` instead of dropped, and waived findings are emitted as `note` with
their reason instead of using SARIF's own `suppressions` array, whose purpose is to tell the viewer to hide
the result. No `region` is invented: the browserless path has no source position, and a wrong line number
in the one format people act on without reading the tool is worse than none.

**Machine formats keep stdout to the payload.** With `--format json|sarif` or `--quiet`, the gate's prose
goes to stderr; the exit code carries the verdict, and it never moves.

## Alternatives considered, and why they were refused

- **Store the key on the finding, in the IR.** Rejected: it puts a *judgement about sameness over time*
  inside a content address, so a change to anchor normalisation would change `contentHash` and
  `IR_VERSION` for pages nobody edited. Computed on demand, identity can be revised without invalidating
  one artifact.
- **Key on `finding.id`.** Rejected: positional, and drifts on unrelated edits (point 2 above).
- **Key on `finding.snippet`.** Rejected twice over: snippets are truncated to `DISPLAY.snippetLength`
  (160), so identity would depend on a *display* limit; and a snippet is content, not location, so editing
  text inside a card moves the key of the card's label problem.
- **Line/column fingerprints, as SARIF's `partialFingerprints.primaryLocationLineHash` intends.**
  Rejected for now: we would have to re-parse the page to map a selector to an offset. That is a second
  parser with its own idea of where things are, for a benefit — a clickable line — that the anchor plus
  snippet already nearly provides. If a browser-backed collector ships real ranges, this decision should be
  revisited rather than quietly extended.
- **Fail on everything until the baseline is adopted.** Rejected: that is the failure mode in point 1.
- **Block findings from rules the baseline never saw.** Rejected: it makes *our* release cadence the
  client's problem. Reported, one line, with the fix named.
- **Exit `1` when the baseline file is missing.** Rejected: a repository that has not adopted the gate and a
  repository that regressed are different states, and a status check that cannot tell them apart teaches
  people to ignore the check.
- **Write the baseline into the target's directory.** Rejected: `spark baseline fixtures/real/x.html` would
  scatter gate files through the fixture tree. One rule — relative to the current directory — and the
  config or `--baseline` overrides it.
- **One baseline file covering a whole directory of pages.** Deferred, not refused: `loadTarget` reads one
  page or URL, so a multi-page file needs a document discriminator in the key, which is a format change
  (`baseline: 2`) and needs its own record rather than a silent widening of the shape.

## Consequences

- The gate is usable in CI today: `.github/workflows/check.yml` runs `--ci` against
  `test/fixtures/gate/{good,bad}.baseline.json`, and `test/gate.test.js` fails if our own fixtures drift
  from the baselines committed for them — so the engine cannot quietly change what it reports on the pages
  we ship as examples.
- `src/identity.js` is now load-bearing for a *file format*. A change to anchor normalisation invalidates
  every committed baseline, so it requires bumping `baseline` to `2` and a migration note in this directory;
  it is not a refactor.
- `spark.config.json` gained one key (`baseline`) and the CLI gained `baseline`, `--ci`, `--baseline`,
  `--strict` and `--format sarif`. Every one of them is in the single `OPTIONS` table, so `--help` cannot
  document a flag that does not exist.
- Unmet, and stated in `docs/GATE.md` §6: ten real repositories with a green gate and committed baselines,
  and at least three merges stopped by a real regression (`docs/PLAN.md`'s exit criteria for this phase).
  The mechanism is here; that evidence has to come from outside this repository. The `md` reporter for PR
  comments is still unbuilt.
