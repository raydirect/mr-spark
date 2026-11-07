# Score Spec

**Version 3.0.0** · applies to `src/score.js` · published so anyone can reimplement it.

A score nobody can recompute is a slogan. This document is the definition, the rationale, and
the calibration table. If the code and this document disagree, the code is wrong.

---

## 1. What a score is, and is not

A score is a **summary of decided findings**, on a published curve, for one pillar.

It is not a conformance claim. Automated checking covers roughly **20–31% of accessibility
criteria** (about 57% of issue volume, because the dominant failures are the machine-detectable
ones). Absence of findings is not evidence of accessibility. Every surface that prints a score
must print that caveat next to it.

Two exclusions do the most work, and both are deliberate:

| Excluded | Why |
|---|---|
| **Undecided checks** (`coverage: "incomplete"`) | "We could not tell" is not damage. Counting it would make the score depend on the *runner's* capabilities rather than the *page's* quality — and would let a better runner lower a site's score for the same site. |
| **Unmeasured pillars** | Returned as `null`, rendered as `—`. An unmeasured pillar is a gap in the tool. Treating it as 100 is flattery; treating it as 0 is slander. |

---

## 2. Impact weights

| Impact | Weight | Meaning |
|---|---|---|
| `critical` | 10 | A user cannot complete the task at all |
| `serious` | 5 | A user is materially blocked or misled |
| `moderate` | 2 | Significant friction, workaround exists |
| `minor` | 1 | Friction, rarely blocking |

Undecided checks are carried at `minor` weight on the IR so they sort sensibly in reports, but
§1's exclusion means they contribute nothing to the score.

---

## 3. The curve

```
damage = Σ weight(finding)        for decided findings in the pillar
score  = round( 100 · K / (damage + K) )
K      = 40
```

Reasons for a hyperbola instead of a straight line:

- **A straight line flatters.** With linear scoring, two missing alt texts and no document
  language still reads like a pass.
- **Diminishing returns are honest.** The fiftieth contrast violation is not as damaging as the
  first one, and the curve says so without needing a cap.
- **It never reaches zero**, so `0` stays reserved for the degenerate case rather than becoming
  a routine verdict on an ordinary bad page.

---

## 3.5 Repetition is priced per root cause (new in 3.0.0)

The score was charged once per **finding**. A real page produced 88 findings from a single cause —
one missing landmark, reported once per element outside it — for damage 176 and a score of **19**.
That number reads as *"this page is catastrophic"* when the truth is *"this page has one structural
problem"*. Nobody acts on 19; they stop trusting the tool.

Findings are now grouped by `ruleId` — the **root cause** — and each group is charged its weight
once per instance, with a decaying charge:

```
charge(n) = 1 / (1 + (n − 1) · 0.5)         n = 1-based occurrence index
```

| occurrence | 1 | 2 | 3 | 4 | 5 | 10 | 20 |
|---|---|---|---|---|---|---|---|
| charge | 1.00 | 0.67 | 0.50 | 0.40 | 0.33 | 0.18 | 0.10 |

Properties this guarantees:

- **The first instance always carries the full weight.** The first missing label is the defect.
- **Repetition still costs something, monotonically, and never zero.** Six unlabelled inputs really
  is worse than one, and the fix is six edits.
- **No count is catastrophic.** 88 instances of a moderate rule is damage ≈16, not 176.
- **Variety is not discounted.** Six *different* critical rules still bottom out at 40 — the
  published anchor is unchanged.
- **A rule is priced at the worst impact it reported**, because the fix for a partially critical
  rule is the critical fix.

What did **not** change: every finding is still listed individually on every surface. The report
says "region ×6" and names all six. Aggregation is a pricing decision, never a reporting one —
hiding instances would be the dishonesty this whole document exists to prevent.

### Worked comparison

| Page | Findings | 2.0.0 | 3.0.0 |
|---|---|---|---|
| 88 × `region` (moderate), one missing landmark | 88 | **19** | **71** |
| 6 × different critical rules | 6 | 40 | **40** (unchanged) |
| 6 × instances of ONE critical rule | 6 | 40 | 56 |

---

## 4. Calibration table (frozen; these are tests)

| Case | Damage | Score |
|---|---|---|
| no decided findings | 0 | **100** |
| one critical | 10 | **80** |
| one serious | 5 | **89** |
| two critical + three serious | 35 | **53** |
| six critical | 60 | **40** |

Bands: `≥90 good` · `≥70 needs work` · `≥40 poor` · `<40 failing` · `null unmeasured`.

### Worked reference: the repository's known-bad fixture

The fixture is built from the failure classes that dominate the real web (missing alternative
text, unlabeled controls, an undecidable contrast pair, no declared language, no landmarks):

| Rule | Impact | Weight |
|---|---|---|
| `button-name` | critical | 10 |
| `image-alt` | critical | 10 |
| `html-has-lang` | serious | 5 |
| `link-name` ×2 | serious | 5 + 5 |
| `region` ×6 | moderate | 2 × 6 = 12 |

damage = 39.7048 (`region` ×6 is charged 2·(1 + 0.67 + 0.5 + 0.4 + 0.33 + 0.29) = 6.4, not 12)
→ `100 · 40 / 79.7` = **50**. Measured output: **≤ 50**. The known-good fixture: **≤ 100**.

**Why this number moved, and what it says about the spec.** The score was 53 until the
best-practice rules were enabled; `region` (content outside a landmark) found six more problems
in the same page. The curve did not change and the fixture did not change - the *tool saw more*.
That is the correct behaviour of a measurement, and it is also a warning worth stating plainly:
**a score is only comparable to another score taken with the same rule set.** Every report
prints the engine version and the score spec version for exactly this reason, and a baseline
that outlives a rule-set change must record both or its delta is meaningless.

---

## 5. Pillar aggregation

- Pillars are scored **independently** and never merged into one letter grade that hides a
  failure. A page with 100 performance and 20 accessibility is not a "B".
- `CONFORMANCE` is the arithmetic mean of **measured** pillars only, and the count of measured
  pillars is printed beside it. It is a convenience for dashboards, not the product; the pillar
  breakdown is the product.
- If no pillar is measured, conformance is `null`, not zero.

---

## 6. Versioning rules

- **Major** — a change that moves existing scores (curve, weights, exclusions).
- **Minor** — a new pillar becomes measured, or a new rule class is introduced.
- **Patch** — a wording or reporting change that cannot move a number.

Every report prints `score spec <version>`, and the JSON output carries it as `scoreSpec`, so a
consumer can tell whether two numbers are comparable. **A score without its spec version is not
a score.**

---

## 7. What would make this spec wrong

Stated openly, because the spec is only as good as its willingness to be falsified:

1. **Practitioner review disagrees with a band.** If accessibility engineers say 53 for the
   known-bad fixture is too generous or too harsh, the constant moves and the spec takes a
   major version.
2. **A real page scores high and is unusable.** Any such page enters the fixture set as a
   wrong-answer test, and the weights are re-examined.
3. **The exclusions hide a problem.** If excluding undecided checks lets a site look clean while
   its contrast is failing, the answer is a runner that can decide contrast — not a change to
   the exclusion.

---

## 8. Open calibration questions

- **Is contrast under-weighted?** It is the most common real-world failure by a wide margin, and
  in the browserless runner it is *undecidable*. Once the browser runner lands, re-check whether
  a contrast failure at `serious` reflects reality.
- **Should a failure in one pillar cap the conformance score?** Today a 100/20 site averages to
  60. Arguably it should read as 20-with-a-caveat. Deferred until there is field data.
- **Do landmarks belong in the score at all?** `bypass` is currently undecidable in the
  browserless runner; when it decides, it should probably weigh `moderate`, not `serious`.
- **Is `REPEAT_DECAY = 0.5` the right second parameter?** It was chosen so the second instance
  costs two thirds of the first. Both extremes are defensible: `0` would price variety only and
  make a page with 88 unlabelled inputs look like a page with one defect; `1` would restore linear
  charging and the 19 that started this. It needs field data from pages that fix findings, and a
  wrong answer here is a *quiet* wrong answer — it moves every score by a little.
- **Should the decay key on `ruleId` or on `ruleId + region of the page`?** Today it is the rule,
  so six unlabelled inputs in six different forms share one decay curve. If field review says that
  sells a bad page short, the key becomes the rule plus its enclosing component.
