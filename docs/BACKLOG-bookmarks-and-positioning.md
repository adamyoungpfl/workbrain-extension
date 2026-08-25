# Backlog — LLM bookmarks, and the microwave piece

Captured 2026-08-25. **Not started. Hold until the current build resolves.**

---

## A · A bank of LLM bookmarks

**The idea:** a button that takes someone to the AI they use, and a bank of slots so they can
bookmark each one. Set up early in the flow, then used later so the proof loop can **switch between
services** — and re-prove on any or all of them whenever the file changes.

### Most of this costs nothing, and one part is already built

The Chrome capability survey (`docs/V1.7-REFINEMENT.md`, VB-40) settled the permission question,
and it lands well here:

- **`chrome.tabs.create({ url })` needs no `tabs` permission.** Opening someone's AI in a tab is
  free — no manifest change, no install warning, no store disclosure.
- **Reading which tab they are on is the expensive thing**, and it is not needed. The side panel
  deliberately does not get `activeTab`, and `tabs` costs the *"Read your browsing history"*
  warning that `docs/GUARDRAILS.md` bans outright.

**So the design that costs nothing is: the person tells us, we never look.** They pick from a list
or paste a URL; we store it and open it on request. The moment the extension tries to *detect*
where they are, it becomes VB-40 and needs a permission conversation.

**And the list already exists.** `PROOF_SERVICES` in `src/core/flow/proofSource.ts` carries
ChatGPT, Claude, Gemini, Copilot and "something else", each with its own verbatim attach tip, and
the proof loop already asks which one they use (`proof_service`). This is that question promoted
from a one-off into a stored, multi-slot preference.

### What it unlocks
Re-proving on demand is the real prize. Today the proof loop is a one-time ceremony; with slots it
becomes something someone repeats after a meaningful edit, on whichever assistant they care about.
That also gives the **cross-service comparison** the proof loop implies but cannot currently
deliver — same file, same prompt, four answers.

### On capturing it
Adam: *"capture that if it's still advisable and within the rules… but not share or expose anywhere
except in the file within the browser."*

Apply `docs/GUARDRAILS.md`'s test: **a number the person typed is data; a number the product
observed is telemetry.** A bookmark someone chose and saved is squarely authored — same class as
`wb:report.scores`, and `store/PRIVACY.md`'s "everything you type" already covers it. **No new
disclosure, provided we never detect anything.**

Worth noting **VB-68's usage log already names the service per line**, so the cross-LLM
distribution arrives from the file rather than from watching. The two ideas fit together: bookmarks
make re-proving easy, the log records what came of it, and neither requires observing a browser.

### Open
- How many slots, and are they ordered or named?
- Does a bookmark carry the person's own URL (a specific project or workspace) or just the service?
  A workspace URL is far more useful and slightly more identifying — still local, but worth deciding.
- Does the proof loop's existing single `proof_service` answer migrate into a slot, or coexist?

---

## B · The microwave piece (marketing)

**Not extension work** — a positioning think-piece, and it belongs wherever `../modelcitizen`'s
content lives rather than in this repo. Captured here so it is not lost.

**The parallel:** culture treats cooking like a microwave — everyone is comfortable with fast, easy,
pre-packaged meals. AI is being treated exactly the same way: useful for things you can do quickly
without investing much in them.

**The turn:** Workbrain is not a better microwave, and it is not even just a full kitchen. It lets
you **train a kitchen staff** — to prepare dinner and set the table. That is the before-and-after
for someone with the appetite to try something other than the next pre-packaged meal.

**The audience alignment:** Workbrain as the **organic, farm-to-table** tool for professionals who
care about the quality of their AI experience as much as the quantity, or more. It maps onto a
mindset that already exists and is already articulate — people who are health-conscious and wary of
what *"they"* put in products before *"we"* consume them.

### Why this is strong, and the one place it could turn
The metaphor earns its keep because it names the *investment* honestly rather than hiding it. Every
other AI pitch claims to remove effort; this one says the effort is the point and the result is
categorically different. That is also exactly what the product does — fifteen minutes of questions
in exchange for something reusable.

**The risk to write against:** farm-to-table rhetoric curdles into smugness quickly, and the
"what *they* put in it" framing can slide from discernment into conspiracy. The version that works
is *"you can taste the difference and you know why"*, not *"everyone else is being poisoned."* The
product's own voice rules (`docs/design-system.html` §08 — never condescend, no jargon the person
did not bring) are the right guardrail for the piece too.

**One asset already exists:** the proof loop is this argument made literal — the same question
asked twice, once microwaved and once cooked. If the piece needs a demonstration rather than a
claim, that is it.
