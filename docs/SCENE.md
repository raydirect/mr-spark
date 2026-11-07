# Scene documents

A scene document is a page described as data: what is on it, where it sits, what changes when it is
hovered or focused, which files it depends on, and what its accessibility contract is. It compiles to
HTML and CSS and nothing else. `motion-0.1` adds time to it; `settings-0.1` gives it a brand.

- Format version: **0.1** (`src/formats/scene.js` is the definition; `schema/scene-0.1.json` is a
  projection of it — never edit that file, run `npm run formats:generate`)
- File name: **`<name>.spark.scene.json`**
- A complete, valid example: [`test/fixtures/docs/landing.spark.scene.json`](../test/fixtures/docs/landing.spark.scene.json)

This format compiles. `spark lower <name>.spark.scene.json` resolves the document set into the IR and
`spark emit` writes `index.html`, `spark.css` and `tokens.json` — byte-identical across runs, and the
emitted page passes `spark check` at the same bar a hand-written page has to clear (both asserted in CI).
What the emitter deliberately refuses is in [`DOCUMENTS.md §4`](DOCUMENTS.md): a motion that needs
something running at play time, and nothing else. A refusal writes no files.

---

## The shape

```jsonc
{
  "$schema": "https://web-spark.dev/schema/scene-0.1.json",
  "version": "0.1",
  "meta": { "name": "landing", "lang": "en", "title": "Black Friday" },
  "tokens": { "$ref": "./brand.spark.settings.json" },

  "components": [
    { "id": "hero", "type": "stack", "children": [
      { "id": "hero-title", "type": "heading", "props": { "level": 1, "text": "Black Friday" } },
      { "id": "hero-cta", "type": "button", "props": { "label": "Shop deals", "tone": "color.accent" } }
    ] }
  ],

  "layout": { "hero": { "display": "grid", "gap": "space.lg", "pad": "space.xl", "align": "center" } },
  "states": { "hero-cta": {
    "default":       { "background": "color.accent", "color": "color.bg" },
    "hover":         { "background": "color.accentHover" },
    "focus-visible": { "outline": "layout.focusRing" }
  } },

  "assets": [{ "id": "logo", "kind": "svg", "path": "./logo.svg",
    "sha256": "0f2f157227e5c132466efda7e55a7d00b9c0ab4b1a52f74a4d9d0d1e0a5b1c4d" }],
  "a11y": { "landmarks": [{ "role": "main", "contains": "hero" }], "skipLink": true }
}
```

Five top-level objects, and each one answers a question the others cannot:

| Field | Answers | If you omit it |
|---|---|---|
| `components` | What is on the page, in what order | Nothing renders — required |
| `layout` | Where each component sits, and how it responds | Everything takes platform defaults |
| `states` | What changes on hover, focus, disabled, invalid | Interactive components fail validation |
| `assets` | Which files the page depends on, and which bytes | `image` may only reference absolute URLs |
| `a11y` | The landmark contract the page promises | A page with no landmarks, which is a choice, not a default |

## The split that organises everything: `props` vs `layout`

**`props` is what a component *is*. `layout` is where it sits.**

A `heading`'s level is a fact about the document's outline; its padding is a fact about this page.
They change for different reasons, they are edited by different parts of the studio (inspector versus
canvas), and they must not live in the same object — otherwise "we changed the copy" and "we moved the
card" are the same diff. This is why `stack` and `grid` have no props at all: everything about a
container is geometry.

## The component vocabulary

Eleven types. There is no `box`, no `div`, and no custom type in v1: a type with no meaning gives the
verifier nothing to check and a screen reader nothing to announce.

| Type | Props | Children | Emits | What the verifier can then say |
|---|---|---|---|---|
| `stack` | — | ✓ | `div` with `display: flex` | nothing about content; geometry only |
| `grid` | — | ✓ | `div` with `display: grid` | column count vs child count |
| `region` | `label` ✱, `role` | ✓ | `section`/`form`/`search`/`nav` with an accessible name | a nameless landmark is not a destination |
| `heading` | `level` ✱, `text` ✱ | — | `h1`–`h6` | one `h1` per page, no skipped levels |
| `text` | `text` ✱, `as`, `size` | — | `p`/`span`/`figcaption`/`blockquote`/lead | measure and size against the type scale |
| `link` | `label` ✱, `href` ✱, `external` | — | `a` | `href: "#"` is a defect, not a style |
| `button` | `label` ✱, `tone`, `type`, `disabled` | — | `button` | every button has a name; every name is text |
| `image` | `src` ✱, `alt` ✱, `width`, `height` | — | `img` | `alt: ""` is a *statement*; absence is not |
| `input` | `name` ✱, `label` ✱, `kind` ✱, `autocomplete`, `required` | — | `input` + `label for` | a placeholder can never be a label |
| `list` | `ordered` | ✓ | `ul`/`ol` > `li` | list semantics that are only visual |
| `listbox` | `label` ✱, `options` ✱, `value` | — | `select` (or a `listbox` with a keyboard map) | options without names |

✱ = required. `props` keys are checked **per type**: `{ "type": "heading", "props": { "label": … } }` is
an error, and the message says it was checked as the `"heading"` shape.

## `layout`

`display`, `cols`, `rows`, `gap`, `pad`, `margin`, `align`, `justify`, `span`, `maxWidth`, `minWidth`,
`responsive`. Every key is a component id.

- **No coordinates.** No `x`, `y`, `top`, `left`, `position`, `zIndex`. There is a test that fails if
  one is ever added (`test/formats.test.js`, "no document format asks for a coordinate"), because prose
  does not stop a field from appearing.
- **`display: none` does not exist.** A scene shows everything it declares. Interactive visibility is a
  machine question (motion document), not a layout one — otherwise a page can hide its main content and
  still look clean from the document.
- **`responsive` keys must name a declared breakpoint** (`layout.breakpoint.narrow`), so a breakpoint is
  one decision for the brand rather than a number invented per page.

## `states`

Seven properties, and this is the whole list: `background`, `color`, `border`, `outline`, `shadow`,
`opacity`, `radius`.

Two consequences worth understanding before they surprise you:

- **`transform` is not here.** A hover that *moves* something is animation. It belongs in the motion
  document, where its duration, its intent and its reduced-motion fallback are declared next to it. Two
  files with two fallbacks for one movement is how a design system ships an accessibility failure that
  every tool approved.
- **`border`, `outline` and `shadow` accept a token and nothing else.** `outline: "1px solid
  color.text"` is refused — not for style, but because a colour inside a string is invisible to every
  contrast check we have. Declare the ring as one token (`layout.focusRing: "2px solid currentcolor"`)
  and the compound inherits a colour that *is* in a contrast pair. A hover that fails contrast therefore
  fails the document, before a page exists.

## `tokens`

Either a reference — `{ "$ref": "./brand.spark.settings.json" }` — or the token groups written
inline for a self-contained document. A reference is the normal case, and it is what §4 of
`DOCUMENTS.md` means by "a page cannot ship a token value the settings document does not contain":
every `space.lg` in the scene is looked up in that file, and `space.larg` is an error with a suggestion.

With no settings document supplied, references are reported as **unresolved**, never as valid. That
distinction is the same one the score keeps between "we checked and it is fine" and "we could not
check".

## `assets`

Content-addressed: `id`, `kind` (`svg`, `png`, `jpg`, `webp`, `avif`, `woff2`), `path` relative to this
document, and `sha256` — 64 hex characters, no short form. `altDefault` optionally carries fallback alt
text for an asset used without an explicit `alt`. `image.src` must name a declared asset id or be an
absolute URL. A changed file with an unchanged hash is a build error, and a declared asset nobody
references is a lint — bytes somebody still has to hash and maintain.

## `a11y`

`landmarks[]` (`role` from the enumerated set — `banner`, `main`, `navigation`, `form`, `search`,
`contentinfo`, `complementary`, `region` — plus `contains`, a single component id) and `skipLink`. **Authored, never inferred.** The
verifier checks what was declared here rather than repairing it, so a page that passes was built to be
navigable rather than having happened to look that way. `SCENE005` refuses two `main`s, refuses a skip
link with nothing to skip to, and refuses a landmark pointing at a component that does not exist.

## The rules

Shape rules live in the schema; these nine do not, because JSON Schema cannot see them. They have ids
and messages for the same reason verifier rules do — a check you cannot name is a check you cannot
dispute.

| Id | Rule |
|---|---|
| SCENE001 | Component ids are unique — they are how `layout`, `states` and motion address a node |
| SCENE002 | Every `layout`/`states` key names a component that exists |
| SCENE003 | `button`, `link`, `input`, `listbox` declare `focus-visible`; the first three also declare `hover` |
| SCENE004 | `image.src` names a declared asset |
| SCENE005 | One `main`, landmarks point at real components, a skip link needs somewhere to skip |
| SCENE006 | A link's `href` is not `"#"` |
| SCENE007 | At most one `h1` (none at all is a lint, because a component is not a page) |
| SCENE008 | A `responsive` key names a breakpoint the settings document declares |
| SCENE009 | A declared state changes something |

## How a bad document is reported

```
document.components[0].props.level must be at most 6. Checked as the "heading" shape.
document.layout.hero.gap: "space.larg" is not a token the settings document declares. Did you mean "space.lg"?
document.states.hero-cta.active: an empty state block promises a change and delivers nothing.
  A reader who tabs to this element will see no reason why [SCENE009]
document.layout.hero.cols: "1fr" is written literally. Legal, and a lint — a value that appears
  twice is a bug waiting to disagree with itself.
```

Errors stop the build. Lints do not, and are printed. Checks that could not run are a third bucket,
because "valid" and "not checked" are different sentences.

---

## What a scene document cannot say

`{ value: 12 }` for a size. A media query it makes up itself. A CSS declaration. An inline SVG. A
component type it invents. `onClick`. `dangerouslySetInnerHTML` in any of its four disguises. Each of
those is a decision the verifier could not see, which is the only kind of decision this format
refuses. The list, and the reasoning for each row, is
[`DOCUMENTS.md §6`](DOCUMENTS.md).
