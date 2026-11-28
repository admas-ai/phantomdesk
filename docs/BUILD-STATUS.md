# PhantomDesk build and release status

Checkpoint: **November 28, 2026, 07:48:30 UTC**. The application and video are public, and Devpost confirmed the project submission. This record distinguishes observed completion from verification limits and does not imply an eligibility or award decision.

## Current result

The local application has completed the approval-to-export workflow and the selectable approval-inspector browser checks. The original prototype was authored in Codex. Kiro CLI contributed the comparison helper, historical selector, renderer, styling and eight domain tests on November 28. Independent Codex review corrected comparison fidelity, selection identity, retained-draft refresh, mobile labels and saved-status feedback. [KIRO-USAGE.md](KIRO-USAGE.md) records that provenance.

| Area | Observed state |
| --- | --- |
| Local application | Implemented in HTML, CSS and JavaScript modules; IndexedDB stores each workspace atomically |
| Domain tests | **42 passed, 0 failed** after the Kiro contribution and independent regression fixes |
| Browser storage checks | **Nine passed, 0 failed** in the actual browser on November 28, from `07:02:32.840Z` through `07:02:32.943Z` |
| Interface walkthrough | Missing information, dirty-draft blocking, exact-revision approval, broken seal, actual stale-download rejection, actual CSV inspection, historical selection, later duplicates and cross-tab conflict behavior verified |
| Keyboard selector | Native keyboard selection retained focus; selecting another approval did not mutate history or approval state |
| Narrow layout | A 360 CSS-pixel iframe showed no document overflow; comparison sides stacked with explicit revision labels and long request IDs wrapped |
| Kiro provenance | Substantive source contribution observed and preserved in candidate commit `01d31a3`; 21 write events across five files recorded |
| Public demo | [PhantomDesk](https://phantomdesk.neighborlyhydrangea16.chatgpt.site/) version 3 deployed successfully on November 28; the actual public page and new approval selector were checked |
| Public source | Runtime and supporting evidence published and verified at [commit `7801ab90`](https://github.com/admas-ai/phantomdesk/commit/7801ab90ab5edeb060f226e4e7fa148b1b49fa25); final release-status documentation was prepared after this checkpoint |
| Demonstration media | [Public YouTube video](https://www.youtube.com/watch?v=raMvzOlu98o), 1:54; Studio confirmed publication and English subtitles. Local technical/visual checks passed. Cloud playback remained buffering; perceptual playback and listening review are unverified |
| Devpost | **Submitted to Kiroween 2026**; [public project](https://devpost.com/software/phantomdesk), submission ID `1323609`; success toast and submitted sidebar observed at `07:48:30Z` |

## Evidence

| Artifact | What it establishes |
| --- | --- |
| [November 28 IndexedDB report](evidence/browser-checks-2026-11-28.json) | The nine completed real-browser repository checks, exact times and disposable-database cleanup |
| [November 28 UI report](evidence/ui-checks-2026-11-28.json) | The observed interface journey, cross-tab repeat after correction, mobile measurements and unverified cases |
| [Actual downloaded CSV](evidence/approved-revision-2026-11-28.csv) | Synthetic `DEMO-002` export for approved revision 5, with exact instructions and approval timestamp |
| [Approval-comparison screenshot](evidence/approval-comparison-2026-11-28.jpg) | Approved revision 3 compared with saved revision 4, including literal change labels |
| [Kiro contribution record](evidence/kiro-contribution-2026-11-28.json) | Sanitized observed write events, preserved candidate and attribution boundaries |
| [Release record](evidence/release-2026-11-28.json) | Deployment identifiers, public-source checkpoint, exact uploaded media hash, YouTube limits and completed Devpost status |
| [Devpost submission confirmation](evidence/devpost-submission-2026-11-28.json) | Exact success UI proof, observed time, public URL, submission ID and saved categories |
| [November 25 IndexedDB report](evidence/browser-checks-2026-11-25.json) | The earlier baseline run, retained as historical evidence |

The application fixtures and workflow evidence use synthetic request data. The UI report is an observation record, not a separately executed automated UI suite. The submission record contains the actual public project identifiers and observed confirmation. No customer adoption, revenue, time savings or production reliability results are claimed.

## November 28 interface journey

The operator used the actual application with synthetic records in the revised local candidate:

1. **Missing information:** `DEMO-002` had no unit and could not be approved. Entering unit `3` and saving produced revision `2`; approval produced revision `3`.
2. **Draft versus saved comparison:** an unsaved instruction edit immediately displayed the draft note, left the comparison on saved revision `3`, and disabled download. The unsaved text was not presented as approved.
3. **Approval invalidation:** saving changed instructions produced revision `4`, broke the seal and retained approved revision `3`.
4. **Real stale-download attempt:** attempting to download the earlier preview was blocked. This was an actual interface action, separately from repository checks.
5. **Reapproval and selection:** reapproval produced revision `5`. The selector listed approvals `5` and `3` once each. Selecting the older approval retained focus and did not change history or approval state.
6. **Actual CSV:** a refreshed preview downloaded revision `5`. Inspection confirmed `DEMO-002`, unit `3`, instructions “Tighten the cupboard hinges. Do not replace the door.”, normal priority, Wednesday `10:00–12:00`, and approval timestamp `2026-11-28T06:48:02.361Z`.
7. **Later duplicate:** adding `REQ-57263399-ce4c-4008-8cda-47e7ebb25825` invalidated the existing approval and advanced `DEMO-002` to revision `6`. Both requests remained. The inspector identified the new counterpart and showed the condition absent at the earlier approval.
8. **Recorded condition review:** resolving the relationship produced revision `7`; approval produced revision `8`. The comparison showed the current condition as resolved with its recorded reason, without claiming that a reviewed condition still required review.
9. **Cross-tab saved refresh:** with approved revision `3` selected and a dirty draft visible, a second tab changed the preferred time to Thursday, producing saved revision `9`. The inspector updated to `9`; the draft's base revision and input focus were retained. A stale save was rejected. Discarding restored the current saved values and removed the dirty note.
10. **Status correction and repeat:** that first cross-tab run exposed stale editor/seal/approval-button wording. After the UI-only correction, revision `9` was approved as `10`, a dirty draft was started, and another tab changed the time to Friday, creating revision `11`. The repeated check confirmed **draft base `10` / latest saved `11`**, **Needs review**, **Save or discard draft**, a broken seal for `11`, and the retained selection of approved revision `3`.

The final status correction refreshed noninteractive saved-status elements while leaving the dirty fields, reviewer input and draft base intact. The browser repeat above passed on the final local application code.

### Narrow-layout and keyboard scope

At a **360 CSS-pixel iframe width**, document client width and scroll width were both **345px**; the remaining 15px was the scrollbar. The comparison region measured **285px wide** with **283px scroll width**. Approved/current revision labels remained visible in the stacked layout, and the long duplicate request UUID wrapped. This is an actual embedded narrow-layout observation, not a physical-device test or a 200% zoom test.

The native history selector retained keyboard focus during repeated selection. A broader keyboard creation-to-approval route had been observed on November 25. Neither observation establishes exhaustive keyboard, dialog, export or assistive-technology coverage.

## Domain and storage verification

The final domain suite passed **42 tests**. It covers input-preserving creation, required fields, deterministic rule relationships, pair-specific review reasons, revision-bound approval, stale previews, CSV escaping, literal untrusted data, stable approval enumeration and separate historical/current condition values. Additional comparison regressions cover changed conditions when both sides have resolutions, a newly added condition that has since been reviewed, removed conditions retaining their historical reason, and read-only returned data.

The November 28 actual-browser suite exercised real IndexedDB using disposable test databases. All nine checks passed:

- Approved fields, decisions, snapshots and history survived closing and reopening.
- A stale edit could not overwrite a newer save.
- A thrown save failure rolled back every affected record.
- An aborted transaction rolled back every affected record.
- Demo reset preserved the separate user workspace.
- Demo reset rejected old drafts and export previews using monotonic revisions.
- Future-schema data stayed untouched when operations were rejected.
- Export read current persisted state and rejected a stale preview, including after reapproval.
- Concurrent saves produced one commit and one conflict.

Each test database was deleted afterward. These repository results do not establish interface behavior under an injected storage failure; that remains a separate unverified case.

The earlier reset fixes remain part of the implementation: resets advance above prior record/workspace revisions, retained drafts keep their original request identity, and concurrent creation selects its own generated ID. The reset and conflict checks were rerun in the November 28 storage suite.

## Kiro execution and attribution

Kiro's original candidate added eight domain tests to the 29-test Codex baseline. The parent-operated candidate run passed 37 tests. Kiro did not execute those tests: its attempted composed shell checks could not obtain permission in the headless session. The subsequent independent fixes and additional cases produced the final 42-test suite.

The observed Kiro run resumed after one provider cooldown, delivered source changes and a draft usage record, then entered a second cooldown during final inspection. The parent interrupted it with exit code `130`. The source contribution is completed and preserved; a normal final Kiro completion response, Kiro-operated browser checks, or Kiro deployment is not claimed.

## Publication and submission confirmation

The revised application is deployed at [the public app URL](https://phantomdesk.neighborlyhydrangea16.chatgpt.site/). Version 3 deployment succeeded at `2026-11-28T07:17:00.225188Z`. The actual public page loaded all five synthetic fixtures. At the `07:17:20.866Z` verification checkpoint, `DEMO-002` with a missing unit could not be approved; entering unit `3` and saving produced revision `2`, approval produced `3`, and the new selector listed approval `3` once with every comparison field visibly Unchanged. This is the checked runtime, not the earlier November 25 release.

Public runtime and supporting-evidence files were verified against commit `7801ab90ab5edeb060f226e4e7fa148b1b49fa25`. Compared file hashes matched except for the known trailing-newline difference in the fixture JSON, whose parsed contents matched. The Site source checkpoint is `251786752742fd1c57df4c00a81874339d814f0a`, and the deployed source archive includes local commit `1bea45bddb56be32be7e5748dba446203ffabb27`. These identifiers describe distinct publication artifacts; no final documentation commit is invented. The [release JSON](evidence/release-2026-11-28.json) records the complete deployment metadata.

The exact 114-second MP4 was uploaded to Admas Academy (`@AdmasAcademy1`) and YouTube Studio returned **Video published**. Public visibility was selected, and Studio reported **English subtitles published** for the timed 43-cue SRT. The watch page at [the public video URL](https://www.youtube.com/watch?v=raMvzOlu98o) opened with the correct title and 1:54 duration. YouTube's copyright and community-guidelines checks each returned **No issues found**; that is a platform check result, not a broader rights determination.

The cloud watch player stayed buffering at `currentTime = 0` and `readyState = 0`, including after one reload. Perceptual playback, signed-out playback and listening review are therefore unverified. Local verification did decode the complete audio/video, inspect 34 representative encoded frames, and check audio RMS/peak and source/output correlation. See [DEMO-PLAN.md](DEMO-PLAN.md) and [VIDEO-PUBLISHING.md](VIDEO-PUBLISHING.md) for those separate evidence layers.

Devpost submission completed after the user confirmed the required declarations and authorized agreement and submission. The form saved an **Individual** entry with **Costume Contest** and **Best Startup Project** (shown as **Startup Project** in the bonus selection). The application, repository and video links, project story, four screenshots and thumbnail were saved and previewed before submission.

At `2026-11-28T07:48:30Z`, Devpost had navigated to [the public PhantomDesk project](https://devpost.com/software/phantomdesk), displayed **SUBMITTED TO — Kiroween 2026** and **Edit hackathon submission**, and showed this exact confirmation:

> Project submitted! Continue to edit your project until the hackathon deadline: December 04, 2026 at 05:00pm EST.

Submission ID: **1323609**. The [confirmation evidence](evidence/devpost-submission-2026-11-28.json) preserves the observed state. Personal eligibility answers are not included in the public record. Submission confirmation is not an organizer eligibility or award determination.

Broader product verification remains open: actual 200% browser zoom, exhaustive accessibility and keyboard/dialog coverage, reduced-motion preference verification, active UI payload checks, and a retained draft under an injected storage failure. The [acceptance matrix](../acceptance-checks.json) records those limits. They are not presented as universally mandatory contest gates; applicable entry requirements must be checked separately against the [official rules](https://kiroween.devpost.com/rules).

## Deliberate limits and reproduction

This is a browser-local prototype using synthetic demonstration records. Reviewer labels are not authenticated identities. There are no shared accounts, server backups, automatic work dispatch or messages. History is not protected against a device owner editing browser storage. The sample leak rule is not an emergency assessment. General JSON import remains deferred.

Run `node --test` from the repository root for domain checks. Serve the repository locally, then open `/tests/browser.html` to run the storage checks. See [the README](../README.md) for complete commands.
