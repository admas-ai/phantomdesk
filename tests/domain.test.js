import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DomainError, SERVICE_CATEGORIES, createWorkspace, applyCommand,
  missingFields, recordStatus, canApprove, isEligible, createPreview, createCSV,
  compareApprovals, listApprovals,
} from '../domain/requests.js';

const NOW = '2026-11-25T18:00:00.000Z';
const FIELDS = {
  address: '12 Sample Street', unit: '4', category: 'repair',
  description: 'Tighten the cupboard hinge.', preferredTime: 'Tuesday 10:00-12:00',
};
const get = (workspace, id = 'A') => workspace.records.find((record) => record.id === id);
const run = (workspace, command) => applyCommand(workspace, { actor: 'Test reviewer', ...command }, { now: NOW });
const add = (workspace, id = 'A', fields = {}) => run(workspace, { type: 'create', id, fields: { ...FIELDS, ...fields } });
const change = (workspace, id, fields) => run(workspace, {
  type: 'edit', id, expectedRevision: get(workspace, id).revision, fields,
});
const approve = (workspace, id = 'A') => run(workspace, {
  type: 'approve', id, expectedRevision: get(workspace, id).revision,
});
function resolveAll(workspace, id) {
  for (const condition of get(workspace, id).conditions.filter((item) => !item.resolution)) {
    workspace = run(workspace, {
      type: 'resolve', id, expectedRevision: get(workspace, id).revision,
      conditionId: condition.id, reason: `Reviewed relationship or rule ${condition.id}.`,
    });
  }
  return workspace;
}
function frozen(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}
function rejectUnchanged(workspace, command, code) {
  const baseline = structuredClone(workspace);
  const commandBefore = structuredClone(command);
  assert.throws(() => run(workspace, command), (error) => error instanceof DomainError && error.code === code);
  assert.deepEqual(workspace, baseline, 'rejected command must not mutate its workspace');
  assert.deepEqual(command, commandBefore, 'rejected command must not mutate its command');
}

// An independent CSV reader checks quoted commas, doubled quotes and embedded
// newlines by round-tripping the produced file, not by repeating the writer.
function readCSV(csv) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && csv[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  assert.equal(quoted, false, 'CSV quotes must close');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

test('the real synthetic fixture set is separate, unapproved and explains its exceptions', () => {
  const fixtures = JSON.parse(readFileSync(new URL('../fixtures/requests.json', import.meta.url))).records;
  const before = structuredClone(fixtures);
  const workspace = createWorkspace('demo', fixtures);
  assert.equal(workspace.schemaVersion, 1);
  assert.equal(workspace.revision, 0);
  assert.equal(workspace.records.length, 5);
  assert.deepEqual(fixtures, before);
  assert.equal(recordStatus(get(workspace, 'DEMO-002')), 'Needs information');
  assert.equal(recordStatus(get(workspace, 'DEMO-005')), 'Out of scope');
  assert.equal(get(workspace, 'DEMO-003').priority, 'high');
  assert.equal(get(workspace, 'DEMO-001').conditions[0].counterpartId, 'DEMO-004');
  assert.equal(get(workspace, 'DEMO-004').conditions[0].counterpartId, 'DEMO-001');
  assert.ok(workspace.records.every((record) => !record.approval && record.history.length === 1));
  assert.deepEqual(createPreview(workspace), []);
  assert.deepEqual(createWorkspace('mine').records, []);
});

test('creating a valid request is input-preserving and never approves it automatically', () => {
  const original = frozen(createWorkspace('mine'));
  const fields = frozen({ ...FIELDS });
  const next = applyCommand(original, { type: 'create', fields, actor: 'Sura' }, { now: NOW, id: () => 'A' });
  assert.equal(original.records.length, 0);
  assert.equal(next.revision, 1);
  assert.equal(get(next).revision, 1);
  assert.equal(get(next).createdAt, NOW);
  assert.equal(recordStatus(get(next)), 'Needs review');
  assert.equal(canApprove(get(next)), true);
  assert.equal(isEligible(get(next)), false);
  assert.equal(get(next).history[0].type, 'created');
  get(next).fields.description = 'Changed returned object';
  assert.equal(fields.description, FIELDS.description);
  assert.equal(get(next).history[0].after.fields.description, FIELDS.description);
});

for (const [field, label] of Object.entries({
  address: 'Address', unit: 'Unit', category: 'Service category',
  description: 'Work instructions', preferredTime: 'Preferred time',
})) {
  test(`a whitespace-only ${field} remains a draft and blocks approval`, () => {
    const workspace = add(createWorkspace('mine'), 'A', { [field]: ' \t\n ' });
    assert.deepEqual(missingFields(get(workspace)), [label]);
    assert.equal(canApprove(get(workspace)), false);
    assert.equal(recordStatus(get(workspace)), 'Needs information');
    rejectUnchanged(workspace, { type: 'approve', id: 'A', expectedRevision: 1 }, 'INCOMPLETE');
  });
}

test('unsupported services are retained but cannot be approved', () => {
  const workspace = add(createWorkspace('mine'), 'A', { category: 'landscaping' });
  assert.equal(recordStatus(get(workspace)), 'Out of scope');
  assert.equal(canApprove(get(workspace)), false);
  rejectUnchanged(workspace, { type: 'approve', id: 'A', expectedRevision: 1 }, 'OUT_OF_SCOPE');
  assert.deepEqual(SERVICE_CATEGORIES, ['repair', 'plumbing', 'electrical']);
});

test('blank or incomplete matching keys do not fabricate duplicate relationships', () => {
  let workspace = add(createWorkspace('mine'), 'A', { unit: '' });
  workspace = add(workspace, 'B', { unit: '  ' });
  assert.equal(workspace.records.length, 2);
  assert.ok(workspace.records.every((record) => record.conditions.length === 0));
});

test('normalized duplicates are reciprocal, retain both records and are reviewed separately', () => {
  let workspace = add(createWorkspace('mine'));
  workspace = add(workspace, 'B', { address: ' 12 SAMPLE   street ', unit: ' 4 ', category: ' REPAIR ' });
  assert.equal(workspace.records.length, 2);
  assert.equal(get(workspace, 'A').revision, 2);
  assert.equal(get(workspace, 'A').history.at(-1).type, 'review-conditions-changed');
  assert.equal(get(workspace, 'B').history.length, 1);
  const pair = get(workspace, 'A').conditions[0];
  assert.equal(pair.type, 'duplicate');
  assert.equal(pair.ruleId, 'PD-DUP-001');
  assert.equal(pair.fingerprint, get(workspace, 'B').conditions[0].fingerprint);
  rejectUnchanged(workspace, { type: 'approve', id: 'A', expectedRevision: 2 }, 'UNRESOLVED');
  workspace = resolveAll(workspace, 'A');
  assert.equal(get(workspace, 'B').conditions[0].resolution, null);
  workspace = approve(workspace, 'A');
  assert.equal(isEligible(get(workspace, 'A')), true);
  assert.equal(isEligible(get(workspace, 'B')), false);
});

test('resolutions and priority decisions require meaningful reasons', () => {
  let workspace = add(createWorkspace('mine'));
  workspace = add(workspace, 'B');
  rejectUnchanged(workspace, {
    type: 'resolve', id: 'A', expectedRevision: get(workspace).revision,
    conditionId: get(workspace).conditions[0].id, reason: '   ',
  }, 'REASON_REQUIRED');
  rejectUnchanged(workspace, {
    type: 'priority', id: 'A', expectedRevision: get(workspace).revision, priority: 'high', reason: '',
  }, 'REASON_REQUIRED');
  rejectUnchanged(workspace, {
    type: 'priority', id: 'A', expectedRevision: get(workspace).revision, priority: 'urgent', reason: 'Reviewed.',
  }, 'INVALID_PRIORITY');
  rejectUnchanged(workspace, {
    type: 'resolve', id: 'A', expectedRevision: get(workspace).revision, conditionId: 'gone', reason: 'Reviewed.',
  }, 'CONDITION_NOT_FOUND');
});

test('a third matching request invalidates old approval without reusing a prior pair resolution', () => {
  let workspace = add(createWorkspace('mine'));
  workspace = add(workspace, 'B');
  workspace = approve(resolveAll(workspace, 'A'), 'A');
  const approved = structuredClone(get(workspace).approval);
  const revision = get(workspace).revision;
  const oldPreview = createPreview(workspace);
  const before = structuredClone(workspace);
  const next = add(frozen(workspace), 'C');
  assert.deepEqual(workspace, before);
  assert.equal(next.records.length, 3);
  assert.equal(next.revision, before.revision + 1);
  assert.equal(get(next).revision, revision + 1);
  assert.equal(get(next).approval, null);
  assert.equal(isEligible(get(next)), false);
  assert.ok(get(next).conditions.find((condition) => condition.counterpartId === 'B').resolution);
  assert.equal(get(next).conditions.find((condition) => condition.counterpartId === 'C').resolution, null);
  assert.deepEqual(get(next).history.at(-1).approval, approved);
  assert.equal(get(next).history.length, before.records[0].history.length + 1);
  assert.equal(get(next, 'C').history.length, 1);
  assert.throws(() => createCSV(next, oldPreview), (error) => error.code === 'STALE_EXPORT');
});

test('an edited existing request can introduce a duplicate and invalidate another approval', () => {
  let workspace = approve(add(createWorkspace('mine')));
  workspace = add(workspace, 'B', { address: '18 Example Road' });
  assert.equal(isEligible(get(workspace)), true);
  const savedApproval = structuredClone(get(workspace).approval);
  workspace = change(workspace, 'B', { address: FIELDS.address });
  assert.equal(get(workspace).approval, null);
  assert.equal(get(workspace).conditions[0].resolution, null);
  assert.deepEqual(get(workspace).history.at(-1).approval, savedApproval);
  assert.equal(get(workspace, 'B').history.at(-1).type, 'edited');
});

test('a relationship removed and then formed at another key needs fresh reasons', () => {
  let workspace = add(add(createWorkspace('mine')), 'B');
  workspace = approve(resolveAll(workspace, 'A'), 'A');
  workspace = approve(resolveAll(workspace, 'B'), 'B');
  const fingerprint = get(workspace).conditions[0].fingerprint;
  workspace = change(workspace, 'A', { unit: '8' });
  assert.equal(get(workspace, 'B').approval, null, 'a changed review context breaks the other approval');
  assert.equal(get(workspace, 'B').conditions.length, 0);
  assert.equal(recordStatus(get(workspace, 'B')), 'Needs review', 'removing a flag never autoapproves');
  workspace = change(workspace, 'B', { unit: '8' });
  for (const record of workspace.records) {
    assert.equal(record.conditions[0].resolution, null);
    assert.notEqual(record.conditions[0].fingerprint, fingerprint);
    assert.equal(isEligible(record), false);
  }
});

test('a counterpart instruction edit does not pretend its unchanged duplicate key is a new relationship', () => {
  let workspace = add(add(createWorkspace('mine')), 'B');
  workspace = approve(resolveAll(workspace, 'A'), 'A');
  const approval = structuredClone(get(workspace).approval);
  const revision = get(workspace).revision;
  workspace = change(workspace, 'B', { description: 'Replace the hinge instead.' });
  assert.equal(get(workspace).revision, revision);
  assert.deepEqual(get(workspace).approval, approval);
  assert.equal(isEligible(get(workspace)), true);
});

test('the sample leak rule is explained, requires review and resets after changed instructions', () => {
  let workspace = add(createWorkspace('mine'), 'A', { category: 'plumbing', description: 'Possible water leak at the sink.' });
  assert.equal(get(workspace).priority, 'high');
  assert.equal(get(workspace).conditions[0].ruleId, 'PD-LEAK-001');
  assert.match(get(workspace).conditions[0].text, /demonstration rule/);
  rejectUnchanged(workspace, { type: 'approve', id: 'A', expectedRevision: 1 }, 'UNRESOLVED');
  workspace = approve(resolveAll(workspace, 'A'));
  workspace = change(workspace, 'A', { description: 'Leak is now reported at a different fixture.' });
  assert.equal(get(workspace).conditions[0].resolution, null);
  assert.equal(get(workspace).approval, null);
  workspace = change(workspace, 'A', { description: 'Replace the tap handle.' });
  assert.equal(get(workspace).conditions.length, 0);
  assert.equal(get(workspace).priority, 'normal');
  assert.equal(isEligible(get(workspace)), false);
});

test('approval binds a new saved revision and an edit preserves its old snapshot in history', () => {
  let workspace = add(createWorkspace('mine'));
  const original = structuredClone(workspace);
  workspace = approve(frozen(workspace));
  assert.deepEqual(original.records[0].approval, null);
  const record = get(workspace);
  assert.equal(record.revision, 2);
  assert.equal(record.approval.revision, 2);
  assert.deepEqual(record.approval.snapshot.fields, FIELDS);
  assert.equal(recordStatus(record), 'Approved');
  assert.equal(canApprove(record), false);
  assert.equal(record.history.at(-1).after.approval.revision, 2);
  rejectUnchanged(workspace, { type: 'approve', id: 'A', expectedRevision: 2 }, 'ALREADY_APPROVED');
  const oldApproval = structuredClone(record.approval);
  workspace = change(workspace, 'A', { description: 'Replace the entire hinge.' });
  assert.equal(get(workspace).revision, 3);
  assert.equal(get(workspace).approval, null);
  assert.deepEqual(get(workspace).history.at(-1).approval, oldApproval);
  get(workspace).fields.description = 'External mutation of returned current fields';
  assert.equal(get(workspace).history.at(-1).approval.snapshot.fields.description, FIELDS.description);
  assert.equal(get(workspace).history.at(-1).after.fields.description, 'Replace the entire hinge.');
});

test('an approved priority change records its reason and expires approval', () => {
  let workspace = approve(add(createWorkspace('mine')));
  const approved = structuredClone(get(workspace).approval);
  workspace = run(workspace, { type: 'priority', id: 'A', expectedRevision: 2, priority: 'high', reason: '  Coordinator reviewed access window.  ' });
  assert.equal(get(workspace).priority, 'high');
  assert.equal(get(workspace).priorityOverride, 'high');
  assert.equal(get(workspace).approval, null);
  const item = get(workspace).history.at(-1);
  assert.equal(item.reason, 'Coordinator reviewed access window.');
  assert.equal(item.before.priority, 'normal');
  assert.equal(item.after.priority, 'high');
  assert.deepEqual(item.approval, approved);
});

test('stale editors and missing revision guards cannot overwrite a saved decision', () => {
  let workspace = approve(add(createWorkspace('mine')));
  for (const command of [
    { type: 'edit', fields: { description: 'Stale edit' } },
    { type: 'priority', priority: 'high', reason: 'Stale decision' },
    { type: 'resolve', conditionId: 'missing', reason: 'Stale decision' },
    { type: 'approve' },
  ]) rejectUnchanged(workspace, { ...command, id: 'A', expectedRevision: 1 }, 'CONFLICT');
  rejectUnchanged(workspace, { type: 'edit', id: 'A', fields: { description: 'No guard' } }, 'CONFLICT');
  rejectUnchanged(workspace, { type: 'edit', id: 'A', expectedRevision: 2, fields: { ...FIELDS } }, 'NO_CHANGE');
});

test('malformed commands and future schemas fail without mutating saved data', () => {
  const workspace = add(createWorkspace('mine'));
  for (const fields of [[], { unit: 4 }, { description: null }, { unexpected: 'value' }]) {
    rejectUnchanged(workspace, { type: 'create', id: 'B', fields }, 'INVALID_FIELDS');
  }
  rejectUnchanged(workspace, { type: 'create', id: 'A', fields: FIELDS }, 'ID_EXISTS');
  rejectUnchanged(workspace, { type: 'delete', id: 'A' }, 'INVALID_COMMAND');
  rejectUnchanged(workspace, { type: 'edit', id: 'missing', expectedRevision: 1, fields: {} }, 'NOT_FOUND');
  const future = { ...workspace, schemaVersion: 99 };
  rejectUnchanged(future, { type: 'approve', id: 'A', expectedRevision: 1 }, 'UNSUPPORTED_SCHEMA');
  assert.throws(() => createWorkspace('demo', [{ id: 'A', ...FIELDS }, { id: 'A', ...FIELDS }]), (error) => error.code === 'INVALID_WORKSPACE');
});

test('eligibility checks the actual approval snapshot rather than trusting a status flag', () => {
  const workspace = approve(add(createWorkspace('mine')));
  assert.equal(isEligible(get(workspace)), true);
  const changedFields = structuredClone(get(workspace));
  changedFields.fields.description = 'Changed without a matching snapshot';
  assert.equal(isEligible(changedFields), false);
  const changedRevision = structuredClone(get(workspace));
  changedRevision.revision += 1;
  assert.equal(isEligible(changedRevision), false);
  const changedSnapshot = structuredClone(get(workspace));
  changedSnapshot.approval.snapshot.priority = 'high';
  assert.equal(isEligible(changedSnapshot), false);
});

test('previews include only eligible revisions, deduplicate selection and remain independent', () => {
  let workspace = approve(add(createWorkspace('mine')));
  workspace = add(workspace, 'B', { address: 'Elsewhere', unit: '' });
  workspace = add(workspace, 'C', { address: 'Another address', category: 'landscaping' });
  const preview = createPreview(workspace, ['A', 'A', 'B', 'C']);
  assert.deepEqual(preview, [{ workspaceId: 'mine', id: 'A', revision: 2, approvalAt: NOW }]);
  assert.deepEqual(createPreview(workspace, []), []);
  assert.throws(() => createPreview(workspace, ['gone']), (error) => error.code === 'NOT_FOUND');
  preview[0].revision = 999;
  assert.equal(get(workspace).revision, 2);
});

test('stale preview remains blocked after edit and reapproval, while unrelated changes are allowed', () => {
  let workspace = approve(add(createWorkspace('mine')));
  const preview = createPreview(workspace);
  workspace = add(workspace, 'B', { address: 'Unrelated location' });
  assert.match(createCSV(workspace, preview), /Tighten the cupboard hinge/);
  workspace = change(workspace, 'A', { description: 'Use the new hinge.' });
  assert.throws(() => createCSV(workspace, preview), (error) => error.code === 'STALE_EXPORT');
  workspace = approve(workspace);
  assert.throws(() => createCSV(workspace, preview), (error) => error.code === 'STALE_EXPORT');
  const csv = readCSV(createCSV(workspace, createPreview(workspace)));
  assert.equal(csv[1][1], String(get(workspace).revision));
  assert.equal(csv[1][5], 'Use the new hinge.');
});

test('a preview cannot cross workspaces, contain duplicate rows or silently export nothing', () => {
  const mine = approve(add(createWorkspace('mine')));
  const demo = approve(add(createWorkspace('demo')));
  const preview = createPreview(mine);
  assert.throws(() => createCSV(demo, preview), (error) => error.code === 'STALE_EXPORT');
  assert.throws(() => createCSV(mine, [...preview, ...preview]), (error) => error.code === 'INVALID_PREVIEW');
  assert.throws(() => createCSV(mine, []), (error) => error.code === 'EMPTY_EXPORT');
  assert.throws(() => createCSV(mine, null), (error) => error.code === 'INVALID_PREVIEW');
});

test('CSV round-trips approved commas, quotes, Unicode and multiline instructions', () => {
  const fields = {
    ...FIELDS, address: '12 Sample Street, "North"',
    description: 'Replace "hinge", then test.\nPreserve this second line.\r\nሰላም',
  };
  const workspace = approve(add(createWorkspace('mine'), 'A', fields));
  const csv = createCSV(workspace, createPreview(workspace));
  assert.ok(csv.endsWith('\r\n'));
  const [headers, row] = readCSV(csv);
  assert.equal(row.length, headers.length);
  assert.equal(row[headers.indexOf('address')], fields.address);
  assert.equal(row[headers.indexOf('work_instructions')], fields.description);
  assert.equal(row[headers.indexOf('approved_at')], NOW);
  assert.equal(row[headers.indexOf('rule_set_version')], 'phantomdesk-demo-1');
});

test('CSV neutralizes formula and control prefixes without changing stored instructions', () => {
  const samples = ['=1+1', '+SUM(A1:A2)', '-2+3', '@SUM(A1)', '  =2+2', '\t=1', '\nformula-like text', '\r@cmd', '\u0001value'];
  for (const sample of samples) {
    const workspace = approve(add(createWorkspace('mine'), 'A', { description: sample }));
    const row = readCSV(createCSV(workspace, createPreview(workspace)))[1];
    assert.equal(row[5], `'${sample}`);
    assert.equal(get(workspace).fields.description, sample);
    assert.equal(get(workspace).approval.snapshot.fields.description, sample);
  }
  const workspace = approve(add(createWorkspace('mine'), '=1+1'), '=1+1');
  assert.equal(readCSV(createCSV(workspace, createPreview(workspace)))[1][0], "'=1+1");
});

test('untrusted HTML stays literal data throughout history, approval and export', () => {
  const text = '<img src=x onerror="alert(1)"><script>doBadThing()</script>';
  const workspace = approve(add(createWorkspace('mine'), 'A', { description: text }));
  assert.equal(get(workspace).fields.description, text);
  assert.equal(get(workspace).history[0].after.fields.description, text);
  assert.equal(readCSV(createCSV(workspace, createPreview(workspace)))[1][5], text);
});

test('replaying an aborted pure candidate produces exactly one committed transition', () => {
  const baseline = approve(add(createWorkspace('mine')));
  const before = structuredClone(baseline);
  const command = { type: 'create', id: 'B', actor: 'Test reviewer', fields: FIELDS };
  const discarded = applyCommand(frozen(baseline), command, { now: NOW });
  const retried = applyCommand(baseline, command, { now: NOW });
  assert.deepEqual(baseline, before, 'discarding an unsaved result must preserve the committed baseline');
  assert.deepEqual(retried, discarded, 'same explicit input/time/ID is deterministic');
  assert.equal(retried.records.length, 2);
  assert.equal(get(retried).history.length, get(baseline).history.length + 1);
  assert.equal(get(retried, 'B').history.length, 1);
  assert.equal(new Set(get(retried).history.map((item) => item.id)).size, get(retried).history.length);
  rejectUnchanged(retried, command, 'ID_EXISTS');
});

test('every incomplete combination stays ineligible across the approval boundary', () => {
  const keys = Object.keys(FIELDS);
  for (let mask = 1; mask < (1 << keys.length); mask += 1) {
    const fields = { ...FIELDS };
    keys.forEach((key, index) => { if (mask & (1 << index)) fields[key] = ''; });
    const workspace = add(createWorkspace('mine'), 'A', fields);
    assert.equal(isEligible(get(workspace)), false);
    assert.equal(canApprove(get(workspace)), false);
    rejectUnchanged(workspace, { type: 'approve', id: 'A', expectedRevision: 1 }, 'INCOMPLETE');
    assert.deepEqual(createPreview(workspace), []);
  }
});

// Comparison coverage introduced by Kiro; correctness cases extended in Codex.

test('compareApprovals: reverting saved fields shows unchanged values without restoring approval', () => {
  // Approve, then break the approval by an instruction change, then revert to the
  // original text. The approval-carrying 'edited' event's snapshot should match
  // the current fields (since the second edit restored them).
  let workspace = add(createWorkspace('mine'));
  workspace = approve(workspace);
  workspace = change(workspace, 'A', { description: 'Temporary edit.' });
  // The 'edited' event now carries the first approval snapshot.
  workspace = change(workspace, 'A', { description: FIELDS.description });
  // Now the description matches the first-approval snapshot again.
  const record = get(workspace);
  const approvalEntries = record.history.filter(e => e.approval);
  assert.equal(approvalEntries.length, 1, 'one approval-carrying event exists');
  const diff = compareApprovals(approvalEntries[0], record);
  const descField = diff.fields.find(f => f.key === 'description');
  assert.ok(!descField.changed, 'description is back to its approved value and must show unchanged');
  assert.ok(diff.fields.every(f => !f.changed), 'all fields must be unchanged after reverting');
  assert.equal(diff.priorityChanged, false);
  assert.equal(diff.conditions.length, 0);
  assert.equal(diff.currentStatus, 'Needs review');
  assert.equal(isEligible(record), false, 'equal values do not restore an old approval');
});

test('compareApprovals: changed field shows as changed, unchanged field stays same', () => {
  let workspace = add(createWorkspace('mine'));
  workspace = approve(workspace);
  // Edit work instructions only; the 'edited' event carries the broken approval.
  workspace = change(workspace, 'A', { description: 'Replace the whole door.' });
  const record = get(workspace);
  const approvalEntry = record.history.find(e => e.approval);
  assert.ok(approvalEntry, 'approval-carrying history entry must exist after breaking approval');
  const diff = compareApprovals(approvalEntry, record);
  const descField = diff.fields.find(f => f.key === 'description');
  const addrField = diff.fields.find(f => f.key === 'address');
  assert.ok(descField.changed, 'changed description must be marked changed');
  assert.equal(descField.approved, FIELDS.description);
  assert.equal(descField.current, 'Replace the whole door.');
  assert.ok(!addrField.changed, 'unchanged address must not be marked changed');
  assert.equal(addrField.approved, FIELDS.address);
  assert.equal(addrField.current, FIELDS.address);
});

test('compareApprovals: priority change is reflected in the diff', () => {
  let workspace = add(createWorkspace('mine'));
  workspace = approve(workspace);
  // A priority override breaks the approval; the 'priority' event carries it.
  workspace = run(workspace, {
    type: 'priority', id: 'A', expectedRevision: get(workspace).revision,
    priority: 'high', reason: 'Reviewer decision.',
  });
  const record = get(workspace);
  const approvalEntry = record.history.find(e => e.approval);
  assert.ok(approvalEntry, 'approval-carrying event must exist after priority change');
  const diff = compareApprovals(approvalEntry, record);
  assert.equal(diff.priorityApproved, 'normal');
  assert.equal(diff.priorityCurrent, 'high');
  assert.equal(diff.priorityChanged, true);
});

test('compareApprovals: multiple historical approvals are each independently comparable', () => {
  // Build a record with two separate approval-breaking edits so there are
  // two history entries each carrying a preserved approval snapshot.
  let workspace = add(createWorkspace('mine'));
  workspace = approve(workspace);
  // Edit breaks the first approval; the 'edited' event carries it.
  workspace = change(workspace, 'A', { description: 'Second revision of work.' });
  workspace = approve(workspace);
  // Edit breaks the second approval; another 'edited' event carries it.
  workspace = change(workspace, 'A', { description: 'Third revision of work.' });
  const record = get(workspace);

  // The two approval-carrying history entries (most-recent first).
  const approvalEntries = [...record.history].reverse().filter(e => e.approval);
  assert.equal(approvalEntries.length, 2, 'must have two history entries that preserved an approval');

  // Most recent broken approval (second approval) is at index 0.
  const secondBroken = approvalEntries[0];
  const diffSecond = compareApprovals(secondBroken, record);
  assert.equal(diffSecond.approvedRevision, secondBroken.approval.revision);
  assert.equal(diffSecond.currentRevision, record.revision);
  const descVsSecond = diffSecond.fields.find(f => f.key === 'description');
  assert.ok(descVsSecond.changed, 'description changed between second approval and current');
  assert.equal(descVsSecond.approved, 'Second revision of work.');
  assert.equal(descVsSecond.current, 'Third revision of work.');

  // Earlier broken approval (first approval) is at index 1.
  const firstBroken = approvalEntries[1];
  const diffFirst = compareApprovals(firstBroken, record);
  assert.equal(diffFirst.approvedRevision, firstBroken.approval.revision);
  const descVsFirst = diffFirst.fields.find(f => f.key === 'description');
  assert.ok(descVsFirst.changed, 'description changed between first approval and current');
  assert.equal(descVsFirst.approved, FIELDS.description);
  assert.equal(descVsFirst.current, 'Third revision of work.');

  // The two diffs should be independent and reference different revision numbers.
  assert.notEqual(firstBroken.approval.revision, secondBroken.approval.revision);
});

test('compareApprovals: later third duplicate appears as a new condition, old pair resolution is preserved', () => {
  // A, B duplicate pair; A approved; C added matching the same key.
  let workspace = add(createWorkspace('mine'));
  workspace = add(workspace, 'B');
  workspace = approve(resolveAll(workspace, 'A'), 'A');

  workspace = add(workspace, 'C');  // introduces a new duplicate condition on A
  const recordAfterC = get(workspace);

  // Adding C triggers 'review-conditions-changed' on A, which carries the broken approval.
  const approvalEntry = [...recordAfterC.history].reverse().find(e => e.approval);
  assert.ok(approvalEntry, 'approval-carrying event must exist after C broke the approval');

  const diff = compareApprovals(approvalEntry, recordAfterC);

  // B relationship was present and resolved at approval.
  const condB = diff.conditions.find(c => c.current?.counterpartId === 'B');
  assert.ok(condB, 'B duplicate condition must appear in the diff');
  assert.equal(condB.changed, false, 'adding C does not change the reviewed A/B relationship');
  assert.equal(condB.change, 'unchanged');
  assert.ok(condB.approved.resolution, 'B was resolved at approval');
  assert.deepEqual(condB.current.resolution, condB.approved.resolution, 'B retains its original recorded reason');
  assert.equal(condB.current.fingerprint, condB.approved.fingerprint, 'the pair-specific matching key is unchanged');

  // C relationship is new since approval.
  const condC = diff.conditions.find(c => c.current?.counterpartId === 'C');
  assert.ok(condC, 'C duplicate condition must appear in the diff');
  assert.equal(condC.approved, null, 'C was not present at the time of approval');
  assert.ok(condC.current, 'C is present in the current saved revision');
  assert.equal(condC.current.resolution, null, 'the old B decision does not resolve C');
  assert.equal(condC.change, 'added');
  assert.equal(condC.changed, true);
  assert.match(condC.note, /C/, 'note must name the counterpart ID');
  assert.match(condC.note, /new condition/i, 'note must explain this is a new condition');
});

test('compareApprovals: inert user-supplied text — HTML and formula prefixes — stays literal throughout', () => {
  const dangerText = '<img src=x onerror="alert(1)"><script>evil()</script>';
  const formulaText = '=SUM(A1:A10)';
  let workspace = add(createWorkspace('mine'), 'A', {
    description: dangerText,
    preferredTime: formulaText,
  });
  workspace = approve(workspace);
  // Edit description to trigger the approval-carrying event; leave preferredTime unchanged.
  workspace = change(workspace, 'A', { description: 'Normal text now.' });
  const record = get(workspace);
  const approvalEntry = record.history.find(e => e.approval);
  assert.ok(approvalEntry, 'approval-carrying event must exist');
  const diff = compareApprovals(approvalEntry, record);
  const descField = diff.fields.find(f => f.key === 'description');
  const timeField = diff.fields.find(f => f.key === 'preferredTime');
  // HTML/formula content in the approved snapshot must be reproduced literally.
  assert.equal(descField.approved, dangerText, 'HTML stays literal in approved snapshot');
  assert.equal(timeField.approved, formulaText, 'formula stays literal in approved snapshot');
  assert.equal(timeField.current, formulaText, 'unchanged formula stays literal in current');
  assert.ok(descField.changed, 'changed description is marked changed');
  assert.ok(!timeField.changed, 'unchanged preferred time is not marked changed');
});

test('compareApprovals: rejects invalid inputs without throwing obscure errors', () => {
  let workspace = add(createWorkspace('mine'));
  workspace = approve(workspace);
  const record = get(workspace);
  assert.throws(
    () => compareApprovals(null, record),
    (e) => e instanceof DomainError && e.code === 'INVALID_SNAPSHOT',
  );
  assert.throws(
    () => compareApprovals({ approval: null }, record),
    (e) => e instanceof DomainError && e.code === 'INVALID_SNAPSHOT',
  );
  const currentOption = { approval: record.approval };
  const malformedSnapshots = [
    { approval: {} },
    { approval: { ...record.approval, at: 'not-a-date' } },
    { approval: { ...record.approval, snapshot: null } },
    { approval: { ...record.approval, snapshot: { ...record.approval.snapshot, fields: null } } },
    { approval: { ...record.approval, snapshot: { ...record.approval.snapshot, conditions: [null] } } },
    { approval: { ...record.approval, snapshot: { ...record.approval.snapshot, revision: 99 } } },
  ];
  for (const malformed of malformedSnapshots) {
    assert.throws(() => compareApprovals(malformed, record),
      (e) => e instanceof DomainError && e.code === 'INVALID_SNAPSHOT');
  }
  for (const malformed of [{ revision: 1 }, { ...record, revision: NaN }, { ...record, conditions: [null] }]) {
    assert.throws(() => compareApprovals(currentOption, malformed),
      (e) => e instanceof DomainError && e.code === 'INVALID_RECORD');
  }
  const malformedHistory = structuredClone(record);
  malformedHistory.history.push({ after: { approval: {} } });
  assert.throws(() => listApprovals(malformedHistory),
    (e) => e instanceof DomainError && e.code === 'INVALID_SNAPSHOT');
  // Need an event that carries .approval to reach the record check.
  workspace = change(workspace, 'A', { description: 'Changed.' });
  const approvalEntry = get(workspace).history.find(e => e.approval);
  assert.ok(approvalEntry, 'approval-carrying entry must exist for the record-validation test');
  assert.throws(
    () => compareApprovals(approvalEntry, null),
    (e) => e instanceof DomainError && e.code === 'INVALID_RECORD',
  );
});

test('comparison selection and returned-data changes leave both frozen inputs and eligibility untouched', () => {
  let workspace = add(createWorkspace('mine'));
  workspace = add(workspace, 'B');
  workspace = approve(resolveAll(workspace, 'A'));
  workspace = change(workspace, 'A', { description: 'Changed.' });
  frozen(workspace);
  const before = structuredClone(workspace);
  const previewBefore = createPreview(workspace);
  const record = get(workspace);
  const entry = frozen(structuredClone(record.history.find(e => e.approval)));
  const entryBefore = structuredClone(entry);
  assert.ok(entry, 'approval-carrying entry must exist');
  const diff = compareApprovals(entry, record);
  const options = listApprovals(record);
  diff.fields[0].current = 'Changed in the returned comparison only';
  diff.conditions[0].approved.resolution.reason = 'Changed in returned historical data only';
  diff.conditions[0].current.resolution.reason = 'Changed in returned current data only';
  options[0].approval.snapshot.conditions[0].resolution.reason = 'Changed in returned option only';
  assert.deepEqual(entry, entryBefore, 'the separately supplied historical snapshot is unchanged');
  assert.deepEqual(workspace, before, 'workspace, approvals and history are unchanged');
  assert.deepEqual(createPreview(workspace), previewBefore, 'selection does not change export eligibility');
});

test('listApprovals: current and historical approvals have unique stable keys and newest-first order', () => {
  let workspace = approve(add(createWorkspace('mine')));
  const firstOptions = listApprovals(get(workspace));
  assert.equal(firstOptions.length, 1, 'current approval and its history copy produce one option');
  assert.equal(firstOptions[0].isCurrent, true);
  const firstKey = firstOptions[0].key;
  assert.equal(firstKey, JSON.stringify(['A', 2, NOW]));
  const currentDiff = compareApprovals(firstOptions[0], get(workspace));
  assert.equal(currentDiff.approvalKey, firstKey);
  assert.ok(currentDiff.fields.every(field => !field.changed));
  assert.equal(currentDiff.currentStatus, 'Approved');

  workspace = change(workspace, 'A', { description: 'Second approved instructions.' });
  const brokenOptions = listApprovals(get(workspace));
  assert.equal(brokenOptions.length, 1, 'after.approval and preserved approval are deduplicated');
  assert.equal(brokenOptions[0].key, firstKey, 'breaking approval does not change its identity');
  assert.equal(brokenOptions[0].isCurrent, false);
  workspace = approve(workspace);
  const record = get(workspace);
  const options = listApprovals(record);
  assert.deepEqual(options.map(option => option.approval.revision), [4, 2]);
  assert.deepEqual(options.map(option => option.isCurrent), [true, false]);
  assert.equal(options[1].key, firstKey, 'newer approvals do not retarget an older selection');
  assert.notEqual(options[0].key, options[1].key, 'identical timestamps do not collapse distinct revisions');
  assert.equal(compareApprovals(options[1], record).fields.find(field => field.key === 'description').approved,
    FIELDS.description);
  const before = structuredClone(record);
  options[0].approval.snapshot.fields.description = 'Only a returned copy';
  assert.deepEqual(record, before, 'option values do not alias the saved record or history');
});

test('listApprovals: no approvals is empty and approved-event snapshots remain readable independently', () => {
  let workspace = add(createWorkspace('mine'));
  assert.deepEqual(listApprovals(get(workspace)), []);
  workspace = approve(workspace);
  workspace = change(workspace, 'A', { description: 'New instructions.' });
  workspace = approve(workspace);
  const historyOnly = structuredClone(get(workspace));
  historyOnly.approval = null;
  historyOnly.history = historyOnly.history.filter(entry => entry.type === 'approved');
  assert.ok(historyOnly.history.every(entry => !entry.approval && entry.after.approval));
  const options = listApprovals(historyOnly);
  assert.deepEqual(options.map(option => option.approval.revision), [4, 2]);
  assert.ok(options.every(option => !option.isCurrent));
  assert.equal(compareApprovals(options[0], historyOnly).currentStatus, 'Needs review');
});

test('compareApprovals: a changed condition and new review remain changed when both sides are resolved', () => {
  let workspace = add(createWorkspace('mine'), 'A', { description: 'Possible leak at the sink.' });
  workspace = run(workspace, {
    type: 'resolve', id: 'A', expectedRevision: get(workspace).revision,
    conditionId: 'sample-leak', reason: 'Reviewed the original sink report.', actor: 'First reviewer',
  });
  workspace = approve(workspace);
  const option = listApprovals(get(workspace))[0];
  workspace = change(workspace, 'A', { description: 'Possible leak at the kitchen pipe.' });
  const unresolved = compareApprovals(option, get(workspace)).conditions[0];
  assert.equal(unresolved.change, 'modified');
  assert.equal(unresolved.current.resolution, null);
  assert.match(unresolved.note, /requires a new review/i);
  workspace = run(workspace, {
    type: 'resolve', id: 'A', expectedRevision: get(workspace).revision,
    conditionId: 'sample-leak', reason: 'Reviewed the updated pipe report.', actor: 'Second reviewer',
  });
  const condition = compareApprovals(option, get(workspace)).conditions[0];
  assert.equal(condition.id, 'sample-leak');
  assert.equal(condition.changed, true);
  assert.equal(condition.change, 'modified');
  assert.notEqual(condition.approved.fingerprint, condition.current.fingerprint);
  assert.equal(condition.approved.resolution.reason, 'Reviewed the original sink report.');
  assert.equal(condition.current.resolution.reason, 'Reviewed the updated pipe report.');
  assert.equal(condition.approved.resolution.actor, 'First reviewer');
  assert.equal(condition.current.resolution.actor, 'Second reviewer');
  assert.match(condition.note, /reviewed in the current saved revision/i);
  assert.doesNotMatch(condition.note, /requires a new review/i);
});

test('compareApprovals: an added duplicate that was reviewed and reapproved is not awaiting review', () => {
  let workspace = approve(add(createWorkspace('mine')));
  const earlierApproval = listApprovals(get(workspace))[0];
  workspace = add(workspace, 'B');
  workspace = approve(resolveAll(workspace, 'A'));
  const diff = compareApprovals(earlierApproval, get(workspace));
  assert.equal(diff.currentStatus, 'Approved');
  const condition = diff.conditions.find(item => item.current?.counterpartId === 'B');
  assert.equal(condition.change, 'added');
  assert.equal(condition.changed, true);
  assert.equal(condition.approved, null);
  assert.ok(condition.current.resolution);
  assert.match(condition.note, /possible duplicate of B/);
  assert.match(condition.note, /reviewed in the current saved revision/i);
  assert.doesNotMatch(condition.note, /requires a new review/i);
});

test('compareApprovals: a removed duplicate retains only its historical side and recorded reason', () => {
  let workspace = add(createWorkspace('mine'));
  workspace = add(workspace, 'B');
  workspace = approve(resolveAll(workspace, 'A'));
  const option = listApprovals(get(workspace))[0];
  workspace = change(workspace, 'B', { address: 'Different synthetic address' });
  const condition = compareApprovals(option, get(workspace)).conditions[0];
  assert.equal(condition.change, 'removed');
  assert.equal(condition.changed, true);
  assert.equal(condition.approved.counterpartId, 'B');
  assert.equal(condition.approved.resolution.reason, 'Reviewed relationship or rule duplicate:B.');
  assert.equal(condition.current, null, 'historical condition data is never copied into the absent current side');
  assert.match(condition.note, /no longer flagged/i);
  assert.doesNotMatch(condition.note, /requires a new review/i);
});
