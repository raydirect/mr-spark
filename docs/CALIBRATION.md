# Calibration against real pages

> **Read this first.** The table below is a **snapshot taken on 2026-11-05** under score spec
> **2.0.0** and a **70-rule** selection. It is kept because the reasoning in it is what produced
> two of the last three changes to the tool, and because deleting a number that turned out to be
> wrong is how a project forgets it was ever wrong. It is **not** the current score of those
> pages. Current baselines live in `test/corpus.test.js` and are explained in `docs/CORPUS.md`.
>
> Three of the four pages described here are **not in this repository** — they live on the
> author's machine and cannot be copied out. What is reproduced here is the reasoning, not the
> bytes. That gap is the reason `fixtures/real/` exists.

## Four real pages, one run

| Page | Score | Decided findings | Undecided |
|---|---|---|---|
| marketplace | **100** | none | 2 (`aria-prohibited-attr`, `color-contrast` on the sign-in control) |
| honey subscription | **100** | none | 1 (`color-contrast` on the header call to action) |
| black friday deals | **67** | `aria-prohibited-attr` ×4 | 1 |
| volunteer | **80** | `label` ×1 (critical, honeypot field) | 9 |

Run before PR #15 landed, so it used 70 of 105 rules. The four best-practice rules that would
have fired here — `region`, `landmark-one-main`, `heading-order`, `page-has-heading-one` — were
not running.

## What the two 100s mean

Nothing good. A 46 KB marketing page with zero accessibility problems is not a credible result;
it is a coverage result. Two things produce it:

1. **The rule set was incomplete** (PR #15). Marketing pages are precisely where landmark and
   heading structure fail, and none of those rules were enabled.
2. **Contrast cannot be decided without a canvas**, and contrast is the largest single category
   of real-world failure. One of the "perfect" pages had an undecided contrast check *on its
   sign-in control*.

The score is computed from decided findings only, so undecided checks can only raise it. A
computed score is therefore an **upper bound**. Printing a bare `100` claims a verification that
did not happen; the tool now prints `≤100` and states how many checks were undecided.

## What the two non-100s got right, and where they are arguable

- **`label ×1` critical on a honeypot field** (volunteer page): technically true, practically
  noise. A hidden bot-check input is deliberately unlabelled. This is the "real page scores down
  for a reason nobody can act on" failure that would get a gate switched off, and it is now the
  clearest known case for a suppression mechanism (see below).
- **`aria-prohibited-attr` ×4 as *decided* on the black friday page, but as *undecided* on the
  marketplace page.** Same rule, same kind of element, different classification. Undisciplined
  and unexplained, and worth a dedicated investigation: a rule that flips between decided and
  undecided based on something we cannot see in the markup makes every score incomparable.
- **`form-field-multiple-label` ×8 undecided** on the volunteer page: a checkbox group where
  each input has several labels. Whether that is wrong depends on grouping intent.

## What this argues for, in order

1. **Investigate the decided-vs-undecided flip** for `aria-prohibited-attr`. Comparability
   depends on it.
2. **A suppression mechanism** before Phase 1c, not after: `spark.config.json` with justified
   ignores, printed in the report as "N findings suppressed" with reasons. A gate with no
   legitimate way to say "this one is deliberate" gets disabled entirely.
3. **The browser runner** for contrast. Until then every score is a floor with a ceiling on its
   usefulness.
4. **Re-score these four pages after PR #15** and after the browser runner, and compare. That is
   the only calibration that means anything: same pages, better instrument.

## What happened next (status, 2026-11-07)

| Item above | State |
|---|---|
| 1. The `aria-prohibited-attr` decided-vs-undecided flip | **still open.** No page in the corpus reports it, so nothing tests it. |
| 2. A suppression mechanism | **done** — `spark.config.json`, reasons required and printed on every surface (`docs/SUPPRESSION.md`). The honeypot case is `test/fixtures/honeypot.html`. |
| 3. The browser runner | **not started.** Every score in the repository is still an upper bound. |
| 4. Re-score the four pages | **not possible**: the pages are not in the repository. Replaced by `fixtures/real/`, three pages written to the same shape with frozen baselines. |

Two claims in this document did not survive contact: the *88 findings, score 19* case is a **2.0.0**
artefact and now prices at **71** (spec 3.0.0, §3.5 of `SCORE-SPEC.md`); and the two scores of
**100** were a coverage result, which is why the tool now prints `≤100` and why `ceramics.html`
in the corpus exists to keep that glyph from disappearing.
