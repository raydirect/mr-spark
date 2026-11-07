# ADR 0007 — A baseline describes a set of pages

**Date:** 2026-11-08
**Deciders:** repo maintainer, in review with Arena
**Amends:** [ADR 0005](0005-a-gate-on-regressions-keyed-by-structure.md), which defined the baseline format and the
"rule the baseline predates" exemption this document sharpens.
**Ships:** the last format decision between "we gate this page" and "we gate this repository".

## Context

Phase 2's exit criterion is a sentence about a whole repository: *"a repo with 400 existing findings goes green in
one commit."* With `baseline: 1` that repo needs a baseline file per page and a workflow step per page — four lines
becomes N lines, and N is exactly where a build check gets deleted inside a week. The gate had also grown a
consumer (`docs/GATE.md` §2's action) whose whole value is one step, so the file format was the last thing pinning
the product to one page.

Everything the gate prices is a *per-page* fact. `src/identity.js` builds a key from `rule + structural anchor`, and
nothing in an anchor says which document it came from. Two shortcuts were available and both were rejected:

- **Rehash the keys** to include a document discriminator. Every committed baseline would then need its numbers
  re-derived by hand — the file is a decision a reviewer reads, and a format change that silently invalidates the
  decisions in it is not a format change, it is a broken promise.
- **Score the set.** An average is how a hundred-page site gets to ship one page at 12. A number people make
  decisions on must be the number next to their own file.

## Decision

**`baseline: 2`: the top level names the build that wrote the file, and `pages[]` holds one section per page.**
Each section carries its own `page`, `source`, `kind`, `ir`, `score`, `rules`, `anchors` and `findings`. Finding keys
are exactly what they were, so promotion from v1 is a reshuffle of keys and never a re-measurement. A v1 file is
read and promoted, never rejected, and a repo-wide run says so once — a project that committed a valid decision does
not lose it on the day we widen the container.

**A page's key is its path relative to the directory the command ran in** — POSIX-separated, never absolute, and a
basename when the page lies above that directory. The frame is deliberately *not* the common ancestor of the
arguments, which is the clever-looking choice: it moves when an argument is added or dropped, so `spark check
dist/a.html` — the command a failed repo-wide gate tells you to run — would re-key the page, a re-keyed page reads
as "never baselined", and "never baselined" is not blocking. A gate that goes green on a repo it never compared is
the failure mode this entire file exists to prevent, so stability beats cleverness in the naming rule. `src/targets.js`
is the one place that rule lives, for the CLI and for `snapshot()` alike.

**A directory argument expands to every `*.html`, `*.htm`, `*.xhtml` under it**, sorted, skipping `node_modules`,
`.spark`, `.spark-cache` and any dot-directory, and skipping the default `spark-report.html`. That last skip is not
tidiness: a report is made of findings, so a report inside an audited directory is a page whose content depends on
the audit — a loop with a green tick at the end. Point `--out` somewhere else and it is your page, audited like one.
An ignore file is still open and says so in `docs/GATE.md` §7.

**Pages are aggregated in counts and nowhere else.** `compare()` returns the sum plus one diff per page, and every
surface that needs to know *which* page reads that instead of re-deriving it: the gate lines, the SARIF results, the
step summary. The one run-level number that cannot be per-page — a SARIF run's score — is the **worst** page, and
the summary labels it "worst page" rather than letting a reader guess which statistic they are looking at.

**A page the file never listed behaves like a rule the file never listed: reported, not charged** (unless
`--strict`). A page in the file that this run did not audit is printed as *not audited* and never counted as fixed,
because a deletion that shows up as 400 resolved findings is a reward for deleting pages. And a run whose pages
overlap the file on nothing **exits 2**: two spellings of the same target, or a rename in this commit, are both
"nothing was compared", which is neither a pass nor a regression.

**The exemption in ADR 0005 is narrowed, because per-page rule lists exposed what it really keys on.** The shipped
v1 reading was "this rule id is not in the baseline's list". Under a per-page format that becomes a hole: a page
that was *clean* records no rules, so adding an unlabelled image to it — the textbook regression a gate exists to
catch — is excused as "a rule this baseline predates", and a repo with a clean baseline can never go red at all.
The claim the exemption is actually making is *we shipped a rule*, and the honest signal for that is the build that
wrote the file: the exemption applies only when `engine.version` in the baseline differs from this build's `VERSION`
(or the file has no engine stamp at all, which we refuse to blame a repo for). Same build, unrecorded rule is the
page's fault, and blocks.

**Machine formats keep one shape per page.** `--format json` prints an array of the per-page payloads it already
printed (an envelope would be a third shape for every consumer to learn); `--quiet` grows a fifth column only when
there is more than one page; SARIF stays **one run with one artifact per page**, because code scanning reports per
repository and a run per page would let a viewer show nine and hide the three that stop the build — with each
result's `partialFingerprints.sparkKey` prefixed by its page, so the same `<div class="region">` on two files does
not merge into one alert on the wrong file. A one-page run prints byte-identically to `baseline: 1`, in every
format, and `test/gate.test.js` pins that.

## Consequences

- `spark baseline .` and `spark check . --ci` are the shape a consumer copies, and the action's `target` input takes
  a directory or a space-separated list to match. Splitting on whitespace is why a path containing a space cannot be
  named in the action — a limit written down in `docs/GATE.md` §2 instead of a second quoting layer added to a shell
  script that already has to survive untrusted input.
- Every gate command has to run from the project root. That was already true of the baseline lookup; it is now also
  true of the page keys, and getting it wrong exits 2 with a sentence about what was compared instead of a shrug.
- `spark check <page> --ci` against a repo-wide baseline is a *subset* verdict. It names the pages it did not look
  at, and it does not replace the repo-wide command in CI.
- The engine learned nothing: no rule in `src/pillars/`, no IR field, no score change. Multi-page-ness lives in the
  baseline file and the gate layer, which is the only reason the promotion is safe.
- Costs: four new refusals (`duplicatePage`, `noPages`, `multiTarget`, no-overlap), a promotion path that has to be
  kept readable forever, per-page diff plumbing in three reporters, and committed fixture baselines that had to be
  regenerated (the byte-currency test makes that a build failure rather than a silent drift, which is the point).
- Not done, still: the `md` reporter, an ignore file, `report`/`lower`/`emit` on a set (one artifact per run, by
  decision), and the ten real repositories the exit criterion has to be true in.

## How this is tested

`test/targets.test.js` (7 tests) pins the naming rule, the walk, the skips and the three refusals — including that
repeating an argument changes nothing and two arguments reaching one file does. `test/repo-gate.test.js` (9) drives
the CLI end to end: write-then-gate a directory, one page regressing and naming itself, a new page charged only
under `--strict`, a page not audited, a v1 file gating a repo-wide run, `--quiet`/`--format json`/`--format sarif`
on a set, the refusal from one-artifact commands, and `--fail-under` per page. The last test in that file checks the
arithmetic where it lives — `compare()`'s union of rules, and one anchor being two facts on two pages — so the
surfaces are not each testing their own copy of a sum. `test/gate.test.js` keeps the one-page contract byte-steady
and adds the promotion round-trip (v2 → v1 → promoted v2 changes no verdict). `.github/workflows/check.yml` writes
a baseline from `fixtures` and gates `fixtures` with the action on every push, then asserts the step summary and the
payload agree about how many pages there were — the one thing in this change that could go silently green.
