/**
 * Score bands — the thresholds that turn a number into a word.
 *
 * These were previously retyped in three files (score.js, reporters/html.js,
 * reporters/terminal.js). Any edit to one produced a page whose colour disagreed with its own
 * label. There is now exactly one definition, and every surface asks for it.
 *
 * `min` is inclusive. Order matters: highest threshold first.
 */

export const BANDS = Object.freeze([
  Object.freeze({ id: 'good', min: 90, label: 'good', tone: 'good' }),
  Object.freeze({ id: 'needs-work', min: 70, label: 'needs work', tone: 'warn' }),
  Object.freeze({ id: 'poor', min: 40, label: 'poor', tone: 'bad' }),
  Object.freeze({ id: 'failing', min: 0, label: 'failing', tone: 'bad' }),
]);

/** The band for a score, or `unmeasured` for null — a gap, never a zero. */
export function band(score) {
  if (score === null || score === undefined) return 'unmeasured';
  const match = BANDS.find((b) => score >= b.min);
  return match ? match.label : 'failing';
}

/** The band a score belongs to, including its colour tone name. Useful to every surface. */
export function bandOf(score) {
  if (score === null || score === undefined) {
    return Object.freeze({ id: 'unmeasured', label: 'unmeasured', tone: 'none' });
  }
  return BANDS.find((b) => score >= b.min) ?? BANDS[BANDS.length - 1];
}

/** CSS class suffix for a score. Surfaces map `tone` to their own presentation. */
export function tone(score) {
  return bandOf(score).tone;
}
