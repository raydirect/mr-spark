/**
 * The generator for everything in `schema/`.
 *
 * Run `npm run formats:generate` to write, `--check` to verify. The committed files are artifacts,
 * not sources: `test/formats.test.js` regenerates all of them and fails on a single differing byte,
 * so a schema can never drift from the validator that produced it.
 *
 * No timestamp inside a generated file. A date would make "same input, same bytes" false, and that
 * property is the one the whole project is built on.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { serialize, toJsonSchema, toJsonSchemaDefs, toTypeScriptBundle } from './grammar.js';
import { DEFS, VERSION, SCHEMA_HOST } from './common.js';
import * as scene from './scene.js';
import * as motion from './motion.js';
import * as settings from './settings.js';

// Owned by ./common.js — one literal for the address, because it is also the `$schema` const every
// document must carry. Re-exported so `publish.js` and the tests keep one import path.
export { SCHEMA_HOST };
export const GENERATED_MARK = `GENERATED from src/formats/ — edit the format module, not this file. Regenerate with \`npm run formats:generate\`.`;

const FORMATS = [
  { kind: 'scene', module: scene },
  { kind: 'motion', module: motion },
  { kind: 'settings', module: settings },
];

/** The shared vocabulary, projected once so the three format files stay one grammar. */
export const COMMON_FILE = 'schema/common-0.1.json';
export const TYPES_FILE = 'schema/types-0.1.d.ts';
export const INDEX_FILE = 'schema/index.json';

export function formatFile(kind) {
  return `schema/${kind}-0.1.json`;
}

/** Every file this generator owns, keyed by repository-relative path. */
export function render() {
  const files = {};
  const sharedDefs = { ...DEFS };
  // Format-specific definitions are merged for the type projection: one `.d.ts` has one namespace,
  // so `layoutBlock` and `motionDefaults` live beside `length` rather than in three files.
  const allDefs = Object.fromEntries(FORMATS.flatMap(({ module }) => Object.entries(module.defs)).sort(([a], [b]) => (a < b ? -1 : 1)));

  files[COMMON_FILE] =
    serialize(
      toJsonSchemaDefs(sharedDefs, {
        id: `${SCHEMA_HOST}/common-0.1.json`,
        title: 'Shared vocabulary for web-spark documents',
        description: 'Ids, lengths, durations, colours, token references and eases — defined once, referenced by all three formats.',
        comment: GENERATED_MARK,
      }),
    ) + '\n';

  for (const { kind, module: format } of FORMATS) {
    const schema = toJsonSchema(format.root, {
      id: `${SCHEMA_HOST}/${kind}-${VERSION}.json`,
      title: `${kind[0].toUpperCase()}${kind.slice(1)} document`,
      description: format.description,
      comment: `${GENERATED_MARK} Shape only: the semantic rules (${format.checks.map((c) => c.id).sort().join(', ')}) are enforced by src/formats/${kind}.js and cannot travel with this file.`,
      defs: { ...sharedDefs, ...format.defs },
    });
    files[formatFile(kind)] = serialize(schema) + '\n';
  }

  files[TYPES_FILE] =
    `/**\n * ${GENERATED_MARK}\n *\n * One declaration file for all three formats, generated from the same descriptors that\n * generate the JSON Schemas and the runtime validator.\n */\n\n` +
    toTypeScriptBundle(
      allDefs,
      FORMATS.map(({ kind, module: format }) => ({
        typeName: `${kind[0].toUpperCase()}${kind.slice(1)}Document`,
        root: format.root,
        description: format.description,
      })),
    );

  const digest = (text) => createHash('sha256').update(text).digest('hex');
  files[INDEX_FILE] =
    serialize({
      $comment: `${GENERATED_MARK} A consumer can pin one release of the formats by hashing this manifest; the schema URLs inside a document are stable, the bytes behind them are not assumed to be.`,
      version: VERSION,
      // The manifest lists what it describes and never itself: a file cannot carry its own hash and
      // still mean anything.
      files: Object.fromEntries(
        Object.keys(files)
          .filter((path) => path !== INDEX_FILE)
          .sort()
          .map((path) => [path, { sha256: digest(files[path]), bytes: Buffer.byteLength(files[path]) }]),
      ),
    }) + '\n';

  return files;
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Read a committed artifact, for `--check`. Returns null when it is missing entirely. */
export function readCommitted(path) {
  try {
    return readFileSync(ROOT + path, 'utf8');
  } catch {
    return null;
  }
}

export function main(argv = process.argv.slice(2)) {
  const files = render();
  const mode = argv[0] === '--check' ? 'check' : 'write';
  const drift = [];
  for (const [path, text] of Object.entries(files)) {
    if (mode === 'check') {
      if (readCommitted(path) !== text) drift.push(path);
      continue;
    }
    mkdirSync(ROOT + path.split('/').slice(0, -1).join('/'), { recursive: true });
    writeFileSync(ROOT + path, text);
  }
  if (mode === 'check') {
    if (drift.length) {
      process.stderr.write(
        `schema/ is out of date with src/formats/ (${drift.join(', ')}). Run \`npm run formats:generate\` and commit the result.\n`,
      );
      return 1;
    }
    process.stdout.write(`schema/ is current: ${Object.keys(files).length} files, every byte as generated.\n`);
    return 0;
  }
  process.stdout.write(`wrote ${Object.keys(files).length} files under schema/\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  process.exitCode = main();
}
