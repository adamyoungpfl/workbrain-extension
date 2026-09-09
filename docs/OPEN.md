# Open product decisions — do not resolve these in code

If a task requires one of these to be settled, stop and ask. Guessing here creates
work that gets thrown away and, worse, ships an opinion nobody agreed to.

1. **Does the drift check fire on a schedule, or only when the panel is opened?**
   A scheduled nudge needs a notification surface the product does not have, and notifications
   are the fastest route to an uninstall. Default assumption for Release 2: **on open only**.

2. ~~**Second machine.** Is "you look new here — do you have a file?" helpful or unsettling?~~
   **RESOLVED 2026-09-08 by removal (Adam: "Get rid of the 'New here?' tag line"):** the hint is
   gone; the chrome bar's upload door is the one route for a file from elsewhere, present in
   every state without asking the question.

3. **How much of a pack may a person edit** before it stops being the team's method?
   Affects whether pack skills are copied into `Skills.md` or referenced. Default assumption:
   referenced and read-only, with "make my own copy" as an explicit action.

4. **Is the improvement report shareable as a link** (needs hosting) or only as a file?
   Default assumption: file only.

5. ~~**What is a useful ending to the Actions interview** for someone who answers "not sure" twice,
   beyond an offer of help?~~ **RESOLVED 2026-08-25 by removing the surface it was about:** there is
   no Actions interview. Actions.md is derived from Skills.md, and "not sure" is a first-class
   per-skill answer the generated file prints as a finding — the shortlist of things to find out.
   See `docs/V2.2-SKILLS-ACTIONS-DECISIONS.md` #1.

6. **Where the civic / after-school programme attaches.** Not in scope for Releases 1–4.

7. **Reformatting incompatible uploads (Adam, 2026-09-09, the File Hub pass).** Today an
   upload is validated and calmly rejected: `.md` extension checked, then a real parse
   (`core/files/parse.ts`) — a file that is not Workbrain-shaped gets the degradation voice,
   never an error code. What does NOT exist: (a) reformatting an arbitrary file into
   Workbrain shape — the honest version of that is a copy-paste prompt asking the person's
   OWN AI to do the reshaping (we never transmit, GUARDRAILS), which is a design decision;
   (b) a Skills.md parser — skills come in via the pack (.workbrain-pack.json) path only.
   Default until decided: reject with the calm line.

8. **The collapse-to-a-thin-bar idea (Adam, 2026-09-09).** Chrome does not let an extension
   set the side panel's width — the person drags it; there is no API. A thin always-on bar
   AS the panel is therefore not buildable, and injecting a bar into every website needs the
   `<all_urls>` host access GUARDRAILS bans. What IS buildable: (a) the toolbar icon's badge
   as an always-visible sliver of status; (b) one-press close from the chrome mark
   (`window.close()`), reopened from the toolbar icon; (c) "come back where you left off" via
   `chrome.storage.session` — ephemeral, browser-session-only, the store the splash flag
   already uses — which needs a ruling against ARCHITECTURE's "which surface you are on is
   never stored" (session-scoped may be arguable; durable is not); (d) a responsive slim-rail
   layout that engages when the person drags the panel narrow. Awaiting Adam's pick.
