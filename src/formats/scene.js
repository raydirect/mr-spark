/**
 * The scene document — `.spark.scene.json`.
 *
 * Structure, layout, states, assets and the authored accessibility contract. Two ideas carry this
 * file, and both are why it is not a stylesheet:
 *
 * 1. **A closed vocabulary.** Every component type and every animatable property is enumerable, so
 *    the verifier reasons over meaning rather than guessing at markup. An unknown key is an error —
 *    a typo that silently does nothing is how a design system rots.
 * 2. **Geometry lives in `layout`, never in `props`.** `props` is what a component *is* (its label,
 *    its level, its target); `layout` is where it sits. One fact, one home — and the studio's canvas
 *    edits `layout` while its inspector edits `props`, so the split is what keeps a drag and a
 *    keyboard shortcut from writing two different stories about the same card.
 */

import { t } from './grammar.js';
import { DEFS, TOKEN_GROUPS, TOKEN_KEY, VERSION, schemaUrl, formatVersion, tokenOr } from './common.js';

/**
 * The v1 component vocabulary. Deliberately small, and deliberately without a `box` or `div`: a type
 * with no meaning has nothing for the verifier to check and nothing for a screen reader to announce.
 */
export const COMPONENT_TYPES = Object.freeze([
  'stack',
  'grid',
  'region',
  'heading',
  'text',
  'link',
  'button',
  'image',
  'input',
  'list',
  'listbox',
]);

/** Which types may have children. A `heading` with children is a nesting bug, caught at the schema. */
const CONTAINERS = new Set(['stack', 'grid', 'region', 'list']);

/** Types the verifier expects to be reachable by keyboard, and so expects states for. */
const INTERACTIVE = Object.freeze(['button', 'link', 'input', 'listbox']);
const POINTER = Object.freeze(['button', 'link', 'listbox']);

/**
 * The only visual properties a `states` block may change, and what each one accepts.
 *
 * `border`, `outline` and `shadow` take a token and nothing else. That is not fussiness: a compound
 * like `1px solid color.text` hides a colour inside a string, where neither the schema nor the
 * contrast check can see it, and a state colour nobody contrasted is the single most common real
 * accessibility defect in this corpus. Declare the whole ring as one token in the settings document —
 * which is also what makes a hover that fails contrast fail *the document*, before a page exists.
 */
export const STATE_PROPERTIES = Object.freeze(['background', 'color', 'border', 'outline', 'shadow', 'opacity', 'radius']);

const COLOR_PROP = tokenOr('color', ['color']);
const TOKEN_ONLY = t.tokenRef({ groups: [...TOKEN_GROUPS] });

const STATE_PROPS = t.object({
  background: t.opt(COLOR_PROP),
  color: t.opt(COLOR_PROP),
  border: t.opt(TOKEN_ONLY),
  outline: t.opt(TOKEN_ONLY),
  shadow: t.opt(TOKEN_ONLY),
  opacity: t.opt(t.union([t.ref('tokenRef'), t.ref('alpha')])),
  radius: t.opt(tokenOr('length', ['radius', 'space', 'layout'])),
});

/**
 * `transform` is absent from `STATE_PROPERTIES` on purpose: a hover that *moves* something is
 * animation, and animation belongs to the motion document where intent, duration and the
 * reduced-motion fallback are declared next to it. Allowing it here would put the same decision in
 * two files with two different fallbacks.
 */
export const STATE_KEYS = Object.freeze([
  'default',
  'hover',
  'focus',
  'focus-visible',
  'active',
  'disabled',
  'checked',
  'invalid',
]);

const ASSET_KINDS = Object.freeze(['svg', 'png', 'jpg', 'webp', 'avif', 'woff2']);

const LANDMARK_ROLES = Object.freeze([
  'banner',
  'navigation',
  'main',
  'complementary',
  'contentinfo',
  'search',
  'form',
  'region',
]);

/** A CSS value or a token reference — the shape every visual property accepts. */
const VALUE = tokenOr('cssValue');
const LENGTH = tokenOr('length', ['space', 'radius', 'layout', 'type']);

function propsFor(type) {
  switch (type) {
    case 'heading':
      return {
        level: t.integer({ minimum: 1, maximum: 6, description: 'The heading level. It is authored because a compiler that guesses it produces a page with three h1s.' }),
        text: t.string({ minLength: 1, maxLength: 400, description: 'The visible text. A heading with no text is a section the reader cannot name.' }),
      };
    case 'text':
      return {
        text: t.string({ minLength: 1, maxLength: 20000 }),
        as: t.opt(t.enum(['p', 'span', 'figcaption', 'blockquote', 'lead'])),
        size: t.opt(LENGTH),
      };
    case 'button':
      return {
        label: t.string({ minLength: 1, maxLength: 120, description: 'The accessible name. There is no icon-only button in v1: an icon without a text label cannot be checked, translated, or read.' }),
        tone: t.opt(tokenOr('color', ['color'])),
        type: t.opt(t.enum(['button', 'submit'], { description: 'Defaults to `button`, which is the safe default and the one that never submits a form by accident.' })),
        disabled: t.opt(t.boolean()),
      };
    case 'link':
      return {
        label: t.string({ minLength: 1, maxLength: 200 }),
        href: t.string({
          pattern: '^(?:#|/|https?://|mailto:|tel:)',
          description: 'A real destination. `#` alone is not one — see SCENE006.',
        }),
        external: t.opt(t.boolean({ description: 'The emitter adds `rel="noopener"` for this; it is not authored, so it cannot be forgotten.' })),
      };
    case 'image':
      return {
        src: t.string({
          pattern: '^(?:[a-z][a-z0-9-]*|https?://\\S+)$',
          description: 'An asset id from `assets`, or an absolute URL. A bare filename that is not a declared asset is a broken image waiting for production.',
        }),
        alt: t.string({ maxLength: 500, description: 'Required, and `""` is a legal answer: it means decorative, which is a statement, not an omission.' }),
        width: t.opt(LENGTH),
        height: t.opt(LENGTH),
      };
    case 'input':
      return {
        name: t.string({ pattern: '^[A-Za-z][A-Za-z0-9_]{0,62}$' }),
        label: t.string({ minLength: 1, maxLength: 120, description: 'Required. A placeholder is not a label, and a field authored without one cannot be emitted with one.' }),
        kind: t.enum(['text', 'email', 'tel', 'url', 'number', 'password', 'search', 'checkbox', 'radio', 'date']),
        autocomplete: t.opt(t.string({ pattern: '^[a-z][a-z-]{0,47}$' })),
        required: t.opt(t.boolean()),
      };
    case 'listbox':
      return {
        label: t.string({ minLength: 1, maxLength: 120 }),
        options: t.array(
          t.object({
            value: t.string({ minLength: 1, maxLength: 80 }),
            label: t.string({ minLength: 1, maxLength: 120 }),
            disabled: t.opt(t.boolean()),
          }),
          { minItems: 1 },
        ),
        value: t.opt(t.string({ maxLength: 80 })),
      };
    case 'region':
      return {
        label: t.string({ minLength: 1, maxLength: 120, description: 'A region without a name is not a landmark a screen reader can offer as a destination.' }),
        role: t.opt(t.enum(['region', 'form', 'search', 'navigation'])),
      };
    case 'list':
      return { ordered: t.opt(t.boolean()) };
    default:
      // `stack` and `grid` carry no props: everything about them is geometry, which lives in `layout`.
      return {};
  }
}

const LAYOUT = t.object({
  display: t.opt(t.enum(['block', 'flex', 'grid', 'inline-flex'])),
  cols: t.opt(VALUE),
  rows: t.opt(VALUE),
  gap: t.opt(LENGTH),
  pad: t.opt(LENGTH),
  margin: t.opt(LENGTH),
  align: t.opt(t.enum(['start', 'center', 'end', 'stretch', 'baseline'])),
  justify: t.opt(t.enum(['start', 'center', 'end', 'stretch', 'between', 'around', 'evenly'])),
  span: t.opt(t.integer({ minimum: 1, maximum: 12 })),
  maxWidth: t.opt(LENGTH),
  minWidth: t.opt(LENGTH),
  /**
   * Breakpoint-scoped overrides — the declarative answer to "no runtime-computed layout". A key must
   * name a token in `layout.breakpoint.<name>`, so a breakpoint is a shared decision in the settings
   * document rather than a number in one page's stylesheet.
   */
  responsive: t.opt(t.map(t.ref('layoutBlock'))),
});

/**
 * One variant per component type, discriminated on `type`.
 *
 * This is what lets a JSON Schema — the thing VS Code and every third-party editor reads — know that
 * a `heading` takes `level` and a `button` takes `label`. A single loose `props` object would accept
 * any of them and check none, which is the difference between a format and a suggestion.
 */
const COMPONENT_VARIANT = t.union(
  COMPONENT_TYPES.map((type) =>
    t.object({
      id: t.opt(t.ref('id')),
      type: t.const(type),
      props: t.opt(t.object(propsFor(type))),
      ...(CONTAINERS.has(type)
        ? { children: t.opt(t.array(t.ref('componentVariant'), { minItems: 1, description: 'A container with no children is an empty box; author a child or drop the container.' })) }
        : {}),
    }),
  ),
  { matchOn: 'type', description: 'A component from the built-in vocabulary.' },
);

export const root = t.object({
  $schema: schemaUrl('scene', VERSION),
  version: formatVersion(VERSION),
  meta: t.object({
    ...DEFS.meta.shape,
    lang: t.opt(t.ref('lang')),
    /**
     * The document title, authored rather than derived from the first heading. A page whose `<title>`
     * is its h1 is a page whose browser tab says "Black Friday — Black Friday — 40% off | Black Friday".
     */
    title: t.opt(t.string({ minLength: 1, maxLength: 120 })),
  }),

  /** A reference to a settings document, not a copy of one — see docs/DOCUMENTS.md §4. */
  /**
   * A settings document *is* the token store, so a reference names the whole file or one group inside
   * it. `#/tokens` appeared in the original sketch and died with the flat `{ "color.accent": … }`
   * object it pointed into; leaving it legal would mean a document could carry a fragment that resolves
   * to nothing, which is a reference that looks like it works right up until it renders nothing.
   */
  tokens: t.opt(
    t.union([
      t.object({
        $ref: t.string({
          pattern: `\\.spark\\.settings\\.json(?:#/(?:${TOKEN_GROUPS.join('|')}))?$`,
          patternNote:
            `A settings document, or one token group inside it (${TOKEN_GROUPS.join(', ')}). There is no "#/tokens" to point at — the groups live at the root.`,
        }),
      }),
      t.ref('tokenStoreInline'),
    ], {
      describeAs: 'a reference to a settings document, or inline token groups',
      description:
        'Either `{"$ref": "./brand.spark.settings.json"}` or, for a self-contained document, the token groups written inline. A scene with no `tokens` at all can only use literal values, and every one of them is a lint.',
    }),
  ),

  components: t.array(t.ref('componentVariant'), { minItems: 1 }),
  layout: t.opt(t.map(t.ref('layoutBlock'), { keyPattern: DEFS.id.pattern })),
  states: t.opt(
    t.map(
      t.map(STATE_PROPS, {
        description: `The only state names the format knows: ${STATE_KEYS.join(', ')}. Movement is motion's business, not a hover's.`,
      }),
      { keyPattern: DEFS.id.pattern, description: 'Component id → state → property → value.' },
    ),
  ),

  assets: t.opt(
    t.array(
      t.object({
        id: t.ref('id'),
        kind: t.enum([...ASSET_KINDS]),
        path: t.string({ minLength: 1, maxLength: 300, description: 'Relative to this document. An absolute path is a build that only works on one machine.' }),
        sha256: t.string({ pattern: '^[a-f0-9]{64}$', description: 'Content address. A changed file with an unchanged hash is a build error, not a warning.' }),
        altDefault: t.opt(t.string({ maxLength: 300, description: 'Fallback alt text for an asset used without an explicit `alt`.' })),
      }),
    ),
  ),

  /**
   * Authored, not inferred. The verifier checks what was declared here instead of repairing it, so a
   * page that passes was built to be navigable rather than having happened to look that way.
   */
  a11y: t.opt(
    t.object({
      landmarks: t.opt(
        t.array(
          t.object({
            role: t.enum([...LANDMARK_ROLES]),
            contains: t.ref('id', { description: 'The component that carries this landmark. One id, so the mapping is auditable rather than implied.' }),
          }),
          { minItems: 1 },
        ),
      ),
      skipLink: t.opt(t.boolean({ description: 'Emitted as the first focusable element on the page, pointing at `main`.' })),
    }),
  ),
});

export const name = 'scene';
export const description =
  'Structure, layout, states and assets for one page. Compiles to semantic HTML and CSS, and nothing else.';

export const defs = {
  ...DEFS,
  componentVariant: COMPONENT_VARIANT,
  layoutBlock: LAYOUT,
  /** The inline-token escape for a self-contained document: the same groups a settings document has. */
  tokenStoreInline: t.object({
    color: t.opt(t.map(t.ref('colorBlock'), { keyPattern: '^[a-z][A-Za-z0-9]*$' })),
    space: t.opt(t.map(t.ref('length'), { keyPattern: TOKEN_KEY })),
    radius: t.opt(t.map(t.ref('length'), { keyPattern: TOKEN_KEY })),
    motion: t.opt(t.map(t.ref('duration'), { keyPattern: TOKEN_KEY })),
    type: t.opt(t.ref('valueBlock')),
    layout: t.opt(t.ref('valueBlock')),
  }),
};

/* ---------------------------------------------------------------- semantic checks */

/** Depth-first walk over the component tree, which is the only place ids live. */
export function walkComponents(doc, visit) {
  const walk = (nodes, path, depth) => {
    (nodes ?? []).forEach((node, index) => {
      const at = `${path}[${index}]`;
      visit(node, at, depth);
      if (Array.isArray(node?.children)) walk(node.children, `${at}.children`, depth + 1);
    });
  };
  walk(doc?.components, 'components', 0);
}

function collectIds(doc) {
  const ids = new Map();
  walkComponents(doc, (node, at) => {
    if (typeof node?.id === 'string') ids.set(node.id, at);
  });
  return ids;
}

export const checks = [
  {
    id: 'SCENE009',
    message: 'a declared state must change something',
    run(doc) {
      const found = [];
      for (const [id, states] of Object.entries(doc.states ?? {})) {
        if (id === '$comment') continue;
        for (const [name, props] of Object.entries(states ?? {})) {
          const keys = Object.keys(props ?? {}).filter((key) => key !== '$comment');
          if (!keys.length) {
            found.push({ path: `states.${id}.${name}`, note: 'an empty state block promises a change and delivers nothing. A reader who tabs to this element will see no reason why' });
          }
        }
      }
      return found;
    },
  },
  {
    id: 'SCENE008',
    message: 'a responsive override must name a breakpoint the settings document declares',
    run(doc, ctx) {
      const found = [];
      if (!ctx?.registry) {
        return { unresolved: [{ path: 'layout', code: 'breakpointsUnresolved', actual: 'no settings document was supplied' }] };
      }
      for (const [id, block] of Object.entries(doc.layout ?? {})) {
        for (const key of Object.keys(block?.responsive ?? {})) {
          if (key === '$comment') continue;
          if (!ctx.registry.has(`layout.breakpoint.${key}`)) {
            found.push({ path: `layout.${id}.responsive.${key}`, note: `"layout.breakpoint.${key}" is not declared in the settings document. Breakpoints are one decision for the whole brand, not one per page` });
          }
        }
      }
      return found;
    },
  },
  {
    id: 'SCENE001',
    message: 'component ids must be unique, because they are how layout, states and motion address a node',
    run(doc) {
      const seen = new Map();
      const found = [];
      walkComponents(doc, (node, at) => {
        const id = node?.id;
        if (typeof id !== 'string') return;
        if (seen.has(id)) {
          found.push({ path: `${at}.id`, note: `"${id}" is also declared at ${seen.get(id)}; a duplicate id makes one layout rule apply to two components` });
          return;
        }
        seen.set(id, at);
      });
      return found;
    },
  },
  {
    id: 'SCENE002',
    message: 'every `layout` and `states` key must name a component that exists',
    run(doc) {
      const found = [];
      const ids = collectIds(doc);
      for (const [field, label] of [['layout', 'layout'], ['states', 'states']]) {
        for (const key of Object.keys(doc[field] ?? {})) {
          if (key === '$comment') continue;
          if (!ids.has(key)) {
            found.push({ path: `${label}.${key}`, note: `no component is named "${key}". A rule for a component that is not there is a stale rule, and stale rules outlive the things they described` });
          }
        }
      }
      return found;
    },
  },
  {
    id: 'SCENE003',
    message: 'interactive components must declare their focus and hover states in the document',
    run(doc) {
      const found = [];
      const states = doc.states ?? {};
      walkComponents(doc, (node, at) => {
        if (!INTERACTIVE.includes(node?.type)) return;
        const owned = states[node?.id] ?? {};
        const missing = [];
        if (!('focus-visible' in owned)) missing.push('"focus-visible"');
        if (POINTER.includes(node.type) && !('hover' in owned)) missing.push('"hover"');
        if (missing.length) {
          found.push({
            path: `${at}.type`,
            note: `a "${node.type}" needs ${missing.join(' and ')} in \`states\`, keyed by its id — a keyboard user and a pointer user must both be able to see what is selected`,
          });
        }
      });
      return found;
    },
  },
  {
    id: 'SCENE004',
    message: 'an image src that names an asset must name one that is declared',
    run(doc) {
      const found = [];
      const declared = new Set((doc.assets ?? []).map((asset) => asset?.id).filter(Boolean));
      const used = new Set();
      walkComponents(doc, (node, at) => {
        if (node?.type !== 'image') return;
        const src = node?.props?.src;
        if (typeof src !== 'string' || /^https?:\/\//.test(src)) return;
        used.add(src);
        if (!declared.has(src)) found.push({ path: `${at}.props.src`, note: `"${src}" is not an id in \`assets\`, so the page ships a broken image and nobody can see it from the document` });
      });
      const notices = [];
      for (const asset of doc.assets ?? []) {
        if (asset?.id && !used.has(asset.id)) {
          notices.push({ path: `assets.${asset.id}`, code: 'unusedAsset', actual: asset.id });
        }
      }
      return { found, notices };
    },
  },
  {
    id: 'SCENE005',
    message: 'landmarks must name a component, and a page has at most one main',
    run(doc) {
      const found = [];
      const ids = collectIds(doc);
      const landmarks = doc.a11y?.landmarks ?? [];
      const mains = [];
      landmarks.forEach((entry, index) => {
        const path = `a11y.landmarks[${index}]`;
        if (entry?.contains && !ids.has(entry.contains)) {
          found.push({ path: `${path}.contains`, note: `"${entry.contains}" is not a component id in this document` });
        }
        if (entry?.role === 'main') mains.push(index);
      });
      if (mains.length > 1) {
        found.push({ path: 'a11y.landmarks', note: `${mains.length} landmarks claim \`main\`; a reader jumping to "main" needs one destination, not a choice` });
      }
      if (doc.a11y?.skipLink === true && mains.length === 0) {
        found.push({ path: 'a11y.skipLink', note: 'a skip link with no `main` landmark skips to nothing, which is worse than no skip link' });
      }
      return found;
    },
  },
  {
    id: 'SCENE006',
    message: 'a link must go somewhere',
    run(doc) {
      const found = [];
      walkComponents(doc, (node, at) => {
        if (node?.type === 'link' && node?.props?.href === '#') {
          found.push({ path: `${at}.props.href`, note: 'href "#" activates and does nothing. If it is a control, author a `button`' });
        }
      });
      return found;
    },
  },
  {
    id: 'SCENE007',
    message: 'a page declares exactly one top-level heading',
    run(doc) {
      let h1 = 0;
      walkComponents(doc, (node) => {
        if (node?.type === 'heading' && node?.props?.level === 1) h1 += 1;
      });
      if (h1 > 1) {
        return [{ path: 'components', note: `${h1} headings are level 1. One page, one top-level heading — everything else is a subsection of it` }];
      }
      return { found: [], notices: h1 === 0 ? [{ path: 'components', code: 'noH1', actual: 'none' }] : [] };
    },
  },
];
