# Kiro development brief

Prepared November 25, 2026; executed as a Kiro source contribution on November 28, 2026. The original brief below is retained as a development input. See KIRO-USAGE.md for the actual contribution, independent review and execution limits.

## Material and destination

The proposed Kiro session would receive this PhantomDesk brief, the project README and specifications, application source, tests, and wholly synthetic maintenance fixtures. The destination is Kiro's external coding service through the authenticated Kiro CLI. Work is limited to this project and the existing free credit allowance. No credentials, personal financial records, customer records, other repositories, or unrelated workspace files are part of the task.

The user's November 27 continuation authorized this scoped disclosure. Kiro CLI was restored in the recovered environment, but the new secure Google sign-in returned declined. Disclosure authorization is no longer pending.

On November 28, authenticated CLI access was restored and independently verified after the workspace reset. The account showed 50 free credits available and zero used. This established the starting point for the subsequently observed contribution. The following starting-state description is historical; current results are in KIRO-USAGE.md.

## Starting state

The initial working application and its review fixes were authored in Codex. The domain suite passed 29 tests on November 25 and again on November 27. The actual-browser IndexedDB suite passed 9 checks on November 25. The original 27-file source archive was recovered with its SHA-256 checksum matching the saved release, then recovered again after the November 28 reset. Recovery itself does not establish a new test run. See `BUILD-STATUS.md` for the exact scope and limitations. No substantive Kiro contribution has yet been verified. Do not attribute the existing implementation to Kiro.

## Proposed useful contribution

Implement an accessible approval comparison inspector that lets a reviewer select any preserved historical approval and see a field-by-field difference against the current saved revision. The current interface shows only the most recent expired approval and a fixed side-by-side summary.

Requirements:

1. Preserve every approval snapshot and existing history. Selecting a historical snapshot must never change saved data, approval, or export eligibility.
2. Show changed versus unchanged work instructions, property address, unit, category, preferred time, priority, and review conditions. Explain newly unresolved duplicate relationships by their actual counterpart IDs.
3. Offer a clearly labeled keyboard-accessible historical revision selector. Use literal text and accessible status labels, with the same readable mobile layout. Avoid generated customer evidence or business metrics.
4. Base the comparison on saved snapshots; label any visible unsaved draft separately and never present it as approved.
5. Add meaningful tests for multiple historical approvals, a later third duplicate, unchanged fields, and inert user-supplied text. Run the existing Node checks. Record browser checks only if actually performed; the parent will run the actual-browser verification afterward.

Read and review the current domain and storage invariants first. If the proposal conflicts with the implementation, document the decision and preserve the approval/export boundary. Keep this task buildless and browser-local. Do not add accounts, paid services, integrations, automatic dispatch, or external runtime calls.

## Evidence to return

Return specific source changes, actual test commands and outcomes, a concise explanation of design decisions, and honest remaining limitations. Update `KIRO-USAGE.md` only from work that actually occurred, clearly distinguishing earlier Codex work from this Kiro contribution. No Git pushes, deployment, or submission are part of the Kiro agent's scope.
