/**
 * `emit` — the IR becomes HTML and CSS.
 *
 * The rule this file exists to obey: **nothing reaches the page that was not in a document.** So the
 * emitter is deliberately boring. It reads values `src/lower.js` already resolved (a token reference
 * knows its own custom property name), maps each component to exactly one element, and writes
 * declarations sorted by property name. No cascade cleverness, no runtime, no invented fallback: when
 * a document is silent the CSS is silent, which is the only way "byte-identical output" and "we did not
 * guess" turn out to be the same statement.
 *
 * Three refusal ids, each with the thing to do instead:
 *
 * - `EMIT001` — a trigger that needs something to run at play time (`state`, `click`, `scroll`), or a
 *   machine with effects. Emit as `load`, `visible`, `hover` or `focus`, or leave the change as a scene
 *   state; the generated runtime arrives in Phase 4 and this refusal leaves with it.
 * - `EMIT002` — `repeatDelay`. CSS has no gap-between-plays property, and padding the duration to fake
 *   one would emit a different motion than the one that was authored. Fold the pause into `duration`.
 * - `EMIT003` — a fact the emitter cannot place: an unknown layout property, an unknown component type, a
 *   skip link with no `main`. Reaching the type branch means the format gained a type the emitter does
 *   not know, which is a build error, not a page.
 *
 * `emit` returns `files` even when `refusals` is non-empty and leaves the decision to the caller —
 * because `spark emit` must then write *nothing*. A page that quietly drops an animation is precisely
 * the artifact this compiler promises not to produce.
 */

import { cssTimingFunction } from './ease-bake.js';

/** Layout key → CSS property. `cols`/`rows` need the child count, so they take the context. */
const LAYOUT = Object.freeze({
  display: () => 'display',
  gap: () => 'gap',
  pad: () => 'padding',
  margin: () => 'margin',
  align: () => 'align-items',
  justify: (ctx) => (ctx.display === 'grid' ? 'justify-items' : 'justify-content'),
  span: () => 'grid-column',
  maxWidth: () => 'max-width',
  minWidth: () => 'min-width',
  cols: (ctx) => (ctx.display === 'grid' ? 'grid-template-columns' : 'flex-wrap'),
  rows: (ctx) => (ctx.display === 'grid' ? 'grid-template-rows' : null),
  responsive: () => null,
});

/** The seven state properties, named by what they paint. */
const STATE = Object.freeze({
  background: 'background-color',
  color: 'color',
  border: 'border',
  outline: 'outline',
  shadow: 'box-shadow',
  opacity: 'opacity',
  radius: 'border-radius',
});

const STATE_PSEUDO = Object.freeze({
  hover: ':hover',
  focus: ':focus',
  'focus-visible': ':focus-visible',
  active: ':active',
  disabled: ':disabled',
  checked: ':checked',
  invalid: ':invalid',
});

/**
 * Motion property → CSS property. `translate`, `scale` and `rotate` are the individual transform
 * properties, which is why there is no transform string to assemble in the right order — a class of bug
 * that simply does not exist here.
 */
const MOTION = Object.freeze({
  opacity: 'opacity',
  translateX: 'translate',
  translateY: 'translate',
  scale: 'scale',
  rotate: 'rotate',
  color: 'color',
  background: 'background-color',
});

const LANDMARK_TAG = Object.freeze({
  banner: 'header',
  navigation: 'nav',
  main: 'main',
  complementary: 'aside',
  contentinfo: 'footer',
  search: 'search',
  form: 'form',
  region: 'section',
});

export const EMIT_RULES = Object.freeze({
  EMIT001: 'a motion that needs a runtime to play is not emitted',
  EMIT002: 'repeatDelay has no CSS equivalent',
  EMIT003: 'every layout property, component type and a11y promise must have exactly one emission mapping',
});

/* ------------------------------------------------------------------ values */

/** A resolved value → CSS text: a token becomes its custom property, a literal is written as authored. */
function css(value) {
  if (!value || typeof value !== 'object') return value === undefined ? null : String(value);
  if (value.token) return `var(${value.cssVar})`;
  if (value.literal === undefined || value.literal === null) return null;
  return String(value.literal);
}

function raw(value) {
  const text = css(value);
  return text === null ? null : text;
}

function declarations(entries) {
  const kept = Object.entries(entries).filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!kept.length) return null;
  return Object.fromEntries(kept.sort(([a], [b]) => (a < b ? -1 : 1)));
}

function rule(selector, entries) {
  const decls = declarations(entries);
  if (!decls) return '';
  return `${selector} {\n${Object.entries(decls).map(([property, value]) => `  ${property}: ${value};`).join('\n')}\n}\n`;
}

function inline(decls) {
  const built = declarations(decls);
  // An empty side is not a gap in the emitter: `from {}` means "start wherever the element already is",
  // which is exactly the semantics of a `to`-only animation.
  if (!built) return '';
  return Object.entries(built).map(([property, value]) => `${property}: ${value}`).join('; ');
}

/** One `@keyframes` block, so a motion and its reduced-motion variant are built the same way. */
function keyframesBlock(name, from, to) {
  return `@keyframes ${name} {\n  from { ${inline(from)} }\n  to { ${inline(to)} }\n}\n`;
}

function text(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attr(value) {
  return text(value).replace(/"/g, '&quot;');
}

function gridTrack(value, childCount) {
  const count = Number(value);
  if (Number.isInteger(count) && count > 0) return `repeat(${count}, minmax(0, 1fr))`;
  if (value === 'auto-fit') return 'repeat(auto-fit, minmax(min(16rem, 100%), 1fr))';
  if (value === 'auto-fill') return 'repeat(auto-fill, minmax(min(16rem, 100%), 1fr))';
  return String(value ?? `repeat(${childCount || 1}, minmax(0, 1fr))`);
}

/* ------------------------------------------------------------------- tokens */

function walkBlock(block, prefix, out) {
  for (const [key, value] of Object.entries(block ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) walkBlock(value, path, out);
    else out.set(path, value);
  }
  return out;
}

/** `--space-lg` from `space.lg`; the same conversion `src/lower.js` used, applied to the same paths. */
function cssVar(path) {
  return `--${path.replaceAll('.', '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`;
}

/**
 * The token block. Every hex in the emitted CSS appears here and nowhere else, which is a test, not a
 * hope: a colour declared in a rule is a colour that escaped the contrast promise.
 */
function tokensCss(tokens) {
  if (!tokens) return '/* no settings document in scope: nothing to emit as custom properties */\n';
  const groups = tokens.groups ?? {};
  const nonColour = walkBlock(
    Object.fromEntries(Object.entries(groups).filter(([group]) => group !== 'color' && group !== 'layout')),
    '',
    new Map(),
  );
  for (const [path, value] of walkBlock(groups.layout ?? {}, 'layout', new Map())) nonColour.set(path, value);
  const themes = tokens.themes ?? [];
  const colours = themes.map((theme) => walkBlock(groups.color?.[theme] ?? {}, 'color', new Map()));

  const lines = [];
  const shared = [...nonColour.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, value]) => `  ${cssVar(path)}: ${value};`);
  // The first theme is the default one, so it shares `:root` with the geometry rather than needing an
  // attribute on <html> to paint the page the brand calls standard.
  const first = [...(colours[0] ?? new Map()).entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, value]) => `  ${cssVar(path)}: ${value};`);
  lines.push(`:root {\n${[...shared, ...first].join('\n')}\n}\n`);
  themes.slice(1).forEach((theme, index) => {
    const rows = [...(colours[index + 1] ?? new Map()).entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, value]) => `  ${cssVar(path)}: ${value};`);
    if (rows.length) lines.push(`[data-theme="${theme}"] {\n${rows.join('\n')}\n}\n`);
  });
  return lines.join('\n');
}

/**
 * Provenance, printed in the artifact: a page that cannot say what produced it is not auditable, which
 * is the same reason the report carries an IR hash.
 *
 * Two details are the point. **Basenames only** — an absolute path would make two machines checking out
 * the same documents emit different bytes, and "byte-identical" would quietly become a claim about
 * directory layout. And the versions come from the documents themselves, not from this build's
 * constants, so an artifact records what it *was* rather than what read it.
 */
function provenanceHeader(ir, irHash, syntax) {
  const documents = ir.provenance?.documents ?? {};
  const versions = ir.provenance?.versions ?? {};
  const file = (path) => String(path).split(/[\\/]/).pop();
  const parts = Object.keys(documents)
    .sort()
    .map((kind) => `${kind} ${file(documents[kind])}${versions[kind] ? ` @${versions[kind]}` : ''}`);
  const line = `generated by web-spark${parts.length ? ` from ${parts.join(', ')}` : ''}${irHash ? ` · ir ${String(irHash).slice(0, 12)}` : ''}`;
  return syntax === 'css' ? `/* ${line} */` : `<!-- ${line} -->`;
}

function tokensJson(tokens) {
  if (!tokens) return '{}\n';
  const sortDeep = (value) => {
    if (Array.isArray(value)) return value.map(sortDeep);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]));
    return value;
  };
  return `${JSON.stringify(sortDeep({ name: tokens.name, version: tokens.version, themes: tokens.themes, groups: tokens.groups, cssVars: tokens.cssVars }), null, 2)}\n`;
}

/* ------------------------------------------------------------------- motion */

function motionSide(values, { opacityOnly = false } = {}) {
  const out = {};
  const has = (key) => Boolean(values) && Object.hasOwn(values, key);
  // One `translate` property, two authored axes: whichever the document named, the other starts at 0.
  if (has('translateX') || has('translateY')) out.translate = `${raw(values.translateX) ?? '0'} ${raw(values.translateY) ?? '0'}`;
  for (const key of ['opacity', 'scale', 'rotate', 'color', 'background']) {
    if (!has(key)) continue;
    const property = MOTION[key];
    if (opacityOnly && property !== 'opacity') continue;
    out[property] = raw(values[key]);
  }
  if (opacityOnly) return declarations({ opacity: out.opacity }) ?? {};
  return declarations(out) ?? {};
}

function staggerOrder(count, from) {
  const indices = [...Array(count).keys()];
  if (from === 'end') return indices.map((_, i) => count - 1 - i);
  if (from === 'center') {
    const middle = (count - 1) / 2;
    return [...indices].sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle) || a - b);
  }
  return indices;
}

/* --------------------------------------------------------------------- page */

/**
 * @param {{ document: object, tokens?: object, motion?: object }} ir the lowered document set
 */
export function emit(ir, { styleFile = 'spark.css', irHash = null } = {}) {
  const doc = ir?.document;
  if (!doc) throw new Error('emit: the IR carries no document — nothing was lowered');
  const refusals = [];
  const notices = [];
  const layoutFor = doc.layout ?? {};
  const statesFor = doc.states ?? {};
  const motionItems = ir.motion?.items ?? [];

  // Resolved before the styles and the markup both, because a landmark changes the *element* a component
  // becomes — one `main` is the reason `#${'id'}` is a stable address for a skip link.
  const landmarkByComponent = new Map();
  for (const landmark of doc.a11y?.landmarks ?? []) {
    if (landmarkByComponent.has(landmark.contains)) {
      refusals.push({ code: 'EMIT003', path: 'a11y.landmarks', note: `"${landmark.contains}" carries two landmarks, and an element has one role` });
      continue;
    }
    landmarkByComponent.set(landmark.contains, landmark);
  }
  const mainId = (doc.a11y?.landmarks ?? []).find((entry) => entry.role === 'main')?.contains ?? null;
  if (doc.a11y?.skipLink && !mainId) {
    refusals.push({ code: 'EMIT003', path: 'a11y.skipLink', note: 'a skip link needs a `main` landmark to point at' });
  }
  const assets = new Map((doc.assets ?? []).map((asset) => [asset.id, asset]));

  const tagFor = (node) => {
    const landmark = landmarkByComponent.get(node.id);
    if (landmark) return LANDMARK_TAG[landmark.role] ?? 'div';
    switch (node.type) {
      case 'heading':
        return `h${Number(node.props?.level ?? 2)}`;
      case 'list':
        return node.props?.ordered ? 'ol' : 'ul';
      case 'text':
        return { blockquote: 'blockquote', figcaption: 'figcaption', span: 'span', lead: 'p' }[node.props?.as] ?? 'p';
      case 'region':
        return node.props?.role === 'form' ? 'form' : node.props?.role === 'search' ? 'search' : 'section';
      default:
        return node.tag;
    }
  };

  const knownTypes = new Set(['stack', 'grid', 'region', 'heading', 'text', 'link', 'button', 'image', 'input', 'list', 'listbox']);
  const cssVarsOf = new Map(Object.entries(ir.tokens?.cssVars ?? {}));
  /** A document value that names a token becomes the custom property the token block already defines. */
  const varOrLiteral = (value) => {
    if (typeof value === 'string' && cssVarsOf.has(value)) return `var(${cssVarsOf.get(value)})`;
    return css(value);
  };
  // Which elements carry a class is decided while the styles are written, then read back while the
  // markup is written — one pass deciding, one pass consuming, so a class can never appear in the HTML
  // with no rule behind it, or vice versa.
  const classNeeded = new Set();
  const styled = (node) => Boolean(node.id) && classNeeded.has(node.id);

  /** The `props` entries with a visual consequence. Everything else in `props` is content, not paint. */
  const propsDeclarations = (node) => {
    const out = {};
    const props = node.props ?? {};
    if (props.tone !== undefined) out['--spark-tone'] = varOrLiteral(props.tone);
    if (node.type === 'text' && props.size !== undefined) out['font-size'] = varOrLiteral(props.size);
    if (node.type === 'image') {
      for (const key of ['width', 'height']) {
        if (props[key] === undefined) continue;
        // A plain integer goes in the attribute, where the browser reserves the space before CSS has
        // loaded. A token or a length goes here, where it can be a var().
        if (/^\d+$/.test(String(css(props[key]) ?? ''))) continue;
        out[key] = varOrLiteral(props[key]);
      }
    }
    if (node.type === 'text' && props.as === 'lead' && props.size === undefined) {
      notices.push({
        path: `#${node.id ?? '(no id)'}`,
        note: '`as: "lead"` with no `size` emits as a paragraph: a lead is a type-scale decision, so name the token',
      });
    }
    return declarations(out) ?? {};
  };

  /* --- styles ------------------------------------------------------------ */
  const cssOut = [tokensCss(ir.tokens)];
  cssOut.push(
    '/* The emitter\'s floor, not a design decision: a reset has no token because it has no opinion. */',
    '*, *::before, *::after { box-sizing: border-box; }',
    'body { margin: 0; }',
    // The skip link is the emitter's own contract, not a documented one: a11y.skipLink says a page has
    // somewhere to skip to, and how it stays out of the way until a keyboard reaches it is not a design
    // decision a brand should have to re-make per page. Moved off-screen with a transform, so revealing
    // it costs no layout.
    '.spark-skip { position: absolute; transform: translateY(-200%); padding: var(--space-sm); background-color: var(--color-accent); color: var(--color-bg); }',
    '.spark-skip:focus { transform: none; }',
    '',
  );

  const responsiveByBreakpoint = new Map();
  const layoutDeclarations = (id, node, source, ctxOverride) => {
    const ctx = ctxOverride ?? { display: css(source?.display), childCount: node.children?.length ?? 0 };
    const out = {};
    for (const [key, value] of Object.entries(source ?? {})) {
      if (!Object.hasOwn(LAYOUT, key)) {
        refusals.push({ code: 'EMIT003', path: `layout.${id}.${key}`, note: `no emission mapping for the layout property "${key}"` });
        continue;
      }
      const property = LAYOUT[key](ctx);
      if (!property) continue;
      const authored = css(value);
      if (authored === null) continue;
      if (key === 'cols' || key === 'rows') out[property] = gridTrack(value.literal ?? authored, ctx.childCount);
      else if (key === 'span') out[property] = `span ${authored}`;
      else out[property] = authored;
    }
    return out;
  };

  const stateDeclarations = (id, state, source) => {
    const out = {};
    for (const [key, value] of Object.entries(source ?? {})) {
      const property = STATE[key];
      if (!property) {
        if (state !== 'default') {
          refusals.push({ code: 'EMIT003', path: `states.${id}.${state}.${key}`, note: `no emission mapping for the state property "${key}"` });
        }
        continue;
      }
      const authored = css(value);
      if (authored !== null) out[property] = authored;
    }
    return out;
  };

  const visit = (node) => {
    if (!knownTypes.has(node.type)) {
      refusals.push({ code: 'EMIT003', path: `#${node.id ?? '(no id)'}`, note: `component type "${node.type}" is not in the emitter's vocabulary` });
    }
    if (!node.id) return void (node.children ?? []).forEach(visit);
    const selector = `.${node.className}`;
    const source = layoutFor[node.id];
    const decls = {
      ...layoutDeclarations(node.id, node, source),
      ...stateDeclarations(node.id, 'default', statesFor[node.id]?.default),
      ...propsDeclarations(node),
    };
    if (Object.keys(decls).length) {
      cssOut.push(rule(selector, decls));
      classNeeded.add(node.id);
    }

    for (const key of Object.keys(source?.responsive ?? {})) {
      const overrides = source.responsive[key];
      if (!responsiveByBreakpoint.has(key)) responsiveByBreakpoint.set(key, []);
      responsiveByBreakpoint.get(key).push({
        selector,
        id: node.id,
        overrides,
        ctx: { display: css(source?.display), childCount: node.children?.length ?? 0 },
      });
    }

    for (const [state, source2] of Object.entries(statesFor[node.id] ?? {})) {
      if (state === 'default') continue;
      const pseudo = STATE_PSEUDO[state];
      if (!pseudo) {
        refusals.push({
          code: 'EMIT001',
          path: `states.${node.id}.${state}`,
          note: `the state "${state}" has no CSS selector, so it needs the runtime (Phase 4)`,
        });
        continue;
      }
      cssOut.push(rule(`${selector}${pseudo}`, stateDeclarations(node.id, state, source2)));
    }

    (node.children ?? []).forEach(visit);
  };
  (doc.tree ?? []).forEach(visit);

  /* --- motion ------------------------------------------------------------
   *
   * One rule per element, with a comma-separated animation list inside it. CSS resolves `animation` as
   * a single shorthand, so two documents' worth of animations on one element emitted as two rules would
   * mean the later one silently wins and the earlier one never plays — the loudest failure an emitter can
   * have, because the page looks finished.
   */
  const byElement = new Map();
  const pushTo = (id, mode, entry) => {
    if (!byElement.has(id)) byElement.set(id, {});
    const slot = byElement.get(id);
    (slot[mode] ??= []).push(entry);
  };
  const keyframes = [];

  for (const item of motionItems) {
    const on = item.trigger?.on;
    if (on === 'state' || on === 'click' || on === 'scroll') {
      refusals.push({
        code: 'EMIT001',
        path: item.path,
        note: `a "${on}" trigger needs the runtime (Phase 4); emit as load/visible/hover/focus, or leave it a scene state`,
      });
      continue;
    }
    if (item.repeatDelay) {
      refusals.push({ code: 'EMIT002', path: item.path, note: 'fold the pause into `duration` — padding it in would emit a different motion than the one authored' });
      continue;
    }
    if (!item.target?.id) continue;
    if (!['load', 'visible', 'hover', 'focus'].includes(on)) {
      pushTo(item.target.id, 'untriggered', { item });
      continue;
    }
    const from = motionSide(item.from);
    const to = motionSide(item.to);
    if (!Object.keys(from).length && !Object.keys(to).length) continue;
    const curve = cssTimingFunction(item.easing) ?? 'ease-out';
    const duration = `${item.duration?.msValue ?? 0}ms`;
    const loops = item.repeat === 'infinite' || Number(item.repeat) > 0;
    pushTo(item.target.id, on, {
      item,
      from,
      to,
      curve,
      duration,
      start: `${item.startMs ?? 0}ms`,
      iteration: item.repeat === 'infinite' ? 'infinite' : loops ? String(Number(item.repeat) + 1) : '1',
      direction: item.yoyo ? 'alternate' : 'normal',
    });
  }

  const reduced = { quiet: [], fade: [] };
  for (const [id, modes] of [...byElement.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const selector = `#${id}`;
    if (modes.untriggered?.length) {
      notices.push({
        path: `motion.${id}`,
        note: `${modes.untriggered.length} motion(s) target this element with no trigger, so nothing plays them (MOTION001 covers why that is legal at all)`,
      });
    }
    if (modes.visible?.length && modes.load?.length) {
      refusals.push({
        code: 'EMIT003',
        path: `motion.${id}`,
        note: 'this element has both a `load` and a `visible` motion; CSS gives one element one animation list, so pick one trigger',
      });
      continue;
    }

    for (const mode of ['load', 'visible']) {
      const entries = modes[mode];
      if (!entries?.length) continue;
      const names = [];
      const durations = [];
      const curves = [];
      const delays = [];
      const iterations = [];
      const directions = [];
      for (const entry of entries) {
        const name = `k-${id}-${mode}${entries.length > 1 ? `-${names.length}` : ''}`;
        keyframes.push(keyframesBlock(name, entry.from, entry.to));
        // A `fade` fallback can only fade something, so a motion that never touched opacity has no
        // reduced variant to write and falls through to `animation: none` with its element. And no
        // variant is emitted for a motion that did not ask for one: dead keyframes in a stylesheet are a
        // file size nobody chose.
        const wantsFade = entry.item.reducedMotion === 'fade';
        const fromFade = wantsFade ? motionSide(entry.item.from, { opacityOnly: true }) : {};
        const toFade = wantsFade ? motionSide(entry.item.to, { opacityOnly: true }) : {};
        entry.fadeable = wantsFade && (Object.keys(fromFade).length > 0 || Object.keys(toFade).length > 0);
        if (wantsFade && !entry.fadeable) {
          notices.push({
            path: entry.item.id ? `motion.animations.${entry.item.id}` : item.path,
            note: '`reducedMotion: "fade"` on a motion that never touches `opacity` emits as no motion at all — add an opacity fade, or say `instant`',
          });
        }
        if (entry.fadeable) keyframes.push(keyframesBlock(`${name}-reduced`, fromFade, toFade));
        names.push(name);
        durations.push(entry.duration);
        curves.push(entry.curve);
        delays.push(entry.start);
        iterations.push(entry.iteration);
        directions.push(entry.direction);
      }
      const animation = {
        animation: names.map((name, index) => `${name} ${durations[index]} ${curves[index]} both`).join(', '),
        'animation-delay': delays.join(', '),
      };
      if (iterations.some((value) => value !== '1')) animation['animation-iteration-count'] = iterations.join(', ');
      if (directions.some((value) => value !== 'normal')) animation['animation-direction'] = directions.join(', ');

      const staggerRules = [];
      for (const entry of entries) {
        const { item } = entry;
        if (!item.stagger || item.target.each !== 'children' || (item.target.childCount ?? 1) < 2) continue;
        staggerRules.push(
          ...staggerOrder(item.target.childCount, item.stagger.from).map((childIndex, position) =>
            rule(`${selector} > :nth-child(${childIndex + 1})`, {
              'animation-delay': `${(item.startMs ?? 0) + position * (item.stagger.eachMs ?? 0)}ms`,
            }),
          ),
        );
      }

      if (mode === 'visible') {
        // Inside @supports on purpose: where scroll-driven animation is missing the rule must be absent
        // rather than downgraded, because an entry animation that plays on page load is a different
        // promise than the one the document made.
        cssOut.push(
          `@supports (animation-timeline: view()) {\n${[rule(selector, { ...animation, 'animation-timeline': 'view()', 'animation-range': 'entry 0% entry 100%' }), ...staggerRules].join('').trimEnd()}\n}\n`,
        );
      } else {
        cssOut.push(rule(selector, animation));
        if (staggerRules.length) cssOut.push(staggerRules.join(''));
      }

      // The reduced-motion answer for an element is one answer: `fade` only where every motion on it
      // asked for fade, because a half-still, half-fading element is neither of the two promises. A
      // `fade` variant is the same curve with the movement removed, which is why it keeps the duration
      // and drops to 1ms: the element must arrive, and arrive at its authored end state.
      const allFade = entries.length > 0 && entries.every((entry) => entry.item.reducedMotion === 'fade' && entry.fadeable);
      if (allFade) {
        reduced.fade.push(
          ...names.map((name) => `${selector} { animation-name: ${name}-reduced; animation-duration: 1ms; animation-delay: 0ms; }`),
        );
      } else {
        reduced.quiet.push(`${selector} { animation: none; }`);
      }
    }

    for (const mode of ['hover', 'focus']) {
      const entries = modes[mode];
      if (!entries?.length) continue;
      const pseudo = mode === 'hover' ? ':hover' : ':focus-visible';
      const props = [...new Set(entries.flatMap((entry) => [...Object.keys(entry.from), ...Object.keys(entry.to)]))].sort();
      if (!props.length) continue;
      const transitions = entries.map((entry) => `${props.join(', ')} ${entry.duration} ${entry.curve}`);
      const base = {};
      for (const entry of entries) Object.assign(base, entry.from);
      cssOut.push(rule(selector, { ...base, transition: [...new Set(transitions)].join(', ') }));
      const painted = {};
      for (const entry of entries) Object.assign(painted, entry.to);
      cssOut.push(rule(`${selector}${pseudo}`, painted));
      reduced.quiet.push(`${selector}, ${selector}${pseudo} { transition: none; }`);
    }
  }

  for (const [name, machine] of Object.entries(ir.motion?.machines ?? {})) {
    const plays = Object.values(machine?.states ?? {}).some((state) => (state?.effects ?? []).length > 0);
    if (plays) {
      refusals.push({ code: 'EMIT001', path: `motion.machines.${name}`, note: `machine "${name}" plays effects, which needs the runtime (Phase 4)` });
    }
  }

  if (keyframes.length) cssOut.push(keyframes.join('\n'));

  for (const [breakpoint, entries] of [...responsiveByBreakpoint.entries()].sort()) {
    const width = ir.tokens?.groups?.layout?.breakpoint?.[breakpoint];
    if (!width) {
      refusals.push({ code: 'EMIT003', path: `layout.responsive.${breakpoint}`, note: `"${breakpoint}" names no breakpoint the settings document declares` });
      continue;
    }
    // `cols` means grid-template-columns only inside a grid, so an override has to know the element's
    // own display: a media query that changes column count is not a display change.
    const body = entries
      .map(({ selector, id, overrides, ctx }) => rule(selector, layoutDeclarations(id, { children: [] }, overrides, ctx)))
      .join('');
    cssOut.push(`@media (max-width: ${width}) {\n${body.trimEnd()}\n}\n`);
  }

  // One block, both buckets, sorted: `fade` first so the later `animation: none` cannot erase it, and
  // the whole thing sits last in the file so it wins the cascade without an `!important` anywhere.
  const reduceLines = [...new Set([...reduced.fade, ...reduced.quiet])].sort();
  if (reduceLines.length) {
    cssOut.push(`@media (prefers-reduced-motion: reduce) {\n${reduceLines.map((line) => `  ${line}`).join('\n')}\n}\n`);
  }

  /* --- markup ------------------------------------------------------------ */
  const render = (node, depth) => {
    const pad = '  '.repeat(depth);
    const tag = tagFor(node);
    const attrs = [];
    if (node.id) attrs.push(`id="${attr(node.id)}"`);
    if (styled(node)) attrs.push(`class="${attr(node.className)}"`);
    const landmark = node.id ? landmarkByComponent.get(node.id) : null;
    if (landmark && landmark.role !== 'main' && landmark.role !== 'banner' && landmark.role !== 'contentinfo') {
      const label = landmark.label ?? node.props?.label ?? null;
      if (label) attrs.push(`aria-label="${attr(label)}"`);
      else if (landmark.role === 'region') notices.push({ path: `#${node.id}`, note: 'a `region` landmark without a label is not a destination a screen reader can offer' });
    }
    const openAttrs = attrs.length ? ` ${attrs.join(' ')}` : '';
    const props = node.props ?? {};

    switch (node.type) {
      case 'heading':
      case 'text':
        return `${pad}<${tag}${openAttrs}>${text(props.text)}</${tag}>`;
      case 'link': {
        const extra = props.external ? ' rel="noopener"' : '';
        return `${pad}<a${openAttrs} href="${attr(props.href ?? '#')}"${extra}>${text(props.label)}</a>`;
      }
      case 'button': {
        const disabled = props.disabled ? ' disabled' : '';
        return `${pad}<button${openAttrs} type="${attr(props.type ?? 'button')}"${disabled}>${text(props.label)}</button>`;
      }
      case 'image': {
        const asset = assets.get(props.src);
        if (props.src && !asset && !/^[a-z][a-z0-9+.-]*:/i.test(String(props.src))) {
          refusals.push({ code: 'EMIT003', path: `#${node.id}.props.src`, note: `"${props.src}" is neither a declared asset nor a URL` });
        }
        const size = ['width', 'height']
          .map((key) => {
            const value = css(props[key]);
            if (value === null) return null;
            return /^\d+$/.test(value) ? `${key}="${attr(value)}"` : null;
          })
          .filter(Boolean);
        return `${pad}<img${openAttrs} src="${attr(asset ? String(asset.path).split('/').pop() : props.src ?? '')}" alt="${attr(props.alt ?? '')}"${size.length ? ` ${size.join(' ')}` : ''} loading="lazy" decoding="async" />`;
      }
      case 'input': {
        const id = `field-${node.id}`;
        const extra = [props.autocomplete ? `autocomplete="${attr(props.autocomplete)}"` : null, props.required ? 'required' : null].filter(Boolean).join(' ');
        return [
          `${pad}<label for="${attr(id)}">${text(props.label)}</label>`,
          `${pad}<input${openAttrs.replace(`id="${attr(node.id)}"`, `id="${attr(id)}"`)} type="${attr(props.kind ?? 'text')}" name="${attr(props.name ?? node.id)}"${extra ? ` ${extra}` : ''} />`,
        ].join('\n');
      }
      case 'listbox': {
        const id = `field-${node.id}`;
        const options = (props.options ?? [])
          .map((option) => {
            const value = typeof option === 'string' ? option : option.value;
            const label = typeof option === 'string' ? option : option.label ?? option.value;
            const selected = props.value !== undefined && String(value) === String(props.value) ? ' selected' : '';
            return `${pad}  <option value="${attr(value)}"${selected}>${text(label)}</option>`;
          })
          .join('\n');
        return [
          `${pad}<label for="${attr(id)}">${text(props.label)}</label>`,
          `${pad}<select${openAttrs.replace(`id="${attr(node.id)}"`, `id="${attr(id)}"`)} name="${attr(props.name ?? node.id)}">`,
          options,
          `${pad}</select>`,
        ].join('\n');
      }
      case 'list': {
        const items = (node.children ?? []).map((child) => `${pad}  <li>\n${render(child, depth + 2)}\n${pad}  </li>`).join('\n');
        return `${pad}<${tag}${openAttrs}>\n${items}\n${pad}</${tag}>`;
      }
      default: {
        const children = (node.children ?? []).map((child) => render(child, depth + 1)).join('\n');
        if (!children) return `${pad}<${tag}${openAttrs}></${tag}>`;
        return `${pad}<${tag}${openAttrs}>\n${children}\n${pad}</${tag}>`;
      }
    }
  };

  const skip = doc.a11y?.skipLink && mainId ? `  <a class="spark-skip" href="#${attr(mainId)}">Skip to main content</a>\n` : '';
  const html = [
    provenanceHeader(ir, irHash, 'html'),
    '<!doctype html>',
    `<html lang="${attr(doc.lang ?? 'en')}">`,
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    doc.title ? `    <title>${text(doc.title)}</title>` : '    <title>(untitled document)</title>',
    `    <link rel="stylesheet" href="${attr(styleFile)}" />`,
    '  </head>',
    '  <body>',
    skip.trimEnd(),
    (doc.tree ?? []).map((node) => render(node, 1)).join('\n'),
    '  </body>',
    '</html>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const stylesheet = `${provenanceHeader(ir, irHash, 'css')}\n${cssOut.join('\n')}`.replace(/\n{3,}/g, '\n\n');
  return { files: { 'index.html': html, [styleFile]: stylesheet, 'tokens.json': tokensJson(ir.tokens) }, refusals, notices };
}
