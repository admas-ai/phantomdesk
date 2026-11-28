# PhantomDesk — submitted project record

**Status: submitted to Kiroween 2026.** Devpost confirmed [the public PhantomDesk entry](https://devpost.com/software/phantomdesk) at the `2026-11-28T07:48:30Z` observation checkpoint, submission ID **1323609**. The revised application, public source and 1:54 demonstration are linked in the submitted entry. Genuine Kiro source work and independent review are documented below. This file retains its original filename as a project record; the [submission evidence](evidence/devpost-submission-2026-11-28.json) records the exact confirmed state.

## Entry fields

| Field | Recorded value |
| --- | --- |
| Project name | PhantomDesk |
| Tagline | Approval belongs to a revision. Change the instructions, break the seal. |
| Submitted category | Costume Contest |
| Working demo URL | [PhantomDesk](https://phantomdesk.neighborlyhydrangea16.chatgpt.site/) — revised version 3 deployed and public-page checks passed November 28 |
| Source URL/revision | [admas-ai/phantomdesk](https://github.com/admas-ai/phantomdesk), verified runtime/evidence checkpoint [`7801ab90`](https://github.com/admas-ai/phantomdesk/commit/7801ab90ab5edeb060f226e4e7fa148b1b49fa25); final release-status documentation prepared afterward |
| Public YouTube demonstration | [Public 1:54 demonstration](https://www.youtube.com/watch?v=raMvzOlu98o) — publication, title/duration and timed English subtitles verified; cloud watch playback remained buffering |
| Built with | HTML, CSS, JavaScript modules, IndexedDB; Codex and Kiro CLI during development |
| Kiro contribution | Comparison helper, historical approval selector, comparison renderer/styles and eight additional domain tests; observed November 28 |
| Submission confirmation | **Verified** — [public project](https://devpost.com/software/phantomdesk), ID `1323609`, observed `2026-11-28T07:48:30Z` |

## Submitted optional bonus fields

The entry was submitted as an **Individual**, with **Best Startup Project** consideration selected and saved (the form uses **Startup Project**). The [official rules](https://kiroween.devpost.com/rules), rechecked November 28, list a $10,000 startup bonus and require founder LinkedIn and startup website information. The saved selection does not imply that the organizers have confirmed eligibility or an award.

| Field | Recorded value |
| --- | --- |
| Entrant type | Solo individual |
| Founder | Surafiel Temesgien |
| Startup | Admas |
| Founder role | Founder of Admas, based on the entrant's own statements |
| Founder LinkedIn | [Surafiel Temesgien](https://www.linkedin.com/in/surafiel-temesgien-573363263) |
| Startup website | [https://www.admas.dev](https://www.admas.dev) |
| Optional category | Best Startup Project |
| Status | Selected and saved in the submitted entry; organizer eligibility and award decisions are separate |

## Inspiration

A maintenance request can still look reassuringly approved after its work instructions change. That leaves an important question: which instructions did the reviewer actually approve?

PhantomDesk makes that boundary visible through a haunted night-shift records office. An intact seal belongs to one saved revision. When relevant instructions or review conditions change, the seal breaks. The previous approval remains part of the request's history.

## What it does

PhantomDesk helps a maintenance coordinator review requests before exporting a work list. It identifies missing details and explains possible duplicates using deterministic matching rules. Both possible duplicates remain in the ledger. Resolving review conditions and overriding priority require recorded reasons.

Approval attaches to a saved revision and its exact field and review snapshots. Editing the instructions creates a new revision that needs approval again. A later matching request can also create an unresolved review condition on a previously approved record.

The approval inspector lets the reviewer select a current or preserved approval and compare it with the current saved record. It shows visible Changed/Unchanged labels, the actual historical and current condition details, related request identifiers and recorded review reasons. Historical selection is read-only. An unsaved editor draft is explicitly identified and does not replace the saved comparison. When another tab saves, the inspector updates while the draft keeps its original base revision.

The export preview contains eligible saved approvals. Download checks current persisted state again. In the observed browser walkthrough, a preview opened before an edit could not download the changed request. After reapproval and a refreshed preview, the actual CSV contained the matching instructions, approved revision and approval timestamp.

The synthetic demonstration and the empty user workspace are separate. The prototype does not dispatch work or automatically merge suspected duplicates.

## How it was built

The application uses buildless HTML, CSS and JavaScript modules, with IndexedDB for browser-local persistence. Deterministic rules drive validation, duplicate flags, priority suggestions and export eligibility. No runtime AI service or backend is required.

Each workspace is stored as one value containing its records, approvals and history. Edits and reviewer decisions check the expected record revision. Every mutation calculates the affected changes from current saved state and commits the records, approvals and history together. Failed transactions leave the prior saved state intact.

### Development attribution and Kiro contribution

Codex prepared the specifications and authored the original working application, storage layer, 29 domain tests and nine browser storage checks. Kiro CLI then implemented a substantive approval-inspector task on November 28 from the project brief and synthetic source material.

Kiro added a pure comparison helper, the historical approval selector, comparison rendering and styling, and eight domain tests. The original candidate was preserved in local commit `01d31a3` before follow-up corrections. The sanitized execution record contains **21 observed write events across five files**. This is evidence of actual Kiro source work; the existence of `.kiro/` documents alone is not the basis of the claim.

Independent Codex review corrected condition comparison fidelity, stable selection identity, the distinction between unsaved and saved state, mobile labels and cross-tab status feedback. It also added regression coverage. Parent-operated checks passed 37 tests on the original Kiro candidate and 42 on the reviewed implementation. Kiro did not execute those checks or the browser walkthrough.

The Kiro session resumed after a provider cooldown and delivered source changes. After a second cooldown during final inspection, the parent interrupted it with exit code `130`. A normal final-completion response is not claimed. [KIRO-USAGE.md](KIRO-USAGE.md) and [the sanitized contribution record](evidence/kiro-contribution-2026-11-28.json) provide the detailed account.

## Challenges addressed

The main correctness challenge is that a request's approval can become stale because another record changes. Introducing a matching request must create an unresolved duplicate relationship, invalidate affected approvals and preserve old snapshots together. A reason belongs to a particular pair and matching key; a reason for one pair cannot resolve a later third request.

The historical inspector raised a second challenge: accurate comparison needs each side's real condition data and recorded reason. Equal condition counts or two resolved states do not prove that the underlying review is unchanged. The reviewed implementation preserves separate historical/current values and stable approval identity.

A third challenge was keeping an unsaved editor honest when another tab saves. The corrected interface refreshes the saved comparison and status without replacing the draft fields or their original base revision. The browser test demonstrated a retained draft, a newer saved comparison and rejection of the stale save. A repeat after correcting stale status wording verified the draft-base/latest-saved metadata and broken seal together.

Earlier reset review also found revision reuse in synthetic fixtures. Reset now advances above previous revisions, and the actual-browser suite verifies rejection of pre-reset drafts and previews.

## Observed accomplishments

- **42 domain tests passed** after the contribution and independent fixes.
- **Nine actual-browser IndexedDB checks passed** on November 28, from `07:02:32.840Z` through `07:02:32.943Z`.
- The actual interface journey completed missing-detail correction, approval, editing with a broken seal, stale-download rejection, reapproval, CSV download and inspection.
- The selector showed current and older approvals once each, retained keyboard focus and did not mutate history.
- A later duplicate invalidated approval while retaining both records. The inspector showed the missing historical condition and the current recorded resolution truthfully.
- A cross-tab edit refreshed the saved comparison while preserving the dirty draft and focus. The final repeat showed draft base `10`, latest saved revision `11`, Needs review and a broken seal for `11`.
- A 360 CSS-pixel embedded layout had document client/scroll widths of 345px each. Revision-side labels remained visible and a long request UUID wrapped.

These are scoped development observations. They do not establish customer adoption, revenue, production reliability, full accessibility, physical-device compatibility or a 200% zoom result. The [build-status record](BUILD-STATUS.md) and [UI evidence](evidence/ui-checks-2026-11-28.json) state the limits.

## Design lesson

An approval becomes easier to assess when its exact revision and recorded review are visible. The seal communicates whether a current saved request is approved. The selectable history explains what changed and what a prior reviewer actually saw. Visible text labels carry the distinction alongside the theme and color treatment.

## What is next

The entry is submitted, and the revised public application and YouTube video are published. Devpost states that the project remains editable until December 04, 2026 at 05:00pm EST. Further perceptual playback/listening review remains unverified because the cloud watch player buffered; local decode, frame and audio signal checks are documented separately. Future coordinator feedback could inform whether shared access, stronger identity controls or managed backups are useful additions.

## Confirmed completion record

- Genuine Kiro source contribution and evidence: **completed and independently reviewed**; process interruption and check attribution are documented.
- Local application: **scoped browser journey passed on the final code**.
- Public demo: **revised version 3 deployed and checked** on November 28, including missing-unit blocking, save/approval and the new approval selector.
- Public source: **runtime and supporting evidence published and verified** at `7801ab90ab5edeb060f226e4e7fa148b1b49fa25`; this submission-confirmation update was prepared after that source checkpoint.
- Narration: **288-word script and 112.003-second voice track prepared**.
- Final MP4: **completed, technically checked and published at 114 seconds** on [YouTube](https://www.youtube.com/watch?v=raMvzOlu98o), with public visibility selected and 43 timed English subtitle cues published. Cloud perceptual playback, signed-out playback and listening review remain unverified.
- Devpost: **submitted and confirmed** at [the public project](https://devpost.com/software/phantomdesk), ID `1323609`, observed `2026-11-28T07:48:30Z`. Costume Contest and Best Startup Project were saved for an Individual entry. The user confirmed the required declarations and authorized agreement and submission.

The [submission confirmation](evidence/devpost-submission-2026-11-28.json), [release record](evidence/release-2026-11-28.json) and [video publication details](VIDEO-PUBLISHING.md) record completed steps and verification limits. The observed submitted status does not imply an eligibility or award decision under the [official Kiroween rules](https://kiroween.devpost.com/rules).
