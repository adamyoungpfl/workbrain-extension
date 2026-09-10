# myworkbrain.org

The companion site for the Workbrain extension. Three files, no build step, no
dependencies — open `index.html` in a browser and it runs.

```
site/
  index.html   all nine pages, one document; pages are swapped by the router
  site.css     tokens + components, mirroring the extension's design/tokens.json
  site.js      hash router, scroll field, white-paper cover, Proving Grounds
```

## Deploy

Upload the three files to the domain root. Nothing to compile, nothing to
install. Works on Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3, nginx.

## Deep links from the extension — a contract

The panel opens pages here by hash. **These slugs are shipped software's
buttons: add, never rename.**

| Slug | Page | Likely caller in the app |
|---|---|---|
| _(none)_ | Home | brand click |
| `#how-it-works` | Docs | "What moves this?" |
| `#white-paper` | White paper | Home foot |
| `#library` | Library | Skill Development area |
| `#proving-grounds` | Proving Grounds | "Prove it works" / "Run a skill for real" |
| `#workbrain-plus` | Pricing | Workbrain+ row |
| `#services` | T.I.M. services | "Talk to a person" |
| `#download` | Download | store listing fallback |
| `#privacy` | Privacy & guardrails | trust foot |

## The proof bundle — a second contract

The app's "Take it to the Proving Grounds" press copies ONE text blob and
the Grounds' intake parses it (`site.js` mirrors
`src/core/proof/bundle.ts`, where the roundtrip is unit-tested):

```
===WORKBRAIN PROOF BUNDLE v1===
===PROMPT===
<the captured ask, word for word>
===BASELINE ANSWER===
<what their AI answered before the file existed>
===CONTEXT FILE===
<Context.md, byte for byte>
===END===
```

Add fields by adding fences; never rename one. A raw Context.md pasted
alone is accepted as the file-only degradation. Everything the page holds
lives in sessionStorage and dies with the tab (Adam's OPEN #9 ruling).

Routing is bidirectional: nav updates the hash, and back/forward works.
`ROUTES` in `site.js` is the whole list. Unknown slugs fall back to Home.

Not built yet, and worth deciding before the app wires up its buttons:

- **Sub-targets.** `#proving-grounds?mode=skills` to land straight in Skills
  proving after a skill is built. `site.js` already strips the query off the
  slug, so adding this is a few lines in `show()`.
- **Handing the file over.** Right now the visitor drops the file on arrival.
  Passing it in the URL would put the person's content in a location bar and in
  history, which `docs/GUARDRAILS.md` should probably forbid; `postMessage`
  from the panel, or a one-shot `chrome.storage` handoff the page reads, are
  the honest options.

## What is real and what is placeholder

Real, taken from the repo — do not casually reword:

- The tagline, from `docs/NORTH-STAR.md`.
- The guardrail quote on the privacy page, verbatim and unabridged.
- The hosted-proving amendment, from `docs/PROVING-GROUNDS.md` — including the
  refusal to claim a model can report environment or location.
- `USED` / `MISSING` / `UNSURE`, and "a claim, not a trace".
- Every colour, every type size, the radii and the elevations, from
  `design/tokens.json`.
- The glyphs: the Peaks mark is `design/icon-peaks.svg`; the layers, run, stack
  and download icons are `LAYERS_ICON`, `RUN_ICON`, `STACK_ICON` and
  `DOWNLOAD_ICON` from `src/panel/surfaces/Home.tsx`.

Placeholder — replace before launch:

- **Prices.** `$9/month`, `starting at $500/month`, and the service prices
  (`from $240`, `from $680`) on the services page. The hourly-vs-monthly story
  needs reconciling.
- **White paper.** Title, abstract, contents list, page count, and the PDF link
  (`TODO` in `index.html`).
- **Chrome Web Store URL.** Two `TODO`s: the hero/download CTA and the header
  pill both point at `#download`.
- **Library catalog.** Six sample skills, hardcoded in `index.html`.
- **Proving Grounds data.** `PROOFS` in `site.js` — three skills with
  objectives, outputs and criteria. The shapes are what the UI expects; wire
  them to the real run endpoint when the hosted environment lands.
- **Booking.** Static slots; needs the Cal.com embed.

## The background

`site.js` draws the extension's own icosahedron — twelve golden-ratio vertices
and the thirty pairs at edge length 2, ported from
`src/core/geometry/icosahedron.ts`. Two uses:

1. **The scroll field.** Scroll pulls the camera backward through a field of
   lattices. Lateral spread is *absolute* rather than scaled by depth, which is
   what makes the effect read as "these few are part of many": up close only a
   narrow cone is on screen, and pulling back widens the window. Count rises
   with distance² while each shrinks as 1/distance, so the ink stays level
   instead of thinning to white. Tune with `CONFIG` at the top of the field
   section — `travel` (how far the camera goes), `density` (×14 lattices),
   `exposure`.
2. **The white-paper cover.** The same solid on the globe's dark field
   (`--splash-field`), lit rather than traced.

Both still under `prefers-reduced-motion`, and both paint synchronously on boot
so a throttled first frame never leaves a blank ground.

## Accessibility notes worth keeping

- Every control clears the 44px target floor, except deliberately small
  secondary chips inside cards.
- Text is at or above 4.5:1 on its own ground; the accent tints under coloured
  text were chosen against that floor.
- Nothing is distinguished by colour alone — every state is also words.
- Both canvases are `aria-hidden`; they are scenery and carry no information.
