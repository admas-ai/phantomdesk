# PhantomDesk — the broken approval seal

## Product
A maintenance coordinator must be able to tell whether the instructions being exported are the instructions someone actually approved. An edit breaks the seal. The old approved snapshot stays in history. The current work list excludes the request until a person approves the new revision.

## Demonstration
Use a clearly labeled synthetic workspace and a separate empty workspace. Start with a cabinet repair at 12 Sample Street, unit 4, a second report with the same normalized address and unit, a report with a missing unit, a plumbing request containing the sample leak flag, and an out-of-catalog landscaping request. Never merge or delete a suspected duplicate automatically. Explain each flag and its rule. A reviewer records a reason to resolve a duplicate or change priority. Incomplete or unresolved records cannot be approved.

## Architecture and acceptance
Use buildless HTML, CSS, ES modules, and browser IndexedDB. Commit the revision, event history, and approval state atomically. Reject stale edits. On write failure retain the draft and show a retry. Render user input as text. Preview an approved-only CSV and recheck eligibility at download time; quote cells and neutralize spreadsheet formula prefixes. Maintain request ID, approved revision, work instructions and approval time across export and reload. Run automated tests for the approval invariant, stale writes, input validation, export escaping and persistence. Exercise the complete journey at 360px and with keyboard input.

## Design
Use a haunted night-shift records office for the Costume Contest. A physical-looking seal, a broken seal and a side-by-side revision diff make the approval history readable. Provide literal status text alongside the visual cues. Honor reduced motion. No external services or automatic dispatch.

## Development provenance
Codex prepared the initial specification from the October 30 planning brief. Record actual Kiro design decisions, implementation changes, and test results as development proceeds.
