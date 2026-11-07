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

---

## 1. Scene document — `.spark.scene.json`

Structure, layout, states and assets. Compiles to HTML + CSS.

```jsonc
{
  "$schema": "https://web-spark.dev/schema/scene-0.1.json",
  "version": "0.1",
  "meta": { "name": "landing", "lang": "en", "title": "Black Friday" },

  "tokens": { "$ref": "./brand.spark.settings.json#/tokens" },

  "components": [
    { "id": "hero", "type": "stack", "props": { "gap": "space.lg", "align": "center" },
      "children": [
        { "id": "hero-title", "type": "heading", "props": { "level": 1, "text": "Black Friday" } },
        { "id": "hero-cta",   "type": "button",  "props": { "label": "Shop deals", "tone": "accent" } }
      ] }
  ],

  "layout": {
    "hero": { "display": "grid", "cols": "1fr", "pad": "space.xl" }
  },

  "states": {
    "hero-cta": {
      "default":      { "background": "color.accent" },
      "hover":        { "background": "color.accentHover" },
      "focus-visible": { "outline": "focus.ring" },
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
- **Assets are content-addressed.** A changed asset with an unchanged hash is a build error.

### Emission

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
    { "id": "hero-in", "target": "#hero-title",
      "intent": "entrance",
      "trigger": { "on": "load" },
      "properties": ["opacity", "translateY"],
      "from": { "opacity": 0, "translateY": "12px" },
      "to":   { "opacity": 1, "translateY": "0" } }
  ],

  "timelines": [
    { "id": "hero", "intent": "entrance",
      "items": [
        { "ref": "hero-in" },
        { "id": "hero-cards", "target": "#hero .card", "at": "<",
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
- **Nothing animates a property that triggers layout in a loop.** `width`, `height`, `top`,
  `left` are refused by the schema for looped animation; the compiler would rather fail than ship
  a jank source.
- **Motion never hides content.** An `entrance` that starts at `opacity: 0` must complete without
  interaction, or it is a content-visibility bug wearing an animation costume.
- **Scroll-linked motion is allowed in the format and marked undecided.** `trigger.on: "scroll"`
  with `scrub` validates structurally, but the effect depends on frame timing. Those findings carry
  `coverage: "incomplete"` with `undecidedKind: "environment"` (see
  [UNDECIDED.md](UNDECIDED.md)) — a browser runner can clear them, and we say so instead of
  guessing.

### Easing is a table, not a function

Named eases are borrowed from the vocabulary designers already have: `linear`, `ease-out`,
`power1–4.out/in/inOut`, `back.out(1.7)`, `elastic.out(1, 0.3)`, `bounce.out`, `steps(4, end)`,
`circ.inOut`. Each entry declares its **emission class**, and the schema is the only place that
knows them:

| Class | Meaning | Example |
|---|---|---|
| `bezier` | Representable as a CSS `cubic-bezier()` exactly | `power2.out`, `circ.inOut` |
| `sampled` | Compiler bakes the curve into a keyframe list at build time — deterministic, no runtime | `bounce.out`, `elastic.out(…)`, `back.out(1.7)` |
| `unlisted` | Not in the table at all, so the document is **invalid**. The error names the nearest supported ease rather than quietly substituting one | springs, `rough`/noise, anything that needs velocity carried between frames |

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

```jsonc
{
  "$schema": "https://web-spark.dev/schema/settings-0.1.json",
  "version": "0.1",
  "meta": { "name": "brand" },

  "tokens": {
    "color.accent":      { "value": "#0b5fd0", "type": "color", "contrastOn": ["color.bg", "color.surface"] },
    "color.accentHover": { "value": "#0a54b8", "type": "color" },
    "color.bg":          { "value": "#ffffff", "type": "color" },
    "space.lg":          { "value": "1.5rem",  "type": "length" },
    "focus.ring":        { "value": "2px solid #14181d", "type": "shadow" }
  },

  "controls": [
    { "group": "Colour", "path": "color.accent", "label": "Accent",
      "type": "color", "writable": true }
  ],

  "contrast": {
    "pairs": [ { "fg": "color.accent", "bg": "color.bg", "min": 4.5 } ]
  }
}
```

### Rules specific to settings

- **A token declares its contrast commitments.** `contrastOn` on the token and `contrast.pairs`
  on the document are both checked, in both themes, at author time. A colour change that breaks a
  commitment is a document error — the panel will not let you save it.
- **`controls` generate the UI.** There is no hand-written settings panel anywhere in the
  product; the panel is a projection of this document.
- **Themes are first-class.** `themes: ["light", "dark"]` multiplies the pair checks; there is no
  path to shipping a theme that was never contrasted.
- **Tokens emit as CSS custom properties and as JSON**, from the same source, so a design tool,
  the studio and the shipped page cannot disagree.

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
| Runtime-computed layout | Not statically checkable. |
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

