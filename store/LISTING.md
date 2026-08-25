# Chrome Web Store listing — ready to paste

Generated for R1-13. Assets in this folder: four 1280×800 screenshots, one 440×280 promo tile,
icons in `public/icons/`. Regenerate the images with `npm run build && node scripts/store-shots.mjs`.

---

## Title (45 char max)
```
Workbrain — your context file for any AI
```
*40 characters.*

## Short description (132 char max)
```
Stop re-explaining yourself to AI. Build one file about how you work, and hand it to whatever assistant you already use.
```
*119 characters. Leads with the problem, not the mechanism, per docs/STORE.md.*

## Category
Productivity

## Detailed description

```
You already explain yourself to AI every single time. Your role. Your team. Who Priya is. How you
like things written. Then you close the tab and do it again tomorrow.

Workbrain asks you the questions once, and writes the answers into a plain text file you own.
Hand that file to ChatGPT, Claude, Gemini, Copilot — anything that takes an attachment — and it
starts the conversation already knowing you.

HOW IT WORKS

Open the side panel and answer one question at a time. Skip anything. Stop whenever you like and
pick up where you left off. It takes about fifteen minutes, and the questions are the point —
they are the ones you would never think to answer about yourself.

As you go, you watch your file build. When you are done, you download it. That is the whole
product: a file, in your hands.

Then prove it worked. Workbrain gives you the same question twice — once with nothing loaded,
once with your file attached — and you see the difference in your own AI, in your own words.

WHAT IT DOES NOT DO

No account. No login. No email address.

Nothing you type is sent anywhere. There is no server. Your answers are saved in your own browser,
on the device you typed them on, and your file only leaves your computer when you download it and
hand it somewhere yourself.

It works offline. It works on a plane.

WHO IT IS FOR

Anyone who uses AI often enough to be tired of introducing themselves to it. You do not need to be
technical. There is nothing to configure, no prompts to write, and no jargon — if you can answer
a question about your own job, you can finish this.
```

## Permission justifications

**storage**
```
Saves the person's answers and generated file on their own device, so they can close the panel and
come back to it. Nothing is transmitted; the extension has no server and makes no network requests.
```

**sidePanel**
```
The product is a side panel. It must stay visible beside the page the person is working in, since
the whole point is answering questions without leaving what they were doing.
```

*No host permissions are requested at install. The four optional AI origins in the manifest are
declared for a later release and are never requested in this version — declining them, or never
being asked, leaves the extension fully functional.*

## Single purpose statement
```
Workbrain builds and maintains a personal context file that a person can give to any AI assistant,
so they do not have to re-explain who they are and how they work every time.
```

## Data disclosure
**Tick nothing.** The extension collects no user data of any category. See `store/PRIVACY.md`.

## URLs
- Privacy policy: `https://www.model-citizen.org/work-brain/privacy` — **must be live before submitting**
- Support: `https://www.model-citizen.org/contact`

## Screenshots, in order
| File | Shows |
|---|---|
| `1-home.png` | Home — your files, what is built and what is still locked |
| `2-question.png` | One question, with its follow-ups and an example on tap |
| `3-brain.png` | The file assembling as you answer |
| `4-proof.png` | The proof loop — same question, with and without the file |

> **⚠️ The images in this folder are stale and must be regenerated before submitting.**
> They were driven against a build from 24 August 2026, and roughly twenty-five feature commits
> have landed since — the accordion list, the lit orbs, the file toggle, the work brain tier, the
> nav melt, the fixed breadcrumb nav. Shot 1 in particular is now wrong rather than merely dated:
> Home stopped being *one file and its freshness* at V1.7 VB-36/37 and became a shelf of files with
> locked slots, and V2.0 VB-64 renamed it again. The caption above is the current one; the picture
> is not.
>
> `npm run build && node scripts/store-shots.mjs`, then **look at all four**. That is not a
> formality — the last pass caught a caption contradicting its own panel and a shot clipping
> "Keep it as-is" in half, and both were only visible by looking.

## Pre-submit checklist
- [x] Privacy policy **written and typechecked** — `src/app/work-brain/privacy/page.tsx` in the
      sibling repo (`../modelcitizen`). Every claim in it was verified against the shipping source
      on 25 August 2026; see `store/PRIVACY.md` for what was checked and the one sentence that was
      wrong.
- [ ] Privacy policy **deployed** and reachable at the URL above ← *the remaining hard blocker*
- [ ] Screenshots regenerated against the current build, and all four looked at
- [ ] `npm run check` green
- [ ] `npm run zip` produces `dist.zip`
- [ ] `dist.zip`'s manifest requests exactly `storage` and `sidePanel`
- [ ] Version bumped in `manifest.config.ts` if resubmitting
- [ ] Data disclosure: every category left unticked

## Before the next submission, re-read this listing against the product

The copy above still describes what ships — checked 25 August 2026 — and that is not luck: it
describes the *proposition*, and the proposition has not moved through ten rounds of refinement.
The things that rot are the pictures and the specifics. Two claims in the detailed description are
worth re-checking each time, because they are the two that a reviewer could hold up against the
product: **"about fifteen minutes"**, and **"a plain text file you own"**. If either becomes untrue,
it is the listing that is wrong, not the product.
