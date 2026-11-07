# The real-page corpus

`fixtures/real/` holds three ordinary pages. They are the only pages in this repository that were
written as pages *first* and measured second. `test/corpus.test.js` freezes what the tool said
about them.

## Why this had to exist

`fixtures/bad.html` was built from the failure classes the tool detects. It scoring badly proves
that the tool can count its own inputs. Three published claims were resting on that closed loop:

- *"a real page scores 19"* — a number from one page, run once, under a rule set that has since
  changed.
- *"two pages score 100"* — which turned out to mean *the rules that would have caught them were
  not running*.
- *"the honeypot produces a critical that nobody can act on"* — true, and worth a suppression
  mechanism, but the page itself was never in the repository, so nothing could check the fix.

The corpus is those pages, as fixtures, with numbers attached.

## The three pages

| Page | What it is | Score | Decided | Undecided |
|---|---|---|---|---|
| `ceramics.html` | a small-business page done well: landmarks, one `h1`, ordered headings, a real form, no scripts | **100** | 0 | 3 |
| `tides.html` | a data page by an author who used `div`s for structure | **87** | 5 (`region`) | 3 |
| `booking.html` | a booking form by an author who wanted it to work in one afternoon | **69** | 11 (`region` ×10, `label` ×1) | 4 |

All three at score spec **3.0.0**. The test fails if the spec version changes without the corpus
being revisited, because a baseline nobody re-reads is a score nobody is measuring.

## What each page proved

**`tides.html` is the case that broke 2.0.0.** Five `region` findings, one root cause (content
outside any landmark), one fix (`wrap it in a main`). Under per-element pricing that cost 25 of
damage and returned **19** — a number that reads as *"this page is catastrophic"* for a page whose
only structural error is a missing `<main>`. Under 3.0.0 the same five findings cost **5.5** and
the page scores **87**. A test now asserts the property directly: a single root cause must not be
able to sink a page.

**`booking.html` is the honest bad page.** It has a honeypot field that is *deliberately*
unlabelled — the same case the suppression mechanism was built for — plus ten `region` findings
from missing landmarks. Score **69**, band *poor*. This is what "needs work" should look like: one
real accessibility failure, one structural habit, no drama.

**`ceramics.html` is the one that disagrees with itself.** It scores 100 and I do not believe it.
The page is genuinely careful, but a 100 from a verifier with no canvas is not a verification. It
is a **ceiling**: three checks are undecided — `color-contrast` on the wordmark, plus the two
rules that need a rendering context. The tool prints `≤100` for exactly this reason, and this page
is the fixture that keeps that behaviour honest: if the upper-bound glyph ever disappears from a
report like this one, the corpus test will be the thing that noticed.

## The undecided counts are part of the baseline

Each page pins its number of *undecided* checks, not only its decided ones. That looks like
bookkeeping and is not: it makes a change in **what the environment can answer** fail a test. The
day a browser runner makes `color-contrast` decidable, all three numbers move, and every one of
those moves has to be explained.

## Rules for adding a page

1. Write it as a page, not as a test. If it is built from rule ids it joins the closed loop.
2. Add it to `EXPECTED` in `test/corpus.test.js` in the same commit. A page with no baseline is
   measured by nobody, and that test fails on purpose (`every page in fixtures/real has a
   baseline`).
3. Never update a baseline without saying what moved it. The number is a regression guard, not a
   grade — but a guard that gets quietly rewritten guards nothing.
4. Keep them small enough to read in one screen. A 46 KB marketing page is realistic and
   unreadable, and an unreadable fixture cannot be argued with.

## What this corpus still cannot tell us

- It is **three pages by one author**, which is not a sample. It catches regressions; it does not
  establish calibration.
- It contains **no JavaScript-driven page**. Everything here is static markup, so nothing exercises
  the shipped-DOM problem — a component runtime that renders its real UI after load is invisible to
  every number on this page.
- **`aria-prohibited-attr` does not appear in any of them**, so the decided-vs-undecided flip
  recorded in `CALIBRATION.md` is still unexplained and still untested.
- Nothing here has **contrast that can be measured**, so the most common real-world failure class
  is entirely absent from the numbers.

Those four gaps are the honest boundary of what "we have a corpus" means today.
