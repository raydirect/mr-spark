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
- **`aria-prohibited-attr` does not appear in any of them.** The contradiction it caused is now
  explained (`docs/UNDECIDED.md`) and pinned by a purpose-built probe in
  `test/undecided.test.js`, but no *page* exercises it. A page carrying a labelled `div` belongs in
  this folder.
- Nothing here has **contrast that can be measured**, so the most common real-world failure class
  is entirely absent from the numbers.

Those four gaps are the honest boundary of what "we have a corpus" means today.

## What four uploaded demo pages taught us, and why none of them are fixtures

Five HTML files were once dropped into this repository from the outside: four saved pages from the
*Canvas* ThemeForest template set (`demo-marketplace`, `demo-black-friday-deals`,
`demo-honey-subscription`, `demo-volunteer`, each carrying its `envato.market` affiliate link) and one
saved DOM dump of a Primer component screen (`001.html`). They were removed. The reason is not
prudishness: **committed, they would be someone's commercial work inside an Apache-2.0 repository**, and
the patent grant in our `LICENSE` would be a promise we have no standing to make about their markup.

Rule 1 also rules them out on method — *write it as a page, not as a test* — and the reverse applies: a
page must be ours to be a corpus page. But they were measured first, and four things came out of it:

| Page | Score | Decided | What it showed |
|---|---|---|---|
| `demo-marketplace` | 65 | 88 (`region` ×84, `heading-order` ×4) | The 3.0.0 pricing claim, at the scale no fixture of ours reaches. 84 findings from one habit cost 16.15 damage on a synthetic equivalent; per-element pricing would have ended the page. |
| `demo-black-friday-deals` | 76 | 4 (`aria-prohibited-attr` ×4) | **The first time that rule fired on a page we had not built.** Gap 3 above, confirmed as real by an unrelated document — template markup putting `aria-*` on `div`s with no role. |
| `demo-volunteer` | 80 | 1 (`label`) | One unlabelled control costs 10.0 damage on an otherwise clean page. A single finding is a *fifth* of the distance from 100 to 70, and that ratio is a claim about how the tool reads to a client. |
| `demo-honey-subscription` | 86 | 4 (`region` ×3, `heading-order` ×1) | A well-built page with a section habit is a high-80s page. Nothing surprising, which is itself the point: the score now reads as expected. |

And the finding that matters most for gap 4, which the uploads looked like they closed and did not:
**every one of the four has zero inline `<style>` and five external stylesheets.** In the browserless
path the tool therefore sees no colours at all — `color-contrast` stays undecided, and a score of 65 is a
statement about landmarks and headings, not about a page a person can read. That is why the corpus's next
page is specified as:

> **one page with its CSS inside the file**, and a contrast problem in it we did not put there.

A page saved as "Webpage, Complete" does not qualify — the CSS has to end up in the document, pasted or
inlined, because the measurement we want is the one the *default* runner can make. Old client work is the
best source precisely because nobody optimised it for a checker.

The measured consequence of the pricing rows above is pinned by a test rather than remembered in prose:
`corpus: pricing stays sub-linear at the scale a real listing page reaches` generates catalogues of 1,
84 and 200 sellers and asserts both directions — repetition costs something, and it does not compound
linearly. That is a probe, not a corpus page, and it says so in its own comment.
