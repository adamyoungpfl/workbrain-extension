# Proposal — drafting the interview from the person's own AI estate

**Status: proposal only. Not scheduled, not on the critical path, nothing committed to.**
Written 2026-08-20 to capture the thinking while it's fresh. Revisit after V1 Beta is in front of
real users — the questions this raises are better answered with usage data than in the abstract.

Roadmap-wise this is Release 4 territory (`docs/RELEASE-1.md` puts every assisted hand-off out of
scope, and the release exists to test whether people finish an interview at all). Nothing here
should influence V1.1.

---

## The idea

A person installs a Workbrain extension in Claude Desktop (or an equivalent for Gemini). They press
one thing. Their own AI — using connectors they already granted, to mail, docs, calendar, chat —
drafts the parts of the Context interview that are really about *recall*, and hands back a file
they import.

## Why it's cheaper than it sounds

Two pieces already built for other reasons carry most of this.

**The bridge exists.** R1-09/R1-10 produced a complete, round-trip-tested `Context.md` format with a
real parser and an import flow that overwrites `wb:answers` wholesale. An outside tool's entire job
can be *"emit a valid Context.md."* No new permission, no manifest change, no new plumbing in the
extension. The handoff mechanism was built as the backup story and turns out to be a general-purpose
ingestion path.

**It's the existing hand-off pattern, not a new one.** The proof loop (R1-11) already works as:
Workbrain generates a prompt → the person's own AI does the work → they bring the result back. This
is the same mechanic at estate scale. The architecture doesn't change shape.

**`core/` being pure is what makes the port nearly free.** `generate.ts`, `parse.ts`, `source.ts`
and `adapter.ts` have no `chrome.*` dependency by rule (`CLAUDE.md`'s one architectural rule). They
drop into a Node MCP server essentially unchanged.

**Workbrain never touches the estate.** The person's AI reads their own connectors, in their own
app, under credentials they already granted. Workbrain receives a file. That distinction is what
keeps `docs/GUARDRAILS.md`'s "never transmit the person's content anywhere" intact, and it is the
difference between a clean Chrome Web Store review and a painful one.

## Why it should NOT fill in the whole interview

The interview splits cleanly, and the split matters more than the feature does. Computed from the
real `estimatedMinutes` in `src/core/flow/source.ts`:

| | Modules | Est. minutes | Share | Verdict |
|---|---|---|---|---|
| **Recall** | My World, Initiatives, Audience Profiles, Vocabulary, Reference Examples | 22–42 | ~57% | AI drafts well |
| **Judgment** | How I Think, How I Communicate, Context Boundaries | 11–19 | ~27% | Person must answer |
| **Mixed** | Orientation, About Me, Responsibilities | 6–10 | ~15% | Partial at best |

*(Totals: 39–71 minutes across all eleven modules.)*

"Name the people, teams and tools you mention constantly" is a retrieval problem an AI with mailbox
access solves better than a person staring at a blank box — and My World plus Initiatives alone are
13–25 minutes, the most tedious stretch of the interview. Reference Examples is the sweetest case:
it can surface things the person actually wrote, which is exactly what that module asks for and the
hardest thing to produce on demand.

But "How direct should AI default to?" and "What should AI never do without asking?" are preferences
and rules. An AI inferring those from sent mail is guessing at intent from behaviour — wrong often
enough to irritate, and those are precisely the answers that have to be the person's own.

**So the product is "AI drafts the tedious half; you answer the half that's actually about you."**
Better pitch, preserves what makes the file theirs, and less to build than doing all of it.

## Staged path — cheapest first

**Stage 0 · No code. Test the premise.**
One well-built prompt: the file format, the System Grounding Rule, and the recall-heavy questions.
Paste into Claude Desktop with connectors on. Import what comes back through the existing flow.
Costs an afternoon and answers the only question that matters — *is an estate-informed draft good
enough to be worth confirming rather than rewriting?* If the output is poor, this ends here for the
price of an afternoon instead of a build.

**Stage 1 · The MCP server.** A Node MCP server reusing `generate.ts`/`parse.ts`/`source.ts`,
packaged as an `.mcpb` bundle for one-click install in Claude Desktop. Exposes the questions and
the required output format; the person's AI does the reading. Handoff stays file-based.

**Stage 2 · A real button — only if Stage 1 earns it.** Connecting the desktop side directly to the
extension means native messaging (an OS-level host manifest, per-platform installers) or a localhost
loopback (a host permission plus a `fetch` the audit script currently forbids outside `core/packs`).
Both add permission surface and install friction. Resist until people are actually using Stage 1.

**Google:** materially worse today. There's no third-party equivalent to MCP's "install a thing that
reads your estate and writes a file." Apps Script could do it from inside Workspace, but that's a
separate build and a separate distribution story. Claude Desktop first; treat Google as a later port.

## Risks, named now so they aren't discovered later

1. **"No feature that only works online" is a guardrail.** This is inherently online and
   estate-dependent. It must be strictly additive — an accelerator, never a path anyone needs.
2. **Drafted ≠ answered.** Every AI-drafted answer has to arrive as a *proposal* the person
   confirms. The reflect step (R1-07) becomes more load-bearing, not less. A subtly-wrong file is
   worse than an honest short one.
3. **Store review — this one touches R1-13.** Keep the desktop piece a separate artifact with its
   own install. The moment the Chrome extension's listing mentions reading mail, the single-purpose
   statement gets complicated and the "collects nothing" claim needs defending. Today it doesn't.
4. **The other-people problem.** `docs/GUARDRAILS.md` already flags that a person's history contains
   colleagues and client details. An estate scan surfaces exactly that — names, relationships,
   project detail. It's intended here (My World literally asks for names), but it strengthens the
   case that drafted content is reviewed before it is ever written to storage.
5. **It could undercut the thing that makes the file good.** The interview works partly *because*
   the person does it — the answers are theirs, in their words. Automating too much of it produces
   a competent file nobody feels ownership of. The recall/judgment split above is the mitigation,
   but it's a real product risk and worth watching in Stage 0's output.

## Open questions for later

- Does an estate-drafted answer survive the reflect step, or does the person rewrite it anyway?
  (That's the Stage 0 test, and the answer decides whether any of this is worth building.)
- Should drafted answers be visually marked as drafted until confirmed, and is that a schema change
  to `Answers` or a transient import-review state?
- Does this change the freshness story? An estate-drafted file could in principle be re-drafted on a
  schedule — which is the drift check, and is out of scope for all of Release 1 for good reasons.
