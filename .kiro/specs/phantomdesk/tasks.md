# Prepared Kiro tasks — original plan

Original plan prepared November 25, 2026. The working implementation and verification now exist as Codex work; these original Kiro-task checkboxes do not claim Kiro execution. See `docs/BUILD-STATUS.md` and `docs/KIRO-NEXT-TASK.md` for the current checkpoint.

Updated November 25, 2026. Check an item only after implementation and observed verification; record supporting evidence in `docs/KIRO-USAGE.md`.

- [ ] 1. Read the preserved requirements and review the proposed model in a genuine Kiro session. Resolve approval revisions and cross-record duplicate changes; record the actual decisions.
- [ ] 2. Implement pure validation, sample rules, duplicate relationships, reasoned review and immutable approval transitions. Verify incomplete/unresolved revisions cannot be approved.
- [ ] 3. Implement IndexedDB transactions, optimistic revision checks, future-schema handling and recoverable storage errors. Atomically update approval/history for all records affected by a new duplicate.
- [ ] 4. Build synthetic and empty workspaces, intake, review queue and detail view. Use intact/broken seals and a legible revision comparison.
- [ ] 5. Complete one journey: missing detail -> review -> exact-revision approval -> edit -> expired approval -> reapproval -> CSV -> reload. Preserve possible duplicates.
- [ ] 6. Implement approved-only CSV preview/download with fresh eligibility checks. Verify stale selections, approved instructions, formula neutralization and escaping. Defer general JSON import.
- [ ] 7. Execute meaningful domain and browser acceptance checks, including duplicate-after-approval, failed transaction, stale edit, reload and workspace isolation. Record failures and deferrals accurately.
- [ ] 8. Verify keyboard operation, 360px, 200% zoom, reduced motion, inert input and downloaded CSV contents. Fix observed problems.
- [ ] 9. Add reproducible setup/run/test instructions and genuine Kiro evidence. Preserve root `.kiro/` and the existing MIT license.
- [ ] 10. Prepare the real 2:45 demonstration, accurate project description and release evidence. Record anonymous app/source access, public YouTube visibility and Devpost submitted status only when verified.

## Explicitly deferred

General JSON import, accounts, multiuser synchronization, billing, runtime AI, contractor integrations and automatic dispatch. Remove deferred controls rather than imply they work. Hosted CI, publication and submission are separate release actions, not completed by this plan.
