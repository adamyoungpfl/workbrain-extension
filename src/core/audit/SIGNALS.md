# Signal extraction — definitions

All deterministic. No AI call. Same code path runs over the export (baseline) and over
tier-2 observed input (ongoing), so before and after are always measured identically.
That identity is what makes the comparison worth anything.

## Setup tax

For each conversation's **first user message**:
1. Split into sentences.
2. Classify each as `ASK` if it is interrogative, or imperative with a request verb
   (write, draft, make, give, summarise, explain, fix, list, help…). Otherwise `CONTEXT`.
3. Setup tax = characters in the leading run of `CONTEXT` sentences, before the first `ASK`.
4. Report the **median** across conversations, plus n.

Deliberately crude. It only has to be consistent, because it is only ever used as a
before/after comparison against itself. Report the absolute character count, not a ratio
of context to total — a short question makes the ratio look terrible for the same setup.

Converting to time: `chars / 200 chars-per-minute × conversations per week`. State the
assumption on screen. Never convert to money unless the person entered their own rate.

## Corrections

A user turn counts as a correction if either:
- it opens with a corrective marker — `no,` `actually` `i meant` `not quite` `that's not`
  `again,` `i said` `don't` `stop` `rewrite` `try again` `too long` `too formal` `shorter`
  `simpler` `in my voice` (case-insensitive, start of message, first 40 chars); **or**
- the message it replies to was a `branchPoint` (an edit or regeneration).

Report count and per-conversation rate. Keep three verbatim examples for the tick list.

## Repeated phrases

1. Normalise: lowercase, collapse whitespace, strip punctuation, keep word order.
2. Shingle every user message into 5–8 word windows.
3. Count **distinct conversations** a shingle appears in, not total occurrences —
   saying the same thing three times in one chat is not a pattern.
4. Keep shingles in ≥ `minConversations` (default 3).
5. Merge overlapping shingles into the longest containing phrase.
6. Re-extract the original casing/punctuation from the first occurrence for display,
   so the person sees their own words, not a normalised stub.

Output is the tick list: `"I write for operators, not engineers" — you said this in 23 chats.`

## Entities

Capitalised token sequences appearing **mid-sentence** (not sentence-initial), ≥3 mentions,
minus a stoplist of months, weekdays, common product names and the platform's own name.
Heuristic `kind` from surrounding words (`ask <X>`, `<X> said` → person; `in <X>`, `<X> ticket` → system).
Always editable, never asserted.

## Topics

Cosine similarity over TF-IDF of title + first user message, agglomerative, threshold tuned
against the fixture. Report `distinctDays` — "you came back to this on six separate days" is
the sentence that lands. Report as a range, not a point estimate; the clustering is fuzzy and
the report should say so.

## Vocabulary

Terms frequent in their history and rare in a small bundled reference frequency list.
Feeds the jargon section of the file.

## Testing

`tests/fixtures/chatgpt-export.sample.json` is synthetic and hand-built so every number is
knowable. `tests/core/audit/signals.test.ts` asserts exact values. When you change an
algorithm here, the fixture expectations change with it in the same commit — never after.
