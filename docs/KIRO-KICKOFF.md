# Kiro kickoff — prepared November 25, 2026

Open this repository root in a genuine authenticated Kiro session. The following is a build instruction, not a record of prior execution. Read the current repository before acting; the requirements on main were preserved and take precedence over the older October 30 archive.

## Instruction for Kiro

Build the first complete PhantomDesk application for Kiroween 2026. Read `README.md`, `.kiro/steering/product.md`, `.kiro/specs/phantomdesk/requirements.md`, the proposed design/tasks, `fixtures/requests.json` and `acceptance-checks.json`. These are Codex-prepared inputs. No genuine Kiro implementation or application test run has been recorded yet. Keep that provenance accurate.

Use buildless HTML/CSS/JavaScript modules and IndexedDB for a maintenance-review workflow. Deliver intake, exact missing-field messages, transparent deterministic rules, possible-duplicate explanations, reasoned human review, versioned approval, immutable historical snapshots, reliable local saves and safe CSV export. Preserve both possible duplicates. Provide a clearly labeled synthetic workspace and an independent empty workspace.

### Resolve and implement this invariant first

A request is exportable only when the current saved revision is complete, every current review condition is resolved, and stored approval points to that exact saved revision and snapshot. Editing relevant instructions or review decisions creates a new revision requiring review. Preserve the old approved snapshot in history. Never silently export unsaved edits.

Recheck eligibility when downloading the CSV, using a consistent read of the latest persisted records. An earlier preview or selection is not authorization. If a selected request changed, block that stale selection, explain which record changed and require an updated preview. Include the actual approved work instructions, revision and approval time in the downloaded file.

**Cross-record condition:** after approving request A, creating or editing request B can introduce a new duplicate relationship with A. In the same storage transaction, recompute affected relationships, make the new condition unresolved, advance affected saved revisions, invalidate current approvals and append explanatory history. A prior dismissal of A/C must not resolve a new A/B relationship. Bind each dismissal reason to the relationship and relevant matching-key fingerprint. Preserve all records; never autoapprove when a flag disappears. Reject stale edits and ensure transaction failure leaves no partial approval or history changes.

Review this model before coding and record the actual decision you make. Implement one complete working journey before secondary features.

### Keep the app focused

- No backend, runtime AI, accounts, billing, multiuser synchronization, automatic messages, assignments or dispatch.
- No paid services, production integrations or real customer data.
- General JSON import is deferred; do not expose a placeholder import control. Keep storage schema/version safety.
- Local reviewer labels are descriptive, not authenticated identities.
- Preserve the existing MIT license and tracked root `.kiro/`.

### Design the approval story

Use a haunted night-shift records office for Costume Contest: near-black plum, parchment, lavender structure, amber caution and sage approval. An intact seal, broken seal and legible revision comparison should explain state. Keep literal labels, focus visibility, non-color cues, 360px layouts, 200% zoom and reduced motion. Show actual product state without fabricated business metrics.

### Verify meaningful behavior

Run domain checks for completeness, reasoned decisions, approval invalidation, newly introduced duplicates, stale revisions, formula-safe CSV and escaping. Exercise real-browser IndexedDB for transaction rollback, retained unsaved drafts, reload and workspace isolation. Verify the complete journey with keyboard input and a narrow viewport. Inspect the downloaded file and show that a stale preview cannot export a changed request.

Use `acceptance-checks.json` to record observed results only after execution. Keep failures and deferrals explicit. A focused hook or property-based invariant is worthwhile if it actually helps; do not add features merely to name them in the entry. Preserve actual failing examples and fixes when they occur.

### Return concrete evidence

Return runnable source, reproducible setup/run/test commands, observed verification results and accurate limitations. Update tasks from actual completion. Add real session records to `docs/KIRO-USAGE.md`, identifying Kiro surface/version, timestamps, contributions, commands, outcomes and commits. Distinguish subsequent Codex review from Kiro work if both contribute.

Prepare the app for the unrecorded **2:45** sequence in `docs/DEMO-PLAN.md`: missing detail -> duplicate review -> approve -> edit breaks seal -> stale export blocked -> reapprove/download/reload -> new duplicate breaks prior approval -> genuine Kiro evidence. Do not claim hosting, a public video or Devpost submission until each is verified.

This kickoff is scoped to building and verifying this separate application. The current launch-package preparation does not push changes, invoke hosted workflows or submit an entry.
