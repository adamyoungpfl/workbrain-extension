# Workbrain privacy policy — ready to publish

**Publish at `https://www.model-citizen.org/work-brain/privacy`.** That exact URL goes in the store
listing, so it must be live before submitting.

`docs/STORE.md` holds an earlier draft written before the product was built. This is the version
that matches **what actually ships in this release** — the draft described host permissions, chat
history import and skill packs, none of which exist yet. Describing capabilities the extension does
not have is worse than saying too little: it invites a reviewer to look for them and it is
inaccurate on the day it is published. Bring those paragraphs back when the features land.

Fill in the two placeholders and publish as-is. Keep it short; length reads as evasion.

---

## Workbrain privacy policy

Workbrain does not collect your data. There is no account, no login, and no server of ours for
anything to be sent to.

**What is stored, and where.** Everything you type into Workbrain is saved in your own browser
using Chrome's extension storage, on the device you typed it on. We cannot see it. Your two
preferences — whether questions are read aloud, and how much motion you want — may sync between
your own Chrome profiles using Chrome's built-in sync, which is operated by Google, not by us.
Your context file itself never syncs. You move it yourself, as a file.

**Your file.** Workbrain writes a plain text file from your answers. It stays in the extension
until you download it. What you do with it after that is entirely up to you.

**Your AI.** Workbrain shows you prompts to copy into whatever AI you already use, and gives you a
box to paste the reply back into. You do the copying and the pasting, and you see the exact text
first. Workbrain does not connect to any AI service and never sends anything on your behalf.

**No tracking.** There are no analytics, no telemetry, no error reporting, and no advertising.
Workbrain makes no network requests at all. It works with no internet connection.

**Permissions.** Workbrain asks for two, at install: storage, to save your answers on your device,
and sidePanel, to appear beside the page you are working in. It asks for nothing else.

**Removing your data.** Uninstalling the extension removes everything it stored. You can also
clear it at any time from Chrome's extension settings. If you downloaded your file, that copy is
yours and we have no involvement in it.

We have no way to identify you and no way to contact you unless you contact us.

Questions: `<support email>`
Last updated: `<date of publication>`

---

## Why this is short

Every claim above is one the code can be checked against, and `npm run audit` fails the build on
several of them — no analytics libraries, no `fetch` outside a single injected client, and exactly
two manifest permissions. It is a short policy because there is genuinely little to describe, and
that is the position `docs/GUARDRAILS.md` exists to protect. Any future feature that would make a
sentence here untrue is a feature that needs a decision, not a policy edit.
