# Automating the benchmark — what it takes, and what it must not become

Adam, 2026-08-31: *"Can we consider automating this by setting these up as API
calls so that we can automate the testing throughout the build?"*

Yes, and it is worth doing — a benchmark run by hand happens when somebody
remembers, and one that runs on every build happens always. But two halves of
it automate very differently, and conflating them would quietly wreck the
thing.

## What automates cleanly

**Running the prompts.** Eighteen cells × N models is a loop. Each provider's
completion endpoint takes a system-or-user message and returns text; the
harness already produces the exact prompt bytes. Nothing about this is subtle.

**The absence check.** This is the part worth automating most, because it is
the part a tired human scores worst. `scripts/bench/persona.ts` lists what the
file does not contain, and most of those absences are mechanically detectable
in an answer:

| Absence | Detector |
|---|---|
| `budget-figure` | any currency symbol or bare number in a money-shaped context |
| `dates` | any resolved calendar date — the file contains none |
| `vendor-headcount` | a cardinal number attached to people |
| `second-manager` | any capitalised person-name that is not Priya |
| `clowns` | the literal word |

A detector that flags candidates for a human to confirm is honest. One that
scores unattended is not — but flagging alone removes most of the work and all
of the fatigue.

**Regression, which is the real prize.** Once a baseline exists, every change
to `generate.ts` can re-run the pack and report movement. That is what turns
this from an experiment into a guardrail.

## What must NOT automate

**The judge.** Scoring "sounds like them" or "ready to send" with a model means
measuring the file with the same class of system the file is being tested on.
When those two agree, nothing has been learned; when they disagree, nobody
knows which was wrong. The voice dimensions stay human, and that is a
limitation to state rather than engineer around.

**The verdict.** An automated run produces a number. Whether the number means
the file got better is a reading, and readings belong in the design log with a
name attached.

## What it needs before it can be built

1. **API keys, and a decision about where they live.** Not in the repo, not in
   `.env` committed by accident. `process.env` at run time, absent by default,
   with the runner refusing to start rather than half-running.
2. **A cost ceiling.** 18 cells × 3 models × a run per build is not free, and
   an unbounded loop against a paid API inside a build is the kind of thing
   that is discovered on an invoice.
3. **A decision on which models are IN the standard.** This matters more than
   it looks: a benchmark that runs against whatever is convenient measures
   convenience. The set should be named, versioned in the manifest beside the
   task set, and changed deliberately.

## The guardrail question, again

`docs/GUARDRAILS.md` bars the PRODUCT from making AI calls. This is
`scripts/`, it ships in nothing, and it runs against a synthetic persona. The
line to hold is that no code path from the extension ever reaches this
directory — which is already true and is worth an audit rule if it is ever in
doubt.
