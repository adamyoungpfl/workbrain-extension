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
| `1-home.png` | Home — the file, its freshness, and the quiet way out to a person |
| `2-question.png` | One question, with its follow-ups and an example on tap |
| `3-brain.png` | The file assembling as you answer |
| `4-proof.png` | The proof loop — same question, with and without the file |

## Pre-submit checklist
- [ ] Privacy policy published and reachable at the URL above
- [ ] `npm run check` green
- [ ] `npm run zip` produces `dist.zip`
- [ ] `dist.zip`'s manifest requests exactly `storage` and `sidePanel`
- [ ] Version bumped in `manifest.config.ts` if resubmitting
- [ ] Data disclosure: every category left unticked
