/**
 * The motion document — `.spark.motion.json`.
 *
 * Time, states, and the field nobody else requires: `intent`. The verifier reasons from intent, so
 * the format has to be able to say which of these it is looking at — an entrance that outstays its
 * welcome, or a decorative loop that never stops.
 *
 * Two rules do most of the work here:
 *
 * - **Every fact the verifier needs is in the document.** `repeat`, `stagger`, `duration` and the
 *   reduced-motion fallback are fields, not effects of emitted CSS. A loop the checker cannot see is
 *   a hazard it cannot price.
 * - **Nothing is computed at play time.** No function values, no `from`-only tweens, no implicit
 *   overwrite, no springs. Each of those is a fact about the frame rather than a fact about the
 *   document, and a document that omits them is verifiable instead of plausible.
 *
 * The vocabulary — timelines with a position parameter, `defaults`, named eases, `stagger` — is
 * borrowed from the authoring model of the industry's animation libraries. The runtime is not, and
 * `docs/LIMITS.md §8` says why in their licence's own words.
 */

import { t } from './grammar.js';
import { DEFS, VERSION, schemaUrl, formatVersion, tokenOr } from './common.js';
import { parseEase } from './eases.js';

export const INTENTS = Object.freeze(['entrance', 'exit', 'emphasis', 'feedback', 'decorative']);
export const REDUCED_MOTION = Object.freeze(['instant', 'fade', 'none']);
export const IMPACT_LEVELS = Object.freeze(['subtle', 'noticeable', 'intense']);
export const TRIGGERS = Object.freeze(['load', 'visible', 'state', 'hover', 'focus', 'click', 'scroll']);

/**
 * What may be animated. Transform-level only: `width`, `height`, `top`, `left` and `margin` are
 * absent, so a loop can never trigger layout, and the format refuses that *for every* motion rather
 * than only for looped motion. `docs/DOCUMENTS.md §2` states the reason; the closed key list is what
 * makes it true.
 */
export const MOTION_PROPERTIES = Object.freeze([
  'opacity',
  'translateX',
  'translateY',
  'scale',
  'rotate',
  'color',
  'background',
]);

/** `<` and `>` are relative to the previous item; `+=`/`-=` are offsets; `label:` anchors. */
const AT = '^(?:<|>|[+-]=\\d+(?:\\.\\d+)?(?:ms|s)?|label:[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$';

const DURATION = tokenOr('duration', ['motion']);
const PROPERTY_MAP = t.map(
  t.union([t.ref('tokenRef'), t.ref('length'), t.ref('alpha'), t.ref('color'), t.string({ pattern: '^-?\\d+(?:\\.\\d+)?(?:deg|turn|px|%)$' })], {
    description: 'A starting or ending value for one property.',
  }),
  {
    keyPattern: `^(?:${MOTION_PROPERTIES.join('|')})$`,
    description: 'The properties to animate, and their values. This *is* the property list: it is never declared a third time.',
  },
);

const TARGET = t.object({
  id: t.ref('id', { description: 'A component id in the scene document. Not a CSS selector: a selector matches nodes the compiler has not decided about, and "which elements does this animate" must be answerable from the document.' }),
  each: t.opt(t.enum(['children'], { description: 'Apply across this component\'s children — the only set a motion document may address, because the tree is known at build time.' })),
});

/**
 * What starts a motion. A timeline needs one too: a sequence with no trigger is a page that stays at
 * opacity 0 forever, which is the failure this whole check exists to catch (MOTION003).
 */
const TRIGGER = t.object({
  on: t.enum([...TRIGGERS]),
  machine: t.opt(t.ref('id', { description: 'For `on: "state"`, the machine whose state change fires this.' })),
  state: t.opt(t.string({ pattern: '^[a-z][a-z0-9]*$', description: 'The state that fires it. `open`, not "when the menu is open".' })),
});

const STAGGER = t.object({
  each: DURATION,
  from: t.opt(t.enum(['start', 'center', 'end', 'edges'])),
  axis: t.opt(t.enum(['x', 'y'], { description: 'Only meaningful with a two-dimensional set; absent means "tree order".' })),
});

/** The fields shared by a top-level animation and an inline timeline item. */
function motionFields() {
  return {
    intent: t.opt(t.enum([...INTENTS])),
    trigger: t.opt(TRIGGER),
    target: TARGET,
    stagger: t.opt(STAGGER),
    from: t.opt(PROPERTY_MAP),
    to: t.opt(PROPERTY_MAP),
    duration: t.opt(DURATION),
    easing: t.opt(t.ref('easing')),
    repeat: t.opt(t.union([t.integer({ minimum: 0, maximum: 999 }), t.const('infinite')], { description: 'Extra plays. `0` is once, `"infinite"` never ends — one field, two spellings, and a loop worth a type.' })),
    yoyo: t.opt(t.boolean()),
    repeatDelay: t.opt(DURATION),
    reducedMotion: t.opt(t.enum([...REDUCED_MOTION])),
    /**
     * A floor, not a dial. The compiler computes severity from travel, scale, rotation, area,
     * duration and looping; an author may say "treat this as at least `intense`" and the compiler
     * raises to it. There is deliberately no field that lowers a computed severity — that would put
     * the guarantee under the control of the person being graded.
     */
    impactFloor: t.opt(t.enum([...IMPACT_LEVELS])),
  };
}

/**
 * A top-level animation. `id` is what a timeline references, and a machine effect names — an
 * animation without one can only ever be played on its own trigger.
 */
const ANIMATION = t.object({ id: t.opt(t.ref('id')), ...motionFields() });

const TIMELINE_ITEM = t.object({
  at: t.opt(t.string({ pattern: AT, description: 'Where this starts relative to the rest of the timeline. `<` = with the previous item; `>` = after it; `+=0.2s` = a gap; `label:name` = an anchor declared on the timeline.' })),
  ...motionFields(),
});

const TIMELINE = t.object({
  id: t.ref('id'),
  intent: t.opt(t.enum([...INTENTS])),
  /** Fires every item that does not declare its own trigger. */
  trigger: t.opt(TRIGGER),
  defaults: t.opt(t.ref('motionDefaults', { description: 'Applies to this timeline\'s items unless they say otherwise.' })),
  labels: t.opt(
    t.map(t.string({ pattern: '^\\d+(?:\\.\\d+)?(?:ms|s)$', description: 'An absolute position on this timeline. Items point at labels with `at: "label:name"`.' }), {
      keyPattern: DEFS.id.pattern,
    }),
  ),
  items: t.array(
    t.union([
      t.object({ ref: t.ref('id'), at: t.opt(t.string({ pattern: AT })) }),
      TIMELINE_ITEM,
    ], { description: 'Either `{ "ref": "an-animation-id" }` or the animation written inline.' }),
    { minItems: 1 },
  ),
});

export const root = t.object({
  $schema: schemaUrl('motion', VERSION),
  version: formatVersion(VERSION),
  meta: DEFS.meta,

  /** Root defaults: inherited by every animation and timeline item, overridable at any level. */
  defaults: t.opt(t.ref('motionDefaults')),

  animations: t.opt(t.array(ANIMATION, { minItems: 1 })),
  timelines: t.opt(t.array(TIMELINE, { minItems: 1 })),

  /**
   * UI as states rather than a pile of booleans. The machine is the only place a motion document may
   * be triggered by something other than load or visibility, which is what keeps "it moves when you
   * hover" auditable against "it moves and never stops".
   */
  machines: t.opt(
    t.map(
      t.object({
        initial: t.string({ pattern: '^[a-z][a-z0-9]*$' }),
        states: t.map(
          t.object({
            on: t.opt(t.map(t.string({ pattern: '^[a-z][a-z0-9]*$' }, { description: 'The state this event moves to.' }))),
            effects: t.opt(t.array(t.ref('id'), { minItems: 1, description: 'Animation or timeline ids to run on entry.' })),
          }),
          { keyPattern: '^[a-z][a-z0-9]*$' },
        ),
      }),
      { keyPattern: DEFS.id.pattern },
    ),
  ),
});

export const name = 'motion';
export const description =
  'Time, sequencing and state machines for a page, with the semantic intent each animation exists to serve.';

export const defs = {
  ...DEFS,
  animation: ANIMATION,
  motionDefaults: t.object({
    duration: t.opt(DURATION),
    easing: t.opt(t.ref('easing')),
    reducedMotion: t.opt(t.enum([...REDUCED_MOTION])),
    intent: t.opt(t.enum([...INTENTS])),
    repeat: t.opt(t.union([t.integer({ minimum: 0, maximum: 999 }), t.const('infinite')])),
    yoyo: t.opt(t.boolean()),
  }),
};

/* ---------------------------------------------------------------- semantic checks */

/**
 * Resolve one field the way `lower()` will: item, then timeline, then timeline defaults, then root
 * defaults. Checks resolve the same way the compiler does, or the document that validates is not the
 * document that gets emitted — which is the whole failure mode of a schema-only validator.
 */
/** Animation ids that some timeline item references. */
export function referencedIds(doc) {
  const ids = new Set();
  for (const tl of doc?.timelines ?? []) {
    for (const item of tl?.items ?? []) if (item?.ref) ids.add(item.ref);
  }
  return ids;
}

export function resolveField(doc, motion, meta, field) {
  const timeline = meta?.timeline;
  for (const candidate of [motion?.[field], timeline?.[field], timeline?.defaults?.[field], doc?.defaults?.[field]]) {
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

export function forEachMotion(doc, visit) {
  (doc.animations ?? []).forEach((anim, index) => visit(anim, `animations[${index}]`, { topLevel: true }));
  // `topLevel` is what lets a check ignore an animation whose timing — and therefore whose intent —
  // belongs to the timeline that references it.
  (doc.timelines ?? []).forEach((tl, ti) => {
    (tl.items ?? []).forEach((item, ii) => {
      const at = `timelines[${ti}].items[${ii}]`;
      if (item?.ref) {
        const resolved = (doc.animations ?? []).find((a) => a?.id === item.ref);
        if (resolved) visit({ ...item, ...resolved }, at, { timeline: tl });
        return;
      }
      visit(item, at, { timeline: tl });
    });
  });
}

export const checks = [
  {
    id: 'MOTION001',
    message: 'a timeline item either references a declared animation or describes one, never both and never neither',
    run(doc) {
      const found = [];
      const declared = new Set((doc.animations ?? []).map((a) => a?.id).filter(Boolean));
      const referenced = new Set();
      (doc.timelines ?? []).forEach((tl, ti) => {
        (tl.items ?? []).forEach((item, ii) => {
          const at = `timelines[${ti}].items[${ii}]`;
          const keys = Object.keys(item ?? {}).filter((key) => !key.startsWith('$'));
          if (item?.ref) {
            referenced.add(item.ref);
            if (!declared.has(item.ref)) {
              found.push({ path: `${at}.ref`, note: `"${item.ref}" is not an id in \`animations\`. A dangling reference is a timeline with a hole in it` });
            }
            if (keys.some((key) => key !== 'ref' && key !== 'at')) {
              found.push({ path: at, note: `cannot both reference "${item.ref}" and redefine ${keys.filter((k) => k !== 'ref' && k !== 'at').join(', ')}; say which one wins` });
            }
            return;
          }
          if (!('to' in (item ?? {})) && !('from' in (item ?? {}))) {
            found.push({ path: at, note: 'an item with no `ref`, no `to` and no `from` animates nothing' });
          }
        });
      });
      // A referenced animation that also declares its own trigger has two entry points, and the page
      // then plays it twice. The timeline owns the timing of anything it references.
      (doc.animations ?? []).forEach((anim, index) => {
        if (anim?.id && referenced.has(anim.id) && anim.trigger) {
          found.push({ path: `animations[${index}].trigger`, note: `"${anim.id}" is referenced by a timeline and declares its own trigger, so it plays twice — the timeline is the trigger` });
        }
        // And the reverse: unreferenced and untriggered is a declaration that runs never, which is
        // either dead code or an author who meant to put it in a timeline.
        if (anim?.id && !referenced.has(anim.id) && !anim.trigger) {
          found.push({ path: `animations[${index}]`, note: `"${anim.id}" is not referenced by any timeline and has no trigger, so nothing will ever run it` });
        }
      });
      return found;
    },
  },
  {
    id: 'MOTION002',
    message: 'stagger only means something across a set',
    run(doc) {
      const found = [];
      forEachMotion(doc, (motion, at) => {
        if (!motion?.stagger) return;
        if (motion.target?.each !== 'children') {
          found.push({ path: `${at}.stagger`, note: 'a stagger needs `target: { id: …, each: "children" }`. One element cannot be staggered against itself' });
        }
      });
      return found;
    },
  },
  {
    id: 'MOTION003',
    message: 'an entrance that starts invisible must finish without the reader doing anything',
    run(doc) {
      const found = [];
      forEachMotion(doc, (motion, at, meta) => {
        const intent = resolveField(doc, motion, meta, 'intent');
        const startsHidden = motion.from && 'opacity' in motion.from && Number(motion.from.opacity) === 0;
        if (!startsHidden || intent !== 'entrance') return;
        // An item's trigger, or the timeline's. Nothing else can start a sequence.
        const trigger = motion.trigger ?? meta?.timeline?.trigger;
        const on = trigger?.on;
        if (on === 'load' || on === 'visible' || on === 'state') return;
        found.push({
          path: meta?.timeline ? `${at}.trigger` : `${at}.trigger.on`,
          note: `an \`entrance\` from opacity 0 ${on ? `triggered on "${on}"` : 'with nothing to trigger it'} hides content until the reader interacts. That is a content-visibility bug in an animation costume, and it is invisible to a checker that only sees the finished page`,
        });
      });
      return found;
    },
  },
  {
    id: 'MOTION004',
    message: 'intent must be resolvable from the item, its timeline, or root defaults',
    run(doc) {
      const found = [];
      forEachMotion(doc, (motion, at, meta) => {
        if (resolveField(doc, motion, meta, 'intent') !== undefined) return;
        // A top-level animation that a timeline references takes its intent (and its fallback) from
        // that timeline, so the item is where the error belongs, not the declaration.
        if (meta?.topLevel && referencedIds(doc).has(motion.id)) return;
        found.push({ path: `${at}.intent`, note: `no \`intent\` here, on its timeline, or in root defaults — expected one of "${INTENTS.join(' | ')}". Intent is what lets the verifier tell a slow entrance from a runaway loop instead of guessing from numbers` });
      });
      return found;
    },
  },
  {
    id: 'MOTION005',
    message: 'anything that is not decoration must say what reduced motion does',
    run(doc) {
      const found = [];
      forEachMotion(doc, (motion, at, meta) => {
        if (resolveField(doc, motion, meta, 'intent') === 'decorative') return;
        if (resolveField(doc, motion, meta, 'reducedMotion') !== undefined) return;
        // A top-level animation that a timeline references takes its intent (and its fallback) from
        // that timeline, so the item is where the error belongs, not the declaration.
        if (meta?.topLevel && referencedIds(doc).has(motion.id)) return;
        found.push({ path: `${at}.reducedMotion`, note: 'required for every animation with intent other than `decorative`. A global kill switch is not a design: `instant`, `fade` and `none` are different answers, and only the author knows which one this page means' });
      });
      return found;
    },
  },
  {
    id: 'MOTION006',
    message: 'every ease must be in the ease table',
    run(doc) {
      const found = [];
      const seen = new Set();
      const checkEase = (value, at) => {
        if (typeof value !== 'string' || seen.has(`${at}:${value}`)) return;
        if (!parseEase(value)) {
          found.push({ path: `${at}`, note: `"${value}" is not in the ease table. An unlisted name is an error rather than a fallback to \`ease\`, because a silent substitution is how intent is lost` });
        }
      };
      checkEase(doc.defaults?.easing, 'defaults.easing');
      (doc.timelines ?? []).forEach((tl, ti) => checkEase(tl.defaults?.easing, `timelines[${ti}].defaults.easing`));
      forEachMotion(doc, (motion, at) => checkEase(motion.easing, `${at}.easing`));
      return found;
    },
  },
  {
    id: 'MOTION007',
    message: 'machine transitions and effects must point at things that exist',
    run(doc) {
      const found = [];
      const motionIds = new Set([...(doc.animations ?? []).map((a) => a?.id), ...(doc.timelines ?? []).map((t2) => t2?.id)].filter(Boolean));
      for (const [id, machine] of Object.entries(doc.machines ?? {})) {
        if (id === '$comment') continue;
        const states = machine?.states ?? {};
        if (!(machine?.initial in states)) {
          found.push({ path: `machines.${id}.initial`, note: `"${machine?.initial}" is not one of the declared states (${Object.keys(states).join(', ') || 'none'})` });
        }
        for (const [state, body] of Object.entries(states)) {
          for (const [event, next] of Object.entries(body?.on ?? {})) {
            if (next in states) continue;
            found.push({ path: `machines.${id}.states.${state}.on.${event}`, note: `leads to "${next}", which is not a state of this machine` });
          }
          (body?.effects ?? []).forEach((effect, index) => {
            if (!motionIds.has(effect)) {
              found.push({ path: `machines.${id}.states.${state}.effects[${index}]`, note: `"${effect}" is neither an animation id nor a timeline id in this document` });
            }
          });
        }
      }
      return found;
    },
  },
];
