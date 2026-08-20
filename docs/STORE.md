# Chrome Web Store assets

Blocks launch, so write it early rather than the night before.

## Single purpose statement

> Workbrain builds and maintains a personal context file that a person can give to any AI
> assistant, so they do not have to re-explain who they are and how they work every time.

Every permission must trace to this sentence. If one does not, remove the permission.

## Permission justifications

| Permission | Justification to submit |
|---|---|
| `storage` | Saves the person's answers and generated file on their own device. Nothing is transmitted. |
| `sidePanel` | The product is a side panel; it must remain visible while the person works in another tab. |
| *(later)* host permissions for four AI origins | Optional. Requested only when the person chooses to have Workbrain type a prompt into their AI's message box. Declining leaves the extension fully functional. |

## Data disclosure

Tick **nothing**. The extension collects no user data of any category.
Under the limited-use policy in force since 1 August 2026, collected data must be strictly
necessary to the declared single purpose and prominently disclosed. Collecting nothing is the
only position that needs no defending — protect it against every future feature request.

## Privacy policy — draft

> **Workbrain privacy policy**
>
> Workbrain does not collect, transmit, or store your data on any server. There is no account
> and no login.
>
> Everything you type into Workbrain is saved in your own browser using Chrome's extension
> storage, on the device you typed it on. Your preferences may sync between your own
> Chrome profiles using Chrome's built-in sync, which is operated by Google, not by us.
> Your context file itself never syncs — you move it yourself, as a file.
>
> If you choose to let Workbrain type a prompt into an AI website's message box, it does that
> in your browser, on that page, at the moment you click. It reads nothing else on the page.
>
> If you choose to give Workbrain a copy of your own chat history export, it is read in your
> browser and never uploaded. The file itself is not saved; only the items you tick are kept,
> and you can remove them at any time.
>
> If your organisation publishes a skill pack, Workbrain downloads that file from the address
> you provided. Nothing about you is sent when it does.
>
> We have no way to identify you and no way to contact you unless you contact us.
>
> Questions: <address>. Last updated: <date>.

Publish at a stable URL and link it in the listing. Keep it this short — length reads as evasion.

## Listing copy checklist

- [ ] Title, 45 chars max
- [ ] Short description, 132 chars — leads with the person's problem, not the mechanism
- [ ] Detailed description — what it does, then the privacy position, then who it's for
- [ ] 1280×800 screenshots: home surface, a question, the proof moment, the file
- [ ] Small promo tile 440×280
- [ ] Icons 16 / 32 / 48 / 128
- [ ] Category: Productivity
- [ ] Support URL and privacy policy URL

## Publishing facts

One-time $5 developer registration, covers up to 20 extensions, valid for the life of the
account. Chrome Web Store Payments was shut down in February 2021 — there is no in-store
purchase flow, so anything paid is handled outside the store.
