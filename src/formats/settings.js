/**
 * The settings document — `.spark.settings.json`.
 *
 * Its shape is `src/config/tokens.json`, deliberately: the brand store the report already uses and
 * the file a designer authors are one format, not two. Freezing a *third* shape here — the flat
 * `"color.accent": { "value": … }` sketch that `docs/DOCUMENTS.md §3` originally showed — would have
 * given the project two token stores, which is the exact failure ADR 0001 was written to prevent.
 * The reconciliation is recorded in `docs/adr/0002`.
 */

import { t } from './grammar.js';
import { DEFS, TOKEN_GROUPS, TOKEN_KEY as KEY, VERSION, schemaUrl, formatVersion } from './common.js';

const CONTRAST_PAIR = t.object({
  fg: t.ref('colorPath', { description: 'The foreground colour, theme-relative.' }),
  bg: t.ref('colorPath', { description: 'The background it sits on.' }),
  min: t.opt(
    t.number({
      minimum: 1,
      maximum: 21,
      description: 'The promise for this pair. Omit to inherit the bucket minimum from `contrast.minimum`.',
    }),
  ),
});

export const root = t.object({
  $schema: schemaUrl('settings', VERSION),
  version: formatVersion(VERSION),

  meta: t.object({
    ...DEFS.meta.shape,
    themes: t.array(t.ref('themeName'), {
      minItems: 1,
      description: 'Every theme the brand ships. Each one must define the same colour keys — a theme that "inherits" a colour is a report that renders one hex on another hex.',
    }),
  }),

  /** The one themed group. Values are hex colours; nesting is naming. */
  color: t.map(t.ref('colorBlock'), {
    keyPattern: '^[a-z][A-Za-z0-9]*$',
    description: 'Theme name → colour block. Checked against `meta.themes` by SETTINGS001.',
  }),

  space: t.opt(
    t.map(t.union([t.ref('length'), t.ref('valueBlock')], {
      description: 'A length, or a nested block of lengths.',
    }), { keyPattern: KEY }),
  ),
  radius: t.opt(t.map(t.union([t.ref('length'), t.ref('valueBlock')]), { keyPattern: KEY })),
  /** Durations only. Every use is wrapped in a reduced-motion guard by the emitter, never by the author. */
  motion: t.opt(t.map(t.union([t.ref('duration'), t.ref('valueBlock')]), { keyPattern: KEY })),
  type: t.opt(t.ref('valueBlock')),
  layout: t.opt(t.ref('valueBlock')),

  contrast: t.object({
    minimum: t.object({
      text: t.number({ minimum: 1, maximum: 21, description: 'The default promise for a `pairs` entry: WCAG AA body text is 4.5.' }),
      ui: t.number({ minimum: 1, maximum: 21, description: 'The default promise for a boundary that carries meaning: WCAG non-text contrast is 3.' }),
    }),
    pairs: t.array(CONTRAST_PAIR, { minItems: 1, description: 'Text-on-background commitments. A colour that appears nowhere here ships unchecked, so the list is required and not empty.' }),
    impactPairs: t.opt(t.array(CONTRAST_PAIR, { description: 'Non-text boundaries: rules, borders, severity bars.' })),
  }),

  /**
   * The panel is a projection of this array. There is no hand-written settings UI anywhere in the
   * product, which is what keeps "the tool that authored the value" and "the value that shipped" the
   * same fact.
   */
  controls: t.opt(
    t.array(
      t.object({
        group: t.string({ minLength: 1, maxLength: 60, description: 'Section heading in the panel.' }),
        path: t.ref('tokenRef', { description: 'The token this control writes, e.g. `color.link` or `space.lg`.' }),
        label: t.string({ minLength: 1, maxLength: 60 }),
        type: t.enum(['color', 'slider', 'select', 'toggle', 'text'], {
          description: 'The editor. `slider` needs `min` and `max`; the control type must suit the group it writes (SETTINGS003).',
        }),
        writable: t.opt(t.boolean({ description: 'Defaults to false. A control is read-only until a brand says otherwise.' })),
        min: t.opt(t.number()),
        max: t.opt(t.number()),
        step: t.opt(t.number()),
        options: t.opt(t.array(t.string({ minLength: 1, maxLength: 40 }))),
      }),
    ),
  ),
});

export const name = 'settings';
export const description =
  'Configuration as data: the token store, the contrast commitments, and the description of the panel that edits them.';

/** The settings format adds nothing to the shared vocabulary — it *is* the vocabulary. */
export const defs = { ...DEFS };

/* ---------------------------------------------------------------- semantic checks */

function pathsIn(block, prefix, out, depth = 0) {
  if (depth > 6 || !block || typeof block !== 'object') return out;
  for (const [key, value] of Object.entries(block)) {
    if (key === '$comment') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') pathsIn(value, path, out, depth + 1);
    else out.add(path);
  }
  return out;
}

/** Every dotted path a scene may reference, theme-collapsed for colours. */
export function tokenRegistry(doc) {
  const registry = new Set();
  for (const group of TOKEN_GROUPS) {
    const block = doc?.[group];
    if (!block || typeof block !== 'object') continue;
    if (group === 'color') {
      for (const theme of doc.meta?.themes ?? []) {
        for (const path of pathsIn(block[theme], '', new Set())) registry.add(`color.${path}`);
      }
    } else {
      for (const path of pathsIn(block, group, new Set())) registry.add(path);
    }
  }
  return registry;
}

const CONTROL_GROUPS = {
  color: ['color'],
  slider: ['space', 'radius', 'motion'],
  select: ['type', 'layout', 'color', 'space', 'radius'],
  toggle: ['layout', 'type'],
  text: ['type', 'layout'],
};

export const checks = [
  {
    id: 'SETTINGS001',
    message:
      'every theme in `meta.themes` must appear in `color` with exactly the same keys, and nothing else may',
    run(doc) {
      const found = [];
      const themes = doc.meta?.themes ?? [];
      const color = doc.color ?? {};
      const keySets = new Map();
      for (const theme of themes) {
        const block = color[theme];
        if (!block) {
          found.push({ path: `color.${theme}`, note: `theme "${theme}" is declared in meta.themes but has no colour block` });
          continue;
        }
        keySets.set(theme, pathsIn(block, '', new Set()));
      }
      for (const key of Object.keys(color)) {
        if (!themes.includes(key)) {
          found.push({ path: `color.${key}`, note: `"${key}" is not a theme in meta.themes; a colour block nobody selects is dead weight that still gets maintained` });
        }
      }
      const [first, ...rest] = [...keySets.entries()];
      if (first) {
        for (const [theme, keys] of rest) {
          for (const missing of first[1]) {
            if (!keys.has(missing)) found.push({ path: `color.${theme}.${missing}`, note: `"${missing}" exists in theme "${first[0]}" but not in "${theme}"` });
          }
          for (const extra of keys) {
            if (!first[1].has(extra)) found.push({ path: `color.${theme}.${extra}`, note: `"${extra}" exists in theme "${theme}" but not in "${first[0]}"` });
          }
        }
      }
      return found;
    },
  },
  {
    id: 'SETTINGS002',
    message: 'contrast pairs must reference colours that exist and promise at least the bucket minimum',
    run(doc) {
      const found = [];
      const themes = doc.meta?.themes ?? [];
      const registry = tokenRegistry(doc);
      const buckets = [
        ['pairs', doc.contrast?.minimum?.text ?? 4.5],
        ['impactPairs', 1],
      ];
      for (const [bucket, floor] of buckets) {
        (doc.contrast?.[bucket] ?? []).forEach((pair, index) => {
          const path = `contrast.${bucket}[${index}]`;
          for (const side of ['fg', 'bg']) {
            if (typeof pair[side] !== 'string') continue;
            const asToken = `color.${pair[side]}`;
            if (!registry.has(asToken)) {
              found.push({ path: `${path}.${side}`, note: `"${pair[side]}" is not a colour in any theme of ${themes.map((t2) => `"${t2}"`).join(', ') || 'the declared themes'}` });
            }
          }
          if (pair.min != null && pair.min < floor) {
            found.push({
              path: `${path}.min`,
              note: `${pair.min}:1 is below the ${bucket === 'pairs' ? `text minimum (${floor}:1)` : 'floor of 1:1'}; a pair that promises less than its bucket is a promise about a different thing`,
            });
          }
        });
      }
      return found;
    },
  },
  {
    id: 'SETTINGS003',
    message: 'every control must write a token that exists, with an editor that suits its group',
    run(doc) {
      const found = [];
      const registry = tokenRegistry(doc);
      (doc.controls ?? []).forEach((control, index) => {
        const path = `controls[${index}]`;
        if (typeof control.path === 'string' && !registry.has(control.path)) {
          found.push({ path: `${path}.path`, note: `"${control.path}" is not a token this document declares` });
        }
        const group = typeof control.path === 'string' ? control.path.split('.')[0] : null;
        const allowed = CONTROL_GROUPS[control.type];
        if (allowed && group && !allowed.includes(group)) {
          found.push({ path: `${path}.type`, note: `a "${control.type}" control cannot edit "${group}" tokens (${allowed.map((a) => `"${a}"`).join(' | ')} are the groups it suits)` });
        }
        if (control.type === 'slider' && (control.min == null || control.max == null)) {
          found.push({ path, note: 'a slider without min and max is a slider with an unbounded range, which is a way to break a design system with one drag' });
        }
        if (control.type === 'select' && !control.options?.length) {
          found.push({ path, note: 'a select with no options renders an empty menu' });
        }
      });
      return found;
    },
  },
  {
    id: 'SETTINGS004',
    message: 'no token value may contain url(), because assets are referenced by id, not embedded',
    run(doc) {
      const found = [];
      const walk = (block, prefix) => {
        for (const [key, value] of Object.entries(block ?? {})) {
          const path = prefix ? `${prefix}.${key}` : key;
          if (value && typeof value === 'object') walk(value, path);
          else if (typeof value === 'string' && /url\s*\(/.test(value)) {
            found.push({ path, note: 'declare it in `assets` instead, so the verifier can check the file it points at' });
          }
        }
      };
      for (const group of TOKEN_GROUPS) walk(doc[group], group);
      return found;
    },
  },
];
