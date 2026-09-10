# Workbrain Civic Accelerator — implementation notes

> Adam, 2026-09-09: "Here are some notes for the Civics page from an editor
> session I just ran." Saved verbatim (encoding artifacts restored to the
> dashes and dots they were). §10's "This week" batch landed as pass 5n;
> §5–§9 are the later batches' source of truth.

Change list to apply. Ordered so nothing blocks on something later in the list.

---

## 1. Naming — do this first, it touches everything else

Find and replace across `myworkbrain.org` and any draft application material:

| Current | Change to | Where |
|---|---|---|
| Civics | **Civic** | Main nav |
| Civics Accelerator | **Civic Accelerator** | Footer |
| `#civics-accelerator` | `/civic` | Anchor becomes a real route |

Full name in formal contexts: **Workbrain Civic Accelerator**. Short form in body copy: **the Civic Accelerator**. Cohort naming convention: **Workbrain Civic Accelerator at [Host Name]**.

Set a 301 from the old anchor if anything already links to it.

---

## 2. Routes to add

| Route | Purpose | Audience |
|---|---|---|
| `/civic` | Program page — the URL cited in grant applications | Funders, hosts |
| `/civic/host` | The packet download and cohort request form | Hosts |
| `/civic/<location-slug>` | Cohort page, one per site, from a template | Participants |
| `/verify/<credential-id>` | Credential verification | Employers, participants |
| `/civic/alumni` | Opt-in graduate directory | Public, funders |

---

## 3. Thin nav pages — decide each one before citing the site anywhere

| Nav item | State | Recommendation |
|---|---|---|
| How it works | Live | Keep |
| White paper | Written, unpublished | **Fill this week.** Publish ungated with the PDF. It is the credibility anchor for everything else. |
| Library | Nothing built | **Remove from nav.** Restore when the starter set of 6–10 skills exists. |
| Proving Grounds | Nothing built | **Remove from nav.** Also rename before it returns — see note below. |
| Workbrain+ | Nothing built | **Remove from nav.** Nothing to sell yet. |
| Civic | Shell | Fill — this document. |
| Add to Chrome | Verify | Confirm it installs something real before a program officer clicks it. |

Instead of four empty pages or four missing ones, add a single **`/roadmap`** page listing what is coming and roughly when. That is more honest than hiding and more credible than an empty page, and it gives you somewhere to point people who ask about Workbrain+ without building a pricing page for it.

On **Proving Grounds**: rename before it comes back. It promises assessment to an audience you are trying to reassure. *Practice*, *Try it out*, or *Test bench* all carry the function without the threat.

---

## 4. `/civic` page build

Sections in order. Copy below is ready to use or edit; the two marked **load-bearing** should not be cut for length.

### 4.1 Hero

> **Workbrain Civic Accelerator**
>
> Four evenings. Free to attend. Everyone leaves with a set of files that make any AI assistant work better for them — and that still work on a service that doesn't exist yet.
>
> Hosted in your building, for an audience you convene.

Chip row directly beneath, in the same treatment as the homepage chips:

`FreeToAttend · NoAccount · AnyDevice · PlainMarkdown · BackgroundChecked · Insured`

Two buttons: **Request a cohort** → `/civic/host` · **Download the program packet** → PDF.

### 4.2 What a host is agreeing to — **load-bearing**

Heading: *What you're agreeing to host*

| | |
|---|---|
| Who is in the room | Adults, or students with guardian consent. Cohort of 16–20. |
| How long | Four sessions of 90 minutes, weekly. Optional monthly evening after that. |
| What participants do | Answer questions about their own work, write plain text files, use an AI assistant they already have. |
| What they install | Nothing required. An optional free Chrome extension. No account, no signup. |
| What data the tool collects | None. It runs in the browser and transmits nothing. |
| What we collect | Name and contact at enrollment, for scheduling and the completion record. Nothing else. |
| What leaves the building | Nothing generated in the sessions. Participants keep their own files. |
| What we need from you | A room with power and wifi, the same night each time, and a screen. |
| What we provide | Facilitation, curriculum, printed materials, loaner devices, certificates. |
| Insurance | General liability carried by Model Citizen. Certificate on request. |
| Background checks | Completed and current for all facilitators. Documentation on request. |
| What we ask of participants | Attendance and a short voluntary survey. |
| What we never do | Sell to participants during sessions, collect payment in the room, or require an email address for anyone to receive their own files. |

Pull that last row out as a standalone line under the table:

> **We do not sell to participants.** Not during sessions, not after. The program is free to attend and there is nothing to buy at the end of it.

### 4.3 What each side provides

Two columns. Host: room, wifi, power, screen, promotion, audience. Model Citizen: facilitator, curriculum, materials, loaner devices, credential, reporting.

### 4.4 The program at a glance

Five gates. Four teaching sessions plus an ongoing board night. Six contact hours across four weeks. Cohort of 16–20. Each session produces one artifact the participant keeps.

Table: Gate → Session → What they leave with. Use numbers, not adjectives.

### 4.5 Three delivery contexts

Reuse the homepage three-door card pattern: **After-school**, **Summer**, **Community adults**. One paragraph each, drawn from §10 of the curriculum.

### 4.6 What participants leave with

Four plain text files they own, plus a Certificate of Completion. Name the files. Concrete artifacts read as real; capability claims do not.

### 4.7 Outcomes and how they're measured — **load-bearing**

> We measure what we can actually attribute. Participants complete a task before any teaching and a comparable task at the end, and we record how much context they had to type, how many exchanges it took, and whether they used the result. We also track how many complete each stage and how many return.
>
> We do not claim employment outcomes. Participants report what happens next and we pass that on as reported, not as program effect. Assistant outputs also vary between runs for reasons unrelated to any program, so we report a group of measures rather than one headline number.

### 4.8 Privacy and data handling

> The tool runs entirely in the browser. There is no account, no server, and nothing is transmitted. Files are plain markdown, written to the participant's own device. Participants who never come back keep everything they made.
>
> Sessions do teach participants to inspect what their AI assistant has already stored about them — several services retain inferred personal details by default. That is done privately, on each person's own screen. No one is asked to read anything aloud.

### 4.9 Compliance

Insurance, background checks, guardian consent process for under-18 participants, facilitator credentials, and how long participant records are retained.

### 4.10 What it costs

State the real cost of delivery, what is donated, and what a funded cohort covers. A free program with no numbers reads as unserious to a funder.

### 4.11 Evidence

White paper link, curriculum summary download, facilitator background.

### 4.12 Start a cohort

**Request a cohort** and **Download the program packet**.

---

## 5. Cohort page template — `/civic/<location-slug>`

Participant-facing. Plain language leads; the formal name is present but secondary.

**Fields to template:** host name, host logo, address, room, four session dates, start time, registration link or host contact, cohort size cap, audience note, facilitator name.

**Copy skeleton:**

> **Free AI skills classes at [Host Name]**
> Four Tuesdays, 6:00–7:30pm, starting [date]. [Room].
>
> You'll leave with a set of files that make any AI assistant work better for you. Free, no account needed, and there's nothing to buy.
>
> Part of the Workbrain Civic Accelerator. Hosted by [Host Name].
>
> [Save my seat]

Beneath: what to bring (a laptop or phone, both fine), who it's for, the four session titles in plain words, and one line on accessibility and parking.

Keep it under one screen on a phone. This is the page a 55-year-old reads on a library flyer's QR code.

---

## 6. Credential

### 6.1 Two tiers

| | Certificate of Completion | Work Brain Certified |
|---|---|---|
| Earned by | Finishing four sessions and producing the artifacts | Returning to a board night and showing what you built since |
| Basis | Attendance plus evidence | Demonstrated use |
| Issued | At Session 4 | At a board night |

Do not collapse these. The second one is what stops the first from being a participation ribbon.

### 6.2 Credential ID scheme

Format: `WB-CIV-YYYY-HOST-NNNN` — e.g. `WB-CIV-2027-FPL-0042`.

Readable, sortable, encodes program, year, host and sequence. Do not encode anything about the person in it.

### 6.3 Verification page — `/verify/<credential-id>`

Reachable only with the ID. Not indexed, not browsable, no directory listing. Shows:

- Credential name and tier
- Recipient name
- Issue date
- Host location and cohort
- The criteria that were met, stated explicitly
- A line confirming the issuer

Explicit criteria matter. A verification page that says only "completed the program" is worth less to an employer than one that says what the person can now do.

### 6.4 LinkedIn

LinkedIn's Add to Profile accepts these parameters: `name`, `organizationName` **or** `organizationId` (never both), `issueYear`, `issueMonth`, `expirationYear`, `expirationMonth`, `certId`, `certUrl`.

Generate the URL from LinkedIn's own builder at [addtoprofile.linkedin.com](https://addtoprofile.linkedin.com/) rather than hand-constructing it, then template your two variables into it. Set `certId` to the credential ID and `certUrl` to the verification page. No approval process and no eligibility bar.

Put the button on the certificate email and on the verification page.

### 6.5 Open Badges — later

Open Badges 3.0 is the current standard, built on the Verifiable Credentials data model, and the specification is public with no stated cost to issue. Worth adopting when volume justifies it or a funder asks. Not for cohort one.

Sources: [LinkedIn Add to Profile](https://addtoprofile.linkedin.com/) · [1EdTech Open Badges](https://www.1edtech.org/standards/open-badges)

---

## 7. Survey instruments

Four instruments. All mobile-first, no login, one screen where possible. **Prefill the credential ID as a URL parameter** so responses join back without anyone typing an identifier.

Google Forms is sufficient and free; anything that supports URL prefill works.

### 7.1 Baseline — Session 1, before any teaching

Two observed measures, recorded by the facilitator while the participant does one cold task:

1. Words of context typed before the first useful answer.
2. Number of exchanges to reach something they would actually use.
3. Outcome: used it / revised it heavily / discarded it.

Two self-reported, on a card:

4. *In a typical week, how many times do you find yourself explaining the same thing again to an AI assistant?* (number)
5. *How confident are you that you can get an AI assistant to produce something you'd actually use?* (1–5)

### 7.2 Session pulse — after each session, 60 seconds

1. *Did you leave with the file you came to make?* (Yes / Partly / No)
2. *What was confusing?* (open, optional)
3. *How likely are you to use what you made this week?* (1–5)

### 7.3 End of program — Session 4

1–3. Repeat the three observed baseline measures on a comparable task.
4. Repeat the confidence question. Paired with baseline, this gives you a delta.
5. Repeat the re-explanation frequency question.
6. *What did you make today, and did you use it?* (open)
7. *In your own words, what changed?* (open — this is where your quotes come from)
8. Consent confirmations (see §8).

### 7.4 Ninety days

1. *Are you still using the files you made?* (Yes, regularly / Sometimes / No)
2. *Has anything changed at work, in school, or in a project that you'd connect to this?* (open)
3. *Would you recommend it to someone you know?* (Yes / No)

### 7.5 One hundred and eighty days

1. *Are you still using the files you made?* (Yes, regularly / Sometimes / No)
2. *Have any of these happened since you finished?* (check all — new job, promotion, raise or more hours, new client or customer, started a business or project, went back to school or training, none of these, prefer not to say)
3. *If you'd like to tell us about it, we'd like to hear.* (open, optional)
4. *May we share your story using your name?* (Yes / No)

Keep **none of these** and **prefer not to say** on that checklist. They cost you nothing and they are what makes the resulting number defensible.

### 7.6 How to report it

Always with the denominator: *34 of 61 responded at 90 days.* A funder who sees the response rate trusts the result far more than one presented without it.

---

## 8. Consent — collect at enrollment, not afterward

Retrofitting consent is where most programs fail this. Three separate checkboxes on the enrollment form, each independently optional:

> ☐ You may contact me after the program with a short survey about how things are going. *(Required for follow-up reporting; you can opt out later.)*
>
> ☐ You may include my first name and a quote in program reporting, if I provide one.
>
> ☐ You may list me in the public graduate directory.

Plus a plain-language retention line:

> We keep your name, contact details and completion record for as long as the credential is valid, so we can verify it if someone asks. You can ask us to delete it at any time.

For under-18 participants, guardian consent covers the same three items, and the directory checkbox should default off.

---

## 9. Participant data model

Minimal, matching the privacy stance you are advertising:

`credential_id` · `first_name` · `last_name` · `email` · `phone (optional)` · `cohort_id` · `host_location` · `sessions_attended (1–4)` · `artifacts_completed (4 flags)` · `tier` · `issued_date` · `consent_followup` · `consent_story` · `consent_directory` · `under_18` · `guardian_consent_on_file`

Survey responses stored against `credential_id`, never against name.

Do not store anything from the participant's own files. You will never have it — that is the point — and saying so plainly on the compliance section is worth more than any feature.

---

## 10. Order of operations

**This week.** Naming fixes. Publish the white paper. Remove the three thin nav items and add `/roadmap`. Build `/civic` with §4.

**Next.** `/civic/host` with the cohort request form and the packet download. One `/civic/<location>` template page with placeholder dates so a host can see what their promotion looks like.

**Then.** Verification page and credential ID scheme. Certificate template. LinkedIn button. Enrollment form with the consent checkboxes.

**Before cohort one runs.** All four survey instruments built and tested on a phone. Baseline card printed. Retention line published.

**After cohort one.** Alumni directory, if anyone opted in. Open Badges when a funder asks or volume justifies it.
