/**
 * Suppression — the escape hatch that keeps a gate alive.
 *
 * Why this exists. A real page had a honeypot input: a deliberately unlabelled text field used to
 * trap bots. The verifier correctly reported `label` as a critical finding, and the finding was
 * useless — nobody can act on it, because the "defect" is the feature. The alternatives in that
 * situation are to disable the rule, disable the gate, or lie; all three end with the tool turned
 * off. So there has to be a legitimate way to say "this one is deliberate".
 *
 * Three rules keep the hatch from becoming a hole:
 *
 *  1. **A suppression must state a reason.** No reason, no suppression — the config fails to load.
 *     A bare ignore cannot be reviewed, and an unreviewable ignore is how debt hides.
 *  2. **A suppression is scoped.** It matches a rule id, and optionally one selector. It cannot
 *     suppress a rule everywhere by omission of `selector` unless it says `"all": true`, which is
 *     a deliberate, visible act.
 *  3. **A suppression is printed.** Every surface counts suppressed findings and the report lists
 *     each one with its reason. The number never disappears; it moves from "problems" to
 *     "problems you said you know about".
 *
 * An expired suppression does not suppress: it is reported as stale, because the common failure of
 * an ignore list is that it outlives the reason it was written for.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const CONFIG_FILENAME = 'spark.config.json';

/** Raised for a config that is structurally wrong or asks for something unsafe. */
export class ConfigError extends Error {
  constructor(message, path = CONFIG_FILENAME) {
    super(`${path}: ${message}`);
    this.name = 'ConfigError';
    this.path = path;
  }
}

const SUPPRESSION_KEYS = new Set(['ruleId', 'selector', 'reason', 'expires', 'all']);
/**
 * The config keys. `baseline` lives here as well as on the command line because the choice of gate file is
 * a property of the *project*, not of the invocation: a CI workflow that passes `--baseline` by hand is a
 * workflow that can silently point at the wrong file.
 */
const TOP_LEVEL_KEYS = new Set(['$schema', 'version', 'suppress', 'baseline']);

/**
 * Validate and normalise a config object. Returns `{ suppressions }` with defaults filled in.
 * Throws `ConfigError` rather than warning: a config that half-works is worse than none.
 */
export function parseConfig(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigError('must be a JSON object');
  }
  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_KEYS.has(key)) throw new ConfigError(`unknown key "${key}"`);
  }
  if (raw.baseline !== undefined && (typeof raw.baseline !== 'string' || !raw.baseline.trim())) {
    throw new ConfigError('"baseline" must be a path, as a string');
  }

  const list = raw.suppress ?? [];
  if (!Array.isArray(list)) throw new ConfigError('"suppress" must be an array');

  const suppressions = list.map((entry, index) => {
    const where = `suppress[${index}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ConfigError(`${where} must be an object`);
    }
    for (const key of Object.keys(entry)) {
      if (!SUPPRESSION_KEYS.has(key)) throw new ConfigError(`${where} has unknown key "${key}"`);
    }
    if (typeof entry.ruleId !== 'string' || entry.ruleId.trim() === '') {
      throw new ConfigError(`${where}.ruleId is required`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 10) {
      throw new ConfigError(`${where}.reason is required and must say something (10+ characters)`);
    }
    const all = entry.all === true;
    if (!all && (typeof entry.selector !== 'string' || entry.selector.trim() === '')) {
      throw new ConfigError(
        `${where} must name a "selector", or set "all": true to suppress ${entry.ruleId} everywhere`
      );
    }
    if (entry.expires !== undefined && Number.isNaN(Date.parse(entry.expires))) {
      throw new ConfigError(`${where}.expires must be an ISO date`);
    }
    return Object.freeze({
      ruleId: entry.ruleId,
      selector: all ? null : entry.selector,
      all,
      reason: entry.reason.trim(),
      expires: entry.expires ?? null,
    });
  });

  return { suppressions, baseline: raw.baseline ?? null };
}

/** Read a config file. A missing file is not an error — it means "no suppressions". */
export async function loadConfig(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return { suppressions: [], baseline: null, path: null };
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new ConfigError(`is not valid JSON (${cause.message})`, path);
  }
  try {
    return { ...parseConfig(raw), path };
  } catch (error) {
    // Re-raised with the path, so a `--config` pointed at the wrong file is obvious rather than
    // looking like the default file is broken.
    throw new ConfigError(error.message.replace(`${CONFIG_FILENAME}: `, ''), path);
  }
}

/** The config path a run should use: the project directory, or the target's own directory. */
export function configPathFor(cwd = process.cwd()) {
  return resolve(cwd, CONFIG_FILENAME);
}

/**
 * Apply suppressions to an IR in place, returning a report of what happened.
 *
 * Suppressed findings stay in `ir.findings` carrying `suppressed: true` and the reason. They are
 * excluded from the score by `countsTowardScore`, and counted by every surface. Deleting them
 * would make the report lie about what the page contains.
 */
export function applySuppressions(ir, suppressions, now = new Date()) {
  const applied = [];
  const expired = [];
  const unmatched = [];

  const active = [];
  for (const suppression of suppressions) {
    if (suppression.expires && Date.parse(suppression.expires) < now.getTime()) {
      expired.push(suppression);
      continue;
    }
    active.push(suppression);
  }

  const used = new Set();
  for (const finding of ir.findings) {
    const match = active.find(
      (s) => s.ruleId === finding.ruleId && (s.all || s.selector === finding.selector)
    );
    if (!match) continue;
    finding.suppressed = true;
    finding.suppressionReason = match.reason;
    used.add(match);
    applied.push({ finding, suppression: match });
  }

  for (const suppression of active) {
    if (!used.has(suppression)) unmatched.push(suppression);
  }

  // A suppression that matched nothing is stale: the finding it was written for is gone. Reported
  // rather than fatal, because deleting a fixed finding is the correct outcome and the config
  // should then be pruned, not the build broken.
  return { applied, expired, unmatched };
}
