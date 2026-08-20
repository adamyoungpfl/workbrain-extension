# The improvement report — what may and may not be claimed

## Two classes of evidence. Never blend them.

| | Proof loop | History trend |
|---|---|---|
| Design | Within-subject controlled comparison — same person, same question, same model, minutes apart, once without the file and once with | Observational |
| Supports | *Attaching this file changed the answer.* A causal claim. | *This is what changed.* Nothing more. |
| Weakness | One question, one moment | Cannot separate the file from everything else that moved |

Both appear in the report, labelled. The product's credibility rests on never letting the
second wear the first's clothes.

## Metrics

| Metric | Definition | Confidence |
|---|---|---|
| Setup tax | Median chars of context before the first ask | **Strong** — deterministic, identical measure both sides |
| Correction rate | Corrective turns + branch points, per conversation | **Strong** |
| Things you no longer say | Of the audit's repeated phrases, how many appeared in the last 30 days | **Strongest** — named, specific, countable, ideally zero |
| Re-asks per topic | Distinct days a topic recurred | Moderate — report as a range |
| Turns to done | Median exchanges per conversation | **Weak proxy** — a chat can end because it worked or because they gave up. Show it, caveat it. |
| Rubric score | Their own AI's grade, with and without | Strong design, soft instrument |

## Rules the code must enforce, not just the copy

- **No composite index.** No score out of 100. If someone asks for one, point at this line.
- **No dollar figure** unless `prefs.hourlyRate` was entered by the person. There is no default
  and there is no suggested value.
- **Confounds render inside the report body**, not as a footnote and not as a tooltip.
- **Negative and zero results render normally.** If nothing improved the report says so and
  offers the drift check. A measurement tool that can only report success is a marketing asset.
- Sample sizes shown next to every figure. `n = 58 conversations over 6 weeks`, always.
- If `n < 10` on either side, show the numbers greyed with "too early to say."

## Permission note

Every metric except *turns to done* is computable from what the person **types**.
None require reading what the AI says back. Measurement runs at tier 2, not tier 3 —
and the consent screen says exactly that.
