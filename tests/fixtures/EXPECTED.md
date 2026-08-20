# Fixture expectations — `chatgpt-export.sample.json`

Synthetic, hand-built, 12 conversations across 24 days. Every number below was computed by a
reference implementation of the algorithms in `src/core/audit/SIGNALS.md`. If your implementation
disagrees, one of you is wrong — resolve it here, in this file, before changing either.

The fixture deliberately contains: two phrases that recur across conversations, corrections of
both kinds (marker phrases and regeneration branches), two topics revisited on multiple days,
and conversations with zero setup tax so the median is not trivially the mean.

## Shape

| | |
|---|---|
| conversations | 12 |
| span | 24 days |
| format | ChatGPT `conversations.json` — array of conversations, each with a `mapping` tree |
| branch points | 2 (conversations 6 and 10 — a node with two children) |

## Setup tax

Per-conversation, in order:
`[97, 37, 62, 0, 24, 37, 0, 0, 37, 0, 0, 0]`

**Median = 12**

Note the median is 12 and not 37. Half these conversations open with a bare request. Reporting
the mean here would be 24.5 and would misrepresent the typical conversation — the median is the
specified statistic and the fixture exists partly to catch that substitution.

## Corrections

| | |
|---|---|
| marker-phrase turns | 4 — `"No, that's too formal…"`, `"Actually make it shorter."`, `"I meant the second candidate."`, `"Don't include icebreakers."` |
| branch points | 2 |
| **total** | **6** |
| **per conversation** | **0.5** |

## Repeated phrases

Shingle 5–8 words, count **distinct conversations**, keep ≥3, then merge.

| phrase | conversations |
|---|---|
| `i write for operators not engineers` | 5 |
| `draft a status update for my manager` | 4 |
| `summarise this roadmap for the leadership review` | 3 |
| `words draft a status update for my manager` | 3 |

**The merge rule, and why the fourth row is there.** Group candidate shingles by their *exact set*
of conversation ids, then within each group keep only strings that are not substrings of another
in the same group, and take the longest. Overlapping phrases that appear in *different* conversation
sets are genuinely different findings and both survive — that is the fourth row. A naive
"drop any substring" merge collapses it and loses a real signal; a naive "keep everything" produces
six near-duplicate rows that look broken to the person. Both failure modes are visible in this fixture.

For display, re-extract the original casing and punctuation from the first occurrence. The person
must see *"I write for operators, not engineers."* — their own words — never the normalised form.

## Topics

| topic | distinct days |
|---|---|
| Weekly status update | 4 |
| Roadmap summary | 3 |

## Entities

None above threshold — the fixture has no repeated proper nouns. That is deliberate: assert the
empty case renders as "nothing found yet" and not as an empty list with a heading.

## Report behaviour on this fixture

n = 12 on the baseline side. With fewer than 10 conversations on either side the report must show
figures greyed with *"too early to say"* rather than a number — so a test that trims this fixture
to 9 conversations must produce that state.
