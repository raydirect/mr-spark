/**
 * The token store, loaded and validated once at import time.
 *
 * Three rules this file exists to enforce:
 *
 *  1. There is exactly ONE definition of any visual value, and it lives in tokens.json.
 *     Renderers read tokens; they never write a hex code, a spacing value or a radius.
 *  2. The contrast pairs are declared as data next to the colours, so a new foreground
 *     colour cannot ship unchecked — if it is not in `contrast.pairs`, the test fails.
 *  3. Values are validated on import, not on first use. A malformed token file should break
 *     loudly at startup, in development, rather than render a subtly wrong report in front of
 *     a user. Fail fast beats fail quiet.
 */

import { readFileSync } from 'node:fs';

export const TOKENS = JSON.parse(
  readFileSync(new URL('./tokens.json', import.meta.url), 'utf8')
);

const HEX = /^#[0-9a-f]{6}$/i;

/** Thrown on a structurally invalid token file. Distinct type so callers can be precise. */
export class TokenError extends Error {
  constructor(message) {
    super(`tokens.json: ${message}`);
    this.name = 'TokenError';
  }
}

/** Every theme block must define the same keys as every other, or a theme silently inherits. */
function assertThemesMirrored(tokens) {
  const themes = tokens.meta.themes;
  const keysOf = (theme) => {
    const out = new Set();
    for (const [group, value] of Object.entries(theme)) {
      if (value && typeof value === 'object') {
        for (const key of Object.keys(value)) out.add(`${group}.${key}`);
      } else {
        out.add(group);
      }
    }
    return out;
  };
  const [first, ...rest] = themes.map((t) => keysOf(tokens.color[t]));
  for (const [index, keys] of rest.entries()) {
    for (const key of first) {
      if (!keys.has(key)) {
        throw new TokenError(`theme "${themes[index + 1]}" is missing "${key}"`);
      }
    }
    for (const key of keys) {
      if (!first.has(key)) {
        throw new TokenError(`theme "${themes[index + 1]}" has extra "${key}"`);
      }
    }
  }
}

/** Resolve a dotted token path (e.g. `impact.critical`) inside one theme of one token set. */
function lookup(tokens, theme, path) {
  const block = tokens.color?.[theme];
  if (!block) throw new TokenError(`unknown theme "${theme}"`);
  const value = path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), block);
  if (typeof value !== 'string') {
    throw new TokenError(`theme "${theme}" has no colour at "${path}"`);
  }
  return value;
}

/** Look a colour token up by theme and dotted path. */
export function colorToken(theme, path) {
  return lookup(TOKENS, theme, path);
}

/** Referenced by both the renderer and the test — one definition of "the pair list". */
export function contrastPairs(tokens = TOKENS) {
  return [...tokens.contrast.pairs, ...tokens.contrast.impactPairs];
}

export function assertTokensValid(tokens = TOKENS) {
  if (!Array.isArray(tokens.meta?.themes) || tokens.meta.themes.length === 0) {
    throw new TokenError('meta.themes must list at least one theme');
  }
  for (const theme of tokens.meta.themes) {
    const block = tokens.color?.[theme];
    if (!block) throw new TokenError(`colour block for theme "${theme}" is missing`);
    const walk = (node, prefix) => {
      for (const [key, value] of Object.entries(node)) {
        if (value && typeof value === 'object') walk(value, `${prefix}${key}.`);
        else if (!HEX.test(value)) {
          throw new TokenError(`${theme} colour "${prefix}${key}" is not a 6-digit hex: ${value}`);
        }
      }
    };
    walk(block, '');
  }
  assertThemesMirrored(tokens);

  // Every pair must resolve in every theme, and declare a minimum. Catching this here means
  // the renderer cannot silently fall back to a default colour for a missing token.
  const pairs = [...(tokens.contrast?.pairs ?? []), ...(tokens.contrast?.impactPairs ?? [])];
  if (pairs.length === 0) throw new TokenError('contrast.pairs must not be empty');
  for (const theme of tokens.meta.themes) {
    for (const pair of pairs) {
      lookup(tokens, theme, pair.fg);
      lookup(tokens, theme, pair.bg);
      if (typeof pair.min !== 'number') {
        throw new TokenError(`contrast pair ${pair.fg}/${pair.bg} has no numeric minimum`);
      }
    }
  }

  for (const group of ['space', 'radius', 'type', 'layout', 'motion']) {
    if (!tokens[group] || typeof tokens[group] !== 'object') {
      throw new TokenError(`missing token group "${group}"`);
    }
  }
  return true;
}

// Validate on import: a broken token file must not reach a renderer.
assertTokensValid(TOKENS);

/** `#abc123` -> `18 193 35`, for rgba() composition without inventing new colours. */
export function rgbTriplet(hex) {
  if (!HEX.test(hex)) throw new TokenError(`cannot decompose "${hex}"`);
  const [r, g, b] = hex.slice(1).match(/../g).map((pair) => parseInt(pair, 16));
  return `${r} ${g} ${b}`;
}
