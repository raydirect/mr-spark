/**
 * GENERATED from src/formats/ — edit the format module, not this file. Regenerate with `npm run formats:generate`.
 *
 * One declaration file for all three formats, generated from the same descriptors that
 * generate the JSON Schemas and the runtime validator.
 */

/**
 * An opacity multiplier between 0 and 1, in canonical form.
 */
export type alpha = string;

/**
 * A curve from the ease table. An unlisted name is an error, never a fallback
 * to `ease`.
 */
export type easing = "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out" | "power1.in" | "power1.out" | "power1.inOut" | "power2.in" | "power2.out" | "power2.inOut" | "power3.in" | "power3.out" | "power3.inOut" | "power4.in" | "power4.out" | "power4.inOut" | "quad.in" | "quad.out" | "quad.inOut" | "cubic.in" | "cubic.out" | "cubic.inOut" | "quart.in" | "quart.out" | "quart.inOut" | "quint.in" | "quint.out" | "quint.inOut" | "sine.in" | "sine.out" | "sine.inOut" | "circ.in" | "circ.out" | "circ.inOut" | "expo.in" | "expo.out" | "expo.inOut" | "bounce.in" | "bounce.out" | "bounce.inOut" | string;

export type tokenRef = string;

/**
 * A length. Viewport units are absent on purpose: a size that changes with the
 * window cannot be checked against a spacing scale.
 */
export type length = string;

/**
 * A 6-digit hex colour, lowercase. No alpha channel — a translucent token is a
 * contrast commitment waiting to be broken.
 */
export type color = string;

/**
 * A document-local identifier. Ids are the only way one document names a thing
 * in another.
 */
export type id = string;

export type animation = {
  duration?: string;
  easing?: easing;
  /**
   * The properties to animate, and their values. This *is* the property list: it
   * is never declared a third time.
   */
  from?: { [key: string]: tokenRef | length | alpha | color | string };
  id?: id;
  impactFloor?: "subtle" | "noticeable" | "intense";
  intent?: "entrance" | "exit" | "emphasis" | "feedback" | "decorative";
  reducedMotion?: "instant" | "fade" | "none";
  /**
   * Extra plays. `0` is once, `"infinite"` never ends — one field, two
   * spellings, and a loop worth a type.
   */
  repeat?: number | "infinite";
  repeatDelay?: string;
  stagger?: {
    /**
     * Only meaningful with a two-dimensional set; absent means "tree order".
     */
    axis?: "x" | "y";
    each: string;
    from?: "start" | "center" | "end" | "edges";
  };
  target: {
    /**
     * Apply across this component's children — the only set a motion document may
     * address, because the tree is known at build time.
     */
    each?: "children";
    /**
     * A component id in the scene document. Not a CSS selector: a selector matches
     * nodes the compiler has not decided about, and "which elements does this
     * animate" must be answerable from the document.
     */
    id: id;
  };
  /**
   * The properties to animate, and their values. This *is* the property list: it
   * is never declared a third time.
   */
  to?: { [key: string]: tokenRef | length | alpha | color | string };
  trigger?: {
    /**
     * For `on: "state"`, the machine whose state change fires this.
     */
    machine?: id;
    on: "load" | "visible" | "state" | "hover" | "focus" | "click" | "scroll";
    /**
     * The state that fires it. `open`, not "when the menu is open".
     */
    state?: string;
  };
  yoyo?: boolean;
};

/**
 * A token name → a colour or a block.
 */
export type colorBlock = { [key: string]: color | colorBlock };

/**
 * A dotted path inside `color.<theme>`. Theme-relative, because a contrast
 * commitment is the same statement in every theme.
 */
export type colorPath = string;

/**
 * A component from the built-in vocabulary.
 */
export type componentVariant = {
    /**
     * A container with no children is an empty box; author a child or drop the
     * container.
     */
    children?: Array<componentVariant>;
    id?: id;
    props?: Record<string, never>;
    type: "stack";
  } | {
    /**
     * A container with no children is an empty box; author a child or drop the
     * container.
     */
    children?: Array<componentVariant>;
    id?: id;
    props?: Record<string, never>;
    type: "grid";
  } | {
    /**
     * A container with no children is an empty box; author a child or drop the
     * container.
     */
    children?: Array<componentVariant>;
    id?: id;
    props?: {
      /**
       * A region without a name is not a landmark a screen reader can offer as a
       * destination.
       */
      label: string;
      role?: "region" | "form" | "search" | "navigation";
    };
    type: "region";
  } | {
    id?: id;
    props?: {
      /**
       * The heading level. It is authored because a compiler that guesses it
       * produces a page with three h1s.
       */
      level: number;
      /**
       * The visible text. A heading with no text is a section the reader cannot
       * name.
       */
      text: string;
    };
    type: "heading";
  } | {
    id?: id;
    props?: {
      as?: "p" | "span" | "figcaption" | "blockquote" | "lead";
      size?: string;
      text: string;
    };
    type: "text";
  } | {
    id?: id;
    props?: {
      /**
       * The emitter adds `rel="noopener"` for this; it is not authored, so it cannot
       * be forgotten.
       */
      external?: boolean;
      /**
       * A real destination. `#` alone is not one — see SCENE006.
       */
      href: string;
      label: string;
    };
    type: "link";
  } | {
    id?: id;
    props?: {
      disabled?: boolean;
      /**
       * The accessible name. There is no icon-only button in v1: an icon without a
       * text label cannot be checked, translated, or read.
       */
      label: string;
      tone?: string;
      /**
       * Defaults to `button`, which is the safe default and the one that never
       * submits a form by accident.
       */
      type?: "button" | "submit";
    };
    type: "button";
  } | {
    id?: id;
    props?: {
      /**
       * Required, and `""` is a legal answer: it means decorative, which is a
       * statement, not an omission.
       */
      alt: string;
      height?: string;
      /**
       * An asset id from `assets`, or an absolute URL. A bare filename that is not a
       * declared asset is a broken image waiting for production.
       */
      src: string;
      width?: string;
    };
    type: "image";
  } | {
    id?: id;
    props?: {
      autocomplete?: string;
      kind: "text" | "email" | "tel" | "url" | "number" | "password" | "search" | "checkbox" | "radio" | "date";
      /**
       * Required. A placeholder is not a label, and a field authored without one
       * cannot be emitted with one.
       */
      label: string;
      name: string;
      required?: boolean;
    };
    type: "input";
  } | {
    /**
     * A container with no children is an empty box; author a child or drop the
     * container.
     */
    children?: Array<componentVariant>;
    id?: id;
    props?: {
      ordered?: boolean;
    };
    type: "list";
  } | {
    id?: id;
    props?: {
      label: string;
      options: Array<{
          disabled?: boolean;
          label: string;
          value: string;
        }>;
      value?: string;
    };
    type: "listbox";
  };

/**
 * A CSS value: a font stack, a grid track list, a width. Values are allowed;
 * declarations are not.
 */
export type cssValue = string;

/**
 * A duration. Bare numbers are absent: `200` is not a fact about time until it
 * says what unit it is in.
 */
export type duration = string;

/**
 * A BCP-47 tag for the page language. It is authored, never guessed:
 * `lang="en"` on a French page is a wrong promise to every screen reader.
 */
export type lang = string;

export type layoutBlock = {
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  cols?: string;
  display?: "block" | "flex" | "grid" | "inline-flex";
  gap?: string;
  justify?: "start" | "center" | "end" | "stretch" | "between" | "around" | "evenly";
  margin?: string;
  maxWidth?: string;
  minWidth?: string;
  pad?: string;
  responsive?: { [key: string]: layoutBlock };
  rows?: string;
  span?: number;
};

export type meta = {
  /**
   * Free text for the humans who inherit this file.
   */
  description?: string;
  /**
   * What this document calls itself. Appears in report provenance and in the
   * studio tab.
   */
  name: string;
  /**
   * The version of what this document describes — the brand, the kit. Not the
   * format version, which is the root `version`.
   */
  version?: string;
};

export type motionDefaults = {
  duration?: string;
  easing?: easing;
  intent?: "entrance" | "exit" | "emphasis" | "feedback" | "decorative";
  reducedMotion?: "instant" | "fade" | "none";
  repeat?: number | "infinite";
  yoyo?: boolean;
};

/**
 * A style value: a token reference if the store has one, otherwise a literal.
 */
export type propertyValue = tokenRef | length | alpha | duration | cssValue;

/**
 * A theme key, e.g. "light".
 */
export type themeName = string;

/**
 * A token name → a value or a block.
 */
export type valueBlock = { [key: string]: propertyValue | valueBlock };

export type tokenStoreInline = {
  color?: { [key: string]: colorBlock };
  layout?: valueBlock;
  motion?: { [key: string]: duration };
  radius?: { [key: string]: length };
  space?: { [key: string]: length };
  type?: valueBlock;
};

/**
 * Structure, layout, states and assets for one page. Compiles to semantic HTML
 * and CSS, and nothing else.
 */
export type SceneDocument = {
  /**
   * The schema this document claims to satisfy. Required, so a document cannot
   * be validated against the wrong vocabulary by accident.
   */
  $schema: "https://mr-spark.pages.dev/schema/scene-0.1.json";
  a11y?: {
    landmarks?: Array<{
        /**
         * The component that carries this landmark. One id, so the mapping is
         * auditable rather than implied.
         */
        contains: id;
        role: "banner" | "navigation" | "main" | "complementary" | "contentinfo" | "search" | "form" | "region";
      }>;
    /**
     * Emitted as the first focusable element on the page, pointing at `main`.
     */
    skipLink?: boolean;
  };
  assets?: Array<{
      /**
       * Fallback alt text for an asset used without an explicit `alt`.
       */
      altDefault?: string;
      id: id;
      kind: "svg" | "png" | "jpg" | "webp" | "avif" | "woff2";
      /**
       * Relative to this document. An absolute path is a build that only works on
       * one machine.
       */
      path: string;
      /**
       * Content address. A changed file with an unchanged hash is a build error, not
       * a warning.
       */
      sha256: string;
    }>;
  components: Array<componentVariant>;
  layout?: { [key: string]: layoutBlock };
  meta: {
    /**
     * Free text for the humans who inherit this file.
     */
    description?: string;
    lang?: lang;
    /**
     * What this document calls itself. Appears in report provenance and in the
     * studio tab.
     */
    name: string;
    title?: string;
    /**
     * The version of what this document describes — the brand, the kit. Not the
     * format version, which is the root `version`.
     */
    version?: string;
  };
  /**
   * Component id → state → property → value.
   */
  states?: { [key: string]: { [key: string]: {
        background?: string;
        border?: string;
        color?: string;
        opacity?: tokenRef | alpha;
        outline?: string;
        radius?: string;
        shadow?: string;
      } } };
  /**
   * Either `{"$ref": "./brand.spark.settings.json"}` or, for a self-contained
   * document, the token groups written inline. A scene with no `tokens` at all
   * can only use literal values, and every one of them is a lint.
   */
  tokens?: {
      $ref: string;
    } | tokenStoreInline;
  /**
   * The format version this document is written against. This build implements
   * "0.1" and refuses every other.
   */
  version: "0.1";
};

/**
 * Time, sequencing and state machines for a page, with the semantic intent
 * each animation exists to serve.
 */
export type MotionDocument = {
  /**
   * The schema this document claims to satisfy. Required, so a document cannot
   * be validated against the wrong vocabulary by accident.
   */
  $schema: "https://mr-spark.pages.dev/schema/motion-0.1.json";
  animations?: Array<{
      duration?: string;
      easing?: easing;
      /**
       * The properties to animate, and their values. This *is* the property list: it
       * is never declared a third time.
       */
      from?: { [key: string]: tokenRef | length | alpha | color | string };
      id?: id;
      impactFloor?: "subtle" | "noticeable" | "intense";
      intent?: "entrance" | "exit" | "emphasis" | "feedback" | "decorative";
      reducedMotion?: "instant" | "fade" | "none";
      /**
       * Extra plays. `0` is once, `"infinite"` never ends — one field, two
       * spellings, and a loop worth a type.
       */
      repeat?: number | "infinite";
      repeatDelay?: string;
      stagger?: {
        /**
         * Only meaningful with a two-dimensional set; absent means "tree order".
         */
        axis?: "x" | "y";
        each: string;
        from?: "start" | "center" | "end" | "edges";
      };
      target: {
        /**
         * Apply across this component's children — the only set a motion document may
         * address, because the tree is known at build time.
         */
        each?: "children";
        /**
         * A component id in the scene document. Not a CSS selector: a selector matches
         * nodes the compiler has not decided about, and "which elements does this
         * animate" must be answerable from the document.
         */
        id: id;
      };
      /**
       * The properties to animate, and their values. This *is* the property list: it
       * is never declared a third time.
       */
      to?: { [key: string]: tokenRef | length | alpha | color | string };
      trigger?: {
        /**
         * For `on: "state"`, the machine whose state change fires this.
         */
        machine?: id;
        on: "load" | "visible" | "state" | "hover" | "focus" | "click" | "scroll";
        /**
         * The state that fires it. `open`, not "when the menu is open".
         */
        state?: string;
      };
      yoyo?: boolean;
    }>;
  defaults?: motionDefaults;
  machines?: { [key: string]: {
      initial: string;
      states: { [key: string]: {
          /**
           * Animation or timeline ids to run on entry.
           */
          effects?: Array<id>;
          on?: { [key: string]: string };
        } };
    } };
  meta: {
    /**
     * Free text for the humans who inherit this file.
     */
    description?: string;
    /**
     * What this document calls itself. Appears in report provenance and in the
     * studio tab.
     */
    name: string;
    /**
     * The version of what this document describes — the brand, the kit. Not the
     * format version, which is the root `version`.
     */
    version?: string;
  };
  timelines?: Array<{
      /**
       * Applies to this timeline's items unless they say otherwise.
       */
      defaults?: motionDefaults;
      id: id;
      intent?: "entrance" | "exit" | "emphasis" | "feedback" | "decorative";
      items: Array<{
            at?: string;
            ref: id;
          } | {
            /**
             * Where this starts relative to the rest of the timeline. `<` = with the
             * previous item; `>` = after it; `+=0.2s` = a gap; `label:name` = an anchor
             * declared on the timeline.
             */
            at?: string;
            duration?: string;
            easing?: easing;
            /**
             * The properties to animate, and their values. This *is* the property list: it
             * is never declared a third time.
             */
            from?: { [key: string]: tokenRef | length | alpha | color | string };
            impactFloor?: "subtle" | "noticeable" | "intense";
            intent?: "entrance" | "exit" | "emphasis" | "feedback" | "decorative";
            reducedMotion?: "instant" | "fade" | "none";
            /**
             * Extra plays. `0` is once, `"infinite"` never ends — one field, two
             * spellings, and a loop worth a type.
             */
            repeat?: number | "infinite";
            repeatDelay?: string;
            stagger?: {
              /**
               * Only meaningful with a two-dimensional set; absent means "tree order".
               */
              axis?: "x" | "y";
              each: string;
              from?: "start" | "center" | "end" | "edges";
            };
            target: {
              /**
               * Apply across this component's children — the only set a motion document may
               * address, because the tree is known at build time.
               */
              each?: "children";
              /**
               * A component id in the scene document. Not a CSS selector: a selector matches
               * nodes the compiler has not decided about, and "which elements does this
               * animate" must be answerable from the document.
               */
              id: id;
            };
            /**
             * The properties to animate, and their values. This *is* the property list: it
             * is never declared a third time.
             */
            to?: { [key: string]: tokenRef | length | alpha | color | string };
            trigger?: {
              /**
               * For `on: "state"`, the machine whose state change fires this.
               */
              machine?: id;
              on: "load" | "visible" | "state" | "hover" | "focus" | "click" | "scroll";
              /**
               * The state that fires it. `open`, not "when the menu is open".
               */
              state?: string;
            };
            yoyo?: boolean;
          }>;
      labels?: { [key: string]: string };
      trigger?: {
        /**
         * For `on: "state"`, the machine whose state change fires this.
         */
        machine?: id;
        on: "load" | "visible" | "state" | "hover" | "focus" | "click" | "scroll";
        /**
         * The state that fires it. `open`, not "when the menu is open".
         */
        state?: string;
      };
    }>;
  /**
   * The format version this document is written against. This build implements
   * "0.1" and refuses every other.
   */
  version: "0.1";
};

/**
 * Configuration as data: the token store, the contrast commitments, and the
 * description of the panel that edits them.
 */
export type SettingsDocument = {
  /**
   * The schema this document claims to satisfy. Required, so a document cannot
   * be validated against the wrong vocabulary by accident.
   */
  $schema: "https://mr-spark.pages.dev/schema/settings-0.1.json";
  /**
   * Theme name → colour block. Checked against `meta.themes` by SETTINGS001.
   */
  color: { [key: string]: colorBlock };
  contrast: {
    /**
     * Non-text boundaries: rules, borders, severity bars.
     */
    impactPairs?: Array<{
        /**
         * The background it sits on.
         */
        bg: colorPath;
        /**
         * The foreground colour, theme-relative.
         */
        fg: colorPath;
        /**
         * The promise for this pair. Omit to inherit the bucket minimum from
         * `contrast.minimum`.
         */
        min?: number;
      }>;
    minimum: {
      /**
       * The default promise for a `pairs` entry: WCAG AA body text is 4.5.
       */
      text: number;
      /**
       * The default promise for a boundary that carries meaning: WCAG non-text
       * contrast is 3.
       */
      ui: number;
    };
    /**
     * Text-on-background commitments. A colour that appears nowhere here ships
     * unchecked, so the list is required and not empty.
     */
    pairs: Array<{
        /**
         * The background it sits on.
         */
        bg: colorPath;
        /**
         * The foreground colour, theme-relative.
         */
        fg: colorPath;
        /**
         * The promise for this pair. Omit to inherit the bucket minimum from
         * `contrast.minimum`.
         */
        min?: number;
      }>;
  };
  controls?: Array<{
      /**
       * Section heading in the panel.
       */
      group: string;
      label: string;
      max?: number;
      min?: number;
      options?: Array<string>;
      /**
       * The token this control writes, e.g. `color.link` or `space.lg`.
       */
      path: tokenRef;
      step?: number;
      /**
       * The editor. `slider` needs `min` and `max`; the control type must suit the
       * group it writes (SETTINGS003).
       */
      type: "color" | "slider" | "select" | "toggle" | "text";
      /**
       * Defaults to false. A control is read-only until a brand says otherwise.
       */
      writable?: boolean;
    }>;
  layout?: valueBlock;
  meta: {
    /**
     * Free text for the humans who inherit this file.
     */
    description?: string;
    /**
     * What this document calls itself. Appears in report provenance and in the
     * studio tab.
     */
    name: string;
    /**
     * Every theme the brand ships. Each one must define the same colour keys — a
     * theme that "inherits" a colour is a report that renders one hex on another
     * hex.
     */
    themes: Array<themeName>;
    /**
     * The version of what this document describes — the brand, the kit. Not the
     * format version, which is the root `version`.
     */
    version?: string;
  };
  motion?: { [key: string]: duration | valueBlock };
  radius?: { [key: string]: length | valueBlock };
  space?: { [key: string]: length | valueBlock };
  type?: valueBlock;
  /**
   * The format version this document is written against. This build implements
   * "0.1" and refuses every other.
   */
  version: "0.1";
};
