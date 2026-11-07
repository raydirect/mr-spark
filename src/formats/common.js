/**
 * Shared definitions for all three formats.
 *
 * These live in one file because they must mean the same thing in a scene, a motion document and a
 * settings document: a `length` that is `px|rem|em|%` in one format and `px|rem` in another is two
 * formats wearing one name.
 */

import { t } from './grammar.js';
import { EASE_NAMES, EASE_PATTERN } from './eases.js';

/**
 * The format version this build implements. A document whose root `version` is anything else is
 * refused, not partially understood (docs/DOCUMENTS.md §5).
 */
export const VERSION = '0.1';

/** The token groups the format knows. A new group is a change to the store, not to a document. */
export const TOKEN_GROUPS = Object.freeze(['color', 'space', 'radius', 'type', 'layout', 'motion']);

/**
 * The only group whose values change per theme in v1.
 *
 * Spacing, radius, type scale and durations do not adapt to a colour scheme, so they are declared
 * once. Saying this in code is what makes "the dark theme forgot our spacing" unrepresentable rather
 * than merely unlikely.
 */
export const THEMED_GROUPS = Object.freeze(['color']);

/** `space.lg`, `color.accent`, `motion.base`. Dotted, lower-camel after the group. */
export const TOKEN_PATH = String.raw`[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+`;

/**
 * A number in canonical form: `0`, `1.5`, `0.05` yes; `.5`, `007`, `1.` no. One spelling per value
 * is what keeps a design document diffable — three ways to write the same number is three diffs.
 *
 * Not `String.raw`: these fragments are interpolated into the non-raw templates below, where a
 * doubled backslash would reach the regex engine as a literal backslash.
 */
/**
 * A token name inside its group: `none`, `2xs`, `scoreRowColumns`. A key may start with a digit,
 * because a spacing scale that writes `2xs` writes it, and a format that rejects the store's own
 * vocabulary is a format with an opinion instead of a contract. The *group* must start with a letter,
 * so `space.2xs` is a reference and `2xs` alone is not.
 */
export const TOKEN_KEY = '^[a-z0-9][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*$';

const NUM = '(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?';

/**
 * A colour block: hex values, or nested naming (`impact.critical`) so related colours group together.
 * Recursive, which is why it is a shared definition rather than a shape written twice.
 */
const COLOR_BLOCK = t.map(
  t.union([t.ref('color'), t.ref('colorBlock')], {
    describeAs: 'a 6-digit hex colour, or a nested block of them',
    description: 'A colour, or a nested block of colours.',
  }),
  { keyPattern: TOKEN_KEY, description: 'A token name → a colour or a block.' },
);

/** Non-colour token groups: values, optionally grouped one level (`type.size.md`). */
const VALUE_BLOCK = t.map(
  t.union([t.ref('propertyValue'), t.ref('valueBlock')], {
    describeAs: 'a value, or a nested block of values',
    description: 'A value, or a nested block of values.',
  }),
  { keyPattern: TOKEN_KEY, description: 'A token name → a value or a block.' },
);

export const DEFS = Object.freeze({
  /** A component, asset or animation id: kebab-case, URL-safe, and stable enough to diff. */
  id: t.string({
    pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
    description: 'A document-local identifier. Ids are the only way one document names a thing in another.',
  }),

  /** Six digits only: `#fff` and `#ff000080` are legal CSS and a diffing nightmare. */
  color: t.string({
    pattern: '^#[0-9a-f]{6}$',
    description: 'A 6-digit hex colour, lowercase. No alpha channel — a translucent token is a contrast commitment waiting to be broken.',
  }),

  length: t.string({
    // `0` needs no unit in CSS, and `space.none: "0"` is how a scale says "nothing". Everything
    // else must carry its unit, because `20` in a design document is a question, not a value.
    pattern: `^(?:0|(?:${NUM})(?:px|rem|em|%))$`,
    description: 'A length. Viewport units are absent on purpose: a size that changes with the window cannot be checked against a spacing scale.',
  }),

  duration: t.string({
    pattern: `^(?:${NUM})(?:ms|s)$`,
    description: 'A duration. Bare numbers are absent: `200` is not a fact about time until it says what unit it is in.',
  }),

  /** Kept a string so `0.5`, `0.50` and `.5` cannot produce three diffs for one value. */
  alpha: t.string({
    pattern: '^(?:0|1|0\\.[0-9]{1,2})$',
    description: 'An opacity multiplier between 0 and 1, in canonical form.',
  }),

  /**
   * Any CSS *value*, never a CSS *declaration*. `;`, `{` and `}` are absent because a token that could
   * end one rule and start another is an escape hatch in a coat of tokens, and `<` because a value
   * that reaches an HTML attribute should not get the chance. `url(` is refused by a check, not here:
   * assets are referenced by id, and a background image is a decision the verifier should be able to
   * see as an asset (docs/DOCUMENTS.md §6).
   *
   * `#` is absent too, and that rule does more work than the other four: a colour written inside a
   * compound value (`2px solid #14181d`) is invisible to every contrast check in the project, because
   * the string is not a colour token. `currentColor` exists so a compound can inherit a colour that
   * *is* checked, which is why the pattern takes the hex away without taking the expressiveness away.
   */
  cssValue: t.string({
    pattern: '^[^;{}<>#]+$',
    patternNote: 'A value may not contain "#", ";", "{", "}" or "<": a colour inside a compound is invisible to the contrast checks, so write it as a token or use currentColor.',
    minLength: 1,
    maxLength: 200,
    description: 'A CSS value: a font stack, a grid track list, a width. Values are allowed; declarations are not.',
  }),

  /** A path inside the colour block of one theme: `text`, `impact.critical`. No group, no theme. */
  colorPath: t.string({
    pattern: '^[a-z][A-Za-z0-9]*(?:\\.[A-Za-z0-9]+)*$',
    description: 'A dotted path inside `color.<theme>`. Theme-relative, because a contrast commitment is the same statement in every theme.',
  }),

  lang: t.string({
    pattern: '^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$',
    description: 'A BCP-47 tag for the page language. It is authored, never guessed: `lang="en"` on a French page is a wrong promise to every screen reader.',
  }),

  themeName: t.string({
    pattern: '^[a-z][a-z0-9]*$',
    description: 'A theme key, e.g. "light".',
  }),

  easing: t.union(
    [t.enum(EASE_NAMES, { description: 'An ease from the closed table, spelled exactly.' }),
     t.string({ pattern: `^(?:${EASE_PATTERN})$`, description: 'A parameterised ease: `back.out(1.7)` or `steps(4, end)`. The amount is required — an omitted parameter would be a hidden default.' })],
    { description: 'A curve from the ease table. An unlisted name is an error, never a fallback to `ease`.' },
  ),

/** A reference to a token in a named group. */
  tokenRef: t.tokenRef({ groups: [...TOKEN_GROUPS] }),

  colorBlock: COLOR_BLOCK,
  valueBlock: VALUE_BLOCK,

  /** A length or an opacity or any CSS value — the union a state property accepts. */
  propertyValue: t.union(
    [t.ref('tokenRef'), t.ref('length'), t.ref('alpha'), t.ref('duration'), t.ref('cssValue')],
    {
      description: 'A style value: a token reference if the store has one, otherwise a literal.',
      // Without this, a rejected value reads "matches none of: a tokenRef | a length | …" — the
      // names of our internals, which an author cannot act on.
      describeAs: 'a token reference (such as "space.lg"), a length, an opacity, a duration or a CSS value',
    },
  ),

  meta: t.object({
    name: t.string({
      minLength: 1,
      maxLength: 120,
      description: 'What this document calls itself. Appears in report provenance and in the studio tab.',
    }),
    version: t.opt(
      t.string({
        pattern: '^\\d+\\.\\d+\\.\\d+$',
        description: 'The version of what this document describes — the brand, the kit. Not the format version, which is the root `version`.',
      }),
    ),
    description: t.opt(t.string({ maxLength: 400, description: 'Free text for the humans who inherit this file.' })),
  }),
});

/**
 * Where the schema set is published, without a trailing slash.
 *
 * One literal on purpose. This string is the `$id` of every schema, the target of every `$ref`
 * between them, the `const` each format requires in `$schema`, and the route the publisher serves —
 * so two copies of it are one fact with two owners, which is how a document ends up naming an
 * address no server answers. `test/publish.test.js` holds those four together.
 *
 * Changing it is a format amendment, not a config change: documents already written name the old
 * address, and they stay valid only while it keeps serving the bytes they expect. `docs/HOSTING.md` §5.
 */
export const SCHEMA_HOST = 'https://mr-spark.pages.dev/schema';

/** Every document starts the same way, so the same two nodes describe the same two fields. */
export function schemaUrl(format, version) {
  return t.const(`${SCHEMA_HOST}/${format}-${version}.json`, {
    description: 'The schema this document claims to satisfy. Required, so a document cannot be validated against the wrong vocabulary by accident.',
  });
}

/**
 * The format version is a `const`, not a checked string: an unknown version is a hard error rather
 * than a best-effort parse, because a partially understood design document produces a page that is
 * confidently wrong (docs/DOCUMENTS.md §5).
 */
export function formatVersion(version) {
  return t.const(version, {
    description: `The format version this document is written against. This build implements "${version}" and refuses every other.`,
  });
}

/** A property value that should be a token but may be written literally, at the cost of a lint. */
export function tokenOr(defName, groups = TOKEN_GROUPS) {
  return t.tokenOr(t.ref(defName), { groups: [...groups] });
}
