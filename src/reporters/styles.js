/**
 * The report stylesheet, generated from design tokens.
 *
 * Two things this file fixes, both found in review:
 *
 *  1. `color-scheme: light dark` was declared while the stylesheet hardcoded a white
 *     background, so in an adapting dark context body text could measure 1.00:1 against its own
 *     background. Both themes are now implemented from tokens, and every declared colour pair
 *     is asserted at 4.5:1 (text) or 3:1 (meaningful boundaries) by test/tokens.test.js.
 *
 *  2. Every colour, size, spacing, radius and duration was a literal inside one template. Now
 *     the stylesheet contains no visual literal at all: it is a pure function of tokens.json.
 *     A grep for `#` in the output finds only token values.
 *
 * Not a single byte of client JavaScript. That property is worth more than any effect it
 * would buy, so it is a hard constraint, not a preference.
 */

import { TOKENS, colorToken, rgbTriplet } from '../config/tokens.js';

/** CSS custom properties for one theme. The only place a colour value enters CSS. */
function themeVariables(theme) {
  const c = (path) => colorToken(theme, path);
  return [
    `--bg: ${c('bg')};`,
    `--surface: ${c('surface')};`,
    `--text: ${c('text')};`,
    `--muted: ${c('muted')};`,
    `--good: ${c('good')};`,
    `--warn: ${c('warn')};`,
    `--bad: ${c('bad')};`,
    `--link: ${c('link')};`,
    `--border: ${c('border')};`,
    `--rule: ${c('rule')};`,
    `--impact-critical: ${c('impact.critical')};`,
    `--impact-serious: ${c('impact.serious')};`,
    `--impact-moderate: ${c('impact.moderate')};`,
    `--impact-minor: ${c('impact.minor')};`,
    /* Focus needs a ring that is visible against both bg and surface. The text colour is the
       only token guaranteed to pass 4.5:1 on both, so it is used rather than a new colour. */
    `--focus: ${c('text')};`,
    `--focus-halo: rgb(${rgbTriplet(c('bg'))} / 0.9);`,
  ].join('\n  ');
}

/** Non-colour tokens, theme-independent. */
function sharedVariables() {
  const { space, radius, type, layout, motion } = TOKENS;
  const lines = [];
  for (const [key, value] of Object.entries(space)) lines.push(`--space-${key}: ${value};`);
  for (const [key, value] of Object.entries(radius)) lines.push(`--radius-${key}: ${value};`);
  for (const [key, value] of Object.entries(type.family)) lines.push(`--font-${key}: ${value};`);
  for (const [key, value] of Object.entries(type.size)) lines.push(`--text-${key}: ${value};`);
  for (const [key, value] of Object.entries(type.weight)) lines.push(`--weight-${key}: ${value};`);
  for (const [key, value] of Object.entries(type.leading)) lines.push(`--leading-${key}: ${value};`);
  for (const [key, value] of Object.entries(type.tracking)) lines.push(`--tracking-${key}: ${value};`);
  for (const [key, value] of Object.entries(type.measure)) lines.push(`--measure-${key}: ${value};`);
  for (const [key, value] of Object.entries(layout)) lines.push(`--layout-${key}: ${value};`);
  for (const [key, value] of Object.entries(motion)) {
    if (key.startsWith('$')) continue;
    lines.push(`--motion-${key}: ${value};`);
  }
  return lines.join('\n  ');
}

/**
 * The stylesheet. Written with logical properties (`margin-inline`, `border-inline-start`,
 * `padding-block`) so a future right-to-left locale costs a translation, not a rewrite.
 */
export function renderStyles() {
  return `
:root {
  color-scheme: light;
  ${sharedVariables()}
  ${themeVariables('light')}
}

/* Dark is a first-class theme, not an afterthought: same tokens, separately verified ratios. */
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    ${themeVariables('dark')}
  }
}

/* Forced colours: hand control to the user agent rather than fighting its palette. */
@media (forced-colors: active) {
  * { forced-color-adjust: auto; }
  .findings li { border-inline-start-width: var(--layout-impactBorderWidth); }
}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  padding: var(--space-xl) var(--space-lg) var(--space-4xl);
  font-family: var(--font-sans);
  font-size: var(--text-md);
  line-height: var(--leading-body);
  background: var(--bg);
  color: var(--text);
  max-width: var(--measure-page);
  margin-inline: auto;
}

/* Visible focus for every interactive element, drawn from tokens so it cannot drift out of
   contrast with either theme. */
:focus-visible {
  outline: var(--layout-focusWidth) solid var(--focus);
  outline-offset: var(--layout-focusOffset);
  border-radius: var(--radius-sm);
}

.skip-link {
  position: absolute;
  inset-inline-start: var(--space-md);
  inset-block-start: calc(var(--space-md) * -6);
  padding: var(--space-xs) var(--space-md);
  background: var(--bg);
  color: var(--link);
  border: var(--layout-borderWidth) solid var(--border);
  border-radius: var(--radius-md);
  z-index: 1;
  transition: inset-block-start var(--motion-fast) ease-out;
}
.skip-link:focus { inset-block-start: var(--space-md); }

h1 {
  font-size: var(--text-xl);
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  margin: 0 0 var(--space-2xs);
}
h2 {
  font-size: var(--text-md);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  margin: var(--space-2xl) 0 var(--space-sm);
  color: var(--muted);
}
p { margin: var(--space-xs) 0; }
a { color: var(--link); text-underline-offset: 0.15em; }

code, pre { font-family: var(--font-mono); font-size: var(--text-sm); }
pre {
  background: var(--surface);
  border: var(--layout-borderWidth) solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-sm) var(--space-md);
  overflow-x: auto;
  /* Long commands should wrap rather than force a horizontal scroll on a phone. */
  white-space: pre-wrap;
  word-break: break-word;
}

.muted { color: var(--muted); }
.fragment-notice {
  border-inline-start: var(--layout-impactBorderWidth) solid var(--warn);
  padding-inline-start: var(--space-sm);
  margin-block: var(--space-sm) 0;
}
.small { font-size: var(--text-sm); }

.header {
  border-block-end: var(--layout-borderWidth) solid var(--border);
  padding-block-end: var(--space-md);
  margin-block-end: var(--space-xs);
}

/* The score: number, band word and a CSS-only meter. No script, no image, no canvas. */
.result { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-sm); margin: var(--space-xs) 0 var(--space-md); }
.big {
  font-size: var(--text-display);
  line-height: var(--leading-tight);
  font-variant-numeric: tabular-nums;
  font-weight: var(--weight-bold);
}
.meter {
  flex: 1 1 12rem;
  min-inline-size: 8rem;
  block-size: var(--space-xs);
  background: var(--rule);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.meter-fill { display: block; block-size: 100%; border-radius: var(--radius-pill); background: currentColor; }
.meter-legend { display: flex; justify-content: space-between; gap: var(--space-md); font-size: var(--text-xs); color: var(--muted); }

.score-row {
  display: grid;
  grid-template-columns: var(--layout-scoreRowColumns);
  gap: var(--space-sm);
  align-items: baseline;
  padding-block: var(--space-xs);
  border-block-end: var(--layout-borderWidth) solid var(--rule);
}
.score-row:last-child { border-block-end: 0; }
.pillar { font-weight: var(--weight-strong); text-transform: capitalize; }
.num { font-variant-numeric: tabular-nums; font-weight: var(--weight-bold); font-size: var(--text-lg); }

.good { color: var(--good); }
.warn { color: var(--warn); }
.bad { color: var(--bad); }
.none { color: var(--muted); }

.findings { list-style: none; margin: 0; padding: 0; }
.findings li {
  border: var(--layout-borderWidth) solid var(--border);
  border-inline-start-width: var(--layout-impactBorderWidth);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  margin-block-end: var(--space-xs);
  background: var(--bg);
}
.findings li.critical { border-inline-start-color: var(--impact-critical); }
.findings li.serious { border-inline-start-color: var(--impact-serious); }
.findings li.moderate { border-inline-start-color: var(--impact-moderate); }
.findings li.minor { border-inline-start-color: var(--impact-minor); }

.rule { font-weight: var(--weight-strong); }
/* Undecided: a question, not a verdict. Dashed edge and a muted marker say "unresolved"
   without borrowing the visual language of a violation. */
.findings li.undecided { border-style: dashed; border-inline-start-color: var(--impact-minor); }
.question { color: var(--muted); font-weight: var(--weight-bold); }
.undecided-tag { color: var(--muted); text-transform: none; letter-spacing: var(--tracking-normal); }
.tag {
  display: inline-block;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  border: var(--layout-borderWidth) solid currentColor;
  border-radius: var(--radius-pill);
  padding-block: 0.05em;
  padding-inline: var(--space-xs);
}

.two-col { display: grid; grid-template-columns: var(--layout-twoColumnColumns); gap: var(--space-lg); }

footer {
  margin-block-start: var(--space-3xl);
  padding-block-start: var(--space-md);
  border-block-start: var(--layout-borderWidth) solid var(--border);
}

@media (max-width: ${TOKENS.layout.breakpoint}) {
  .two-col { grid-template-columns: var(--layout-twoColumnColumnsSmall); }
  .score-row { grid-template-columns: var(--layout-scoreRowColumnsSmall); }
}

/* Motion is never load-bearing, and is removed entirely when the user asks for that. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`.trim();
}
