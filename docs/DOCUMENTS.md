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

  "animations": [
    { "id": "hero-in", "target": "#hero-title",
      "intent": "entrance",
      "trigger": { "on": "load" },
      "properties": ["opacity", "translateY"],
      "from": { "opacity": 0, "translateY": "12px" },
      "to":   { "opacity": 1, "translateY": "0" },
      "duration": "motion.base", "easing": "ease-out",
      "reducedMotion": "instant" }
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

### Rules specific to motion

- **`intent` is required.** `entrance` | `exit` | `emphasis` | `feedback` | `decorative`. The
  verifier reasons from intent, not from properties: an `entrance` that lasts four seconds is a
  different defect from a `decorative` loop that never stops.
- **`reducedMotion` is required** for anything with intent other than `decorative`. Values:
  `instant` | `fade` | `none`. A global kill switch is not a design — intent decides the
  fallback, per animation.
- **Known vestibular triggers are checked from the document**, before a browser is involved:
  large transforms, parallax, looping, full-screen movement, motion concurrent with scroll.
- **Nothing animates a property that triggers layout in a loop.** `width`, `height`, `top`,
  `left` are refused by the schema for looped animation; the compiler would rather fail than ship
  a jank source.
- **Motion never hides content.** An `entrance` that starts at `opacity: 0` must complete without
  interaction, or it is a content-visibility bug wearing an animation costume.

### Emission

CSS transitions for single-property animations; WAAPI for orchestrated sequences; a small runtime
(≈3 KB) only for state machines, generated per-document so unused states cost nothing. Every path
honours `prefers-reduced-motion` from the same `reducedMotion` field, so the fallback cannot
drift from the intent.

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
| Third-party embeds with their own a11y tree | Cannot be verified; must be declared and are reported as unverified, never as passing. |
| Precise visual layout (pixel positioning) | Deliberately. Layout is constraints and tokens, not coordinates — coordinates do not survive a viewport. |

That last row is the one that makes this different from a drawing canvas, and it is the decision
worth arguing about most.
