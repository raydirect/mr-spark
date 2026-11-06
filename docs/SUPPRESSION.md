# Suppression

A gate that cannot be told "yes, this one is deliberate" gets switched off entirely.

This document defines `spark.config.json`, the only configuration file web-spark reads. It exists
because of a real page: a newsletter signup with a honeypot field — an unlabelled text input,
hidden from people, that only a bot fills. The verifier correctly reported `label` as a
**critical** violation. The finding was true and it was useless. The alternatives were to switch
off the rule, switch off the gate, or lie about the page. All three end with the tool uninstalled.

So suppression is a first-class feature with three properties, and the properties matter more than
the mechanism.

## 1. Rules of the hatch

**A suppression must state a reason.** Not a string that exists — a reason long enough to be a
sentence. `spark.config.json` with a blank or two-character reason fails to load, and the CLI exits
`2` with the file path and the offending entry index. An ignore list nobody can review is where
debt hides.

**A suppression is scoped.** It names a rule id and one selector, or sets `"all": true` to waive
that rule everywhere. Waiving a whole rule is a deliberate, visible act in the config, not
something that happens because a field was left out.

**A suppression is printed.** Every surface counts suppressed findings and the terminal and report
list each one with its reason. The number never disappears; it moves from "problems" to "problems
you said you know about". A waiver that only exists as a count is indistinguishable from a rule
that was quietly switched off.

## 2. The file

```json
{
  "version": 1,
  "suppress": [
    {
      "ruleId": "label",
      "selector": "#website",
      "reason": "Deliberate honeypot field: hidden from people and screen readers, filled only by bots. It must stay unlabelled.",
      "expires": "2027-06-01"
    }
  ]
}
```

| Key | Required | Meaning |
|---|---|---|
| `version` | no | Format version. `1` today; anything else is a hard error so an old engine cannot silently misread a newer file. |
| `suppress` | no | Array of waivers. Absent or empty means nothing is suppressed. |
| `suppress[].ruleId` | **yes** | The rule to waive, exactly as printed in a finding. |
| `suppress[].selector` | yes, unless `all` | One selector. It must match the finding's selector exactly — no globs, no prefixes, no descendant matching. Exact matching is why a waiver cannot quietly grow to cover elements it was never written for. |
| `suppress[].all` | no | `true` waives `ruleId` on every element. |
| `suppress[].reason` | **yes** | 10+ characters. Printed on every surface that mentions the finding. |
| `suppress[].expires` | no | ISO date. An expired waiver stops suppressing and is reported as expired. |

Unknown top-level keys and unknown keys inside a waiver are errors, not warnings. A typo in
`selector` is the difference between a waiver and a no-op, and a config that half-works is worse
than a config that refuses to load.

## 3. Where it is read from

`spark check <target>` looks for `spark.config.json` in the working directory. `--config <path>`
overrides it. A missing file is not an error: no config means no waivers, which is the common case.

The config is validated **before** the score is published, so a broken config cannot produce a
number that looks authoritative.

## 4. What a waiver does to the numbers

A suppressed finding:

- **stays in the IR** with `suppressed: true` and `suppressionReason`. It is not deleted. The page
  still contains the thing; a report that pretends otherwise is a lie that compounds.
- **does not move the score.** Scoring counts decided *and not suppressed* findings.
- **is counted everywhere**: the pillar line, the findings list, the JSON `summary.suppressed`, the
  JSON `suppressions` array (with reasons), and the HTML report.
- **is excluded from `--quiet`**. Quiet mode is a machine contract read by gates, and a waived
  finding listed there would fail a build the config said should pass.

Suppression is a *different axis* from decidedness. "We could not tell" and "we were told this is
deliberate" are different facts about a page, and a surface that merges them is overstating its
confidence in one direction or hiding a decision in the other.

## 5. Stale waivers

Two ways a waiver goes stale, both reported and neither fatal:

- **Expired** — `expires` has passed. The finding is live again, and the waiver is listed as
  expired so somebody has to re-justify it.
- **Unmatched** — it suppressed nothing, because the finding it was written for is gone. The
  correct response is to delete the waiver; the tool reports it rather than failing, because the
  fix having landed is a good outcome.

Neither is an error for the same reason: the failure mode of an ignore list is that it outlives
the reason it was written for, and a build that breaks when that happens trains people to delete
the tool.

## 6. What this cannot do

- It cannot waive a **bucket** of rules in one line. If you want to switch off the verifier, edit
  the code, and say so in review — there is no `"disable": true` here on purpose.
- It cannot waive by impact (`"impact": "minor"`). Impact is a property of how a rule presents,
  not a thing a page owner gets to reclassify.
- It cannot hide a waiver from a report. There is no `"silent": true`, and there will not be one.
- It does not make a suppressed page compliant. It records that a person looked, decided, and
  wrote down why. The finding remains in the IR and in every score's *inputs*, even though it does
  not appear in the number.
