# Calibration against real pages

Fixture scores are a closed loop: the fixture was built from the failure classes the tool
detects, so it scoring badly is not evidence of anything. These are real pages, and what their
first scores said.

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
