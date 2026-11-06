/**
 * WCAG 2.x contrast maths. Dependency-free, and deliberately the ONLY implementation in the
 * repository — the token test and the future browser runner will both import this, so a bug
 * here is fixed once and a passing test cannot disagree with the tool's own verdicts.
 *
 * Reference: WCAG 2.1, 1.4.3 (contrast, minimum) and the relative-luminance definition in
 * "relative luminance" of the same document.
 */

const HEX = /^#([0-9a-f]{6})$/i;

/** sRGB channel (0-255) -> linearised channel, per the WCAG definition. */
function linearise(channel) {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a `#rrggbb` colour, 0 (black) to 1 (white). */
export function luminance(hex) {
  const match = HEX.exec(String(hex));
  if (!match) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = match[1].match(/../g).map((pair) => linearise(parseInt(pair, 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Contrast ratio, 1 to 21. Order-independent by definition: (lighter + 0.05) / (darker + 0.05).
 * Rounded to four places so thresholds can be asserted exactly without float noise.
 */
export function contrastRatio(a, b) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 10000) / 10000;
}

/**
 * Which band a ratio lands in. Text needs 4.5:1 (3:1 for large text), non-text UI boundaries
 * that carry meaning need 3:1. Returns the failing threshold, or null when it passes.
 */
export function contrastVerdict(ratio, minimum) {
  if (ratio >= minimum) return null;
  return { ratio, minimum, shortfall: Math.round((minimum - ratio) * 100) / 100 };
}
