# What MR-Spark Still Cannot Do When It Is Finished

Every other document in this folder is about what we are building. This one is about what will
still be true afterwards, so that nobody discovers it in a client's inbox.

> **Read this before you trust a score.** A 100 from MR-Spark means *every check we could run, on
> this artifact, in this environment, passed*. It does not mean the page is accessible, fast, or
> correct — those words are bigger than any checker.

Ten limitations. Three shrink as the phases land; seven are properties of the problem and never
will. Nothing here is a hedge: each one names what we do instead.

| # | Limitation | Fixable? | Retired by |
|---|---|---|---|
| 1 | A perfect score is not a certification | **No** | never — mitigated by wording |
| 2 | Some findings no environment can settle | **No** | never — `undecidedKind: judgement` |
| 3 | We check the artifact, not the live page | Partly | Phase 2 (browser runner + the CI gate) |
| 4 | Performance numbers are lab numbers | **No** | never — field data is imported, never measured |
| 5 | We cannot know intent | **No** | never — mitigated by declared fields |
| 6 | The score is gameable | **No** | never — mitigated by printing reasons |
| 7 | v1 cannot express every design | Yes | grows, never closes |
| 8 | We cannot ship the industry's best motion toolkits | **No** | never — licence terms |
| 9 | A format nobody speaks yet | Yes | Phases 1–5, and only with help |
| 10 | One team, five pillars | **No** | never — the reason the plan is a sequence |

---

## 1. A perfect score is not a certification

Automated checking reaches roughly **20–31% of WCAG criteria** — about 57% of *issue volume*,
because the failures machines can see are the common ones. A page with zero findings can still fail
a manual audit: keyboard traps that need real navigation, focus order that is technically correct
and experientially wrong, alt text that describes the pixels and not the meaning, error messages
that exist and do not help.

We are not allowed to sell a 100 as a conformance claim, and no amount of extra rules changes that.
Legal exposure — ADA, EAA, EN 301 549 — is answered by a human audit against a standard, signed by
someone who can be deposed. A machine is evidence in that argument, not the argument.

**What we do instead:** the number is always printed with its coverage (`COVERAGE.md`), never as a
badge, and the wording says *checked* where a competitor would say *compliant*.

## 2. Some findings no environment can settle

Phase 0f taught us this one the hard way. An undecided check is not one thing, it is two:

- **`environment`** — this run lacked a capability. Contrast needs a canvas; a browser runner
  clears it. Work exists to do.
- **`judgement`** — nothing in the markup answers it, in any environment, ever. `aria-label` on a
  bare `div` is the example: axe-core reports *incomplete* in jsdom and in a real Chrome, and the
  answer depends on which browser builds which accessibility tree, and on whether a human thinks a
  visible label is doing the job. No runner we could write changes that.

The temptation is to file the second kind under the first, because "pending" sounds like progress
and "unanswerable" sounds like a shrug. That would make every roadmap promise a lie about work that
cannot be done.

**What we do instead:** the two are counted separately, printed with different marks (`~` and `?`),
and the report footer names how many of each. See [UNDECIDED.md](UNDECIDED.md).

## 3. We check the artifact, not the live page

The browserless runner never loads your site. It cannot see what a consent-management banner does
after load, what the cookie-gate hides, what a third-party chat widget injects into the landmark
structure, what happens on a throttled 3G phone, or whether the CSS that shipped is the CSS that got
deployed. Real pages are dynamic in ways no static check can follow.

**What we do instead:** check the URL, not the file, once the browser runner lands (Phase 2) — that
closes "the deployed thing differs from the thing in the repo", which is the common half of this.
It does not close the widget that appears four seconds later. Post-hydration checking is not
scheduled in any phase, and naming a phase for it anyway would be exactly the kind of promise this
document exists to prevent.

## 4. Performance numbers are lab numbers

Every score in `performance` comes from a headless run on one machine in CI, not from real users on
real networks. Lighthouse-in-a-vacuum is a fine *regression detector* and a dishonest *promise*. A
page that measures 95 in our runner can have a 400ms INP on a mid-range Android in the field, and
nothing we statically analyze can know that.

**What we do instead:** lab numbers are labelled as lab, always compared against the project's own
baseline rather than an absolute, and CrUX-style field data is only ever *imported* — we report it,
we do not invent it.

## 5. We cannot know intent

A wall of unbroken text is either an accessible-reading choice or a broken stylesheet, and the
document does not say which. Design is decisions made for reasons that live in people's heads; a
verifier reasons from artifacts. Declared fields (`intent` on motion, `role` semantics, tokens with
names) push this boundary out, but they push it *out*, they do not remove it. A generator can be
asked "was this intentional?" and the answer will always be a guess.

**What we do instead:** make intent a field where it can be one, and where it cannot be, prefer
*incomplete* over *violation*. A false "fix this" costs more trust than an honest "I can't tell".

## 6. The score is gameable

Any published formula is an optimization target. Concretely: add a `landmark` and lose nothing; move
a defect under a waived region; replace one `region` failure with two `region` failures and the
decay curve means the second costs two thirds; split a page in two so each half scores 100. We
priced repetition per root cause (spec 3.0.0) precisely because the naive curve rewarded *fixing the
loud thing twice*. That slowed gaming down. It did not stop it, and a formula that stopped it would
have to be secret, which would destroy the property that makes it worth anything.

The corpus found a second one, sharper because it requires no edits to the markup's content at all.
`region` prices *runs* of orphaned content, not elements: six unlandmarked cards inside one wrapper div
are one finding, and the same six cards as sibling divs are seven — identical text, scores 91 and 82. So
`<div class="page">` around somebody's soup buys nine points without anybody wrapping anything in a
`main`. That is the correct output for a rule whose message is one instruction, and it is not a
comparable number across pages. It is pinned by `corpus: region prices runs of orphaned content, not
elements` and explained in `docs/CORPUS.md`.

**What we do instead:** the score is a summary, not a goal — the findings are the product and every
one of them prints its rule, its reason and its source. Suppression writes a reason into the report
(`SUPPRESSION.md`), so a waived page says 100 *and* lists every waiver, with its expiry date, on the
same screen; an expired waiver starts failing the gate again by itself. A number you can audit is
less useful to game than one you cannot.

## 7. v1 cannot express every design

The vocabulary is closed on purpose: types, properties, tokens. A page whose whole idea is a WebGL
shader behind a scroll-scrubed morph cannot be authored in it, and adding an escape hatch would
mean our guarantee silently stops wherever the hatch is. Decided 2026-11-07: no escapes in v1, and
no bare refusals either — every gap either grows a field or grows a *declared* `embed` that reports
itself unverified. Some designs will still be out of reach in year one, and the honest answer is
"import that section as HTML, and the report will show you exactly how much was not verified".

## 8. We cannot ship the industry's best motion toolkits

The animation library every professional reaches for is free to use and *not* available to us: its
Standard "No Charge" licence defines "Competitive Products" as software that lets people create or
edit animation through a visual interface, forbids using its code inside such a tool, forbids
reverse-engineering it toward one, is not an open-source licence, and can be rewritten by its owner
at any time. Same story one layer up: the polished vector-animation formats are proprietary
binaries owned by the tool that exports them.

The consequence is that our emitted output is CSS transitions, WAAPI, and a ~3 KB machine runtime —
built from platform specs. That is a real constraint: no Flip, no physics springs, no morphing, no
timeline scrubbing inside someone else's engine. Worth being precise about blame, though — springs
are refused on our own terms too, because a spring's endpoint depends on how fast the element was
already moving, and "how fast it was already moving" is a fact about a frame rather than a fact a
document can hold. It is also a feature nobody else can claim. A page exported from MR-Spark
carries no licence its author did not choose, and cannot be broken by someone else's
terms-of-service update.

**What we do instead:** borrow their *vocabulary* — timelines, `defaults`, named eases, `stagger`,
declared `repeat` — and bake at build time what their runtime does per frame. See
[DOCUMENTS.md §2](DOCUMENTS.md).

## 9. A format nobody speaks yet

Publishing schemas is the easy half. A standard is its implementers: one implementation with a
monopoly is a file extension. If MR-Spark is the only tool that can write `.spark.scene.json`, then
the format is a lock-in dressed as an open spec, and the "no proprietary document format" promise in
`INSPIRATIONS.md` is broken by us rather than by a vendor.

**What we do instead:** `lower()` in and `emit()` out from day one, so the format is at minimum a
*lossless representation of things that already exist*; publish the schemas with the reference
implementation and the test corpus in the same repo; keep the escape direction (document → HTML)
open forever, because HTML does not need our permission.

## 10. One team, five pillars

This is the limitation most likely to actually be the end of the project. The plan spans a verifier,
three document formats, a studio, a motion runtime, a manifest layer and a renderer — roughly
fourteen months of focused work, in a repository whose honest surface today is two commands. Every
one of those pillars has a funded incumbent with a decade of head start, and every one of them
needs a different specialism to do properly.

Three honest consequences. **Scope will be cut before quality is**, which is why phases have exit
criteria and a definition of done rather than dates. **Maintenance is the real cost**: axe-core, the
schemas and the corpus all need attention forever, and an unmaintained checker is worse than none
because it teaches people to ignore findings. **The order matters more than the effort** — the plan
front-loads the verifier precisely so that if we stop after Phase 2, what exists is already useful
and already believed.

---

## What is *not* on this list

Worth naming, because these get raised as limits and are already decided:

- **No accounts.** Never a limitation, always a design constraint (`EASE.md`).
- **"It's only a CLI."** The engine is the product; the surfaces are projections of it (`SURFACES.md`).
- **"Only one file at a time."** Still true after the gate shipped, and not by accident.
  `.spark-baseline.json` describes one target, because an entry's key is *rule + structural anchor* and
  nothing in an anchor says which file it came from — a repo-wide file would need a document
  discriminator in the key, which is a change to a format people commit, so it gets a version bump and
  its own ADR rather than a quiet widening (`docs/GATE.md` §6 says the same thing from the user's side).
  Phase 2's exit criterion — *"a repo with 400 existing findings goes green in one commit"* — is met per
  page today, and per repo when that change lands.
- **"It needs a server."** It does not. Everything here runs in a browser tab or a laptop with the
  lid shut on a flight.
- **"Designers won't write JSON."** Correct — which is why the canvas exists (Phase 3) and why the
  document is the source of truth rather than the artifact (decision §14.1).

## The two that matter most

If someone remembers two lines from this document, these:

1. **A 100 means "nothing we check is wrong", not "nothing is wrong."**
2. **Some checks are permanently undecided, and we print that instead of queuing it as a TODO.**

Everything else in the project is negotiable by phase. Those two are the reason the number is worth
anything.
