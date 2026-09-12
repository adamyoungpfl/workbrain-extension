# The interview, in order — what it says, and what they hear

Adam, 2026-09-12: "Make the top line the way it will read above the input.
Then the narration should be what the interviewee actually hears… I want to
make the question easy to read and the spoken version of the question offer a
friendly alternate ask of the same question with a little more context around
the ask."

Two voices per screen, and they do different jobs:

- **On screen** — the short line above the input. Read, not heard. It should
  be graspable at a glance and never make someone parse a sentence before
  they can start typing.
- **Spoken** — what the narrator actually says. A friendlier ask of the same
  question, carrying the context the short line leaves out, and resolving any
  ambiguity the short line creates. *"What should I call you?"* is ambiguous
  about who "I" is; the spoken line settles it: *"When you're using your own
  AI services, what name should it use to reference you?"*

Each spoken line also picks up from the screen before it, so the whole thing
plays as one conversation rather than a stack of form fields.

Generated from `docs/interview-script.json`. Edit in the question editor —
those edits persist and come back for the update pass.

## Why this order

1. **Scope, then the pain.** Two cheap screens that set the language for
   everything after.
2. **The specimen, early.** Pasting one answers eight later questions, and
   the spoken line says so. Skip it and the interview gets longer, not worse.
3. **Identity, then trajectory** — who they are, then who they're becoming,
   before the file hardens into the present tense.
4. **Their world, their words.** Names and systems, then the terms that only
   mean something here.
5. **Audiences and standards**, once there is context to hang them on.
6. **Initiatives last**, because it is the block people abandon — and by then
   the file is already worth downloading.
7. **Skills is a second sitting**, opened by pointing back at the very first
   answer.

**Legend.** `NEW` — not in the flow today. `RESHAPED` — asked today, wrong
answer type.

---


## Open

### 1. Let's write down what makes your work yours.

**id** `welcome` · **slot** — · **input** `intro` · **chars** —

> 🔊 Hi. Over the next twenty minutes or so we'll build a file that tells any AI tool who you are and how you work. You keep it, and you can hand it to whatever assistant you already use.

| Button | Goes to |
|---|---|
| Start | → scope |
| What is this? | → about (aside) → returns to welcome |

### 2. Is this for work, life, or both?

**id** `scope` · **slot** A1 · **input** `chips-one` · **chars** —

> 🔊 First one, so I ask the rest the right way: are we building this for your work, your personal life, or a bit of both?

| Button | Goes to |
|---|---|
| Work / Personal / Both | → pain |

### 3. What do you explain over and over?

**id** `pain` · **slot** A2 · **input** `text` · **chars** 40–200

> 🔊 Great. So when you're using an AI tool, what do you find yourself typing out again and again before it can actually be useful?

*Note — Whatever they write here is what we point back to at the end, when we show them the proof.*

| Button | Goes to |
|---|---|
| Answer | → specimen_ask |
| Not sure yet | → specimen_ask (marks A2 unanswered, re-offered at review) |


## Specimen

### 4. Paste something you wrote and liked.

**id** `specimen_ask` · **slot** H1 · **input** `paste` · **chars** 400–4000

> 🔊 Here's the shortcut. Paste in something you wrote — an email, a post, a report, anything you were happy with — and I can read your style straight off it, instead of asking you eight questions about it later.

*Note — The skip is honest: nothing is lost, the interview just gets longer.*

| Button | Goes to |
|---|---|
| Paste it | → specimen_why |
| I don't have one handy | → voice_fallback (the 5 scale questions), rejoins at names |
| Skip for now | → names (voice inferred later or left blank) |

### 5. What makes this one good? `NEW`

**id** `specimen_why` · **slot** H2 · **input** `text` · **chars** 40–250

> 🔊 Nice. In a line or two — what makes that one good? Put it another way: if somebody 'tidied it up' for you, what would you be annoyed to lose?

| Button | Goes to |
|---|---|
| Answer | → specimen_bad |
| Skip | → specimen_bad |

### 6. Paste one that came back wrong. `NEW`

**id** `specimen_bad` · **slot** H4 · **input** `paste` · **chars** 0–2000

> 🔊 Now the opposite, if you've got one. Paste something an AI wrote for you that missed — the kind of draft you had to redo. One bad example teaches it more than a list of adjectives.

| Button | Goes to |
|---|---|
| Paste it | → names |
| Nothing to hand | → names |

### 7. Two quick ones about your style. `RESHAPED`

**id** `voice_fallback` · **slot** I1–I2 · **input** `scale` · **chars** —

> 🔊 No problem. Two quick taps instead: how direct should your AI be by default, and how long should a normal answer run?

*Note — Only reached with no specimen. Two scales, not seven.*

| Button | Goes to |
|---|---|
| Both answered | → names |


## Identity

### 8. What should I call you?

**id** `name` · **slot** B1 · **input** `text` · **chars** 2–40

> 🔊 Great! When you're using your own AI services, what name should it use to reference you?

| Button | Goes to |
|---|---|
| Answer | → pro_name |

### 9. A different name professionally?

**id** `pro_name` · **slot** B2 · **input** `text` · **chars** 0–60

> 🔊 And is there a different name you go by professionally — one that belongs on anything formal? If it's the same, just leave it blank.

| Button | Goes to |
|---|---|
| Answer or blank | → self_desc |

### 10. What do you do?

**id** `self_desc` · **slot** B3 · **input** `long` · **chars** 80–400

> 🔊 Now, in your own words, and not your job title — how would you describe what you actually do? Say it the way you'd say it to someone at a barbecue.

| Button | Goes to |
|---|---|
| Answer | → roles |
| Tighten this for me | → polish handoff (their own AI), returns here with the draft |

### 11. What roles should it know about?

**id** `roles` · **slot** B4 · **input** `record-list` · **chars** 3–60 ea.

> 🔊 Plenty of people wear more than one hat. What roles should your AI know about separately? Separately meaning you'd want a different kind of answer depending on which one you're in.

| Button | Goes to |
|---|---|
| Add a role | → role_mandate (per role) |
| Just the one | → responsibilities |
| Done adding | → responsibilities |

### 12. What are you there to accomplish?

**id** `role_mandate` · **slot** B5 · **input** `long` · **chars** 60–300

> 🔊 For that one — in a sentence or two, what are you actually there to accomplish? Not the tasks; the point of it.

| Button | Goes to |
|---|---|
| Answer | → role_standing |

### 13. How central is this role?

**id** `role_standing` · **slot** B6 · **input** `chips-one` · **chars** —

> 🔊 Is this your main one, a secondary one, or something occasional? And is it current, or past work that's still worth knowing about?

| Button | Goes to |
|---|---|
| Answered | → roles (next role) or responsibilities |

### 14. What are you responsible for?

**id** `responsibilities` · **slot** B7 · **input** `long` · **chars** 60–500

> 🔊 Okay. What are you personally on the hook for — the things that are genuinely yours, where it lands on you if they don't happen?

| Button | Goes to |
|---|---|
| Answer | → contributes |

### 15. What do you help with but not own?

**id** `contributes` · **slot** B8 · **input** `long` · **chars** 40–300

> 🔊 And the other half of that: what do you contribute to, but don't own? It helps your AI know when something should go back to somebody else.

| Button | Goes to |
|---|---|
| Answer | → not_yours |
| Skip | → not_yours |

### 16. What isn't yours, but people think it is?

**id** `not_yours` · **slot** B9 · **input** `long` · **chars** 40–300

> 🔊 This one's usually fun. What do people keep assuming is your job, when it really isn't?

| Button | Goes to |
|---|---|
| Answer | → decisions |
| Skip | → decisions |

### 17. What can you decide on your own?

**id** `decisions` · **slot** B10 · **input** `long` · **chars** 60–400

> 🔊 What kinds of decisions can you just make — no approval, no checking first? Your AI will stop hedging on the calls you're allowed to make.

| Button | Goes to |
|---|---|
| Answer | → expertise |

### 18. What do people come to you for?

**id** `expertise` · **slot** B11 · **input** `long` · **chars** 40–300

> 🔊 Last one in this stretch: when people come to you, what do they come to you for?

| Button | Goes to |
|---|---|
| Answer | → target |


## Trajectory

### 19. What are you working toward? `NEW`

**id** `target` · **slot** G7 · **input** `long` · **chars** 40–300

> 🔊 Everything so far describes where you are now. This one's about where you're going: what are you working toward that isn't true yet — a role, a certificate, a kind of work you want more of?

*Note — The screen that makes this product work for someone job-hunting or changing careers.*

| Button | Goes to |
|---|---|
| Answer | → gap |
| Nothing right now | → entities (file stays present-tense; review offers it again) |

### 20. What's between you and that? `NEW`

**id** `gap` · **slot** G8 · **input** `long` · **chars** 40–300

> 🔊 And what's standing between you and it — something you'd need to learn, show, or prove? If you're not sure, that's a fine answer; we'll write it down as a question to come back to.

| Button | Goes to |
|---|---|
| Answer | → entities |
| Not sure | → entities (kept as a finding, printed as a question in the file) |


## World

### 21. Who and what do you work with?

**id** `entities` · **slot** C1–C4 · **input** `record-list` · **chars** 2–60 ea.

> 🔊 Let's give your AI the names you actually use. Who and what should it know by name — people, teams, tools, clients, anything you'd say in shorthand and expect to be understood?

| Button | Goes to |
|---|---|
| Add one | → per-entity mini-record, returns here |
| Done | → systems |
| Skip this part | → systems |

### 22. Where does the real answer live? `NEW`

**id** `systems` · **slot** C5 · **input** `chips-text` · **chars** 40–250

> 🔊 When you need the truth about something — the real number, the current status — where do you go and look? A system, a spreadsheet, a particular person; whatever it honestly is.

| Button | Goes to |
|---|---|
| Answer | → terms |
| Skip | → terms |


## Names

### 23. Words an outsider would get wrong. `RESHAPED`

**id** `terms` · **slot** D1 · **input** `pairs` · **chars** 60–600

> 🔊 Every line of work has words that mean something specific. Give me a few that an outsider would get wrong — the word, and what it means where you work.

| Button | Goes to |
|---|---|
| Add a pair | → stays here |
| Done | → never_words |
| Use the ones you found | → confirm list, returns here |

### 24. Words you never want to see.

**id** `never_words` · **slot** D2 · **input** `chips-text` · **chars** 0–200

> 🔊 Any words or phrases you never want coming out of an AI with your name on it? Most people have two or three that make them wince.

| Button | Goes to |
|---|---|
| Answer | → audiences |
| None | → audiences |


## Audiences

### 25. Who do you write to? `RESHAPED`

**id** `audiences` · **slot** E1 · **input** `record-list` · **chars** 3–40 ea.

> 🔊 Who do you write to regularly? Three or four is plenty — the ones where you'd change how you write depending on who's reading.

| Button | Goes to |
|---|---|
| Add an audience | → aud_expects (per audience) |
| Done | → standards |

### 26. What does this one expect? `RESHAPED`

**id** `aud_expects` · **slot** E2 · **input** `long` · **chars** 40–250

> 🔊 For that group — what do they expect from you that the others don't? Just the difference; that's the part your AI can act on.

| Button | Goes to |
|---|---|
| Answer | → aud_knows |

### 27. What can you assume they know? `NEW`

**id** `aud_knows` · **slot** E3 · **input** `long` · **chars** 40–250

> 🔊 And what can you take as read with them — what would be a little condescending to explain? This is the one that stops your AI over-explaining to people who already know.

| Button | Goes to |
|---|---|
| Answer | → audiences (next) or standards |


## Standards

### 28. What gets a draft sent back?

**id** `standards` · **slot** F1 · **input** `long` · **chars** 60–500

> 🔊 Now your standards. What would actually make you send a draft back — not in theory, but something you've really done?

| Button | Goes to |
|---|---|
| Answer | → peeves |

### 29. What makes you rewrite on sight?

**id** `peeves` · **slot** F3 · **input** `long` · **chars** 40–300

> 🔊 And the smaller version of that: what makes you rewrite something the second you lay eyes on it?

| Button | Goes to |
|---|---|
| Answer | → settled |
| Skip | → settled |

### 30. What's already decided? `NEW`

**id** `settled` · **slot** F4 · **input** `long` · **chars** 60–400

> 🔊 What's already settled that you don't want reopened — a tool you've chosen, a format you use, a way of doing it that's final? This stops your AI offering you alternatives you're tired of hearing.

| Button | Goes to |
|---|---|
| Answer | → guardrails |
| Nothing yet | → guardrails |

### 31. What needs your okay first?

**id** `guardrails` · **slot** F2 · **input** `chips-text` · **chars** 40–400

> 🔊 What should your AI never do without checking with you first? Sending something, committing to a date, speaking for someone else — that sort of thing.

| Button | Goes to |
|---|---|
| Answer | → redaction |

### 32. Anything you can't write down here? `NEW`

**id** `redaction` · **slot** F5 · **input** `chips-text` · **chars** 0–300

> 🔊 Some work can't be written down in detail — client names, case details, anything under a policy. If that's you, say so and we'll use stand-ins like 'Client A'. It works just as well.

*Note — Permission, never interrogation. This must not sound like a compliance check.*

| Button | Goes to |
|---|---|
| Answer | → boundaries |
| Nothing like that | → boundaries |

### 33. Anything this file should skip? `NEW`

**id** `boundaries` · **slot** F6 · **input** `long` · **chars** 0–250

> 🔊 Anything you'd rather this file stayed out of altogether? Short answers are good answers here.

| Button | Goes to |
|---|---|
| Answer | → initiatives |
| No | → initiatives |


## Initiatives

### 34. What are you working on now?

**id** `initiatives` · **slot** G1–G6 · **input** `record-list` · **chars** 3–60 ea.

> 🔊 Last stretch. What are you actually working on at the moment? For each one I'll ask what it is, where it stands, and what finishing it looks like.

| Button | Goes to |
|---|---|
| Add one | → per-initiative mini-record, returns here |
| Nothing active | → review |
| Done | → review |


## Close

### 35. Here's your file.

**id** `review` · **slot** — · **input** `review` · **chars** —

> 🔊 That's it. Here's your file, in your words. Have a read, change anything that isn't right, and then it's yours to download and use anywhere.

*Note — Show the real file, not a summary of it.*

| Button | Goes to |
|---|---|
| Download | → done |
| Fix something | → that question, returns to review |
| Fill the ones I skipped | → skipped queue, returns to review |
| Prove it works | → Proving Grounds |


## Skills

### 40. Now one job you do over and over.

**id** `skill_open` · **slot** — · **input** `intro` · **chars** —

> 🔊 Your file tells an AI who you are. A skill tells it how you do one particular job. Remember the thing you said you were tired of explaining? That's usually the right one to start with.

| Button | Goes to |
|---|---|
| Pick a job | → skill_name |
| Not now | → home |

### 41. What do you call this job?

**id** `skill_name` · **slot** S1 · **input** `text` · **chars** 3–60

> 🔊 What do you call it when you ask for it? Your name for it, not a formal one — 'the Monday numbers' beats 'weekly performance reporting' every time.

| Button | Goes to |
|---|---|
| Answer | → skill_objective |

### 42. What does a good one let you do? `NEW`

**id** `skill_objective` · **slot** S2 · **input** `long` · **chars** 60–300

> 🔊 Before the how — when this comes out right, what does it let you do next? That's the bar we'll measure it against later, so it's worth a sentence.

*Note — Not skippable: nothing can be scored against a skill with no objective.*

| Button | Goes to |
|---|---|
| Answer | → skill_trigger |

### 43. What sets it off? `RESHAPED`

**id** `skill_trigger` · **slot** S3 · **input** `chips-text` · **chars** 20–160

> 🔊 What kicks this off — a day of the week, or something happening? Either's fine; plenty of work runs on events rather than calendars.

| Button | Goes to |
|---|---|
| A day | → skill_method_pick |
| Something happens | → skill_method_pick |

### 44. A recipe, or a judgment call? `NEW`

**id** `skill_method_pick` · **slot** S6/S7 · **input** `chips-one` · **chars** —

> 🔊 Quick one. Is this more of a recipe — the same steps every time — or more of a judgment call, where it depends? Neither's better; they just get written down differently.

*Note — The fork that makes the skills interview work for judgment work.*

| Button | Goes to |
|---|---|
| A recipe | → skill_steps |
| A judgment call | → skill_principles |

### 45. Walk me through it.

**id** `skill_steps` · **slot** S6 · **input** `long` · **chars** 120–1500

> 🔊 Walk me through it the way you'd explain it to somebody new on their first day. Don't worry about numbering anything — just talk it through and I'll tidy it up.

| Button | Goes to |
|---|---|
| Answer | → skill_inputs (pre-filled from the narration) |
| Turn my notes into steps | → handoff to their AI, returns here |

### 46. What do you weigh, and where do you stop? `NEW`

**id** `skill_principles` · **slot** S7 · **input** `long` · **chars** 120–800

> 🔊 Since it's a judgment call: what do you weigh up when you decide? And are there lines you won't cross, whatever the situation?

| Button | Goes to |
|---|---|
| Answer | → skill_inputs |

### 47. What do you need to start?

**id** `skill_inputs` · **slot** S4 · **input** `chips-text` · **chars** 20–300

> 🔊 What do you need in front of you before you can start? I've pulled a few out of what you just told me — bin any I got wrong.

*Note — Pre-filled from their narration; confirming beats typing.*

| Button | Goes to |
|---|---|
| Confirm | → skill_tools |
| Add one | → stays here |

### 48. Where does it come from, and go?

**id** `skill_tools` · **slot** S5 · **input** `chips-text` · **chars** 20–300

> 🔊 Where does that come from, and where does the finished thing end up? This is the part that decides what could be automated later on.

| Button | Goes to |
|---|---|
| Answer | → skill_output |

### 49. What shape is the finished thing?

**id** `skill_output` · **slot** S8 · **input** `chips-text` · **chars** 20–200

> 🔊 And what does the finished thing look like — an email, a document, a list, a spreadsheet?

| Button | Goes to |
|---|---|
| Answer | → skill_checks |

### 50. How do you know it's right? `NEW`

**id** `skill_checks` · **slot** S9 · **input** `long` · **chars** 40–400

> 🔊 Before you send it, how do you check it's right? And while you're there — what usually goes wrong with this one?

| Button | Goes to |
|---|---|
| Answer | → skill_example |

### 51. Paste a good finished one. `NEW`

**id** `skill_example` · **slot** S10 · **input** `paste` · **chars** 0–3000

> 🔊 If you've got a good finished one handy, paste it in. One real example pins the format, the length and the tone all at once.

| Button | Goes to |
|---|---|
| Paste | → skill_autonomy |
| Not handy | → skill_autonomy |

### 52. Should it run without you?

**id** `skill_autonomy` · **slot** S11 · **input** `chips-one` · **chars** —

> 🔊 Last one. Would you want this running without you? You can say never — that's a real answer and we'll record it as one.

| Button | Goes to |
|---|---|
| Answered | → skill_review |

### 53. Here's the skill.

**id** `skill_review` · **slot** — · **input** `review` · **chars** —

> 🔊 There's your skill, with the objective you wrote at the top of it. Want to put it to the test against that objective?

| Button | Goes to |
|---|---|
| Prove it | → Proving Grounds (skills mode) |
| Add another skill | → skill_name |
| Done | → home |

