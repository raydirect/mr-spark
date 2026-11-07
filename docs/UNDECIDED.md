# Why a check has no answer

`CALIBRATION.md` recorded a contradiction and left it open: `aria-prohibited-attr` came back as a
**decided violation** on one real page and an **undecided** check on another, "same rule, same kind
of element". A rule that flips between decided and undecided based on something invisible in the
markup makes every score incomparable, so this was worth chasing before Phase 1.

It is not a flip. There are two different questions, and the tool said so in the wrong words.

## The finding

The contradicted claim was that the rule was unstable. It is not. The rule is stable and so is its
verdict; what differed between the two pages was **which node was undecided** and **why**.

`aria-prohibited-attr` reports three distinct things in a static DOM:

| Markup | Verdict | The engine's own words |
|---|---|---|
| `<div aria-label="Cart">` | **undecided** | *"aria-label attribute is not well supported on `div` elements with no valid role attribute."* |
| `<div role="button" aria-label="Cart">` | passes | — |
| `<div aria-labelledby="real">` (referenced element exists and is visible) | **undecided** | *"…but the elements referenced by aria-labelledby are visible in the page. Verify the label is not necessary."* |
| `<ul aria-describedby="missing">` | passes | stated preference, not a prohibition |
| `<div aria-hidden="true">`, `<a aria-hidden="true">` | **inapplicable** | hidden nodes are excluded from the rule entirely |
| `<div aria-expanded="false">`, `<span aria-checked="true">` | passes | the attribute is proposed for `div`/`span` in ARIA 1.2 |

So the rule fires where it should and stays quiet where it should. The "flip" was two different
elements on two different pages: one a `div` carrying a label it cannot use, one a control that
passed.

**But the tooling was wrong in a way that mattered more.** Our report rendered *"could not be
decided in this environment"* for the `div aria-label` case. That is false. No environment decides
it, because *"is a label well supported on a `div`"* is a question about the accessibility tree the
browser builds — and in a revealed sense, about what a person actually experiences. Markup does not
determine it. Saying "this environment" invited the reader to wait for a browser runner that could
never deliver the answer.

## The fix: two kinds of undecided

Every finding that is `coverage: 'incomplete'` now carries `undecidedKind`:

| Kind | Meaning | Marked | Example |
|---|---|---|---|
| `environment` | The answer needs a capability this run did not have. | `~` | computed contrast without a canvas |
| `judgement` | No environment can answer it from markup. It depends on the accessibility tree or on what a person sees. | `?` | a label on a bare `div`; whether a referenced element is visible |

The two get different marks because they ask the reader for different things. `environment` is our
blindness — *run this where there is a canvas*. `judgement` is a pointer at something worth going
and looking at, and it is often the most useful line in the report.

Classification is by **cause, not by rule id**, so a rule added later is judged on the same evidence
as every other rule:

- the cause mentions a missing capability (`canvas`, `layout`, `getContext`) and not a judgement
  phrase → `environment`
- the cause says *not well supported*, *does not reference*, *verify*, *not visible* → `judgement`
- anything else → `judgement`, the conservative default, because claiming a question needs a
  capability we might have had is exactly the failure this change removes
- `color-contrast` is pinned to `environment` by name; it is decided by computation, and when it is
  undecided the reason is always a missing capability

A real page now reads:

```
    ✗ label                   critical  #url
    ? aria-hidden-focus       serious   .signin
    ~ color-contrast          serious   .logo
    ? landmark-one-main       moderate  html

    at most — 4 check(s) could not be decided, so this is an upper bound, not a measurement
    ? = could not be decided (4): 1 need a capability this run did not have (a canvas);
        3 cannot be answered from markup by any environment. Excluded from the score; not violations.
```

## What this does not fix, and will not

- **Three of those four answers are already as good as they will get.** A browser runner will move
  `color-contrast` from `~` to a verdict. It will not move the three `judgement` findings. Anyone
  waiting for the browser to clear them is waiting for something that is not coming.
- **`judgement` findings still do not affect the score**, which means a page can carry three
  unknown real problems and still read `≤100`. That is the correct direction — an unanswerable
  question is not a violation — but it is the reason the count is printed on every surface rather
  than folded away.
- **The engine's `serious` impact is kept** for judgement findings. A rule that cannot decide does
  not thereby become minor, and downgrading it was the first mistake this project made with
  undecided checks.

## Two things this investigation established by accident

- **`aria-prohibited-attr` is a shadow of `aria-allowed-attr`.** The vast majority of its output is
  about labels that would not be announced. It is worth pinning in the corpus the day a page with a
  labelled `div` exists there, which is now recorded as a gap.
- **An element that is `aria-hidden` is excluded from this rule entirely**, so a hidden control
  cannot be "reported then suppressed" — it is never reported. That is the correct behaviour and it
  is worth knowing before somebody builds a suppression rule for it.
