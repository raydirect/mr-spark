/**
 * Identity and versions, read from ONE place.
 *
 * The report previously printed a hardcoded engine version while package.json said something
 * else, so a report could overstate the engine that produced it. Provenance that is not derived
 * from the artifact is not provenance. `package.json` is now the only definition of the version.
 */

import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export const NAME = 'web-spark';
export const BIN = 'spark';

/** The version of the engine and the CLI. Single source: package.json. */
export const VERSION = pkg.version;

export const HOMEPAGE = pkg.homepage ?? null;

/** Report identifier length. Short enough to quote, long enough to collide ~never. */
export const ID_LENGTH = 12;
