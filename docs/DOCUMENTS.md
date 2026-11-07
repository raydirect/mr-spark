# The Document Formats — scene, motion, settings

Three documents, one grammar, one type system. This is the specification for what a person
authors, and the contract the compiler and verifier both read.

Why three and not one: a page has *structure*, *time*, and *configuration*, and they change at
different rates. Merging them produces a document nobody can diff; splitting them further
produces the six-products failure. Three is the smallest number that keeps each independently
useful.

**Common rules, applying to all three:**

1. **JSON, with a JSON Schema, with typed declaration files.** Diffable is not a convenience — it
   is what makes review, merge, blame and the verifier's delta mean anything.
2. **`$schema` and `version` are required.** An unknown version is an error, never a warning.
3. **No executable code.** A document is data. Behaviour beyond declarative documents is an
   ordinary ES module, referenced by path, and therefore linted and measured like any other code.
4. **Deterministic lowering.** Same document, same IR, same bytes out. Asserted in CI.
5. **Unknown keys are rejected**, not ignored. A typo that silently does nothing is how a design
   system rots.
6. **Tokens are referenced, never inlined.** A colour that appears twice is a bug.
7. **`$comment` is the only prose key.** A document may annotate itself and may not smuggle anything
   else past a closed vocabulary.
8. **The published schema is a projection.** `schema/*.json` is generated from `src/formats/`
   ([ADR 0002](adr/0002-one-grammar-three-projections.md)); editing a generated file is how two
   definitions of one format get started. `npm run formats:check` fails if they disagree.

---

## 1. Scene document — `.spark.scene.json`

Structure, layout, states and assets. Compiles to HTML + CSS.

```jsonc
{
  "$schema": "https://web-spark.dev/schema/scene-0.1.json",
  "version": "0.1",
  "meta": { "name": "landing", "lang": "en", "title": "Black Friday" },

  "tokens": { "$ref": "./brand.spark.settings.json" },

  "components": [
    { "id": "hero", "type": "stack",
      "children": [
        { "id": "hero-title", "type": "heading", "props": { "level": 1, "text": "Black Friday" } },
        { "id": "hero-cta",   "type": "button",  "props": { "label": "Shop deals", "tone": "accent" } }
      ] }
  ],

  "layout": {
    "hero": { "display": "grid", "cols": "1fr", "gap": "space.lg", "align": "center", "pad": "space.xl" }
  },

  "states": {
    "hero-cta": {
      "default":      { "background": "color.accent" },
      "hover":        { "background": "color.accentHover" },
      "focus-visible": { "outline": "layout.focusRing" },
      "disabled":     { "opacity": "0.5" }
    }
  },

  "assets": [ { "id": "logo", "kind": "svg", "path": "./logo.svg", "sha256": "…" } ],

  "a11y": {
    "landmarks": [{ "role": "main", "contains": "hero" }],
    "skipLink": true
  }
}
```

### Rules specific to scenes

- **`props` is what a component is; `layout` is where it sits.** The 2026-11-07 schema freeze moved
  `gap`, `align` and friends out of `props` and into `layout`, because the inspector edits one and the
  canvas edits the other. Two homes for one fact is how a drag and a keyboard shortcut end up writing
  different stories about the same card.
- **Every component type is from the built-in vocabulary.** The v1 set is deliberately small:
  `stack`, `grid`, `heading`, `text`, `button`, `link`, `image`, `input`, `list`, `listbox`,
  `region`. A custom type is not allowed in v1 — see `REVOLUTION.md §14.2` for the reasoning and
  the v2 escape hatch.
- **`a11y` is authored, not inferred.** Landmarks and the skip link live in the document because
  a compiler that guesses at structure produces pages that pass a checker and confuse a person.
  The verifier then checks what was authored — it does not silently repair it.
- **`states` are mandatory for interactive components.** A `button` without `focus-visible` and
  `hover` fails the document schema, before any page exists. This is one place where authoring
  makes a whole class of failure unrepresentable.
- **`props` are checked per type.** `{ "type": "heading", "props": { "label": … } }` is refused, and
  the message says which shape it was checked against. A single loose `props` object would accept any
  type's keys and check none: the difference between a format and a suggestion.
- **`states` may change seven properties and no more:** `background`, `color`, `border`, `outline`,
  `shadow`, `opacity`, `radius`. `transform` is absent because movement is the motion document's
  business — duration, intent and reduced-motion fallback declared together, not in two files.
  `border`/`outline`/`shadow` accept a token and nothing else: a colour inside a compound string
  (`1px solid color.text`) is invisible to every contrast check we have. `layout.focusRing` holding
  `"2px solid currentcolor"` inherits a colour that *is* in a contrast pair, which is how a bad hover
  becomes a document error instead of a live page.
- **There is no coordinate, and no `display: none`.** Layout is constraints and tokens; a scene shows
  everything it declares. Interactive visibility is a machine question, not a layout one.
- **Assets are content-addressed.** A changed asset with an unchanged hash is a build error.

### Emission

Nine semantic rules (SCENE001–SCENE009) are enforced by the validator and deliberately *not* claimed
by the JSON Schema — see [SCENE.md](SCENE.md) for the table and the author-facing guide.

`scene → HTML`: one element per component, semantic by default (a `button` is a `<button>`, a
`listbox` gets its roles and a keyboard map), classes generated as stable, hashed, short names.
No inline styles in output. No JavaScript unless a state requires it, and state in CSS where
possible.

---

## 2. Motion document — `.spark.motion.json`

Time, states, and — the part nobody else has — **semantic intent**.

```jsonc
{
  "$schema": "https://web-spark.dev/schema/motion-0.1.json",
  "version": "0.1",
  "meta": { "name": "hero-motion" },

  "defaults": { "duration": "motion.base", "easing": "ease-out", "reducedMotion": "instant" },

  "animations": [
    { "id": "hero-in", "intent": "entrance",
      "target": { "id": "hero-title" },
      "trigger": { "on": "load" },
      "from": { "opacity": "0", "translateY": "12px" },
      "to":   { "opacity": "1", "translateY": "0" } }
  ],

  "timelines": [
    { "id": "hero", "intent": "entrance", "trigger": { "on": "load" },
      "items": [
        { "ref": "hero-in" },
        { "id": "hero-cards", "target": { "id": "hero-offers", "each": "children" }, "at": "<",
          "stagger": { "each": "motion.fast", "from": "center" },
          "to": { "opacity": 1, "translateY": "0" }, "easing": "power2.out" },
        { "id": "hero-badge", "target": "#hero .badge", "at": ">",
          "intent": "decorative", "to": { "rotate": "3deg" },
          "repeat": "infinite", "yoyo": true }
      ] }
  ],

  "machines": {
    "menu": {
      "initial": "closed",
      "states": {
        "closed": { "on": { "toggle": "open" } },
        "open":   { "on": { "toggle": "closed" }, "effects": ["menu-in"] }
      }
    }
  }
}
```

`defaults` is inherited down the tree and overridable at any level: one place for duration, one
place for easing, one place for the reduced-motion fallback. A required field counts as present if
`defaults` supplies it — the verifier reads the **resolved** animation, and `lower()` is what
resolves it, so inheritance is a compiler feature rather than a convention readers have to remember.

`at` is the timeline position parameter — `"<"` starts with the previous item, `">-0.1s"` overlaps
it, `"+=0.2s"` gaps it, `"label"` names a point. Order and overlap are what an animation *is*; a
flat list of independent transitions cannot be asked "how long until this page is still" or "what
else is moving at that moment", and those are exactly the questions the motion rules need answered.

`repeat` is a non-negative integer (extra plays) or the single string `"infinite"`. No `-1`, no
`infinite: true`: one field, two legal spellings, and a loop that never stops is worth a type.

### Rules specific to motion

- **`intent` is required.** `entrance` | `exit` | `emphasis` | `feedback` | `decorative`. The
  verifier reasons from intent, not from properties: an `entrance` that lasts four seconds is a
  different defect from a `decorative` loop that never stops. A timeline may declare one `intent`
  for its items; an item that declares its own wins — the badge inside an entrance sequence is
  still `decorative`, and pretending otherwise is how loops sneak into page transitions.
- **Severity is computed, not declared.** The compiler derives `motionImpact:
  none | subtle | noticeable | intense` from travel, scale, rotation, affected area, duration,
  looping and concurrency. An author may declare `impactFloor`; the compiler raises to the floor
  and **never lowers below it**. There is no field that talks a hazard down — that is the whole
  point of it being computed. Intent and severity are two axes on purpose: a `decorative` loop can
  be `intense`, and an `emphasis` cue can be `subtle`.
- **`reducedMotion` is required** for anything with intent other than `decorative` — satisfied
  either per animation or by `defaults`. Values: `instant` | `fade` | `none`. A global kill switch
  is not a design — intent decides the fallback, per animation.
- **A motion targets a component id, not a selector.** `{ "id": "hero-offers", "each": "children" }`
  is answerable from the document; `#hero .card` depends on what matched after layout, which is not a
  fact a static format owns. `each: "children"` is the only set a motion document may address, because
  the tree is known at build time — and it is what makes `stagger` mean something.
- **The animated properties are the keys of `from` and `to`.** There is no `properties` list: a third
  declaration of the same fact is a third way to be inconsistent, and it was in the original sketch.
- **A timeline needs a trigger.** A sequence with nothing to start it is a page that stays at
  `opacity: 0` forever, which is why `MOTION003` follows an item's trigger to its timeline's.
- **Loops are written in the document.** `repeat` | `yoyo` | `repeatDelay` are fields, not
  CSS after-effects. A loop the verifier cannot see is a vestibular hazard it cannot price, and
  `decorative` + `repeat: infinite` + `intense` is a finding on its own.
- **Overlapping writes are a finding, not a runtime behaviour.** If two animations move the same
  property on the same node without a declared order, the document is ambiguous. There is no
  `overwrite: "auto"` equivalent — the last writer is a race, and races are what we are here to
  remove.
- **No executable values.** Durations, distances and eases are numbers, tokens or names. `x: () =>
  innerWidth()` is the single feature that makes an imperative animation library unverifiable, so
  it is refused by the schema. Responsive motion is a `responsive` block of breakpoint-scoped
  overrides in the settings document, which the compiler can evaluate statically.
- **`to` / `fromTo` only, never `from` alone.** A `from`-only tween's endpoint is whatever the DOM
  happens to be at that moment, which is not in the document and therefore not in the guarantee.
- **Known vestibular triggers are checked from the document**, before a browser is involved:
  large transforms, parallax, looping, full-screen movement, motion concurrent with scroll.
- **Seven properties animate, and no others:** `opacity`, `translateX`, `translateY`, `scale`,
  `rotate`, `color`, `background`. `width`, `height`, `top`, `left`, `margin`, `padding`, `position`
  and `zIndex` are refused by the key pattern for *every* motion, not only for loops — a closed list of
  compositor-only properties is a one-line format rule, while "fine unless it loops" is a performance
  judgement a document cannot be trusted to make. The alternative for an effect that looks like a size
  change is `scale`, which is in the list and does not reflow; an effect that genuinely needs real
  measured size stays a CSS state change with no animation, which is what
  `Layout-state animation` means in §6.
- **Motion never hides content.** An `entrance` that starts at `opacity: 0` must complete without
  interaction, or it is a content-visibility bug wearing an animation costume.
- **Scroll-linked motion is allowed in the format and marked undecided.** `trigger.on: "scroll"`
  with `scrub` validates structurally, but the effect depends on frame timing. Those findings carry
  `coverage: "incomplete"` with `undecidedKind: "environment"` (see
  [UNDECIDED.md](UNDECIDED.md)) — a browser runner can clear them, and we say so instead of
  guessing.

Seven rules (MOTION001–MOTION007) are enforced by the validator and deliberately not claimed by the
JSON Schema:

| Id | Rule |
|---|---|
| MOTION001 | `target` is a component id or `animations[]` names a declared animation — dangling, missing, both-at-once, and a referenced animation carrying its own `trigger` are all findings |
| MOTION002 | `stagger` only means something with `each: "children"` |
| MOTION003 | An `entrance` that starts at `opacity: 0` must be triggered on `load`, `visible` or a state — following the item's timeline when it has no trigger of its own |
| MOTION004 | Every `intent` resolves against `INTENTS` |
| MOTION005 | `reducedMotion` is required unless the motion is declared `decorative` |
| MOTION006 | Every ease is in the table; an unknown name gets the nearest one, not a silent substitution |
| MOTION007 | A state machine's `initial`, `transitions` and `effects` resolve |

### Easing is a table, not a function

Named eases are borrowed from the vocabulary designers already have: `linear`, `ease-out`,
`power1–4.out/in/inOut`, `back.out(1.7)`, `elastic.out(1, 0.3)`, `bounce.out`, `steps(4, end)`,
`circ.inOut`. Each entry declares its **emission class**, and the schema is the only place that
knows them:

| Class | Meaning | Example |
|---|---|---|
| `bezier` | A CSS timing function exists for it, so it emits as one word and nothing else | `linear`, `ease-out`, `steps(4, end)` |
| `sampled` | Compiler bakes the curve into a keyframe list at build time — deterministic, no runtime | `power2.out`, `circ.inOut`, `bounce.out`, `back.out(1.7)` |
| `unlisted` | Not in the table at all, so the document is **invalid**. The error names the nearest supported ease rather than quietly substituting one | springs, `rough`/noise, anything that needs velocity carried between frames |

The line between the two classes is drawn where CSS's own vocabulary ends, not where a `cubic-bezier()`
could be *fitted*. `power2.out` has published control points — `(0.33, 1, 0.68, 1)` is close — but a fit
is a different curve, and quietly shipping a near-miss is the exact failure this compiler exists to
prevent. So families emit as baked keyframes, where the sample count is a declared constant
(`SAMPLE_MAX_KEYFRAMES`, 32) and the error is bounded and identical for everyone. One consequence is
worth naming now, because `lower()` will hit it: **a CSS `transition` carries exactly one timing
function and no keyframe list**, so a `sampled` ease forces a WAAPI animation even for a single property.
That is why `emission` lives in the format instead of being a caller's choice.

`sampled` is why an ease that CSS cannot express is not an argument for a JS runtime: the compiler
can do at build time what a library does per frame, once, and leave nothing behind to license,
load, or break. `unlisted` is the honest boundary on that trick — sampling works for curves that
are a pure function of progress, and springs are not: where a spring ends up depends on how fast
the element was already moving, which is a fact about the frame, not about the document. Interruptible
spring motion is the feature most likely to be asked for and the one this format will not have in
v1; it needs a runtime that owns state, which is exactly what we are trying not to ship.

### Emission

CSS transitions for single-property animations; WAAPI for orchestrated sequences and timelines; a
small runtime (≈3 KB) only for state machines, generated per-document so unused states cost
nothing. Every path honours `prefers-reduced-motion` from the same `reducedMotion` field, so the
fallback cannot drift from the intent.

**Emitted output contains no third-party animation runtime.** The widely used ones are licensed in
ways that matter here: the Standard "No Charge" licence (effective 2025-04-30) defines "Competitive
Products" as software that lets users create or edit animations through a visual interface, and
prohibits both using its library inside such a tool and reverse-engineering it toward one. It is
not an open-source licence, it can be amended by posting a new version, and a page that depends on
it belongs to its owner less than a page that depends on CSS does. Our emitted output is
platform primitives plus code we generated, so a user's page carries no licence they did not choose
— which is a feature of the format, not a limitation of our taste.


---

## 3. Settings document — `.spark.settings.json`

Configuration as data, tokens as the only source of visual values.

The settings document is `src/config/tokens.json` as it already exists. The flat
`"color.accent": { "value", "type", "contrastOn" }` sketch that lived here was dropped in favour of the
shape the report renders from — see [ADR 0002](adr/0002-one-grammar-three-projections.md), whose
dogfood test is our own brand file validating as a settings document.

```jsonc
{
  "$schema": "https://web-spark.dev/schema/settings-0.1.json",
  "version": "0.1",
  "meta": { "name": "brand", "version": "1.0.0", "themes": ["light", "dark"] },

  "color": {
    "light": { "bg": "#ffffff", "text": "#14181d", "accent": "#0b5fd0", "accentHover": "#0a54b8" },
    "dark":  { "bg": "#12161b", "text": "#e9edf2", "accent": "#85b4ff", "accentHover": "#a3c6ff" }
  },
  "space":  { "sm": "0.75rem", "md": "1rem", "lg": "1.5rem" },
  "radius": { "sm": "4px", "md": "6px" },
  "type":   { "size": { "md": "1rem", "lg": "1.25rem" } },
  "layout": { "breakpoint": { "narrow": "40rem" }, "focusRing": "2px solid currentcolor" },
  "motion": { "instant": "0ms", "fast": "120ms", "base": "200ms" },

  "contrast": {
    "minimum": { "text": 4.5, "ui": 3 },
    "pairs":       [ { "fg": "text", "bg": "bg" }, { "fg": "accent", "bg": "bg", "min": 4.5 } ],
    "impactPairs": [ { "fg": "border", "bg": "bg", "min": 1.2 } ]
  },

  "controls": [
    { "group": "Colour", "path": "color.accent", "label": "Accent",
      "type": "color", "writable": true }
  ]
}
```

`fg` and `bg` are paths **inside a theme block**, not token references: the same pair means the same
promise in light and in dark, so it is written once. `color` is the only themed group — spacing,
radius, type scale and durations do not adapt to a colour scheme, and saying so in the format is what
makes "the dark theme forgot our spacing" unrepresentable.

### Rules specific to settings

- **One home for a contrast commitment.** `contrast.pairs` is it. `contrastOn` on individual tokens —
  the second declaration this sketch used to carry — was dropped: two places promising the same thing
  is not a guarantee, it is a tie-break waiting to happen. A colour that appears in no pair ships
  unchecked, and `SETTINGS002` says so; a pair may be stricter than `contrast.minimum` and never laxer
  for text.
- **Themes mirror each other or the document is wrong.** `SETTINGS001` requires `color`'s keys to be
  exactly `meta.themes` and every theme to define every colour key. A theme that "inherits" a colour is
  a report that renders one hex on another hex. Both halves are `themes` first: every declared theme
  multiplies every pair check, so there is no path to shipping a theme that was never contrasted.
- **`controls` generate the UI, read-only unless declared otherwise.** There is no hand-written
  settings panel anywhere in the product; the panel is a projection of this document. A control must
  name a token that exists, and its editor must suit the group (`SETTINGS003`) — a slider needs a
  `min` and a `max`, because an unbounded slider is a way to break a design system in one drag.
- **No colour inside a compound value.** A token value may be `2px solid currentcolor` and may not be
  `2px solid #14181d`: `#` is refused by the pattern, because a colour a contrast check cannot see is
  a colour nobody promised.
- **Tokens emit as CSS custom properties and as JSON**, from the same source, so a design tool,
  the studio and the shipped page cannot disagree.

Four rules (SETTINGS001–SETTINGS004):

| Id | Rule |
|---|---|
| SETTINGS001 | `color`'s keys are exactly `meta.themes`, and every theme defines every colour key |
| SETTINGS002 | Every `contrast.pairs` / `impactPairs` path resolves inside a theme block; a text pair may not be laxer than `contrast.minimum.text` |
| SETTINGS003 | A control names a token that exists, its editor suits the group, a `slider` has `min`/`max`, a `select` has `options` |
| SETTINGS004 | No `url()` in a token value — a file an asset hash does not cover is a dependency nobody promised |

---

## 4. How the three combine

```
settings ──tokens──▶ scene ──structure──▶ IR ──▶ compiler ──▶ page
                        ▲                                     │
motion ────time─────────┘                                     │
                                                              ▼
                                              verifier: accessible · fast · safe
                                                        · legible · resilient
```

`scene.tokens` is a reference to a settings document, not a copy. A page therefore cannot ship a
token value the settings document does not contain — the same rule as "no hex literal in a
stylesheet" that we already enforce on our own report.

### `lower`: five rules about the set, not the file

`src/lower.js` is where three documents become one IR, and it is the only place four kinds of fact are
computable: token values, cross-document identity, inherited `defaults`, and absolute timing.

| Id | Rule |
|---|---|
| LOWER001 | A referenced settings document must exist, parse, and validate — a `$ref` to a file that is not there is an error naming the path, never an empty token table |
| LOWER002 | A motion target names a component in the scene; `each: "children"` requires that the component has children |
| LOWER003 | A token reference resolves in the store actually in scope; two tokens whose paths collapse to one CSS name is a token that silently loses |
| LOWER004 | A `state` trigger names a machine and a state the motion document declares |
| LOWER005 | A component id's CSS class is unique on the page |

`defaults` resolve in one order — item, timeline, timeline defaults, document defaults — through
`resolveField`, the same resolver the format's own checks import. A document that validates is
therefore a document that emits; two resolvers is where "it passed the schema but the page is wrong"
comes from.

**Severity is computed, and an author may only raise it.** `assessMotionImpact` reads travel in px
(>12 noticeable, >40 intense), scale delta (>0.02, >0.25), rotation in degrees (>2, >15), and
looping: anything that repeats is at least `noticeable` because "still changing" is the burden, not
"changed a lot", and a loop under 250 ms is `intense`. `impactFloor` can lift a level and can never
lower one — a guarantee the graded party can dial down is not a guarantee.

### `emit`: three rules about what CSS can honour

| Id | Rule, and the alternative |
|---|---|
| EMIT001 | A `state`, `click` or `scroll` trigger, a machine with effects, or a state with no CSS selector needs something running at play time. Emit as `load`, `visible`, `hover` or `focus`, or leave the change as a scene state with no animation. The generated runtime is Phase 4 and this refusal leaves with it |
| EMIT002 | `repeatDelay` has no CSS equivalent. Fold the pause into `duration` — padding it in would emit a different motion than the one authored |
| EMIT003 | Every layout property, component type, breakpoint and a11y promise must have exactly one emission mapping; a `load` and a `visible` motion on one element is two claims on one CSS animation list |

A refusal writes **nothing**. Not "the CSS without the motion", not "the HTML with a TODO": a page with
a silently dropped animation is a wrong page, and shipping it would put this tool in the category of
tools that approve things.

Emission today, in full: `:root` and `[data-theme]` token blocks, one rule per component in property-name
order, state pseudo-classes, `@media` blocks for `responsive` against declared breakpoints, `@keyframes`
with `animation-delay` for timelines, `:nth-child` delays for a stagger, `transition` for hover and
focus, `@supports (animation-timeline: view())` around anything that waits for the viewport, and one
`@media (prefers-reduced-motion: reduce)` block last, and a provenance header naming the source
documents, their versions and the IR hash — basenames only, so the same documents emit the same bytes in
someone else's checkout. `sampled` eases arrive as `linear(…)` with at most
`SAMPLE_MAX_KEYFRAMES` values — the curve sampled by the compiler, not a `cubic-bezier()` fitted to it.
Nothing needs `!important`, because the order is the argument.

---

## 5. Versioning

- Adding an optional field: **minor**.
- Adding a required field, removing a field, changing a default: **major**, with a migration
  command.
- The compiler **refuses** a document whose `version` it does not implement. It does not attempt
  best-effort parsing: a partially understood design document produces a confidently wrong page.
- Every emitted artifact prints the document versions and the IR hash in its provenance block, for
  the same reason the report does — a page that cannot say what produced it is not auditable.

---

## 6. What these formats deliberately cannot express

Written down so the omission is a decision, not an oversight.

| Not expressible in v1 | Why |
|---|---|
| Arbitrary CSS | The guarantees depend on a closed vocabulary. Escape hatch is a v2 "unverified region". |
| Custom component types | Types are the vocabulary the verifier reasons over. |
| Runtime-computed layout | Not statically checkable. The alternative is `responsive`, declared against named breakpoints in the settings document: the same decision, made where it can be checked. |
| Hiding content (`display: none`, `hidden`) | A v1 page shows what it declares, or it can hide its main content and still read clean from the document. The alternative is `trigger.on: "state"` in the motion document, where the emitter decides how a state is hidden and `reducedMotion` says what the fallback looks like. |
| Animation driven by server data | The motion document is static; data-driven motion needs a data document we have not designed. |
| Layout-state animation ("measure it, then animate the difference") | Needs real measurement, so it waits for the browser runner. It is a `measure` step on a timeline in the design, not a refusal — but until that step exists the format cannot promise anything about it. |
| Third-party embeds with their own a11y tree | Cannot be verified; must be declared and are reported as unverified, never as passing. |
| Precise visual layout (pixel positioning) | Deliberately. Layout is constraints and tokens, not coordinates — coordinates do not survive a viewport. |

That last row is the one that makes this different from a drawing canvas, and it is the decision
worth arguing about most.

**A row is not finished until it has an alternative.** Decided 2026-11-07: no escape hatch, and no
bare refusals either — *there are always solutions that work*, so the plan is to keep finding them
(see [REVOLUTION.md §14.2](REVOLUTION.md)). In practice that means a gap grows a field (`defaults`,
`stagger`, `sampled` eases), or it grows a declared `embed` that reports itself unverified. What it
never grows is markup the verifier silently skips.

