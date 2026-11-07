/**
 * `lower` — the document set becomes the IR.
 *
 * Three documents, one page. The formats each check their own file; this module is the only place
 * all three are in scope at once, which is what makes four kinds of fact computable here and nowhere
 * else:
 *
 * 1. **Token values.** A scene writes `space.lg`; only the settings document knows it is `1.5rem`. The
 *    IR carries both the reference and the resolved value, so the emitter never re-resolves anything
 *    and a report can always say which token produced which declaration.
 * 2. **Cross-document identity.** A motion targets `hero-offers`, which exists only if the scene says
 *    so. This was `PHASE-PLAN §9`'s "not enforced yet" row, and `lower` is where it becomes enforced.
 * 3. **Inherited timing.** `defaults` cascade root → timeline → item; `docs/adr/0002` names this
 *    function as the sole resolver, and the format's own semantic checks import the same resolver so a
 *    document that validates is a document that emits.
 * 4. **Sequencing.** A timeline's `at: "<"` and `label:` positions become absolute start times, which
 *    is only possible because every duration is a constant in a document rather than a runtime value.
 *
 * A refusal here is a *document-set* problem, never a licence to invent a value: when something cannot
 * be resolved, `lower` says so with an id and stops. Absent facts stay absent.
 */

import { readFile as fsReadFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

import { validateDocument, EXTENSIONS, tokenRegistry } from './formats/index.js';
import { walkComponents } from './formats/scene.js';
import { resolveField, referencedIds } from './formats/motion.js';
import { TOKEN_GROUPS } from './formats/common.js';
import { createIR, stableStringify } from './ir.js';
import { NAME } from './config/brand.js';

/**
 * The cross-document rules. Like the format's own checks these carry ids, because a rule you cannot
 * name is a rule nobody can dispute.
 */
export const LOWER_RULES = Object.freeze({
  LOWER001: 'a referenced settings document must exist, parse and validate',
  LOWER002: 'a motion target must name a component in the scene, and `each: "children"` needs children',
  LOWER003: 'a token reference must resolve in the settings document that is actually in scope',
  LOWER004: 'a `state` trigger must name a machine and a state that the motion document declares',
  LOWER005: 'a CSS class name derived from a component id must be unique on the page',
});

/** The five rule ids, in order, for docs and tests that assert every rule is documented. */
export const LOWER_RULE_IDS = Object.freeze(Object.keys(LOWER_RULES));

/**
 * `space.accentHover` → `--space-accent-hover`.
 *
 * Kebab-case because it is a CSS custom property and readers see it in devtools; the collision check in
 * `lowerSet` is what makes the conversion safe rather than merely tidy, since `accentHover` and
 * `accent-hover` would otherwise write one name and one would silently win.
 */
export function cssVarName(path) {
  return `--${path.replaceAll('.', '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

/** A short, stable, content-derived class name: `s-` plus base36 of an FNV-1a hash of the id. */
export function className(id) {
  let hash = 0x811C9DC5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `s-${hash.toString(36).padStart(7, '0').slice(0, 7)}`;
}

/** Flatten a nested token block into dotted paths, the same walk `tokenRegistry` uses. */
function flatten(block, prefix, out) {
  for (const [key, value] of Object.entries(block ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out);
    else out.set(path, value);
  }
  return out;
}

/**
 * Every token in the store, with the value(s) a page will actually paint.
 *
 * Colours are indexed per theme and everything else is a single value, because `color` is the only
 * themed group in v1 — the format says so, and a table that invented theme variants for `space.lg`
 * would be a compiler disagreeing with its own schema.
 */
export function tokenTable(settings) {
  const table = new Map();
  const themes = settings?.meta?.themes ?? ['light'];
  for (const group of TOKEN_GROUPS) {
    const block = settings?.[group];
    if (!block || typeof block !== 'object') continue;
    if (group === 'color') {
      // The registry's colour paths are theme-free (`color.bg`), because one promise has to hold in
      // every theme. So the table indexes the same path and keeps a value per theme.
      for (const path of tokenRegistry(settings)) {
        const key = path.slice('color.'.length);
        const entry = table.get(path) ?? { path, group, themes: new Map() };
        for (const theme of themes) entry.themes.set(theme, flatten(block[theme] ?? {}, '', new Map()).get(key) ?? null);
        table.set(path, entry);
      }
      continue;
    }
    for (const [path, value] of flatten(block, group, new Map())) {
      table.set(path, { path, group, value });
    }
  }
  for (const entry of table.values()) {
    entry.cssVar = cssVarName(entry.path);
  }
  // `color.bg` and `color.bg-` would collide; the format cannot see that, the table can.
  const byVar = new Map();
  for (const entry of table.values()) {
    const clash = byVar.get(entry.cssVar);
    if (clash && clash !== entry.path) entry.cssVarClash = clash;
    byVar.set(entry.cssVar, entry.path);
  }
  return table;
}

/** The paintable value behind a reference-or-literal, for arithmetic (durations, distances). */
function toLiteral(table, value) {
  if (typeof value === 'string' && table?.has(value)) {
    const entry = table.get(value);
    if (entry?.themes) return entry.themes.values().next().value ?? '0ms';
    return entry?.value ?? value;
  }
  return value;
}

/** A value from a document: a token reference resolved, or a literal kept as it was written. */
export function resolveValue(table, value) {
  if (typeof value === 'string' && table?.has(value)) {
    const entry = table.get(value);
    return { token: value, cssVar: entry.cssVar, themes: entry.themes ?? null, value: entry.value ?? null };
  }
  return { literal: value };
}

/**
 * `"1.5rem"` → `24`, `"-12px"` → `-12`, `"0"` → `0`.
 *
 * Values arriving here may still be `{ token, … }` shapes from `resolveValue`, so the shape is unwrapped
 * first: a hazard assessment that read `var(--space-sm)` as zero travel would rate every tokenised
 * movement `subtle`, which is the opposite of what the tokens are for.
 */
function lengthInPx(input, signed = false) {
  const value = typeof input === 'object' && input !== null ? (input.value ?? input.literal ?? 0) : input;
  const match = /^(-?[\d.]+)(px|rem|em)?$/.exec(String(value ?? '').trim());
  if (!match) return 0;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return 0;
  const px = match[2] === 'rem' || match[2] === 'em' ? number * 16 : number;
  return signed ? Math.round(px) : Math.round(Math.abs(px));
}

function ms(input) {
  const value = typeof input === 'object' && input !== null ? (input.value ?? input.literal ?? 0) : input;
  const match = /^([\d.]+)(ms|s)?$/.exec(String(value ?? '').trim());
  if (!match) return 0;
  return match[2] === 's' ? Number(match[1]) * 1000 : Number(match[1]);
}

/**
 * Severity, computed rather than declared.
 *
 * `impactFloor` lets an author say "treat this as at least intense"; nothing lets an author lower a
 * severity, because a guarantee the graded party can dial down is not a guarantee. These thresholds are
 * the compiler's opinion, and they are here, in the open, so an argument about them has something to
 * point at.
 */
export function assessMotionImpact(motion) {
  const from = motion.from ?? {};
  const to = motion.to ?? {};
  // Distance travelled, not the value of either end: `translateY: 60px → 0` and `0 → 60px` are the
  // same hazard, and reading only `to` would have called the first one subtle.
  const travel = Math.max(
    Math.abs(lengthInPx(to.translateX, true) - lengthInPx(from.translateX, true)),
    Math.abs(lengthInPx(to.translateY, true) - lengthInPx(from.translateY, true)),
  );
  const scaleDelta = Math.abs(Number(to.scale ?? 1) - Number(from.scale ?? 1));
  const rotate = Math.abs(Number.parseFloat(to.rotate ?? from.rotate ?? 0) || 0);
  const loops = motion.repeat === 'infinite' || Number(motion.repeat) > 1;
  const duration = ms(motion.durationValue ?? motion.duration);

  let level = 'subtle';
  // A motion that never stops is at least `noticeable` on its own, whatever it moves: "the element is
  // still changing" is the thing a person has to work around, not the size of each change.
  if (loops) level = 'noticeable';
  if (travel > 12 || scaleDelta > 0.02 || rotate > 2) level = 'noticeable';
  if (travel > 40 || scaleDelta > 0.25 || rotate > 15 || (loops && duration > 0 && duration < 250)) level = 'intense';
  if (loops && travel > 12) level = 'intense';
  if (Object.keys(from).length + Object.keys(to).length === 0) level = 'subtle';

  const floor = motion.impactFloor;
  const rank = { subtle: 0, noticeable: 1, intense: 2 };
  if (floor && rank[floor] > rank[level]) level = floor;
  return level;
}

/** A timeline position becomes an absolute offset. `<` is with, `>` is after, `+=` is a gap. */
function positionOf(at, previous, labels) {
  const previousStart = previous?.start ?? 0;
  const previousEnd = previousStart + (previous?.duration ?? 0);
  if (!at || at === '>') return previousEnd;
  if (at === '<') return previousStart;
  const relative = /^\+=([\d.]+)(ms|s)?$/.exec(at);
  if (relative) return previousEnd + ms(relative[0].slice(2));
  const label = /^label:(.+)$/.exec(at);
  if (label) return ms(labels?.[label[1]]);
  return previousEnd;
}

function readJson(text, path) {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error: `${basename(path)} is not valid JSON: ${error.message}` };
  }
}

/**
 * Find the rest of the set from one file. `<name>.spark.scene.json` and `<name>.spark.motion.json`
 * beside it: the convention is the reason a folder of documents describes itself with no manifest, and
 * an explicit `--settings` always wins over whatever the scene points at.
 */
export async function loadDocumentSet(entry, { readFile = fsReadFile, settingsPath = null } = {}) {
  const entryPath = resolve(entry);
  const stem = basename(entryPath).replace(/\.spark\.(scene|motion|settings)\.json$/, '');
  const dir = dirname(entryPath);
  const kindOf = /\.(scene|motion|settings)\.json$/.exec(basename(entryPath))?.[1];
  if (!kindOf) {
    throw new Error(`not an ${NAME} document: ${basename(entryPath)} — expected <name>${EXTENSIONS.scene}`);
  }

  const docs = {};
  const paths = {};
  const problems = [];
  const wanted = { scene: stem ? `${stem}${EXTENSIONS.scene}` : null, motion: stem ? `${stem}${EXTENSIONS.motion}` : null };

  const read = async (kind, file) => {
    const path = resolve(dir, file);
    let text;
    try {
      text = await readFile(path, 'utf8');
    } catch {
      return null;
    }
    const parsed = readJson(text, path);
    if (parsed.error) {
      problems.push({ code: 'LOWER001', path: kind, note: parsed.error });
      return null;
    }
    paths[kind] = path;
    docs[kind] = parsed.value;
    return parsed.value;
  };

  await read(kindOf, basename(entryPath));
  if (kindOf === 'scene') await read('motion', wanted.motion);
  if (kindOf === 'motion') await read('scene', wanted.scene);

  // The settings document: an explicit flag first, then whatever the scene references, then a sibling.
  let settingsRef = null;
  if (docs.scene?.tokens?.$ref) {
    const [file, fragment] = docs.scene.tokens.$ref.split('#/');
    settingsRef = { file: resolve(dir, file), group: fragment ?? null, declared: docs.scene.tokens.$ref };
  }
  if (settingsPath) settingsRef = { file: resolve(settingsPath), group: null, declared: settingsPath };
  if (settingsRef && !docs.settings) {
    let text;
    try {
      text = await readFile(settingsRef.file, 'utf8');
    } catch {
      problems.push({
        code: 'LOWER001',
        path: 'tokens.$ref',
        note: `"${settingsRef.declared}" names a settings document that is not there: ${settingsRef.file}`,
      });
    }
    if (text !== undefined) {
      const parsed = readJson(text, settingsRef.file);
      if (parsed.error) problems.push({ code: 'LOWER001', path: 'tokens.$ref', note: parsed.error });
      else {
        docs.settings = parsed.value;
        paths.settings = settingsRef.file;
        if (settingsRef.group) {
          // A `#/space` reference narrows what a page may reach: the same file, one group of it, so a
          // component cannot borrow a colour the brand did not offer to this page.
          docs.settingsGroup = settingsRef.group;
        }
      }
    }
  }

  return { docs, paths, problems, entryPath, kindOf };
}

/**
 * Lower a document set to the IR. `docs` comes from `loadDocumentSet`; validation runs here rather
 * than at read time so the registry built from the settings document is in scope for token checks.
 */
export function lowerSet({ docs, paths = {}, problems = [] }) {
  const { scene, motion, settings } = docs;
  const errors = [...problems];
  const notices = [];

  const registry = settings ? tokenRegistry(settings) : null;
  const scoped = new Map();
  if (settings && docs.settingsGroup) {
    for (const path of registry) if (path.startsWith(`${docs.settingsGroup}.`)) scoped.set(path, true);
  }
  const table = settings ? tokenTable(settings) : new Map();
  const reachable = docs.settingsGroup ? new Set(scoped.keys()) : registry;

  const validated = {};
  for (const [kind, doc] of Object.entries({ scene, motion, settings })) {
    if (!doc) continue;
    // A settings document resolves its own control paths — they point at tokens in the same file, which
    // is the one case where "no registry" would be a lie about a document that needs none.
    const registryFor = kind === 'settings' ? tokenRegistry(settings) : reachable;
    const result = validateDocument(kind, doc, { registry: registryFor });
    validated[kind] = result;
    for (const error of result.errors) errors.push({ ...error, kind });
    for (const notice of result.notices) notices.push({ ...notice, kind });
    if (!result.complete) {
      notices.push({
        kind,
        code: 'unresolved',
        path: kind,
        note: result.unresolved.length
          ? `${result.unresolved.length} token reference(s) could not be resolved without a settings document`
          : 'a check could not run',
      });
    }
  }

  for (const [path, entry] of table) {
    if (entry.cssVarClash) {
      errors.push({
        code: 'LOWER003',
        path: `settings.${path}`,
        note: `"${entry.path}" and "${entry.cssVarClash}" both become ${entry.cssVar}; a name two tokens share is a token that silently loses`,
      });
    }
  }

  // Component index: identity, parentage and the child count a stagger needs.
  const byId = new Map();
  if (scene) {
    walkComponents(scene, (node, at) => {
      if (!node?.id) return;
      byId.set(node.id, { node, at, children: Array.isArray(node.children) ? node.children : [] });
    });
  }
  const classNames = new Map();
  for (const id of byId.keys()) {
    const name = className(id);
    const clash = classNames.get(name);
    if (clash) {
      errors.push({ code: 'LOWER005', path: `scene.components.${id}`, note: `"${id}" and "${clash}" would share the class ${name}` });
    }
    classNames.set(name, id);
  }

  const layout = {};
  for (const [id, block] of Object.entries(scene?.layout ?? {})) {
    const resolved = {};
    for (const [property, value] of Object.entries(block ?? {})) {
      if (property === 'responsive') {
        resolved[property] = Object.fromEntries(
          Object.entries(value ?? {}).map(([breakpoint, overrides]) => [
            breakpoint,
            Object.fromEntries(Object.entries(overrides ?? {}).map(([k, v]) => [k, resolveValue(table, v)])),
          ]),
        );
        continue;
      }
      resolved[property] = resolveValue(table, value);
    }
    layout[id] = resolved;
  }

  const states = {};
  for (const [id, blocks] of Object.entries(scene?.states ?? {})) {
    states[id] = {};
    for (const [state, declarations] of Object.entries(blocks ?? {})) {
      states[id][state] = Object.fromEntries(
        Object.entries(declarations ?? {}).map(([property, value]) => [property, resolveValue(table, value)]),
      );
    }
  }

  const assetsById = new Map((scene?.assets ?? []).map((asset) => [asset.id, asset]));

  const motionItems = [];
  if (motion) {
    const timelineByIndex = new Map();
    const schedule = (list, timeline) => {
      let previous = null;
      list.forEach((entry, index) => {
        const item = entry?.ref ? (motion.animations ?? []).find((a) => a?.id === entry.ref) : entry;
        if (!item) return;
        const meta = { timeline };
        // The trigger may belong to the timeline: that is the whole reason MOTION001 lets a referenced
        // animation omit one, and emission needs the answer, not the question.
      const trigger = resolveField(motion, item, meta, 'trigger') ?? null;
        // A duration may be a token (`motion.fast`) or a literal, and `ms()` only means anything once
        // the token is looked up. Resolving it here rather than at emit is what lets a timeline compute
        // absolute start times at all.
        const rawDuration = resolveField(motion, item, meta, 'duration') ?? '0ms';
        const duration = rawDuration;
        const durationMs = ms(toLiteral(table, rawDuration));
        const withValue = {
          ...item,
          durationValue: duration,
          intent: resolveField(motion, item, meta, 'intent'),
          easing: resolveField(motion, item, meta, 'easing'),
          reducedMotion: resolveField(motion, item, meta, 'reducedMotion'),
          repeat: resolveField(motion, item, meta, 'repeat'),
          yoyo: resolveField(motion, item, meta, 'yoyo'),
          trigger,
        };
        // Sequencing is a timeline property. A standalone animation plays when it is triggered, so it
        // starts at 0 — inheriting a delay from an unrelated animation earlier in the file is exactly the
        // kind of accidental fact a compiler is not allowed to invent.
        const start = timeline ? positionOf(entry?.at ?? item.at, previous, timeline.labels) : 0;
        previous = { start, duration: durationMs };
        motionItems.push({ item: withValue, timeline, index, start, path: `motion.${timeline ? 'timelines' : 'animations'}[${index}]` });
      });
      timelineByIndex.set(list, previous);
    };
    (motion.timelines ?? []).forEach((timeline) => schedule(timeline.items ?? [], timeline));
    // An animation with no trigger of its own plays *because* a timeline plays it, and that pairing
    // already happened above. Listing it again would emit the same page twice.
    const standalone = (motion.animations ?? []).filter((a) => !a?.id || !referencedIds(motion).has(a.id));
    schedule(standalone, null);

    for (const entry of motionItems) {
      const { item, path } = entry;
      const trigger = item.trigger ?? null;
      const target = item.target;
      if (target?.id) {
        const found = byId.get(target.id);
        if (!found) {
          errors.push({
            code: 'LOWER002',
            path: `${path}.target.id`,
            note: `"${target.id}" is not a component in ${scene ? basename(paths.scene ?? 'the scene document') : 'a scene document — this set has none'}`,
          });
        } else if (target.each === 'children' && found.children.length === 0) {
          errors.push({
            code: 'LOWER002',
            path: `${path}.target.each`,
            note: `"${target.id}" has no children, so "each: children" animates nothing and the page shows its start state`,
        });
        } else {
          entry.targetId = target.id;
          entry.each = target.each ?? null;
          entry.childCount = target.each === 'children' ? found.children.length : 1;
        }
      }
      if (trigger?.on === 'state') {
        const machine = motion.machines?.[trigger.machine];
        if (!machine) {
          errors.push({ code: 'LOWER004', path: `${path}.trigger.machine`, note: `no machine named "${trigger.machine}"` });
        } else if (trigger.state && !machine.states?.[trigger.state]) {
          errors.push({
            code: 'LOWER004',
            path: `${path}.trigger.state`,
            note: `machine "${trigger.machine}" has no state "${trigger.state}"`,
          });
        }
      }
      entry.impact = assessMotionImpact(item);
      for (const [key, value] of Object.entries({ ...(item.from ?? {}), ...(item.to ?? {}) })) {
        entry[`resolved_${key}`] = resolveValue(table, value);
      }
      entry.from = Object.fromEntries(Object.entries(item.from ?? {}).map(([k, v]) => [k, resolveValue(table, v)]));
      entry.to = Object.fromEntries(Object.entries(item.to ?? {}).map(([k, v]) => [k, resolveValue(table, v)]));
      entry.duration = resolveValue(table, item.durationValue);
      entry.duration.msValue = ms(toLiteral(table, item.durationValue));
      entry.stagger = item.stagger
        ? { ...item.stagger, eachMs: ms(resolveValue(table, item.stagger.each).token ? table.get(item.stagger.each)?.value : item.stagger.each) }
        : null;
    }
  }

  // A token reference with no settings document in scope is unresolved, never assumed valid.
  if (!settings) {
    const seen = new Set();
    const note = (path, value) => {
      if (typeof value !== 'string' || seen.has(`${path}:${value}`)) return;
      if (!/\./.test(value) || table.has(value)) return;
      seen.add(`${path}:${value}`);
      errors.push({
        code: 'LOWER003',
        path,
        note: `"${value}" names a token, and this set has no settings document to resolve it against`,
      });
    };
    for (const [id, block] of Object.entries(scene?.layout ?? {})) {
      for (const [property, value] of Object.entries(block ?? {})) note(`scene.layout.${id}.${property}`, value);
    }
    for (const [id, blocks] of Object.entries(scene?.states ?? {})) {
      for (const [state, declarations] of Object.entries(blocks ?? {})) {
        for (const [property, value] of Object.entries(declarations ?? {})) note(`scene.states.${id}.${state}.${property}`, value);
      }
    }
  }

  const ir = createIR({
    source: paths.scene ? 'file' : 'documents',
    uri: paths.scene ?? null,
    kind: 'document',
  });
  ir.provenance.collector = 'spark-lower';
  ir.provenance.documents = Object.fromEntries(Object.entries(paths).map(([kind, path]) => [kind, path]));
  // The versions the emitter prints in its header. They come from the documents themselves, not from
  // this build's constants, so an artifact says what it *was*, not what read it.
  ir.provenance.versions = Object.fromEntries(
    Object.entries(docs).filter(([, doc]) => doc).map(([kind, doc]) => [kind, doc.version ?? null]),
  );

  if (settings) {
    ir.tokens = {
      name: settings.meta?.name ?? 'brand',
      version: settings.meta?.version ?? null,
      themes: settings.meta?.themes ?? ['light'],
      groups: Object.fromEntries(TOKEN_GROUPS.map((group) => [group, settings[group] ?? null])),
      cssVars: Object.fromEntries([...table.values()].map((entry) => [entry.path, entry.cssVar])),
      contrast: settings.contrast ?? null,
    };
  }

  if (scene) {
    const tree = (nodes, parentPath) =>
      (nodes ?? []).map((node, index) => {
        const at = `${parentPath}[${index}]`;
        return {
          // An id-less component still renders; it simply has no addressable name, so nothing can
          // carry layout, states or a motion. That is why `id` is optional rather than required: a leaf
          // nobody styles does not need one.
          id: node.id ?? null,
          type: node.type,
          tag: TAG_BY_TYPE[node.type] ?? 'div',
          className: node.id ? className(node.id) : null,
          props: node.props ?? {},
          children: tree(node.children, `${at}.children`),
        };
      });
    ir.document = {
      name: scene.meta?.name ?? null,
      lang: scene.meta?.lang ?? 'en',
      title: scene.meta?.title ?? null,
      tree: tree(scene.components, 'scene.components'),
      layout,
      states,
      a11y: scene.a11y ?? null,
      assets: (scene.assets ?? []).map((asset) => ({ ...asset, resolvedPath: paths.scene ? resolve(dirname(paths.scene), asset.path) : asset.path })),
      assetIds: [...assetsById.keys()],
      componentIds: [...byId.keys()],
    };
  }

  if (motion) {
    ir.motion = {
      name: motion.meta?.name ?? null,
      items: motionItems.map(({ item, targetId, each, childCount, impact, start, from, to, duration, stagger, path }) => ({
        id: item.id ?? null,
        path,
        intent: item.intent ?? null,
        impact,
        target: targetId ? { id: targetId, className: className(targetId), each, childCount: childCount ?? 1 } : null,
        trigger: item.trigger ?? null,
        from,
        to,
        duration: duration ?? { literal: '0ms', msValue: 0 },
        easing: item.easing ?? null,
        repeat: item.repeat ?? 0,
        yoyo: item.yoyo === true,
        // Emission refuses this one, so it has to survive the trip through the IR or the refusal
        // would be a claim about a field the emitter never saw.
        repeatDelay: item.repeatDelay ?? null,
        stagger,
        startMs: start,
        reducedMotion: item.reducedMotion ?? null,
      })),
      machines: motion.machines ?? null,
    };
  }

  const referenced = motion ? referencedIds(motion) : new Set();
  for (const animation of motion?.animations ?? []) {
    if (animation.id && !referenced.has(animation.id) && !animation.target) {
      notices.push({
        kind: 'motion',
        code: 'unusedAnimation',
        path: `motion.animations.${animation.id}`,
        note: 'declared with no trigger and referenced by no timeline, so nothing ever plays it',
      });
    }
  }

  const complete = Object.values(validated).every((result) => result.complete);
  return { ir, errors, notices, complete, table, byId, validated, canonical: stableStringify(ir) };
}

/**
 * The one place a component type meets the element it becomes. The emitter refuses anything not in
 * here, which is what keeps "we added a type" a single edit rather than a hunt.
 */
export const TAG_BY_TYPE = Object.freeze({
  stack: 'div',
  grid: 'div',
  region: 'section',
  heading: 'h2',
  text: 'p',
  link: 'a',
  button: 'button',
  image: 'img',
  input: 'input',
  list: 'ul',
  listbox: 'select',
});
