# Kiro development record

Updated November 28, 2026. This record distinguishes the original prototype, the actual Kiro contribution, and subsequent review. It is not a contest-eligibility determination or a submission receipt.

## Attribution

| Work | Authoring environment |
| --- | --- |
| Initial requirements, design, steering and task documents | Codex |
| Original working application, IndexedDB repository, 29 domain tests and 9 browser storage checks | Codex |
| Approval-comparison helper, historical approval selector, comparison renderer and styling, eight additional domain tests | Kiro CLI, November 28 |
| Independent review, additional regression cases, corrected comparison data, stable selection, draft refresh and mobile labels | Codex review following the Kiro candidate |
| Executed Node and actual-browser verification | Codex-operated tools; individual dates and results are recorded in BUILD-STATUS.md |

The presence of `.kiro/` files alone is not evidence of Kiro execution. The contribution described here was observed through actual Kiro Read File, Grep Search and Replace in File events, and the resulting source diff was preserved in local candidate commit `01d31a3` before follow-up corrections.

## Task and concrete contribution

Kiro received the project specifications, application source, tests and wholly synthetic fixtures. The brief in [KIRO-NEXT-TASK.md](KIRO-NEXT-TASK.md) asked for a selectable approval inspector that compares preserved approvals with the current saved revision while preserving approval, history and export invariants.

Kiro implemented:

- A pure `compareApprovals()` function in `domain/requests.js` with field, priority and review-condition comparisons.
- A labeled historical-revision selector and comparison renderer in `ui/app.js`.
- Comparison, focus and narrow-layout styles in `styles.css`.
- Eight domain tests covering unchanged and changed fields, priority, multiple approvals, a later duplicate, literal untrusted text, invalid inputs and read-only comparison.

The original candidate changed five files, including Kiro's draft of this usage record. A [sanitized execution summary](evidence/kiro-contribution-2026-11-28.json) identifies observed file writes, the candidate commit and the parent-run test result. Full service event logs are not published because they include unnecessary session and infrastructure metadata.

## Verification and review

The parent ran `node --test` on the candidate on November 28: **37 passed, 0 failed**. Kiro did not execute those checks. Its composed shell commands could not obtain permission in the headless session, and its own draft explicitly reported that limitation. No Kiro-operated browser check is claimed.

Independent review found cases not covered by those initial tests: condition changes with both sides resolved, a newly added condition that has since been reviewed, selection shifting after another approval is preserved, stale saved comparisons while retaining an unsaved draft, and ambiguous mobile labels. The follow-up corrections preserve each condition's actual historical and current data, use stable approval keys, keep draft and saved state separate, and label both revision sides visibly. Final verification is recorded in [BUILD-STATUS.md](BUILD-STATUS.md).

## Execution boundaries

The session used the existing free Kiro allowance. No subscription upgrade, deployment, GitHub push, or contest submission was performed by Kiro. Runtime application behavior remains browser-local and does not call an AI service.

The provider returned a five-minute rate-limit cooldown during the run. It resumed and delivered the source and draft usage record. After a second cooldown began during repeated final inspection, the parent interrupted the process to continue independent review. The process exited with code 130; this document does not claim a normal final Kiro completion response.

Earlier November 25 and November 27 startup or sign-in attempts produced no verified source contribution and are not counted as Kiro implementation. Authenticated CLI access was restored on November 28 before this actual development run.
