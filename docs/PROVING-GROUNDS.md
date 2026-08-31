# The Proving Grounds — assessment

Adam, 2026-08-31: a hosted testing environment on the Work Brain site. The
extension's "prove it" button opens it in the main panel; the person pastes or
sends the prompt there; we control the environment, capture the response, and
format the paste-back with far higher precision. Plus *"ethical,
non-destructive prompt injections that return small useful details about the
environment, location, and other details… to help fine-tune the file."*

Three separable ideas, and they have three different answers.

---

## 1 · The hosted testing environment — strong, with a guardrail bill attached

**The idea is good and it fixes the worst part of the proof loop.** Today the
proof asks somebody to copy a wall of text, leave, paste, wait, copy the
answer, come back, and paste again. Every one of those steps is a place to
abandon, and the paste-back arrives as unstructured text we then have to guess
at. A controlled environment fixes the drop-off and the parsing in one move.

**What it costs is the sentence the whole product is built on.**

`docs/GUARDRAILS.md`, unabridged:

> **Never transmit the person's content anywhere. Not to us, not to their AI
> without them seeing the exact text first, not to a pack publisher.**

Adam's framing — *"the file still only leaves the browser if they choose to
test in the proving grounds"* — is the right instinct and it satisfies the
second clause. It does not satisfy **"not to us"**, which is absolute and is
the clause the install page is really promising.

This is not a reason to refuse. It is a reason to make it a **written
amendment** the way BS-02's feedback door was, rather than a quiet exception
somebody discovers in the network tab. What that amendment has to say:

- **What is sent, exactly.** The prompt — which is the file plus a task — and
  nothing else. No answers store, no identifiers, no session.
- **Where it goes and what happens to it.** Through us to a named model, and
  then what: held, logged, discarded? "Discarded on response" is the only
  answer consistent with the rest of the product, and it has to be true rather
  than intended.
- **That it is a door, not a default.** The copy-and-paste path stays and stays
  first. A proving ground that becomes the only way to prove it has quietly
  turned an offline product into a service.
- **What the install page now says.** The Chrome listing currently discloses no
  collection. A feature that can transmit the file changes the data disclosure,
  and the store's User Data FAQ requires that even for handling we consider
  incidental. This is a `docs/STORE.md` change and a privacy-policy change, not
  only a code change.

**And one design constraint worth naming early:** running it costs money per
press. That is fine, and it is also the first thing in this product that has a
marginal cost per user — which is a business decision wearing a feature.

---

## 2 · Capturing structure back — the best part, and cheapest without a server

This is where most of the value is, and **it does not need the hosted
environment at all.**

The prompt can simply *ask* for what we want back, in a shape we can parse:

```
When you are done, add a short block in this exact form:

USED: the sections of my file you actually drew on
MISSING: anything you needed that the file did not contain
UNSURE: anything you had to guess at
```

That is not an injection. It is a visible instruction in a prompt the person
can read before they send it — which is the condition the guardrail already
sets. Parse those three lines on paste-back and the product learns, per real
use:

- **which sections earn their place** (USED, aggregated over time),
- **which questions are missing** (MISSING — the strongest possible input to
  "what should we ask that we don't"),
- **where the file is ambiguous** (UNSURE).

**That is the fine-tuning signal Adam is after, and it needs no server, no
transmission, and no guardrail change.** It also works today, in the existing
copy-and-paste loop, and would keep working inside a proving ground later.

The honest caveat: a model's self-report about its own use of context is not
reliable. It is a *claim* about what it used, not a trace. Useful in aggregate,
never as a fact about a single answer — and it should be labelled that way
wherever it surfaces.

---

## 3 · The "prompt injections" for environment and location — this one does not work

I want to be straight about this rather than build it and let it disappoint.

**A model cannot tell you the environment or the location.** It has no access
to the browser, the OS, the network, or where somebody is sitting. It sees the
prompt. Asking it to report those things does not retrieve them — it produces
plausible text in the shape of an answer, which is **exactly the failure mode
we spent this week building a detector for.** We would be adding a feature
whose output is confabulation and then tuning the file on it.

The parts that *are* obtainable are obtainable honestly:

| Wanted | Actually available | How |
|---|---|---|
| Which model answered | Yes | We chose it, or the API says so |
| Token counts, latency, cost | Yes | The API response, in a proving ground |
| Whether the file was used, and how | Partly | Ask it, visibly, and treat as a claim |
| What the file was missing | Partly | Same |
| Environment, location, device | **No** | Not in the prompt. Anything returned is invented |

**And on the word "injection".** Anything hidden from the person breaks *"them
seeing the exact text first"* — the one clause the guardrail spends its
strictness on, and the one a security researcher would test first. If the extra
instructions are visible, they are not injections, they are prompt. If they are
invisible, the product has started doing to its users the thing it warns them
about. There is no ethical version of the invisible one; there is a perfectly
good version of the visible one, and it is §2 above.

---

## Recommendation, in order

1. **Build §2 now.** The USED / MISSING / UNSURE block in the existing paste
   loop. No server, no guardrail change, no cost per user, and it starts
   collecting the tuning signal immediately. This is a small slice.
2. **Then decide on §1 deliberately**, with the guardrail amendment, the store
   disclosure and the per-press cost all written down before any code. It is a
   good feature and it changes what this product is; both of those are true.
3. **Drop §3.** Keep the honest metadata the API gives us for free if the
   proving ground happens.
