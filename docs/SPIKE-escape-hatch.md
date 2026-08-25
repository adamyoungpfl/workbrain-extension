# Spike — VB-78, the escape hatch

Run 2026-08-25. **Design only. Nothing built, and nothing should be until the copy below has been
reviewed** — the words are the mechanism here, more than anywhere else in the product.

## The moment it exists for

A blank field on a question that feels consequential and costly to get wrong. Today the flow's
AI-assist machinery only works *after* someone has written something (`interpret.buildPrompt(raw,
ctx)` — **all seven existing prompts interpolate `"${raw}"` and break on an empty string**, checked,
not assumed). The person staring at the blank field has the least help at the moment they need the
most.

Adam's tone target, verbatim: *"These questions need to feel like a therapist helping you unlock
the pain points in your work life… keep the bar to entry low and the ability to thrive on the other
side of the bar high. Under promise. Over deliver."*

## The trap, named before the options

A button that produces a finished answer produces **a file full of someone else's words** — which
reads fine, works worse, and quietly hollows out the one thing that makes the product worth using.
The proof loop's whole argument is that *your* file beats no file; a ghost-written file beats
neither. Any design that ends with "paste the AI's answer in as yours" fails this test no matter
how good the answer looks.

## Three shapes considered

**C · "Write this for me." Rejected.** The trap, verbatim.

**B · Options to react to.** The prompt returns 3–4 candidate directions; the person picks and
edits. Faster — but on a *blank* field there is nothing personal to ground the candidates in, so
they arrive horoscope-generic, and reacting to generic options produces generic answers with the
person's fingerprints on them. Worse than nothing, because it feels like progress.

**A · Their AI interviews them. Recommended — with the grounding twist that makes it work.**
The prompt does not ask the AI to answer. It asks the AI to **ask them three short questions**
about the topic, wait for their replies, and then assemble *their own words* into the shape the
field needs. They paste back a distillation of things they actually said.

The twist: **by the time anyone reaches a consequential blank field, earlier answers exist**, and
`buildPrompt` already receives the whole `FlowContext` (`answers`, `repeatables`). The interview
prompt is grounded in who they've already said they are — their name, their scope, their role —
so the AI's three questions are *about their actual seat*, not about a hypothetical person. That
is the difference between a therapist and a form letter, and the machinery for it already exists.

## Which questions carry it

**The rule, not a list:** any open-text question whose step carries `interpret.via === 'ai-assist'`
(seven today). That marker already means "consequential enough that we built an interpretation step
for the answer" — the same judgment, already made, question by question, in the ported source. No
new per-question flag, no second list to drift.

## The mechanics — everything is already built except the entry point

| Piece | Status |
|---|---|
| Copy-out / paste-back loop | Shipped (proof loop, AI-assist reflect) |
| Prompt composition with context | Shipped (`interpret.buildPrompt(raw, ctx)`) |
| Accepting a pasted result as the answer | Shipped (reflect step) |
| A prompt that works on an EMPTY field | **Missing** — this is the whole build |
| The button on the blank field | **Missing** |

The build is one optional field on `InterpretConfig` — `buildBlankPrompt?: (ctx) => string` — plus
one quiet button that appears only while the field is empty and `buildBlankPrompt` exists, feeding
the existing copy/paste/reflect mechanic. Small, additive, adapter-friendly (V2.0 FLAG 2: changes
attach via `adapter.ts`, never `source.ts`).

## Draft copy — for review, not for building

**The button** (visible only on an empty field, quiet variant, under the textarea):

> Stuck? Let your AI ask you about it

Not "write this for me" (the trap), not "get help" (vague). It says what will actually happen and
whose words the answer will be in. Reading grade holds; "Stuck?" carries the therapist's permission
to not have the answer ready.

**The prompt template** (the shape; per-question versions get authored like `DEEP_DIVE` was):

> I'm building a Context file that tells AI who I am, so I stop re-explaining myself. I'm stuck on
> this question: "«the question»".
>
> Here's what I've already said about myself: «two or three grounding lines from ctx — name, scope,
> role names — assembled by the template, omitted where unanswered».
>
> Don't answer for me. Ask me up to three short questions, one at a time, that would help someone
> in my seat figure out their real answer. After I reply, put what **I said** into one short
> paragraph in my own words, and give it to me to paste back. If I say something vague, ask me for
> the specific example instead of polishing the vagueness.

That last sentence is the therapist. The "don't answer for me" is the guardrail, stated to the one
party who would otherwise break it.

**The reflect step keeps its existing framing** — the pasted text arrives as *"It sounds like…"*,
editable, with "say it again" still available. Nothing about the paste-back is new.

## Risks carried forward

1. **The AI ignores the instruction and answers anyway.** It will, sometimes. The reflect step is
   the net: the person still sees the text, still edits, still owns the accept. The failure mode is
   the status quo (generic text offered), not something worse.
2. **Round-trip cost.** This is the *slow* path by design — three questions in their AI, then a
   paste. Someone who wants fast still has the field. The button's placement (quiet, under, only
   when empty) keeps it an offer rather than a default.
3. **Per-question authoring.** Seven grounded templates to write, and they are copy, which means
   Adam reviews them before they ship (the V1.1 precedent: draft first, build after sign-off).

## What this is not

No API call, no key, no new permission, no telemetry — the person carries the text both ways, same
as everywhere else. `docs/GUARDRAILS.md` untouched.
