# The Proving Grounds hand-off — app ↔ site, thought through

Adam, 2026-09-09: "for the Context option, we need to set up so that the
baseline prompt and response (from the app) and the context file that they
created in the app [reach the site]. I need to think through the experience
from the app and site perspective… as easy as possible… This is what sells
the value of the idea with proof."

This document is that thinking, laid out for decision. Nothing here is
built yet; §5 lists what is Adam's to rule on before anything is.

## 1 · What each side already holds

**The app** holds everything the proof needs, all authored-or-judged:
the baseline run (`wb:report.runs`, stage `baseline` — the prompt in their
own words AND the answer their AI gave), and `Context.md` generated on
demand from `wb:answers`. The in-app Grounds (pass 4f) already run the
head-to-head inside the panel.

**The site** (`#proving-grounds`, Context mode) is today a well-dressed
mock: a hardcoded baseline card, a fake file chip, a dead Compare button.
Its copy already tells the true story ("the app ran this on your first
day… loaded from your download, or dropped in here").

**Why the site at all, when the app proves in-app?** Three reasons worth
keeping straight: the site is the SHAREABLE surface (a person can show a
colleague the head-to-head without installing anything), the site can host
richer comparison layout than a 400px panel, and — per 4c's original
brief — it lets them test "in the service of their choice" on a full
screen. The app feeds it; it does not replace the in-app loop.

## 2 · The experience at its easiest (the ceiling)

One press in the app: **"Take it to the Proving Grounds."** A tab opens on
`myworkbrain.org/#proving-grounds`, and by the time the person looks, the
page already shows THEIR baseline card (their prompt, their AI's answer,
their capture date) and THEIR file chip (real name, real size, real
section count) — the mock's layout, filled with their truth. From there:
one button composes the with-file prompt, Tier 1 drops it into their AI,
they paste the response back, and the page lays the two answers side by
side with the analysis. Two pastes total, both of them the unavoidable
ones (into their AI, back from their AI).

That ceiling is reachable — but the transport is the decision.

## 3 · Transport options, against the guardrails

The wall everything must respect: **never transmit the person's content
anywhere** — no server of ours may ever see a byte of it. The site is
static; Vercel serves files and can log URLs, nothing else.

**A · The bundle (copy → paste).** The app copies ONE text blob to the
clipboard — a delimited bundle: prompt, baseline answer, Context.md — and
opens the site. The site's Context mode has one intake box: "Paste your
Workbrain bundle." Parse, populate, done.
  - Guardrails: clean. Content moves person-to-person via their clipboard;
    nothing leaves the machine until THEY paste, and then only into a
    local page that sends nothing.
  - Friction: one press in the app, one paste on the site.
  - Bonus: the same intake serves people WITHOUT the extension — paste any
    context file, or the bundle a friend sent them. The demo surface
    works for everyone.

**B · The URL fragment.** The app opens
`…#proving-grounds?b=<base64 bundle>`. Fragments never reach the server,
so technically nothing is transmitted to us.
  - Guardrails: defensible but smelly — the person's content lands in
    browser history and sync'd-history surfaces. A privacy product
    writing your context file into your URL bar is telling a joke about
    itself. **Not recommended.**

**C · Tier-1 injection onto our own origin.** `myworkbrain.org` joins the
optional host permissions; the same press that opens the tab injects the
bundle straight into the page's intake (the 5c mechanism, pointed at a
selector WE control, so it never rots).
  - Guardrails: same shape as the composer hand-off — content moves into a
    page in the person's own browser; our server sees nothing. Needs the
    origin added to the manifest (a store-listing note) and a written
    amendment, which the white paper already anticipates ("the one
    written amendment under which a hosted testing environment is
    permitted to exist").
  - Friction: ZERO pastes for the hand-off. This is the §2 ceiling.

## 4 · Recommendation: stage it

**V1 — the bundle (option A).** Build the intake and the real Context
mode on the site, and the "Take it to the Proving Grounds" press in the
app (compose bundle → clipboard → open tab). It ships without manifest
changes, serves extension-less visitors, and every later option still
needs the same site-side machinery: the parser, the populated cards, the
with-file prompt composer, the response paste-back, the comparison view.

**V2 — the injection (option C).** Once V1's page is real, add
`myworkbrain.org` to the optional origins and let the press fill the
intake itself. The permission ask rides the same press, exactly like 5c.
Fallback IS V1 (denied → the bundle is already on the clipboard; the
intake says "paste it here").

Site-side run design (V1): the two mock cards become live states —
baseline card empty until the bundle lands ("Bring it from the app, or
paste your bundle"), file chip real (name/size/sections parsed
client-side with the same section headings the generator writes). Compare
composes the with-file prompt (file + the SAME captured ask, verbatim),
copy button + per-service doors (the app's four), then a paste-back box,
then the side-by-side: both answers, a diff-ish highlight of lines
naming file facts (the groundedness grammar, client-side), and the
verdict left to the person — the app's own rule, "shown as a claim".
Nothing persists: sessionStorage at most, cleared on tab close; no
analytics (the site carries none, matching the product).

## 5 · Adam's decisions before the build

1. **The hosted-grounds amendment** (GUARDRAILS): one written row saying
   the person's content may move from the panel into a page on OUR static
   origin, in their own browser, which transmits nothing. The white
   paper's abstract already reserves this seat.
2. **Transport**: confirm A-then-C staging (or strike C).
3. **Retention on the site**: nothing vs sessionStorage-until-close.
   Recommend sessionStorage-until-close so a mid-run tab refresh does not
   eat the errand.
4. **Whether the app's in-app Grounds keep the full loop** once the site
   is live, or slim to a door. Recommend: keep both; the panel is where
   iteration happens, the site is where showing-someone happens.
