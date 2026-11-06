# ADR 0001 — One token store, one view model

Status: accepted · Applies to: every surface · Date: 2026-11-07

## Context

The first build kept its visual values where they were used: colours inside a stylesheet
template literal, band thresholds retyped per reporter, prose inline in templates, and a
hardcoded engine version inside the HTML reporter while `package.json` said something else.
Each of these worked. Together they produced three defects that no single file was responsible
for:

1. `color-scheme: light dark` was declared while the background stayed hardcoded, so the page
   could render at 1.00:1 in an adapting dark context.
2. `NO_COLOR` was documented in a comment and never implemented.
3. The terminal and the HTML report each computed a pillar summary and an overall score with
   slightly different sort tie-breaks, so they could disagree about the same IR.

The common cause is not carelessness. It is that a value's *location* was decided by whichever
file needed it first.

## Decision

**One token store.** `src/config/tokens.json` is the only definition of a visual value:
colour (light and dark), spacing, radii, type scale, layout dimensions, motion durations. The
stylesheet is generated from it. The contrast test reads the same file. A test fails if the
generated CSS contains a hex value that is not in the token file.

**One view model.** `src/view-model.js` is the only place an IR becomes a verdict: conformance,
per-pillar rows, summaries, finding groups. Reporters render what it returns and add nothing but
presentation. If two surfaces ever disagree, the bug is in one file by construction.

**One vocabulary.** `src/vocabulary.js` owns impact order, pillar order, the decided test and
sorting. The coverage enum lives in `src/ir.js`, because the artifact owns its own enum and must
be valid without the scoring module.

**Validate at import.** A malformed token file throws on import, not on render. A report that
silently falls back to a default colour is worse than a process that refuses to start.

## Why JSON for the tokens, not a JS module

Because Phase 3's authoring UI must read the same palette at runtime in a browser, without a
build step. A JS-only store would need a second copy or a bundler. JSON is also the format a
design tool can export into, and the format a test can diff.

## Consequences

- Changing a colour means editing one file, and the test tells you which pairs now fail.
- Every new foreground colour must be added to `contrast.pairs`, or a test fails. This is
  deliberate friction: a colour that is not checked is a colour that can ship broken.
- Reporters got shorter and dumber, which is the point. `html.js` no longer knows what a band
  threshold is.
- The view model is now a shared dependency of every surface. It must stay pure and must not
  import a reporter. That is enforced by review, and will be enforced by a dependency rule when
  the lint config lands.
- A token file that is wrong fails loudly. Teams that vendor this will notice in the first
  minute rather than in front of a user.

## What would make this wrong

- If the number of surfaces stays at two and the tokens never change, the token file is
  ceremony. It is justified by the four surfaces on the roadmap, not by today.
- If Phase 3 needs per-theme token overrides at runtime (brand theming), the single JSON file
  becomes a base plus overlays, and `renderStyles()` takes the resolved set. The seam is already
  in the right place: `renderStyles()` has no arguments today and one argument tomorrow.
- If the contrast test ever passes a pair that a browser renders differently — for example a
  colour inside `color-mix()` or a transparency composite — then the test is checking the token
  file rather than the pixels, and the browser runner must take over that duty.
