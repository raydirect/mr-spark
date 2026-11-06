# What the tool can and cannot see

Honesty about coverage is a product requirement, not a disclaimer. This page states exactly what
a run inspects, so a score can be read for what it is.

## Rules

The engine runs **105 rules** and is configured to run **100 of them**: everything tagged with a
WCAG success criterion, plus everything tagged *best practice*.

That second group matters, and was nearly shipped missing. Running only the WCAG tags silently
excluded 30 rules — `heading-order`, `region`, `landmark-one-main`, `page-has-heading-one`,
`aria-allowed-role`, `empty-heading`, `tabindex`, `skip-link` and others. A page whose headings
skip a level, or whose content sits outside any landmark, scored as if nothing were wrong.

Those rules are excluded from a *conformance* claim for good reason: they are not success
criteria. But this tool reports quality, not certification, and the caveat printed on every run
says so. Enabling them moved the known-bad fixture from 53 to 46 without changing a single
input byte.

Five rules remain excluded:

| Rule | Why |
|---|---|
| `frame-tested` | Requires running the rules engine *inside* a cross-origin frame. A file has no frames to enter. |
| `frame-tested`-adjacent manual checks | Same reason: they are instructions to a human, not assertions a machine can make. |
| `color-contrast` (partly) | Runs, but cannot decide without a canvas. Reported as undecided. |

## What a file-based run cannot decide

| Signal | Why | Consequence |
|---|---|---|
| **Computed contrast** | Needs a canvas and real layout. | `color-contrast` is *undecided*, never a pass. It is usually the largest category of real failures. |
| **Anything requiring styles** | No CSS cascade in a headless parse. | A finding about visibility, focus or target size is undecided. |
| **Ids assigned by the page's own JavaScript** | Document scripts are never executed. | `aria-labelledby="r_10"` must point at markup present in the input. A component lifted out of a page will "lose" its target and produce a finding that is an artefact of the excerpt. |
| **The rendered DOM of a hydrated app** | Only the HTML in the file is inspected. | On a single-page app this is the *server-rendered* markup. Findings may name elements that React (or any framework) replaces on hydration. |

## Fragments versus documents

An input is a **document** only if it declares one (`<!doctype>` or `<html>`). Anything else is a
**fragment**, and checks that describe a document — a title, a language, a skip link — are
reported as *undecided with a reason* rather than as failures. Both surfaces print the
distinction above the score.

This exists because a pasted component was once reported as a page with no title and no
language. Those findings were about a document that was never in the input.

## What this means for a score

- A file-based score is a **floor**, not a measurement of the page a user sees.
- **A score is comparable only to a score taken with the same rule set.** Reports print the
  engine version and score spec version for that reason; a baseline must record both.
- An unmeasured pillar is a gap in the tool, never a passing grade, and `—` is not a zero.

## The plan

A browser runner (Phase 1c/2) closes the contrast and rendered-DOM gaps: it loads the page in a
real engine, waits for layout, and computes colour. Until then, the undecided category is the
honest answer, and it is printed rather than hidden.
