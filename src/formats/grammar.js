/**
 * The grammar behind all three document formats.
 *
 * One descriptor produces three projections: a JSON Schema file for editors and third-party tools,
 * a TypeScript declaration file for consumers, and the runtime validator the compiler uses. That is
 * the whole reason this file exists. The alternative — writing schemas by hand and a validator by
 * hand — gives two sources of truth that drift, and a design format that drifts is a dialect.
 *
 * See docs/adr/0002-one-grammar-three-projections.md and docs/DOCUMENTS.md.
 *
 * A node is plain data. Shape rules only; anything JSON Schema cannot express lives in the
 * `checks` of a format module, where it gets an id and a message just like a verifier rule does.
 */

/** Nodes may be marked optional by their parent, never by themselves. */
const MISSING = Symbol('missing');

export const t = {
  /**
   * `patternNote` is the "why" behind a pattern. A rejected value should say what the rule protects,
   * not just that a regex disagreed — the pattern itself is not advice.
   */
  string: ({ description, pattern, patternNote, minLength, maxLength } = {}) => ({
    kind: 'string',
    description,
    pattern,
    patternNote,
    minLength,
    maxLength,
  }),
  /** A string that must equal one thing: `version` and `$schema` are consts, not "check it later". */
  const: (value, { description } = {}) => ({ kind: 'const', value, description }),
  integer: ({ description, minimum, maximum } = {}) => ({ kind: 'integer', description, minimum, maximum }),
  /**
   * Thresholds, ratios and sliders are numbers; values that get written into a page are strings with
   * units. The line is deliberate: `min: 4.5` is a fact about a *check* the tool compares, and JSON
   * numbers are the honest type for that, while `0.5` vs `"0.50"` vs `.5` as a page value is three
   * diffs for one design decision.
   */
  number: ({ description, minimum, maximum } = {}) => ({ kind: 'number', description, minimum, maximum }),
  boolean: ({ description } = {}) => ({ kind: 'boolean', description }),
  enum: (values, { description } = {}) => ({ kind: 'enum', values, description }),
  object: (shape, { description } = {}) => ({ kind: 'object', shape, description }),
  array: (items, { description, minItems, maxItems } = {}) => ({
    kind: 'array',
    items,
    description,
    minItems,
    maxItems,
  }),
  /** An object whose keys are user-chosen (ids, token names). Keys matching `keyPattern`. */
  map: (values, { description, keyPattern, title } = {}) => ({
    kind: 'map',
    values,
    description,
    keyPattern,
    title,
  }),
  /**
   * `matchOn` names the discriminator key. When no branch matches, the branch whose const value the
   * document actually carries is validated in full, and *its* errors are reported. Without that, a
   * bad `props` on a `heading` answers with "an object or an object or an object …", which is a
   * message that cannot be acted on.
   */
  /**
   * `matchOn` names the discriminator key: when no branch matches, the branch whose const value the
   * document actually carries is validated in full and *its* errors are reported. Without that, a bad
   * `props` on a `heading` answers with "an object or an object or an object …", which is a message
   * nobody can act on.
   *
   * `describeAs` replaces the branch list in prose, for the case where the branches are shared
   * definitions whose names mean nothing to an author.
   */
  union: (anyOf, { description, matchOn, describeAs } = {}) => ({
    kind: 'union',
    anyOf,
    description,
    matchOn,
    describeAs,
  }),
  /** A named shared definition, emitted into `$defs` and referenced by both projections. */
  ref: (name, { description } = {}) => ({ kind: 'ref', name, description }),
  /** A dotted path into the token store. The only way to name a visual value in a scene. */
  tokenRef: ({ groups, description } = {}) => ({ kind: 'tokenRef', groups, description }),
  /**
   * A token reference, or a literal of `node`. The literal is legal and *discouraged*: matching it
   * produces a notice, never an error. Refusing literals outright would make the format unusable for
   * anything one-off; allowing them silently is how a design system accumulates 40 greys.
   */
  tokenOr: (node, { groups, description } = {}) => ({
    kind: 'tokenOr',
    node,
    groups,
    description,
  }),
  /** A value that may be omitted. Wraps rather than marks, so "required" is the shape's business. */
  opt: (node) => ({ ...node, optional: true }),
};

/**
 * Keys a document may carry anywhere without the format declaring them. There is exactly one.
 *
 * The rest of the `$` family — `$ref`, `$schema`, `$id`, `$defs` — is *meaningful*: each one changes
 * what a value resolves to. A blanket "starts with `$`, pass it" rule would make a `$ref` legal in a
 * document that never agreed to resolve anything, which is a reference that looks like it works right up
 * until it renders nothing. So a `$` key is checked like any other where the shape declares it (the
 * roots declare `$schema` and `version`; `tokens` declares `$ref`), and an undeclared one is an unknown
 * key like any other. `$comment` is the exception because it carries nothing to verify — and it is the
 * only prose a v1 document is allowed to smuggle.
 */
export const RESERVED_KEYS = Object.freeze(['$comment']);

export function isReserved(key) {
  return RESERVED_KEYS.includes(key);
}

/** Human-readable expectation for an error message. Kept short: it prints after a path. */
export function describe(node) {
  switch (node.kind) {
    case 'string':
      return node.pattern ? 'a string matching the published pattern' : 'a string';
    case 'const':
      return JSON.stringify(node.value);
    case 'integer':
      return 'an integer';
    case 'number':
      return 'a number';
    case 'boolean':
      return 'true or false';
    case 'enum':
      return `one of ${node.values.map((v) => `"${v}"`).join(' | ')}`;
    case 'object':
      return 'an object';
    case 'array':
      return 'an array';
    case 'map':
      return 'an object keyed by name';
    case 'union':
      return node.describeAs ?? node.anyOf.map(describe).join(' or ');
    case 'ref':
      return `a ${node.name}`;
    case 'tokenRef':
      return 'a token reference such as "space.lg"';
    case 'tokenOr':
      return `a token reference such as "space.lg", or ${describe(node.node)}`;
    default:
      return `a ${node.kind}`;
  }
}

/**
 * Validate a value against a root node.
 *
 * `ctx.registry` is the set of dotted token paths a settings document declares. Without it,
 * token references can only be checked for shape, so every reference becomes `unresolved` rather
 * than silently passing — an unchecked check is never reported as a passed one.
 */
export function validate(node, value, ctx = {}) {
  const state = { errors: [], notices: [], unresolved: [], defs: ctx.defs ?? {}, registry: ctx.registry ?? null };
  check(node, value, '', state);
  return { valid: state.errors.length === 0, errors: state.errors, notices: state.notices, unresolved: state.unresolved };
}

/** Shape-only check for `t.union` branches: it must not write to the shared result. */
function branchOk(node, value, state) {
  const scratch = { errors: [], notices: [], unresolved: [], defs: state.defs, registry: state.registry };
  check(node, value, '', scratch);
  return { ok: scratch.errors.length === 0, scratch };
}

function push(list, entry) {
  list.push(entry);
}

function check(node, value, path, state) {
  if (node.optional && value === undefined) return;

  switch (node.kind) {
    case 'ref': {
      const target = state.defs[node.name];
      if (!target) throw new Error(`grammar: undefined shared definition "${node.name}"`);
      check({ ...target, optional: node.optional }, value, path, state);
      return;
    }
    case 'const': {
      if (value !== node.value) {
        push(state.errors, {
          path,
          code: 'const',
          expected: node.value,
          actual: value === undefined ? 'absent' : value,
        });
      }
      return;
    }
    case 'enum': {
      if (typeof value !== 'string' || !node.values.includes(value)) {
        push(state.errors, {
          path,
          code: 'enum',
          allowed: node.values,
          actual: value === undefined ? 'absent' : value,
        });
      }
      return;
    }
    case 'string': {
      if (typeof value !== 'string') {
        push(state.errors, { path, code: 'type', expected: 'string', actual: typeName(value) });
        return;
      }
      if (node.minLength != null && value.length < node.minLength) {
        push(state.errors, { path, code: 'minLength', minLength: node.minLength, actual: value });
      }
      if (node.maxLength != null && value.length > node.maxLength) {
        push(state.errors, { path, code: 'maxLength', maxLength: node.maxLength, actual: value });
      }
      if (node.pattern && !new RegExp(node.pattern).test(value)) {
        push(state.errors, {
          path,
          code: 'pattern',
          pattern: node.pattern,
          actual: value,
          ...(node.patternNote ? { note: node.patternNote } : {}),
        });
      }
      return;
    }
    case 'integer': {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        push(state.errors, { path, code: 'type', expected: 'integer', actual: typeName(value) });
        return;
      }
      if (node.minimum != null && value < node.minimum) {
        push(state.errors, { path, code: 'minimum', minimum: node.minimum, actual: value });
      }
      if (node.maximum != null && value > node.maximum) {
        push(state.errors, { path, code: 'maximum', maximum: node.maximum, actual: value });
      }
      return;
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        push(state.errors, { path, code: 'type', expected: 'number', actual: typeName(value) });
        return;
      }
      if (node.minimum != null && value < node.minimum) {
        push(state.errors, { path, code: 'minimum', minimum: node.minimum, actual: value });
      }
      if (node.maximum != null && value > node.maximum) {
        push(state.errors, { path, code: 'maximum', maximum: node.maximum, actual: value });
      }
      return;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        push(state.errors, { path, code: 'type', expected: 'boolean', actual: typeName(value) });
      }
      return;
    }
    case 'tokenRef':
    case 'tokenOr': {
      const groups = node.groups;
      const literal = node.kind === 'tokenOr' ? node.node : null;
      if (typeof value === 'string' && TOKEN_PATH.test(value)) {
        const group = value.split('.')[0];
        if (groups && !groups.includes(group)) {
          push(state.errors, { path, code: 'tokenGroup', groups, actual: value });
          return;
        }
        if (state.registry === null) {
          push(state.unresolved, { path, code: 'tokenUnresolved', actual: value });
        } else if (!state.registry.has(value)) {
          push(state.errors, { path, code: 'unknownToken', actual: value, nearest: nearest(value, state.registry) });
        }
        return;
      }
      if (literal) {
        const before = state.errors.length;
        check(literal, value, path, state);
        if (state.errors.length === before) {
          push(state.notices, { path, code: 'literalValue', actual: value });
          return;
        }
        state.errors.length = before;
      }
      push(state.errors, { path, code: 'expected', expected: describe(node), actual: typeName(value) });
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        push(state.errors, { path, code: 'type', expected: 'array', actual: typeName(value) });
        return;
      }
      if (node.minItems != null && value.length < node.minItems) {
        push(state.errors, { path, code: 'minItems', minItems: node.minItems, actual: value.length });
      }
      value.forEach((item, index) => check(node.items, item, `${path}[${index}]`, state));
      return;
    }
    case 'map': {
      if (!isPlainObject(value)) {
        push(state.errors, { path, code: 'type', expected: 'object', actual: typeName(value) });
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if (isReserved(key)) continue;
        if (node.keyPattern && !new RegExp(node.keyPattern).test(key)) {
          push(state.errors, { path: `${path}.${key}`, code: 'keyPattern', pattern: node.keyPattern, actual: key });
          continue;
        }
        check(node.values, child, `${path}.${key}`, state);
      }
      return;
    }
    case 'union': {
      if (value === undefined) {
        if (!node.optional) {
          push(state.errors, { path, code: 'required', expected: describe(node) });
        }
        return;
      }
      const results = node.anyOf.map((branch) => branchOk(branch, value, state));
      const winner = results.find((r) => r.ok);
      if (winner) {
        for (const n of winner.scratch.notices) {
          push(state.notices, { ...n, path: relate(path, n.path) });
        }
        return;
      }
      if (node.matchOn) {
        const keyed = node.anyOf.find(
          (branch) => branch.kind === 'object' && branch.shape?.[node.matchOn]?.kind === 'const' && value?.[node.matchOn] === branch.shape[node.matchOn].value,
        );
        if (keyed) {
          // The discriminator is settled by the document, so report the *chosen* shape's errors and
          // annotate them. "components[0].props.gap is not a field" is a puzzle; the same line with
          // "(checked as the \"stack\" shape)" reads as an answer.
          const before = state.errors.length;
          check(keyed, value, path, state);
          for (const entry of state.errors.slice(before)) entry.asType = value[node.matchOn];
          return;
        }
      }
      // "Got a string, expected a string" is the classic useless validator line. A union failure
      // carries the reasons its branches failed, collected from however deep the real complaint was, so
      // the author reads why nothing matched instead of a list of our internal definition names.
      const notes = notesOf(results.flatMap((r) => r.scratch.errors));
      push(state.errors, {
        path,
        code: node.matchOn ? 'unknownDiscriminator' : 'noBranch',
        discriminator: node.matchOn,
        branches: node.anyOf.map((branch) => branch.shape?.[node.matchOn]?.value ?? describe(branch)),
        actual: value?.[node.matchOn] ?? typeName(value),
        ...(notes.length ? { notes } : {}),
      });
      return;
    }
    case 'object': {
      if (!isPlainObject(value)) {
        push(state.errors, { path, code: 'type', expected: 'object', actual: typeName(value) });
        return;
      }
      for (const [key, child] of Object.entries(node.shape)) {
        if (value[key] === undefined) {
          if (!child.optional) push(state.errors, { path: join(path, key), code: 'required', expected: describe(child) });
          continue;
        }
        check(child, value[key], join(path, key), state);
      }
      for (const key of Object.keys(value)) {
        if (isReserved(key) || node.shape[key]) continue;
        push(state.errors, {
          path: join(path, key),
          code: 'unknownKey',
          allowed: Object.keys(node.shape),
          actual: key,
        });
      }
      return;
    }
    default:
      throw new Error(`grammar: unknown node kind "${node.kind}"`);
  }
}

const TOKEN_PATH = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;

/**
 * The nearest declared token, by shared prefix length.
 *
 * A typo in a token name is the most common error in a design document, and "unknown token"
 * without a suggestion sends the author hunting. Deliberately dumb: prefix sharing beats edit
 * distance here because token names are hierarchical (`space.larg` is *in* `space`).
 */
function nearest(value, registry) {
  const parts = value.split('.');
  const group = parts[0];
  const tail = parts.slice(1).join('.');
  let best = null;
  let bestScore = Infinity;
  for (const candidate of registry) {
    const cp = candidate.split('.');
    if (cp[0] !== group) continue;
    const depthGap = Math.abs(cp.length - parts.length);
    const score = editDistance(tail, cp.slice(1).join('.')) + depthGap * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  // A suggestion further from the typo than simply writing a new token would be noise.
  return bestScore <= Math.max(2, Math.floor(tail.length / 2)) ? best : null;
}

/** Levenshtein, two rows. Small enough to inline rather than import. */
function editDistance(a, b) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeName(value) {
  if (value === undefined) return 'absent';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function join(path, key) {
  return path ? `${path}.${key}` : key;
}

/**
 * Collect explanation notes out of a nested failure tree, deduped and depth-bounded.
 *
 * Depth-bounded because a union of unions could otherwise gather the same sentence from every branch
 * at every level; the first two layers are where a real reason lives.
 */
function notesOf(errors, depth = 0) {
  if (depth > 2 || !Array.isArray(errors)) return [];
  const out = [];
  for (const error of errors) {
    if (!error || typeof error !== 'object') continue;
    if (error.note) out.push(error.note);
    if (error.notes) out.push(...error.notes);
  }
  return [...new Set(out)];
}

/** Re-root a path produced inside a branch probe. Array indices take no dot. */
function relate(path, sub) {
  if (!sub) return path;
  return sub.startsWith('[') ? `${path}${sub}` : `${path}.${sub}`;
}

/** Walk a dotted path, `undefined` when any step is missing. Used by checks and by lowering. */
export function getIn(value, dottedPath) {
  return dottedPath.split('.').reduce((node, key) => (node == null ? undefined : node[key]), value);
}

/* ------------------------------------------------------------------ projections */

const SCHEMA_DRAFT = 'https://json-schema.org/draft/2020-12/schema';

/**
 * JSON Schema for a root node. Only *shape* is expressible here, and the artifact says so in its
 * own `$comment` rather than pretending semantic checks travel with the file.
 */
export function toJsonSchema(root, { id, defs = {}, title, description, comment }) {
  const ctx = { defs, used: new Set(), queue: [] };
  const schema = schemaOf(root, ctx);
  const out = {
    $schema: SCHEMA_DRAFT,
    $id: id,
    $comment:
      comment ??
      'Generated from src/formats/. Shape only: semantic rules (unique ids, references that must resolve, required states) are enforced by src/formats/*.js and do not travel with this file.',
    title,
    description,
    ...schema,
  };
  // Worklist, not recursion: a recursive definition (`colorBlock` contains a `colorBlock`) must not
  // send this projection around in a circle, and JSON Schema resolves `$defs` lazily anyway.
  const $defs = {};
  while (ctx.queue.length) {
    const name = ctx.queue.shift();
    if ($defs[name]) continue;
    if (!defs[name]) throw new Error(`grammar: schema references an undefined definition "${name}"`);
    $defs[name] = schemaOf(defs[name], ctx);
  }
  if (Object.keys($defs).length) out.$defs = $defs;
  return out;
}

function schemaOf(node, ctx) {
  switch (node.kind) {
    case 'ref': {
      if (!ctx.used.has(node.name)) {
        ctx.used.add(node.name);
        ctx.queue.push(node.name);
      }
      return { $ref: `#/$defs/${node.name}` };
    }
    case 'const':
      return { const: node.value };
    case 'enum':
      return { type: 'string', enum: [...node.values] };
    case 'string':
      return clean({ type: 'string', pattern: node.pattern, minLength: node.minLength, maxLength: node.maxLength });
    case 'integer':
      return clean({ type: 'integer', minimum: node.minimum, maximum: node.maximum });
    case 'number':
      return clean({ type: 'number', minimum: node.minimum, maximum: node.maximum });
    case 'boolean':
      return { type: 'boolean' };
    case 'tokenRef':
      return clean({
        type: 'string',
        pattern: `^${TOKEN_PATH.source}$`,
        description: 'A dotted reference into the token store, e.g. "space.lg".',
      });
    case 'tokenOr':
      return clean({
        anyOf: [{ type: 'string', pattern: `^${TOKEN_PATH.source}$` }, schemaOf(node.node, ctx)],
        description: 'A token reference, or a literal. A literal is legal and reported as a lint.',
      });
    case 'array':
      return clean({
        type: 'array',
        minItems: node.minItems,
        maxItems: node.maxItems,
        items: schemaOf(node.items, ctx),
      });
    case 'map':
      return clean({
        type: 'object',
        propertyNames: node.keyPattern ? { pattern: node.keyPattern } : undefined,
        additionalProperties: schemaOf(node.values, ctx),
      });
    case 'union':
      return clean({ anyOf: node.anyOf.map((branch) => schemaOf(branch, ctx)) });
    case 'object': {
      const properties = {};
      const required = [];
      for (const [key, child] of Object.entries(node.shape).sort(([a], [b]) => (a < b ? -1 : 1))) {
        const projected = schemaOf(child, ctx);
        properties[key] = child.description ? { description: child.description, ...projected } : projected;
        if (!child.optional) required.push(key);
      }
      return clean({
        type: 'object',
        properties,
        required: required.length ? required : undefined,
        additionalProperties: false,
      });
    }
    default:
      throw new Error(`grammar: cannot project node kind "${node.kind}"`);
  }
}

/**
 * `propertyGroupPattern` was dropped on purpose: a schema that enumerated every legal token path
 * would have to be regenerated whenever a brand added a colour, which couples a published standard
 * to one project's palette. Which groups are legal is enforced by the validator, and the pattern
 * above already fixes the *shape* of a reference.
 */
/** Project a set of shared definitions on their own, for `schema/common-0.1.json`. */
export function toJsonSchemaDefs(defs, { id, title, description, comment }) {
  const ctx = { defs, used: new Set(), queue: [] };
  const $defs = {};
  for (const name of Object.keys(defs).sort()) ctx.queue.push(name);
  while (ctx.queue.length) {
    const name = ctx.queue.shift();
    if ($defs[name]) continue;
    if (!defs[name]) throw new Error(`grammar: shared definition "${name}" is referenced but not defined`);
    $defs[name] = schemaOf(defs[name], ctx);
  }
  return clean({
    $schema: SCHEMA_DRAFT,
    $id: id,
    $comment:
      comment ??
      'Shared vocabulary for the generated schemas. Nothing here is a document: it exists so the three format files stay one grammar instead of three copies of it.',
    title,
    description,
    $defs,
  });
}

/**
 * One `.d.ts` for several documents.
 *
 * Every shared definition is emitted once, because three copies of `export type length = string` in
 * one file is not a type system. Declaration order does not matter in TypeScript — aliases are
 * hoisted — so the defs can simply be sorted, which keeps the generated file byte-stable.
 */
export function toTypeScriptBundle(defs, entries) {
  const ctx = { defs, emitted: [], pending: new Set(), done: new Set() };
  const blocks = [];
  for (const name of Object.keys(defs).sort()) {
    defType(name, ctx);
  }
  for (const { typeName, root, description } of entries) {
    blocks.push(typeBlock(typeName, tsOf(root, ctx, ''), description));
  }
  return [...ctx.emitted.map(({ name, text, doc }) => typeBlock(name, text, doc)), ...blocks].join('\n\n') + '\n';
}

/**
 * Custom keyword, deliberately: an editor that does not know `propertyGroupPattern` ignores it, and
 * the validator enforces it. A JSON Schema `enum` over full token paths would have to be regenerated
 * every time a brand changed, which is exactly the coupling this format refuses.
 */
function clean(value) {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}

/**
 * TypeScript for a root node: one `export type` per shared definition actually used, dependencies
 * first, plus the root. A consumer that imports `SceneDocument` should not have to also know that
 * `LayoutBlock` exists.
 */
export function toTypeScript(root, { defs = {}, typeName = 'Document', description } = {}) {
  const ctx = { defs, emitted: [], pending: new Set(), done: new Set() };
  const body = tsOf(root, ctx, '');
  const rootBlock = typeBlock(typeName, body, description);
  return [...ctx.emitted.map(({ name, text, doc }) => typeBlock(name, text, doc)), rootBlock].join('\n\n') + '\n';
}

function typeBlock(name, body, description) {
  return [...(description ? wrapComment(description) : []), `export type ${name} =${body};`].join('\n');
}

/** Emit a named def once, after whatever it depends on. Self-referential defs just inline. */
function defType(name, ctx) {
  if (ctx.done.has(name) || ctx.pending.has(name)) return;
  ctx.pending.add(name);
  const node = ctx.defs[name];
  if (!node) throw new Error(`grammar: TypeScript projection has no definition "${name}"`);
  const body = tsOf(node, ctx, '');
  ctx.pending.delete(name);
  ctx.done.add(name);
  ctx.emitted.push({ name, text: body, doc: node.description });
}

function tsOf(node, ctx, indent) {
  const inner = `${indent}  `;
  switch (node.kind) {
    case 'ref':
      defType(node.name, ctx);
      return ` ${node.name}`;
    case 'const':
      return ` ${JSON.stringify(node.value)}`;
    case 'enum':
      return ` ${node.values.map((v) => JSON.stringify(v)).join(' | ')}`;
    case 'string':
    case 'tokenRef':
    case 'tokenOr':
      return ' string';
    case 'integer':
    case 'number':
      return ' number';
    case 'boolean':
      return ' boolean';
    case 'array':
      return ` Array<${tsOf(node.items, ctx, inner).trim()}>`;
    case 'map':
      return ` { [key: string]: ${tsOf(node.values, ctx, inner).trim()} }`;
    case 'union':
      return ` ${node.anyOf.map((branch) => tsOf(branch, ctx, inner).trim()).join(' | ')}`;
    case 'object': {
      const parts = Object.keys(node.shape)
        .sort()
        .map((key) => {
          const child = node.shape[key];
          const docs = child.description ? wrapComment(child.description, inner) : [];
          return [...docs, `${inner}${key}${child.optional ? '?' : ''}: ${tsOf(child, ctx, inner).trim()};`].join('\n');
        });
      if (!parts.length) return ' Record<string, never>';
      return ` {\n${parts.join('\n')}\n${indent}}`;
    }
    default:
      throw new Error(`grammar: cannot project TS for node kind "${node.kind}"`);
  }
}

/** Doc comments so the .d.ts carries the same reasoning as the schema, not just the shape. */
function wrapComment(text, indent = '') {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > 76) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return [`${indent}/**`, ...lines.map((l) => `${indent} * ${l}`), `${indent} */`];
}

/** Keys sorted, 2-space indent: the generated files must be byte-identical on every machine. */
export function serialize(value) {
  return stableStringify(value, 0);
}

function stableStringify(value, depth) {
  const pad = '  '.repeat(depth);
  const inner = '  '.repeat(depth + 1);
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((item) => `${inner}${stableStringify(item, depth + 1)}`).join(',\n')}\n${pad}]`;
  }
  const entries = Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  if (!entries.length) return '{}';
  return `{\n${entries
    .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${stableStringify(v, depth + 1)}`)
    .join(',\n')}\n${pad}}`;
}
