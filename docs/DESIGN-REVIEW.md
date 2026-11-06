# Design Review — architecture, tokens, UI/UX

Audit performed against the code as merged at `4d2880b`. This is a *findings* document: what
holds up, what does not, and what is missing. Fixes are proposed here and implemented in
follow-up commits, not silently bundled.

Verdict up front: **the structure is sound, the discipline is real, and three things are
broken or missing in ways that matter.** One is a shipping bug in the report's dark mode, one is
the "everything in one place" requirement being only half-true, and one is the absence of any
type system.

---

## 1. Is it proper OOP?

**No — and that is correct here. Do not convert it.**

What the code uses is *modules of pure functions over a plain-data document*, with side effects
pushed to the edges. That is the right choice for this product, for reasons that are
architectural rather than stylistic:

| Using classes here would | Why it matters for web-spark specifically |
|---|---|
| Break the IR's content address | The IR must be plain JSON to be canonically stringified and SHA-256'd. Class instances carry prototypes, getters and hidden state — exactly what `stableStringify` cannot see. |
| Break determinism | The engine must be a pure function of input → output. Stateless functions make that provable; instances with mutable fields make it something you merely hope for. |
| Break the MCP handle model | Stateless tool calls with an explicit content-hash handle are the protocol's own recommended shape. Objects with identity are the opposite of that. |
| Break testability | Every test today constructs data and asserts on data. No mocks, no fixtures-with-behaviour, no DI container. |

What the code *does* have is the parts of OOP that actually carry weight:

- **Encapsulation** — `src/engine.js` is the only seam; surfaces never reach into collectors.
- **Information hiding** — `stableStringify`, `collectedAt`, and the rules-engine injection are
  private to their modules.
- **Single responsibility** — one collector, one score, one reporter per format.
- **Dependency inversion** — `analyze({ engines })` injects the engines, so tests never launch a
  DOM implementation they do not need.

Where the discipline is *incomplete* is not OOP, it is the two things OOP was supposed to
guarantee: **no shared vocabulary module** (the same concepts are re-derived in four files) and
**no structural contracts**. See §4 and §5.

### The one place a class is genuinely warranted

`Report` / `Finding` are close to earning a class, because they have **invariants** (a finding's
id must round-trip from its rule and location) and behaviour (normalisation, comparison). The
lighter fix that keeps purity: a `Finding` **factory + reader pair** with the invariant asserted
in one place. Recommended, not required.

---

## 2. Is "every value in one place" true?

**No. It is about 60% true.** This is the biggest gap against the stated requirement, and it is
fixable in one focused change.

What is already centralised correctly: the score curve and weights (`score.js`), the pillar list
and IR version (`ir.js`), the automation-coverage caveat (`score.js`).

What is scattered:

| Value | Where it actually lives | Problem |
|---|---|---|
| **Version** | `package.json` = `0.1.0`, `html.js` = `0.2.0` | **Already drifted.** A report printed today claims a version the package does not have. |
| Band thresholds | `score.js`, `html.js`, `terminal.js` — **three copies** | 90/70/40 retyped per surface. Change one, the others lie. |
| CSS | one template literal inside `html.js` | Zero tokens: colours, spacing, radii, type sizes all inline hex/rem literals |
| Colours | 9 hex values inside the CSS string | Not addressable, not themeable, not testable, not documented |
| Magic numbers | `4321` (×2), `160` (snippet), `12` (id prefix), `3` (summary top-N), `6` (worst findings), `48`/`60` (truncation), `999` (pill radius), `40rem` | Behaviour tuned in eight places by eight adjectives |
| User-facing strings | `cli.js`, `terminal.js`, `html.js` | USAGE, section headings, empty states, caveats — no single catalogue |
| CLI defaults | `cli.js` | Port and output filename duplicated (and one copy is inside the help text) |

Nothing here is a crisis today. It becomes one the moment there is a second surface (the editor,
the MCP server, the extension) — because every one of those values will be needed again, and
copied.

**The fix** is a `src/config/` directory: `tokens.js` (the complete design-token set),
`thresholds.js` (bands + weights, consumed by all surfaces), `copy.js` (all prose), `constants.js`
(limits, defaults, timeouts), `brand.js` (name, versions). Surfaces *read* from it; nothing else
defines a literal.

### The honesty caveat that must ship with the token file

A single-file token store is right for **Phase 1** and wrong for **Phase 3**, when the authoring
UI needs tokens at build time and at runtime in a browser. At that point the canonical store must
be **JSON with the JS module as a thin reader**, so the editor can import the same file without a
build step. Designing it as JS-only now and migrating later is exactly the kind of rework this
project can avoid for free.

Recommendation: `tokens.json` (data) + `tokens.js` (validated accessor + derived helpers like the
contrast-checked CSS block).

---

## 3. UI / UX review

### 3.1 A real bug: dark mode is broken, and it is the worst kind

`:root { color-scheme: light dark; }` tells the browser to adapt **form controls and scrollbars**,
but the stylesheet then hardcodes `background: #fff` and `color: #14181d`. In a dark-mode browser
with forced-colors or user stylesheet adaptation this produces a page whose body text can meet its
own background.

Measured (WCAG relative-luminance ratios, `#14181d` on `#14181d`):

| Pair | Ratio | Required |
|---|---|---|
| body text on body background | **1.00** | 4.5 |
| muted text on dark background | 2.25 | 4.5 |
| good/positive value on dark | 2.68 | 4.5 |
| bad/negative value on dark | 2.26 | 4.5 |

The light-mode palette is genuinely good — 5.93 to 17.82, all comfortably passing. The bug is
that we *declared* dark support and did not implement it. For a tool that audits other people's
contrast, shipping a self-declared dark mode that fails at 1.00 is the single most embarrassing
defect possible.

**Fix:** implement both themes with tokens (explicit `prefers-color-scheme` block plus an explicit
toggle-free light default), then add a test that computes ratios for every pair in both themes
from the token file, so it cannot regress. This also gives us the contrast maths we will need for
the browser runner.

### 3.2 Accessibility gaps in the report itself

| Issue | Why it matters | Fix |
|---|---|---|
| `list-style: none` on `<ul class="findings">` with no `role="list"` | Safari drops list semantics when the marker is removed, so a screen-reader user hears a run of unrelated text instead of "list, 7 items" | add `role="list"` (both lists) |
| No focus indicator styles | The page is navigable, but tab focus is the browser default at best | explicit `:focus-visible` token |
| No skip link | Small page, but it is the pattern we will preach | add one |
| Heading levels are visual, not structural | `h2` for every section is correct; verify after token refactor | test heading order |
| Score conveyed by colour **and** a glyph | Already good — `✓ ~ ✗` plus a number | keep; note it as a pattern |

### 3.3 What the report gets right (worth protecting)

- **No client-side JS at all.** It reads with scripting disabled, in a text browser, behind a
  strict proxy. This is rarer than it should be and it is a genuine differentiator.
- **`tabular-nums` on every score** — numbers do not jitter between 63 and 100.
- **Provenance and a reproduce command** on the page itself. The reader can verify, not trust.
- **The caveat is not in a footnote** — it sits beside the score.
- **Undecided separated from violations.** Structurally, this is the best decision in the UI.
- **Delta-and-reason formatting in the terminal** (`ACCESSIBLE 53 ✗ label ×2 · …`) is the right
  density for a developer tool.

### 3.4 UX gaps worth planning for

| Gap | Impact | Recommendation |
|---|---|---|
| No visual score representation | A number alone is slower to read than a number plus a bar | a CSS-only meter (no JS), tokenised, with the threshold marked |
| No "bring me to the element" affordance | The reader cannot locate the failing node on their own page | show the selector and a breadcrumb; in the editor, deep-link and highlight |
| No copy-to-clipboard for the reproduce command | Pure friction | a `<button>` needs JS; instead select-on-click via CSS `user-select` + a `<pre>` the reader can triple-click. Honest, no JS. |
| Terminal has no `NO_COLOR` support despite claiming it | A documented behaviour that does not exist — same class of defect as dark mode | implement `NO_COLOR` / `FORCE_COLOR` properly, from config |
| Exit codes are good, but there is no `--quiet` / `--json` for machines | CI wants silence; humans want prose | `--quiet` for the action, keep JSON as the machine contract |
| Empty state ("no findings") is a sentence | Fine, but it should say *what was not checked* | reuse the coverage line in the empty state |

---

## 4. Structural design review

### 4.1 The good

- **One seam** (`engine.js`), **one collector boundary** (the only place a DOM exists), **one
  reporter per format**. The layering diagram in the docs is actually the layering in the code.
- **Injected engines** make tests fast and hermetic.
- **Purity where it counts**: `analyze` in, `{ ir, scores, hash }` out.
- **Determinism is enforced**, not hoped for — canonical stringify, sorted keys, content hash
  with volatile provenance excluded, and `SOURCE_DATE_EPOCH`.
- **Failure honesty is uniform**: unmeasured is `null`, undecided is excluded, environment limits
  are recorded rather than thrown.

### 4.2 The weak

| Weakness | Consequence | Fix |
|---|---|---|
| **Duplication across surfaces** — `summarize()`, `bandClass()`, `overallScore()` exist in `terminal.js` *and* `html.js` with slightly different sort tie-breaks | Two surfaces can disagree about the same IR — the exact drift the architecture forbids | extract a `src/view-model.js`: one projection from IR → display model, consumed by every surface |
| **No shared vocabulary** | `coverage === 'incomplete'`, `impact` ordering, and pillar ranks are re-derived in four files | one `src/vocabulary.js` with frozen constants |
| **CLI parsing is hand-rolled** | ~40 lines, no `--` handling, no repeatable args, `--port` accepts `NaN`, unknown flags kill the run rather than warn | small parser module with descriptors + coercion + validation, still zero deps |
| **`USAGE` is a template literal with interpolated `${'accessible'}`** | Interpolating a literal into a template that also documents the value it interpolates is a smell | copy catalogue + `COLLECTABLE` read at build of the string |
| **No config file at all** | Every option is a flag; the documented `spark.config.json` does not exist yet | schema + loader in 1c (it is needed for `baseline` paths and budgets) |
| **Version drift** | Reports overstate the engine version | single source read from `package.json` |
| **No `src/` barrel discipline** | `engine.js` re-exports three things from `score.js`, blurring the seam | either re-export nothing, or make `engine.js` the deliberate public API surface |
| **Serve is coupled to a CLI string** | `serveReport` takes rendered HTML; fine today, wrong when it serves many reports | accept a renderer function, keep the CLI from owning the server |

### 4.3 System-design gaps that are not code

| Gap | Why it matters |
|---|---|
| No **`CONTRIBUTING.md`** | The project invites disagreement in the README but gives no process |
| No **`SECURITY.md`** | We are a security-adjacent tool (we will audit MCP servers) with no disclosure path |
| No **`GOVERNANCE.md`** | The plan promises the spec can outlive the repo; nothing states how decisions are made |
| No **`CODE_OF_CONDUCT.md`** | Standard expectation for a public repository |
| No **issue/PR templates** | Bug reports will arrive without an IR hash, engine version or reproduce command |
| No **`CHANGELOG.md`** | Spec 2.0.0 shipped; consumers have no record of what moved |
| CI uses **`npm install`** not **`npm ci`** | Not reproducible; the lockfile should be authoritative |
| No **lint/format config** | Style is consistent by discipline, which does not survive contributors |
| No **`tsconfig`/types** | See §5 |
| No **error taxonomy** | Every failure is `Error` with a prose message; nothing is machine-classifiable or documented per exit code |

---

## 5. Missing in a deeper sense (ranked by risk)

1. **No type system, and no runtime schema for the IR.** The IR is the product's contract and it
   is unvalidated. A collector bug produces a malformed IR and every surface consumes it happily.
   *Fix:* publish `schema/ir-0.1.json` (JSON Schema), validate in `analyze`, and add JSDoc types
   with `checkJs` — no build step, no transpiler, types where they pay.
2. **No `src/config/`** — §2.
3. **No `view-model`** — §4.2, the only duplication that can make two surfaces disagree.
4. **Dark mode defect** — §3.1.
5. **No config file** (`spark.config.json`) despite being documented.
6. **No `baseline`/`--ci`** — 1c, already planned; the gate is the product.
7. **No browser runner** — contrast (the most common real failure) is undecidable.
8. **No error taxonomy / no `--quiet`** — blocks a clean CI action.
9. **No l10n hooks** — strings are English literals; the ease model promises localized output.
   The fix is not translation, it is *keying*: copy referenced by id from one catalogue.
10. **No packaging proof** — nobody has run `npm pack` and executed the tarball in a clean
    directory. Classic first-run failure.
11. **No performance budget for ourselves** — we publish budgets for others and have none.
12. **No observability of our own failures** — no way for a user to send us an IR hash + version.

---

## 6. Recommendation order

| Priority | Change | Why first |
|---|---|---|
| 1 | `src/config/` (tokens, thresholds, copy, constants, brand) + single version source | The stated requirement; unblocks every other surface |
| 2 | Fix dark mode **with tokens**, and add a contrast test that reads the token file | Turns an embarrassing defect into a permanent capability (we now have contrast maths) |
| 3 | `src/vocabulary.js` + `src/view-model.js` | Removes the only path by which two surfaces can disagree |
| 4 | IR JSON Schema + `checkJs` + JSDoc | Turns the contract into something enforced |
| 5 | Governance files, `npm ci`, lint/format, templates, CHANGELOG | Cheap, expected, and they protect the discipline as contributors arrive |
| 6 | Then resume 1c (`baseline` + `--ci` + SARIF + action) | The product, on a foundation that will not need re-cutting |

Everything above is additive. Nothing in the current architecture needs to be undone — which is
the strongest signal that the structural decisions were right.
