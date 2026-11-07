/**
 * The document formats: one entry point for validating a document, and one for generating the
 * published artifacts.
 *
 * `validateDocument` is the only authority on what a valid document is. The JSON Schema files in
 * `schema/` are a *projection* of it for other tools, not a second definition — which is why
 * `test/formats.test.js` regenerates them and fails if a byte differs.
 */

import { validate } from './grammar.js';
import { VERSION } from './common.js';
import { copy } from '../config/copy.js';

import * as scene from './scene.js';
import * as motion from './motion.js';
import * as settings from './settings.js';

export const FORMATS = Object.freeze({ scene, motion, settings });

/** What a file on disk is called, per format. The suffix is how a folder full of documents self-describes. */
export const EXTENSIONS = Object.freeze({
  scene: '.spark.scene.json',
  motion: '.spark.motion.json',
  settings: '.spark.settings.json',
});

export { tokenRegistry } from './settings.js';
// A design tool importing the formats gets the ease table too, because "is this curve in the list" is a
// question the author needs answered before they draw it, not after the build refuses them.
// `EASE_PATTERN` and `SAMPLE_MAX_KEYFRAMES` join the table here because a design tool needs the same two
// facts the compiler does: which names are legal, and how many samples a baked curve may cost.
export { parseEase, EASE_NAMES, EASE_PATTERN, KEYWORD_EASES, EASE_FAMILIES, SAMPLE_MAX_KEYFRAMES } from './eases.js';

/**
 * Validate one document.
 *
 * Three buckets, because there are three different facts:
 *   errors    — the document is wrong. Nothing is emitted.
 *   notices   — the document is legal and the author should probably reconsider.
 *   unresolved — a check that could not run because an input was missing. Never reported as passing.
 *
 * A `registry` (see `tokenRegistry`) is the set of dotted token paths a settings document declares.
 * Without it every token reference is `unresolved` rather than accepted: "we did not check" and "we
 * checked and it was fine" must not share a return value.
 */
export function validateDocument(kind, doc, { registry = null } = {}) {
  const format = FORMATS[kind];
  if (!format) return { valid: false, errors: [{ path: '', code: 'unknownKind', actual: kind }], notices: [], unresolved: [] };
  if (!isPlainObject(doc)) {
    return { valid: false, errors: [{ path: '', code: 'notAnObject' }], notices: [], unresolved: [] };
  }
  // Refused before the shape check: 30 shape errors on a document from a future version is noise
  // that hides the one fact that matters.
  if (doc.version !== VERSION) {
    return {
      valid: false,
      errors: [{ path: 'version', code: 'versionMismatch', implemented: VERSION, actual: doc.version }],
      notices: [],
      unresolved: [],
    };
  }

  const result = validate(format.root, doc, { defs: format.defs, registry });
  const errors = [...result.errors];
  const notices = [...result.notices];
  const unresolved = [...result.unresolved];
  const ran = [];

  for (const check of format.checks) {
    let outcome;
    try {
      outcome = check.run(doc, { registry, kind });
    } catch (error) {
      // A check that throws is our bug, and it must not be reported as the author's.
      errors.push({ path: '', code: 'checkCrashed', ruleId: check.id, actual: error.message });
      continue;
    }
    ran.push(check.id);
    const found = Array.isArray(outcome) ? outcome : (outcome?.found ?? []);
    for (const item of found) errors.push({ ...item, ruleId: check.id });
    for (const item of outcome?.notices ?? []) notices.push(item);
    for (const item of outcome?.unresolved ?? []) unresolved.push(item);
  }

  // `complete` is the field a surface must not skip: a document with nothing unresolved is a
// document we actually checked. When checks could not run, "valid" alone would read as a pass,
// which is the same lie as a bare score next to undecided findings.
  return {
    valid: errors.length === 0,
    complete: unresolved.length === 0,
    errors,
    notices,
    unresolved,
    checksRun: ran,
    kind,
  };
}

/** One line per problem, phrased in `config/copy.js` like every other sentence the product says. */
export function formatMessage(entry, { pathPrefix = 'document' } = {}) {
  const path = entry.path ? `${pathPrefix}.${entry.path}` : copy('format.root');
  const annotate = (message) => (entry.asType ? `${message} Checked as the "${entry.asType}" shape.` : message);
  switch (entry.code) {
    case 'unknownKind':
      return annotate(copy('format.unknownKind', entry.actual));
    case 'notAnObject':
      return annotate(copy('format.notAnObject'));
    case 'versionMismatch':
      return annotate(copy('format.versionMismatch', entry.implemented, entry.actual));
    case 'required':
      return annotate(copy('format.required', path, entry.expected));
    case 'type':
      return annotate(copy('format.type', path, entry.expected, entry.actual));
    case 'const':
      return annotate(copy('format.const', path, entry.expected, entry.actual));
    case 'enum':
      return annotate(copy('format.enum', path, entry.allowed, entry.actual));
    case 'pattern':
      return annotate(copy('format.pattern', path, entry.pattern, entry.actual));
    case 'keyPattern':
      return annotate(copy('format.keyPattern', path, entry.pattern, entry.actual));
    case 'minimum':
      return annotate(copy('format.minimum', path, entry.minimum, entry.actual));
    case 'maximum':
      return annotate(copy('format.maximum', path, entry.maximum, entry.actual));
    case 'minItems':
      return annotate(copy('format.minItems', path, entry.minItems, entry.actual));
    case 'minLength':
      return annotate(copy('format.minLength', path, entry.minLength, entry.actual));
    case 'maxLength':
      return annotate(copy('format.maxLength', path, entry.maxLength, entry.actual));
    case 'unknownKey':
      return annotate(copy('format.unknownKey', path, entry.allowed ?? [], entry.actual));
    case 'tokenGroup':
      return annotate(copy('format.tokenGroup', path, entry.groups, entry.actual));
    case 'unknownToken':
      return annotate(copy('format.unknownToken', path, entry.actual, entry.nearest));
    case 'literalValue':
      return annotate(copy('format.literalValue', path, entry.actual));
    case 'noBranch':
      return annotate(copy('format.noBranch', path, entry.branches, entry.actual, entry.notes));
    case 'unknownDiscriminator':
      return annotate(copy('format.unknownDiscriminator', path, entry.discriminator, entry.branches, entry.actual));
    case 'branchChosen':
      return annotate(copy('format.branchChosen', path, entry.chosen));
    case 'tokenUnresolved':
      return annotate(copy('format.tokenUnresolved', path, entry.actual));
    case 'checkCrashed':
      return `${path}: rule ${entry.ruleId} could not run (${entry.actual}). That is a bug in this tool, not in your document.`;
    default:
      // A semantic check's message goes through the same path prefix as a shape error, or the report
      // shows two spellings of one location and readers learn to ignore the difference.
      return annotate(entry.note ? copy('format.check', entry.ruleId, path, entry.note) : `${path}: ${entry.note ?? entry.code}`);
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
