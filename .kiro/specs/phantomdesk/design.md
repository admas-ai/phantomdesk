# Proposed design — review in Kiro before implementation

Prepared from the October 30 brief and requirements preserved from main, November 25, 2026. Nothing below claims implemented behavior.

## One product promise

The current work-list export must contain only complete, resolved, saved request revisions whose approval refers to that same revision. An old approval remains in history but cannot authorize edited instructions or a changed review condition.

## Core architecture

- Buildless HTML/CSS and JavaScript ES modules for a small portable app. No backend in the initial scope.
- `domain/requests.js`: pure validation, normalized duplicate relationships, versioned transitions, deterministic rules and export eligibility.
- `storage/repository.js`: IndexedDB transactions containing each request, history, approval state and affected cross-record duplicate changes. A memory adapter can support domain tests; browser persistence checks must exercise real IndexedDB.
- `ui/`: intake, queue, record drawer, rules view and export preview. All untrusted values use text nodes.
- `fixtures/`: synthetic demo data, loaded into a separate demo workspace.
- `tests/`: Node tests for pure behavior and browser tests for persistence, keyboard flow and transaction failure.

## Data model

Request: id, workspaceId, savedRevision, originalIntake, currentFields, currentReviewConditions, suggestedPriority, reviewerPriority, state, createdAt, updatedAt and optional currentApproval.

Approval: approvedRevision, immutable field/review snapshot, approvedAt and local actor label. The label is descriptive, not an authenticated identity.

History event: id, requestId, revision, type, actorLabel, time, before, after, reason and ruleSetVersion. History is append-only in the application; do not claim protection against a device owner changing browser storage.

States: Draft → Needs information / Needs review → Approved. Relevant edits or changed review conditions require a new saved revision and invalidate current approval. Incomplete or unresolved requests cannot enter Approved. No Dispatched state exists.

## Approval and export invariant

Evaluate eligibility from persisted state: the record is complete, all current conditions are resolved, and approval refers to the current saved revision with its exact field/review snapshot. Preserve old approval snapshots in history when the seal breaks. Unsaved edits cannot be approved or silently represented as saved/exportable changes.

Re-evaluate selected records when downloading; a preview is not authorization. Read current records consistently and construct the export from those immutable saved values. If a selected request changed, explain the change and require an updated preview before download. Do not silently substitute another revision.

## Cross-record duplicate changes

Duplicate matching uses normalized address, unit and category within one workspace. Preserve each request. Display the rule and counterpart IDs rather than merging records.

When a request is created or matching fields change, recompute affected relationships in the same storage transaction. A newly matching counterpart creates an unresolved condition on every affected request, including a previously approved one. Advance affected saved revisions, invalidate current approvals and append explanatory history atomically. Historical approved snapshots remain intact.

Scope a duplicate-resolution reason to the specific relationship and matching-key fingerprint reviewed. Dismissing one pair does not preapprove a later third request. If relationships change or disappear, recompute conditions and preserve history; never autoapprove. A retry after transaction failure must not append duplicate events.

Have Kiro review this model and record its actual decision before implementation. Verify the property that a newly unresolved duplicate cannot leave an affected request exportable.

## Persistence and concurrency

Commit a mutation and its history before reporting Saved. Compare the caller's expected revision to the latest persisted revision in the write transaction. Reject stale writes without overwriting newer data. On failure retain the visible draft, show Unsaved and offer retry. Keep unknown future schema versions intact and explain why the app cannot open them.

Demo and empty workspaces have separate identifiers. Demo reset must not touch user records. Explain browser-only storage without implying server backup, accounts or synchronization.

## Rules

Default demo catalog: repair, plumbing, electrical. Required fields include address, unit, category, description and preferred time. A possible-leak phrase triggers a visibly labeled sample review rule, not an emergency determination. Out-of-catalog work remains out of scope and cannot be approved without a defined valid resolution. Require reasons for priority overrides and duplicate dismissals. Normalization trims whitespace and applies consistent case folding without guessing missing addresses.

## Safe output and deferred import

Render user content with text nodes. CSV columns include request ID, approved revision, address, unit, category, approved description/work instructions, priority, preferred time, approval time and rule-set version. Preserve exact approved instructions while quoting cells and neutralizing formula/control prefixes. Inspect the downloaded file, not just a success message.

General JSON import is deferred in the first slice. Retain future-schema safeguards for stored data; do not show a placeholder import control.

## Visual direction

Haunted night-shift records office: near-black plum, parchment surfaces, restrained lavender, amber caution and sage approval. An intact seal, broken seal and side-by-side revision comparison explain approval state. Literal labels, readable contrast and visible keyboard focus remain primary. Use licensed icons or simple geometric marks; no unrelated franchise assets.

Show the selected request and next useful action. Do not invent customer counts, revenue or time-saved numbers. At 360px and 200% zoom keep primary controls reachable; stack comparisons when needed. Honor reduced motion and manage dialog focus. Hover must never reveal the only action.

## Error boundaries

Storage rejection → keep draft and unsaved marker. Stale revision → conflict prompt. Invalid transition → explanation. Export failure → retain the user's selection for a fresh eligibility check on retry, never treat a cached snapshot as permanently authorized. No remote logging of private fields.

## Tests and proof

Use the acceptance matrix as planned checks, not proof of success. Verify unresolved requests cannot be approved, duplicate evaluation preserves records, new duplicate conditions break prior approval and rejected transactions leave stored state unchanged. Run real browser checks for IndexedDB and the complete workflow. If a focused Kiro hook or property-based test helps, actually execute it and preserve any failure/fix evidence. Record results in `docs/KIRO-USAGE.md`; do not mark tests passed before execution.
