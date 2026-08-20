# Architecture

## Module map

```
src/
  panel/                      React app rendered in the side panel
    main.tsx                  mount
    App.tsx                   surface router: 'home' | 'flow' — no 'sheet' surface built yet
    surfaces/
      Home.tsx                derived entirely from core/freshness + core/storage
      FileActions.tsx         download/import Context.md, DOM-only, wraps core/files/{generate,parse,restore}
      Flow.tsx                the generic step runner — one component for all five flows
      sheets/Capture.tsx  sheets/Briefing.tsx  sheets/Audit.tsx  sheets/Report.tsx
    components/               Button Pill Field ReadOnlyBlock FileRow Banner Meter Toast Sheet
    cues/
      engine.ts               chain runner: play → wait for `until` → hand off
      verbs.ts                sweep | ring | ringViolet | focus | bob
      Pointer.tsx             cross-surface pointer overlay — also where `point` lives
  background/
    service-worker.ts         message router only. No state in memory — it will be killed.
  content/
    composer.ts               capability probe, fill, optional submit, optional read-back
    selectors.ts              versioned per-site selector map
  core/                       PURE. No chrome.*, no DOM, no direct fetch.
    flow/       flow.ts (the question data)  runner.ts  types.ts
    files/      generate.ts   parse.ts        <- must round-trip. See CONTRACTS.
    freshness/  clocks.ts     nextMove.ts
    audit/      parsers/{chatgpt,claude,gemini}.ts  normalize.ts  signals.ts
    report/     scoring.ts     <- R1-11's wb:report.scores write only. metrics.ts, render.ts
                                   (the full report engine) are out of scope for Release 1.
    packs/      fetch.ts (takes an injected fetcher)  verify.ts  merge.ts
    storage/    keys.ts       migrations.ts  client.ts   <- the ONLY module that touches chrome.storage
    briefing/   build.ts
  schema/       *.schema.json + generated *.types.ts
design/tokens.json            single source of truth for CSS custom properties
```

## Data flow

```
                 ┌──────────── side panel (React) ────────────┐
  chrome.storage │  core/storage.client  ←→  surfaces         │
       ▲         │        ▲                     │             │
       │         │        │                core/freshness     │
       │         │   core/flow.runner       core/report       │
       │         └────────────┬──────────────────────────────┘
       │                      │ typed messages
       │              ┌───────▼────────┐
       └──────────────│ service worker │  routing only
                      └───────┬────────┘
                              │
                      ┌───────▼────────┐
                      │ content script │  probe / fill / (submit) / (read)
                      └────────────────┘
```

**Nothing derived is stored.** Freshness, next move, progress percentage and file contents are all
computed from answers on every render. A stored progress state drifts out of agreement with the
data by month four and starts telling people untrue things about their own file.

## Storage contract

`chrome.storage.local` — split by write frequency so a small change does not rewrite everything.

| Key | Holds | Notes |
|---|---|---|
| `wb:meta` | `{ schemaVersion: number, installedAt: string }` | Drives migrations |
| `wb:answers` | `Record<questionId, AnswerValue>` + repeatable records | The interview |
| `wb:skills` | Skills the person authored | |
| `wb:packs` | `{ url, revision, cachedAt, skills }[]` | Last good copy kept |
| `wb:report` | Baseline metrics + score history | Small, derived once, then appended |

### `wb:answers`, precisely

Established by `core/flow/runner.ts` (R1-06), which is the only code that writes this key:

- A value of `null` means **explicitly skipped** — distinct from the key being absent, which means
  never reached. Position-finding depends on this distinction (a skipped question must not be
  re-asked on every render) — see `findPosition`.
- Repeatable records live in `Answers.repeatables[blockId]`, an array of `Record<fieldKey,
  AnswerValue>`. A record can exist at an index before every field in it is answered — the array
  is extended field-by-field, not pre-allocated.
- `Answers.answeredAt` is keyed by plain question id for top-level answers, but by
  `` `${blockId}#${recordIndex}#${fieldKey}` `` for repeatable fields — a plain field key would
  collide across records (e.g. every `entities` record has an `entity_name`). Anything reading
  `answeredAt` for freshness (R1-12, see `core/freshness/nextMove.ts`) needs to know about this
  compound form for repeatable-sourced content.
- `Answers.reflectedAt` (R1-07) follows the exact same convention as `answeredAt` — plain
  question id at top level, the same compound form inside a repeatable — and is written only by
  `applyReflect`, never by `applyAnswer` or `applySkip`. A text question with `interpret` set is
  "answered but not yet reflected" when its key is present in `values`/the record but absent from
  `reflectedAt`; `findPosition` routes that state to the reflect screen instead of treating it as
  done. `core/freshness/nextMove.ts`'s `mostRecentAnsweredAt` reads both maps together for a
  file's "N days old" badge.
- **Which question is "current" is never stored.** It's recomputed from this data on every render
  by walking the flow's modules for the first unanswered, non-`skipIf`'d node — see
  `findPosition` in `core/flow/runner.ts`, and "Nothing derived is stored" below.

`chrome.storage.sync` — **preferences only**. It caps near 100 KB total with an 8 KB per-item limit,
so it cannot hold a context file. Never put answers here.

| Key | Holds |
|---|---|
| `wb:prefs` | narrator, mic, reduced motion, hand-off posture, subscribed pack URLs |

### Migrations

Forward-only, one function per version bump, in `core/storage/migrations.ts`:

```ts
export const migrations: Migration[] = [
  { to: 2, up: (s) => ({ ...s, /* ... */ }) },
];
```

Before any migration runs, write a full export to a download. If a migration throws, restore
from that file and tell the person plainly. Never silently drop data.

## Message contract

One discriminated union in `src/schema/messages.types.ts`. Every response is a result, never a throw.

```ts
type Request =
  | { t: 'probe';  site: SiteId }
  | { t: 'fill';   site: SiteId; text: string }
  | { t: 'submit'; site: SiteId }
  | { t: 'read';   site: SiteId }

type Response<T = void> = { ok: true; data: T } | { ok: false; reason: FailReason }
type FailReason = 'no-permission' | 'no-tab' | 'selector-missing' | 'timeout' | 'refused'
```

Rules:
- A failed response is normal, not exceptional. The panel always has a manual fallback for each.
- `selector-missing` is silent to the person. It flips the posture back to manual for that site.
- The service worker holds no state between messages.

## Content script

`selectors.ts` is a versioned map, one entry per site, each with a `probe()` that returns which
capabilities are available right now:

```ts
type SiteCaps = { composer: boolean; attach: boolean; submit: boolean; reply: boolean }
```

Probe on injection, cache per tab, re-probe on SPA navigation. If `composer` is false the site
is treated as manual-only. The map is the thing that will break most often — keep it in one file,
keep it data-shaped, and make it updatable in a patch release without touching anything else.

## Cue engine

Guidance is declared as data on each step, never written per screen:

```ts
cues: [
  { play: ['sweep:choices'],             until: 'choice', say: '…' },
  { play: ['ring:prompt','sweep:copy'],  until: 'copy',   say: '…' },
  { play: ['focus:paste','point:page.composer|Ask it here'], until: 'paste' },
  { play: ['ring:next'],                 until: 'next' },
]
```

The engine plays link `n`, waits for its `until` event, marks it done and advances. Verbs resolve
targets through a registry so a target name never appears in a component. Every verb has a
reduced-motion form that keeps the instruction.

Invariant: **a cue means one instruction and stops the moment it is followed.** Cues accelerate;
they never gate. A person who ignores every cue still completes the flow.

## File round-trip

`core/files/generate.ts` and `core/files/parse.ts` are inverses. This is a hard requirement from
Release 1, not a later feature: the downloaded file is the only backup, so it must be re-importable.
A property test asserts `parse(generate(answers)) ≈ answers` over generated inputs.
