# The real-page corpus

`fixtures/real/` holds five ordinary pages. They are the only pages in this repository that were
written as pages *first* and measured second. `test/corpus.test.js` freezes what the tool said
about them.

The last two (`locksmith.html`, `newsletter-archive.html`) were written by hand for this folder with
their CSS inside the file, which the first three do not have. They are ours, so they can be committed and
quoted. They are **not** independent evidence: the person who wrote the analyzer wrote them. What they
buy is coverage of shapes the other three do not have — styled markup, a labelled `div`, and nested `div`
soup — frozen as numbers.

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

## The five pages

| Page | What it is | Score | Decided | Undecided |
|---|---|---|---|---|
| `ceramics.html` | a small-business page done well: landmarks, one `h1`, ordered headings, a real form, no scripts | **100** | 0 | 3 |
| `tides.html` | a data page by an author who used `div`s for structure | **87** | 5 (`region`) | 3 |
| `booking.html` | a booking form by an author who wanted it to work in one afternoon | **69** | 11 (`region` ×10, `label` ×1) | 4 |
| `locksmith.html` | a trade page, CSS inline, landmarks and labelled controls done properly | **100** | 0 | 3 |
| `newsletter-archive.html` | a club archive: `div`s for everything, one heading skip, one labelled `div` | **91** | 2 (`region`, `heading-order`) | 4 |

All five at score spec **3.0.0**. The test fails if the spec version changes without the corpus
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

**`locksmith.html` proves that the contrast gap is a capability gap, not an input-format gap.** Every
colour the page uses is inside the file — `#6b7280` meta text on white, `#7a4a10` on `#fbf7f1`, white on
the `#1f6feb` call button. A reader with a browser can check all three in a minute. The tool reports the
same three undecided checks it reported for the unstyled `ceramics.html`, and the same score: 100. It
does not read the `<style>` block, because contrast is not a fact about declared colours — it is a fact
about computed ones, which needs layout, inheritance and the cascade. This is the fixture that stops
anybody "fixing" the offline runner by pasting more CSS into a test page.

Its own text is clean at the arithmetic — `#6b7280` meta on white is 4.83:1, the white-on-`#1f6feb` button
is 4.63:1, the amber callout is 6.99:1 — so this 100 is not hiding a colour failure, and the page passes
for the reason a person would check. What it does carry is one thing no rule here evaluates, browser or
not: the input borders are `#d7dbe0` on white, **1.39:1**, under the 3:1 non-text floor of WCAG 1.4.11. A
human sees that in a second. Every number in this document is silent about it.

**`newsletter-archive.html` is the page that found a limit in the `region` rule.** It is a club archive
whose author used `div`s for everything and never reached for `<main>`. It should have been the worst page
in the corpus, and it scored **91** with one `region` finding. The reason is grouping: the six issue cards
sit inside one wrapper `div`, so the whole page is one piece of orphaned content. The same six cards as
sibling `div`s, with no wrapper, are seven findings on identical text — 82, not 91. `region` counts runs
of unlandmarked content, not elements, which means a page can improve its score by nesting its `div` soup
instead of fixing it. That is correct behaviour for a rule whose job is "give the author one instruction"
(wrap it in a `main`) and wrong behaviour for a rule whose numbers get compared across pages. It is now
pinned by a probe test rather than remembered, and written into `docs/LIMITS.md`.

This page also carries the contrast failure the corpus was originally specified to find — and it shows
why that specification was the wrong ask. The issue dates are `#a8a196` on `#f6f3ec`: **2.31:1**, under
even the 3:1 large-text floor, in a file whose CSS is inline and readable. The score is 91. A test
computes that ratio with `src/contrast.js` and asserts the tool says nothing about it, so the claim is
arithmetic in `test/corpus.test.js` rather than a sentence in a document.

The same page is where the labelled `div` lives, and it pins down where the `aria-*` line is. `aria-label`
on a `div` with no role comes back *"not well supported"* — a claim about the accessibility tree, which
markup does not settle, so we defer it. Reach for a different attribute and the same habit is decided:
`aria-required` on a `div`, or `aria-checked` on a `span`, come back as decided `aria-allowed-attr`
violations — and *one* such finding took a probe page from 100 to 80. Which attribute the author copied
off a blog post decides whether the tool can call it at all. The four uploads had four decided `aria-prohibited-attr`
findings; the files are gone, so we cannot say which attributes produced them, and that gap is recorded
rather than explained.

## The undecided counts are part of the baseline

Each page pins its number of *undecided* checks, not only its decided ones. That looks like
bookkeeping and is not: it makes a change in **what the environment can answer** fail a test. The
day a browser runner makes `color-contrast` decidable, five numbers move instead of three, and
every one of those moves has to be explained.

## Rules for adding a page

1. Write it as a page, not as a test. If it is built from rule ids it joins the closed loop.
2. Add it to `EXPECTED` in `test/corpus.test.js` in the same commit. A page with no baseline is
   measured by nobody, and that test fails on purpose (`every page in fixtures/real has a
   baseline`).
3. Never update a baseline without saying what moved it. The number is a regression guard, not a
   grade — but a guard that gets quietly rewritten guards nothing.
4. Keep them small enough that a reviewer reads the whole file before arguing with it. A 46 KB
   marketing page is realistic and unreadable. The `<style>` block counts against that budget:
   `locksmith.html` at 188 lines is the longest page in here and it is at the limit.

## What this corpus still cannot tell us

- It is **five pages by one author**, which is not a sample. It catches regressions; it does not
  establish calibration. The four pages that would have been someone else's work could not be
  shipped (see "What four uploaded demo pages taught us" below), so the corpus is still an echo and
  says so.
- It contains **no JavaScript-driven page**. Everything here is static markup, so nothing exercises
  the shipped-DOM problem — a component runtime that renders its real UI after load is invisible to
  every number on this page.
- **`aria-prohibited-attr` is only half covered.** `newsletter-archive.html` carries a labelled
  `div`, and it lands undecided because axe calls that combination "not well supported" rather than
  a violation. Nothing in the corpus has a page where the same habit *is* decided — that shape
  belongs to the neighbouring rule `aria-allowed-attr`, and it is pinned by a probe in this file
  rather than by a fixture, because we could not keep the page that showed it.
- Nothing here has **contrast that can be measured** — and `locksmith.html` is the proof that the
  fix is not more CSS in the file. Its colours are all inline and the rule is still undecided,
  because the answer needs computed styles. The most common real-world failure class stays out of
  every number in this document until the browser runner exists.

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

**That specification was wrong in its second half, and `locksmith.html` is the page that said so.** The
first half stands: a corpus page has to be ours to keep, and the CSS has to be in the file for the page to
be a normal single-file page at all. The second half does not. We wrote a page with every colour declared
inside it, and `color-contrast` stayed undecided, unchanged, because the default runner does not parse
stylesheets — it needs computed styles from a browser. So "paste the CSS in and the offline tool can grade
contrast" is not a thing that can be arranged, and no future fixture will arrange it. The fix is the
browser runner, not the input. What this folder still needs from outside is narrower than it was:
**one page we are allowed to commit, written by somebody who has never seen this repository** — for
calibration, not for coverage.

The measured consequence of the pricing rows above is pinned by a test rather than remembered in prose:
`corpus: pricing stays sub-linear at the scale a real listing page reaches` generates catalogues of 1,
84 and 200 sellers and asserts both directions — repetition costs something, and it does not compound
linearly. That is a probe, not a corpus page, and it says so in its own comment.
