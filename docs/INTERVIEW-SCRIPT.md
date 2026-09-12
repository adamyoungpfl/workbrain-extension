# The interview, in order — questions, narration, and where each screen goes

Adam, 2026-09-12: "give me a doc that lists your suggested order for asking
the questions… the question, the input type, a conversational narration
script for each question… each new question/prompt narration to seem to be a
continuation of the interview based on the action and wording of the prior
screen and the navigation waypoints for the buttons on the page."

Built from `docs/CONTEXT-SLOT-MAP.md`. The slot column ties every screen back
to the value it fills there. **Edit this in the question editor** (the
artifact) rather than here — the editor writes to a store I can read back, so
your edits become the single update pass across the real flow. This file is
generated from `docs/interview-script.json`.

## Why this order

1. **Scope, then the pain.** Two easy screens that cost nothing and set the
   language for everything after.
2. **The specimen, early.** The paste is moved near the front because it
   answers eight later questions by itself. Anyone who pastes gets a
   noticeably shorter interview — which is the incentive pointing the right
   way.
3. **Identity, then trajectory.** Who they are, then — new — who they are
   becoming, before the file hardens into the present tense.
4. **Their world, their words.** Entities and systems, then the terms that
   only mean something here.
5. **Audiences and standards.** The rules, asked once they have context to
   hang them on.
6. **Initiatives last**, because it is the block people abandon, and by then
   the file is already worth downloading.
7. **Skills is a separate sitting**, opened by pointing back at the very
   first answer.

**Legend.** `NEW` — not in the flow today. `RESHAPED` — asked today, wrong
answer type. Everything unmarked exists and is kept.

---


## Open

### 1. We're going to write down what makes your work yours. Twenty minutes, and you keep everything.

**id** `welcome` · **slot** — · **input** `intro` · **chars** —

*Narration.* Opening. No question yet — one screen that says what the next twenty minutes are for and what they end with. Say the ending first: a file they own, that they can hand to any AI tool. Then the only button.

| Button | Goes to |
|---|---|
| Start | → scope |
| What is this? | → about (aside) → returns to welcome |

### 2. Are we building this for your work, your personal life, or both?

**id** `scope` · **slot** A1 · **input** `chips-one` · **chars** —

*Narration.* First real question, and it is deliberately easy — one tap, nothing to type. Frame it as setting the language for everything after: 'I'll ask about the rest differently depending on which you pick.'

| Button | Goes to |
|---|---|
| Work / Personal / Both | → pain |

### 3. What do you find yourself explaining over and over?

**id** `pain` · **slot** A2 · **input** `text` · **chars** 40–200

*Narration.* Carry the scope choice forward by name: 'Right — work it is.' Then this. It is the whole product's thesis as a question, and whatever they type here is the thing we point back to at the end when we show them the proof. If they stall, the examples are the escape hatch.

| Button | Goes to |
|---|---|
| Answer | → specimen_ask |
| Not sure yet | → specimen_ask (marks A2 unanswered, re-offered at review) |


## Specimen

### 4. Paste something you wrote that you were proud of.

**id** `specimen_ask` · **slot** H1 · **input** `paste` · **chars** 400–4000

*Narration.* The hinge of the whole interview, and it comes early on purpose. Tell them why plainly: 'One paste here saves you about eight questions later — I can read your voice off it instead of asking you to describe it.' Offer the skip honestly; the flow just gets longer.

| Button | Goes to |
|---|---|
| Paste it | → specimen_why |
| I don't have one handy | → voice_fallback (the 5 scale questions), rejoins at names |
| Skip for now | → names (voice inferred later or left blank) |

### 5. What makes this one good — what would you lose if someone "improved" it? `NEW`

**id** `specimen_why` · **slot** H2 · **input** `text` · **chars** 40–250

*Narration.* Immediately after the paste, while they still have it in their head. This is the question that turns a sample into a standard: without it we teach imitation, with it we teach judgment. Keep it short; one sentence is a fine answer.

| Button | Goes to |
|---|---|
| Answer | → specimen_bad |
| Skip | → specimen_bad |

### 6. Now the opposite — paste something that came back wrong. A draft you had to rewrite. `NEW`

**id** `specimen_bad` · **slot** H4 · **input** `paste` · **chars** 0–2000

*Narration.* Play it as the mirror of the last one, and say why it earns its place: one bad example teaches a tool more than ten adjectives about tone. Optional, and say so — plenty of people won't have one saved.

| Button | Goes to |
|---|---|
| Paste it | → names |
| Nothing to hand | → names |

### 7. Two quick ones, then: how direct should it be by default? And how long should a normal answer run? `RESHAPED`

**id** `voice_fallback` · **slot** I1–I2 · **input** `scale` · **chars** —

*Narration.* Only reached when no specimen was pasted. Two scales, not seven — the other five were doing work the specimen does better, and asking them anyway is how an interview earns a reputation for being long.

| Button | Goes to |
|---|---|
| Both answered | → names |


## Identity

### 8. What should AI call you?

**id** `name` · **slot** B1 · **input** `text` · **chars** 2–40

*Narration.* Gear change, and name it: 'That's the hard part done. The rest is mostly about you.' Then the easiest question in the interview.

| Button | Goes to |
|---|---|
| Answer | → pro_name |

### 9. Do you use a different name professionally? Leave this blank if it's the same.

**id** `pro_name` · **slot** B2 · **input** `text` · **chars** 0–60

*Narration.* Quiet, optional, and the blank is a real answer — say so on the screen so nobody feels they have to invent something.

| Button | Goes to |
|---|---|
| Answer or blank | → self_desc |

### 10. How would you describe what you do?

**id** `self_desc` · **slot** B3 · **input** `long` · **chars** 80–400

*Narration.* Ask for the version they'd say out loud, not the version on a résumé — the rephrasings already do this well. If they wrote a specimen, nod to it: 'Plain words are fine — you already showed me how you write.'

| Button | Goes to |
|---|---|
| Answer | → roles |
| Tighten this for me | → polish handoff (their own AI), returns here with the draft |

### 11. What are your roles — the ones distinct enough that AI should know about each one separately?

**id** `roles` · **slot** B4 · **input** `record-list` · **chars** 3–60 ea.

*Narration.* Explain the test rather than the word: a role is separate if you'd want a different answer depending on which hat you had on. Most people name one or two; that is a complete answer.

| Button | Goes to |
|---|---|
| Add a role | → role_mandate (per role) |
| Just the one | → responsibilities |
| Done adding | → responsibilities |

### 12. In a sentence or two, what are you there to accomplish?

**id** `role_mandate` · **slot** B5 · **input** `long` · **chars** 60–300

*Narration.* Per role, and named: 'For the [role name] one —'. Keep it to purpose, not duties; the duties come next and asking twice annoys people.

| Button | Goes to |
|---|---|
| Answer | → role_standing |

### 13. Is this your main one, a secondary one, or something occasional? And is it current?

**id** `role_standing` · **slot** B6 · **input** `chips-one` · **chars** —

*Narration.* Two taps. Say what it buys them — the file can flag the old role as old later instead of quietly presenting it as current.

| Button | Goes to |
|---|---|
| Answered | → roles (next role) or responsibilities |

### 14. What are you personally responsible for?

**id** `responsibilities` · **slot** B7 · **input** `long` · **chars** 60–500

*Narration.* Owned, not involved-in. Draw the line in the question itself, because the next two questions depend on them having drawn it here.

| Button | Goes to |
|---|---|
| Answer | → contributes |

### 15. And what do you contribute to, but not own?

**id** `contributes` · **slot** B8 · **input** `long` · **chars** 40–300

*Narration.* Explicitly the other side of the line they just drew — 'And the other half of that —'. Rare in a context file and worth a sentence of praise when they answer it.

| Button | Goes to |
|---|---|
| Answer | → not_yours |
| Skip | → not_yours |

### 16. What do people sometimes assume is your responsibility, but actually isn't?

**id** `not_yours` · **slot** B9 · **input** `long` · **chars** 40–300

*Narration.* Keep verbatim — it is the best question in the current flow. It gets a wry answer out of almost everyone, which is exactly the register we want before the duller ones.

| Button | Goes to |
|---|---|
| Answer | → decisions |
| Skip | → decisions |

### 17. What kinds of decisions can you make yourself?

**id** `decisions` · **slot** B10 · **input** `long` · **chars** 60–400

*Narration.* Frame as autonomy, not authority — 'what can you just decide, without checking?' The chips (alone / with a nod / needs approval) give a fast path for people who don't want to write.

| Button | Goes to |
|---|---|
| Answer | → expertise |

### 18. What do people come to you for?

**id** `expertise` · **slot** B11 · **input** `long` · **chars** 40–300

*Narration.* Closing the identity block on a generous note. This is the question people enjoy answering, so it is a good last one before a gear change.

| Button | Goes to |
|---|---|
| Answer | → target |


## Trajectory

### 19. What are you working toward that isn't true yet — a role, a certification, a kind of work you want more of? `NEW`

**id** `target` · **slot** G7 · **input** `long` · **chars** 40–300

*Narration.* NEW, and the one that changes who this product works for. Say the reason out loud: 'Everything so far describes where you are. This one points the file at where you're going, so it stops writing about your last job.' For a job seeker this is the most important screen in the interview.

| Button | Goes to |
|---|---|
| Answer | → gap |
| Nothing right now | → entities (file stays present-tense; review offers it again) |

### 20. What's between you and that — what would you need to show, learn, or prove? `NEW`

**id** `gap` · **slot** G8 · **input** `long` · **chars** 40–300

*Narration.* Only if they named a target. This is the one that makes the target usable: without it, a tool can restate the ambition; with it, a tool can help close the distance.

| Button | Goes to |
|---|---|
| Answer | → entities |
| Not sure | → entities (kept as a finding, printed as a question in the file) |


## World

### 21. Who and what do you work with that AI should know by name?

**id** `entities` · **slot** C1–C4 · **input** `record-list` · **chars** 2–60 ea.

*Narration.* Gear change into their world. Frame as names, not org charts: people, teams, tools, clients — anything they'd say in shorthand and expect to be understood. Each one takes a name, a kind, why it matters, and any aliases.

| Button | Goes to |
|---|---|
| Add one | → per-entity mini-record, returns here |
| Done | → systems |
| Skip this part | → systems |

### 22. When you need the real answer, where do you look? Which system is the source of truth? `NEW`

**id** `systems` · **slot** C5 · **input** `chips-text` · **chars** 40–250

*Narration.* NEW. The file knows the names but never where the truth lives, and every automation question later depends on it. Chips for the common ones and a field for the rest; 'a spreadsheet somebody maintains' is a completely valid answer.

| Button | Goes to |
|---|---|
| Answer | → terms |
| Skip | → terms |


## Names

### 23. What words does your work depend on that an outsider would get wrong? Give me the word and what it means here. `RESHAPED`

**id** `terms` · **slot** D1 · **input** `pairs` · **chars** 60–600

*Narration.* RESHAPED from prose to term → meaning rows. Say why the pairs matter: 'If I only have the word, a tool guesses the definition — and it guesses the common one.' If a specimen was pasted, pre-fill candidate terms from it and ask them to confirm or bin each.

| Button | Goes to |
|---|---|
| Add a pair | → stays here |
| Done | → never_words |
| Use the ones you found | → confirm list, returns here |

### 24. Any words or phrases you never want to see in your own writing?

**id** `never_words` · **slot** D2 · **input** `chips-text` · **chars** 0–200

*Narration.* Light relief after the pairs, and people enjoy it. Seed the chips with the usual AI tells — delve, leverage, robust, in today's fast-paced — and let them add their own.

| Button | Goes to |
|---|---|
| Answer | → audiences |
| None | → audiences |


## Audiences

### 25. Who do you write to regularly? `RESHAPED`

**id** `audiences` · **slot** E1 · **input** `record-list` · **chars** 3–40 ea.

*Narration.* RESHAPED into records so each one can carry its own two answers. Keep the ask small — three or four names is plenty, and say so, or people list everyone they've ever emailed.

| Button | Goes to |
|---|---|
| Add an audience | → aud_expects (per audience) |
| Done | → standards |

### 26. What does this one expect from you that the others don't? `RESHAPED`

**id** `aud_expects` · **slot** E2 · **input** `long` · **chars** 40–250

*Narration.* Per audience, named. Ask for the difference, not a description — the difference is the only part a tool can act on.

| Button | Goes to |
|---|---|
| Answer | → aud_knows |

### 27. And what can you assume they already know — what would be condescending to explain? `NEW`

**id** `aud_knows` · **slot** E3 · **input** `long` · **chars** 40–250

*Narration.* NEW, and the most useful audience field there is. It is the one that stops a tool over-explaining to a board and under-explaining to a new hire. Frame it as saving them the edit they always make.

| Button | Goes to |
|---|---|
| Answer | → audiences (next) or standards |


## Standards

### 28. What would you actually send a draft back over?

**id** `standards` · **slot** F1 · **input** `long` · **chars** 60–500

*Narration.* Keep verbatim. It gets the real standard rather than the aspirational one, because it asks about a thing they have actually done.

| Button | Goes to |
|---|---|
| Answer | → peeves |

### 29. What makes you rewrite something on sight?

**id** `peeves` · **slot** F3 · **input** `long` · **chars** 40–300

*Narration.* The smaller sibling of the last one, and fun to answer. If a bad specimen was pasted, point at it: 'Anything in that rewrite you'd call out?'

| Button | Goes to |
|---|---|
| Answer | → settled |
| Skip | → settled |

### 30. What's already been decided that you don't want reopened — a tool, a format, a way of doing things that's final? `NEW`

**id** `settled` · **slot** F4 · **input** `long` · **chars** 60–400

*Narration.* NEW, and the highest-half-life content in the file. Frame it as the thing they are tired of re-arguing: 'Anything a tool should stop offering you alternatives to.'

| Button | Goes to |
|---|---|
| Answer | → guardrails |
| Nothing yet | → guardrails |

### 31. What should AI never do without asking you first?

**id** `guardrails` · **slot** F2 · **input** `chips-text` · **chars** 40–400

*Narration.* Keep verbatim. Chips for the common ones — send anything, commit to a date, speak for someone else, spend money.

| Button | Goes to |
|---|---|
| Answer | → redaction |

### 32. Is there anything about your work you can't put in writing here — client names, case details, anything under a policy? `NEW`

**id** `redaction` · **slot** F5 · **input** `chips-text` · **chars** 0–300

*Narration.* NEW, and it needs care: it is permission, not interrogation. Say the useful thing plainly — 'You can write "Client A" and it still works' — and teach the placeholder habit right here, in the one screen where it is relevant.

| Button | Goes to |
|---|---|
| Answer | → boundaries |
| Nothing like that | → boundaries |

### 33. Anything this file should deliberately stay out of? `NEW`

**id** `boundaries` · **slot** F6 · **input** `long` · **chars** 0–250

*Narration.* NEW. Curation in their own words, and the last word before we leave the rules section. Short answers are good answers here.

| Button | Goes to |
|---|---|
| Answer | → initiatives |
| No | → initiatives |


## Initiatives

### 34. What are you actually working on right now?

**id** `initiatives` · **slot** G1–G6 · **input** `record-list` · **chars** 3–60 ea.

*Narration.* Last content block, and say so — people push through when they can see the end. Each initiative takes a name, what and why, where it stands, what success looks like, constraints, and what's out of scope.

| Button | Goes to |
|---|---|
| Add one | → per-initiative mini-record, returns here |
| Nothing active | → review |
| Done | → review |


## Close

### 35. Here's your file. Anything you want to change before you take it?

**id** `review` · **slot** — · **input** `review` · **chars** —

*Narration.* Show the actual file, not a summary of it — the payoff is seeing their own words formatted. Offer the unanswered ones back as a short list rather than a nag, and make download the loud button.

| Button | Goes to |
|---|---|
| Download | → done |
| Fix something | → that question, returns to review |
| Fill the ones I skipped | → skipped queue, returns to review |
| Prove it works | → Proving Grounds |


## Skills

### 40. Now the part that makes it repeatable: one job you do over and over.

**id** `skill_open` · **slot** — · **input** `intro` · **chars** —

*Narration.* Opening the second interview, and it must connect to the first: 'Your file tells a tool who you are. A skill tells it how you do one specific thing.' Point back at their answer to the very first question — the thing they're tired of explaining — as the obvious candidate.

| Button | Goes to |
|---|---|
| Pick a job | → skill_name |
| Not now | → home |

### 41. What do you call this job when you ask for it?

**id** `skill_name` · **slot** S1 · **input** `text` · **chars** 3–60

*Narration.* Their name for it, not a formal title — 'the Monday numbers' is a better skill name than 'weekly performance reporting', because it is what they will actually type.

| Button | Goes to |
|---|---|
| Answer | → skill_objective |

### 42. When this goes well, what does the finished thing let you do? `NEW`

**id** `skill_objective` · **slot** S2 · **input** `long` · **chars** 60–300

*Narration.* NEW, and it goes FIRST on purpose — before the steps. Say why: 'Tell me what good looks like and the steps get easier to write.' This is also the only reason the proof can ever be scored rather than admired, so it is not skippable.

| Button | Goes to |
|---|---|
| Answer | → skill_trigger |

### 43. What sets it off — a day of the week, or something happening? `RESHAPED`

**id** `skill_trigger` · **slot** S3 · **input** `chips-text` · **chars** 20–160

*Narration.* RESHAPED: offer both kinds. Calendar triggers suit office work; situation triggers ('when a new offer lands', 'when someone asks for a quote') are the only ones that fit gig and shift work, and without them those people stall on this screen.

| Button | Goes to |
|---|---|
| A day | → skill_method_pick |
| Something happens | → skill_method_pick |

### 44. Is this more of a recipe, or more of a judgment call? `NEW`

**id** `skill_method_pick` · **slot** S6/S7 · **input** `chips-one` · **chars** —

*Narration.* NEW branch, one tap, and it is what makes this interview work for people whose job has no steps. Frame it without hierarchy — neither answer is the better one.

| Button | Goes to |
|---|---|
| A recipe | → skill_steps |
| A judgment call | → skill_principles |

### 45. Walk me through it the way you'd tell a new coworker.

**id** `skill_steps` · **slot** S6 · **input** `long` · **chars** 120–1500

*Narration.* Ask for narration, not a numbered list — people who freeze at 'document your process' will happily explain it to an imaginary new hire. We parse the nouns out afterwards and offer them back as inputs and tools.

| Button | Goes to |
|---|---|
| Answer | → skill_inputs (pre-filled from the narration) |
| Turn my notes into steps | → handoff to their AI, returns here |

### 46. What do you weigh when you decide? And what lines won't you cross? `NEW`

**id** `skill_principles` · **slot** S7 · **input** `long` · **chars** 120–800

*Narration.* NEW, the other half of the branch. For advisers, caregivers, coordinators and anyone whose value is judgment. Two prompts in one screen because they are the same thought: what I consider, and where I stop.

| Button | Goes to |
|---|---|
| Answer | → skill_inputs |

### 47. What do you need in front of you before you can start?

**id** `skill_inputs` · **slot** S4 · **input** `chips-text` · **chars** 20–300

*Narration.* Pre-filled from whatever they just described, as confirmable chips — 'I pulled these out of what you wrote; bin the ones I got wrong.' Confirming beats typing, every time.

| Button | Goes to |
|---|---|
| Confirm | → skill_tools |
| Add one | → stays here |

### 48. Where does that come from, and where does the finished thing go?

**id** `skill_tools` · **slot** S5 · **input** `chips-text` · **chars** 20–300

*Narration.* In and out in one screen. This is the answer the Actions file is derived from later, so it is worth the extra ten seconds — say that, because it makes the question feel like it is buying something.

| Button | Goes to |
|---|---|
| Answer | → skill_output |

### 49. What shape does the finished thing take?

**id** `skill_output` · **slot** S8 · **input** `chips-text` · **chars** 20–200

*Narration.* Chips — an email, a doc, a list, a spreadsheet, a message. Fast, and it pins the format so a tool stops guessing.

| Button | Goes to |
|---|---|
| Answer | → skill_checks |

### 50. How do you know it's right before you send it? And what usually goes wrong? `NEW`

**id** `skill_checks` · **slot** S9 · **input** `long` · **chars** 40–400

*Narration.* NEW, and the one that makes a proof honest. Both halves matter: the check is what to verify, the failure is what to watch for. People answer the second half faster, so lead with it if they stall.

| Button | Goes to |
|---|---|
| Answer | → skill_example |

### 51. Got a good finished one handy? Paste it. `NEW`

**id** `skill_example` · **slot** S10 · **input** `paste` · **chars** 0–3000

*Narration.* NEW, optional, and framed as the shortcut it is: one real example pins the format, the length and the tone at once. Never insist — this is the elite rung, not the bar.

| Button | Goes to |
|---|---|
| Paste | → skill_autonomy |
| Not handy | → skill_autonomy |

### 52. Would you want this to run without you?

**id** `skill_autonomy` · **slot** S11 · **input** `chips-one` · **chars** —

*Narration.* Four options and no judgment attached to any of them: I'd run it myself / draft it for my approval / fully automatic / never. Say plainly that 'never' is a legitimate answer and gets recorded as one.

| Button | Goes to |
|---|---|
| Answered | → skill_review |

### 53. Here's the skill. Want to run it against its objective?

**id** `skill_review` · **slot** — · **input** `review` · **chars** —

*Narration.* Show the written skill and point at the objective they wrote at the start — that is the scoring line. The proof offer belongs here, while the skill is fresh and they can still see what it was for.

| Button | Goes to |
|---|---|
| Prove it | → Proving Grounds (skills mode) |
| Add another skill | → skill_name |
| Done | → home |

