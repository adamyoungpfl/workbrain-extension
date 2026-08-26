# Backlog — platform reach and monetization (morning review, not deep spikes)

Captured 2026-08-26, Adam's framing kept: possibility / wisdom / weight only. Nothing here
redefines what is being built. The lens: free takes people 5%→60% utilization; paid is 60→100;
and the open meta-question — is monetizing an unproven-but-immediately-valuable product worth
the work before a funded competitor replicates it?

## A · Website-direct, phone, and joined files
**Possibility: higher than assumed — half of (a) already exists.** The sibling repo has a shipped
web Context *Builder*, and `WorkBrainContextInterview.tsx` (2,306 lines) + `contextInterviewFlow.ts`
are sitting in the site tree right now (uncommitted — the files my stray commit accidentally swept
up and I restored). Separately, the extension's own architecture was built for this: `core/**` is
pure TS, `chrome.*` touched only through the storage client — **swap one storage adapter
(localStorage/IndexedDB) and the entire interview, generator, derivation and freshness engine runs
on the web.** LOE for (a): small-to-medium, mostly panel-chrome reshaping, not logic.
**(b) Phone:** Chrome mobile has no extensions — the web version IS the phone story (PWA). Same
core, same adapter. **(c) Joined files:** technically trivial (parse both, merge by section
recency — `parse.ts` round-trips already); the heavy part is principle: sync-between-devices
implies identity, and *no accounts* is the trust posture the whole product stands on. File-based
merge ("import from your other machine") keeps the posture; a sync service breaks it.
**Wisdom:** high for (a)/(b) — it widens the free 5→60 funnel with code already paid for.
**Weight:** the (c) decision is the only heavy one, and it is a values call, not a technical one.

## B · Pro tier: rubric-graded answers, local models, MCP
**The honest technical note first:** Ollama cannot run *inside* a Chrome extension (no native
binaries). The in-browser route is WASM/WebGPU models — real, but a large download and small-model
quality for rubric grading. A local companion app is install friction the product has none of.
**The opportunistic reframe:** answer-vs-criteria evaluation is exactly what the `interpret`
machinery already does through the person's OWN AI, at zero cost to us. **A "pro" layer can ship
as content — per-question rubrics embedded in better prompts, their AI does the grading — with
zero COGS, no service, no maintenance tail, before any hosted inference exists.** That is 60→100
as authored depth, not infrastructure.
**MCP:** the extension can't be an MCP host, but Workbrain FILES are precisely what MCP resources
are for — a small MCP server that serves someone's Context/Skills/Actions files to Claude Desktop
etc. is low LOE, fits the "library of upgrades" idea, and rhymes with the Actions-derivation story
(the file as the interface). **Wisdom:** rubrics-as-content now, MCP server as the first paid
"upgrade", hosted eval only if proven demand. **Weight:** hosted anything = the first recurring
cost and the first uptime promise this product has ever made — that's the real weight.

## C · Red Pill (marketing skin)
**Two hard facts before the creative:** (1) the Chrome Web Store prohibits duplicate/repetitive
listings — a reskinned second extension risks BOTH listings; (2) the store has no paid-extension
mechanism — a $100 price means external checkout + license gating, which drags accounts into the
no-accounts product. **The version that keeps everything:** Red Pill as a *campaign and a site
funnel*, not a second binary — the ads' two sides (symptoms / missing-out) land on a Red Pill
page, the $100 buys the 7-day plan + burst support (site-side, Stripe already wired), and the
extension stays the free, unbranded-pure artifact both funnels install. **Also worth naming
plainly:** "red pill" carries loud cultural baggage in 2026 beyond the film reference; the
symptoms/FOMO framing works with or without that name — test the tag before betting the campaign
on it. **Wisdom:** the two-sided ad structure is strong; the second-extension mechanic is the
risky part, and it's also the unnecessary part. **Weight:** low if campaign-only; high if it
forks the product.

## The meta-question
The service ladder already answers the shape: the fastest *honest* monetization is what V2.2 just
built — every Skills file derives an Actions file that is a statement-of-work generator for TIM.
Services attach today with zero product forks. App-licensing revenue can wait for proof;
attachment revenue cannot be replicated by a funded competitor, because it's Adam.


## The $42 easter egg (recorded 2026-08-26)

Adam's personal easter egg: consider a **$42 price point** on services or skills packages —
Hitchhiker's Guide, the answer to the ultimate question of life, the universe, and everything.
Explore whether 42 can attach to the project as a marketing-and-principles idea (the number
worked into the product's story somewhere meaningful, not just a price tag). Pricing lives
portal-side (NORTH-STAR decision 4), so this activates with the pricing/marketing work, not in
the extension.
