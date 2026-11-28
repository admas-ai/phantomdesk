/**
 * PhantomDesk domain model, implemented in this Codex session.
 * No storage or network calls. A successful reducer returns an independent
 * workspace; a rejected command leaves its input unchanged.
 */

export const SCHEMA_VERSION = 1;
export const RULE_SET_VERSION = 'phantomdesk-demo-1';
export const SERVICE_CATEGORIES = Object.freeze(['repair', 'plumbing', 'electrical']);

const FIELD_LABELS = Object.freeze({
  address: 'Address',
  unit: 'Unit',
  category: 'Service category',
  description: 'Work instructions',
  preferredTime: 'Preferred time',
});
const FIELD_KEYS = Object.keys(FIELD_LABELS);
const PRIORITIES = ['normal', 'high'];
const COMMANDS = new Set(['create', 'edit', 'resolve', 'priority', 'approve']);

export class DomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

const copy = (value) => structuredClone(value);
const normalize = (value) => value.trim().replace(/\s+/gu, ' ').toLowerCase();
const plainObject = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function fail(code, message, details) {
  throw new DomainError(code, message, details);
}

function requiredText(value, label, code = 'INVALID_INPUT') {
  if (typeof value !== 'string' || !value.trim()) fail(code, `${label} is required.`);
  return value.trim();
}

function instant(value) {
  const date = value === undefined ? new Date() : value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) fail('INVALID_TIME', 'The operation timestamp is invalid.');
  return date.toISOString();
}

function fieldsFrom(input, existing = null) {
  if (!plainObject(input)) fail('INVALID_FIELDS', 'Request fields must be an object.');
  for (const key of Object.keys(input)) {
    if (!FIELD_KEYS.includes(key)) fail('INVALID_FIELDS', `Unknown request field: ${key}.`);
    if (typeof input[key] !== 'string') fail('INVALID_FIELDS', `${FIELD_LABELS[key]} must be text.`);
    if (input[key].length > 20000) fail('INVALID_FIELDS', `${FIELD_LABELS[key]} is too long.`);
  }
  return Object.fromEntries(FIELD_KEYS.map((key) => {
    let value = Object.hasOwn(input, key) ? input[key] : existing?.[key] ?? '';
    if (key === 'category') value = normalize(value);
    return [key, value];
  }));
}

function workspaceShape(workspace) {
  if (!plainObject(workspace)) fail('INVALID_WORKSPACE', 'The workspace is invalid.');
  if (workspace.schemaVersion !== SCHEMA_VERSION) {
    fail('UNSUPPORTED_SCHEMA', 'This workspace uses an unsupported storage version. Its data was not changed.');
  }
  if (typeof workspace.id !== 'string' || !workspace.id.trim()
    || !Number.isSafeInteger(workspace.revision) || workspace.revision < 0
    || !Array.isArray(workspace.records)) {
    fail('INVALID_WORKSPACE', 'The workspace structure is invalid.');
  }
  const ids = new Set();
  for (const record of workspace.records) {
    if (!plainObject(record) || typeof record.id !== 'string' || !record.id.trim()
      || ids.has(record.id) || !Number.isSafeInteger(record.revision) || record.revision < 1
      || !plainObject(record.fields) || FIELD_KEYS.some((key) => typeof record.fields[key] !== 'string')
      || !PRIORITIES.includes(record.priority)
      || !(record.priorityOverride === null || PRIORITIES.includes(record.priorityOverride))
      || !Array.isArray(record.conditions) || !Array.isArray(record.history)
      || !(record.approval === null || plainObject(record.approval))) {
      fail('INVALID_WORKSPACE', 'A saved request has an invalid structure.');
    }
    ids.add(record.id);
    const conditionIds = new Set();
    for (const condition of record.conditions) {
      if (!plainObject(condition) || typeof condition.id !== 'string' || conditionIds.has(condition.id)
        || !['duplicate', 'sample-leak'].includes(condition.type)
        || typeof condition.fingerprint !== 'string'
        || !(condition.resolution === null || plainObject(condition.resolution))) {
        fail('INVALID_WORKSPACE', 'A saved review condition has an invalid structure.');
      }
      conditionIds.add(condition.id);
    }
  }
}

function duplicateKey(record) {
  const values = ['address', 'unit', 'category'].map((key) => normalize(record.fields[key]));
  return values.every(Boolean) ? JSON.stringify(values) : null;
}

function conditionsFor(record, records) {
  const old = new Map(record.conditions.map((condition) => [condition.id, condition]));
  const conditions = [];
  if (/\bleak(?:s|ing|age)?\b/iu.test(record.fields.description)) {
    conditions.push({
      id: 'sample-leak',
      type: 'sample-leak',
      ruleId: 'PD-LEAK-001',
      fingerprint: JSON.stringify([RULE_SET_VERSION, record.id, record.fields.description]),
      text: 'Sample rule: the instructions mention a possible leak. Review the suggested high priority; this is a demonstration rule, not an emergency assessment.',
      resolution: null,
    });
  }
  const key = duplicateKey(record);
  if (key !== null) {
    for (const other of records) {
      if (other.id === record.id || duplicateKey(other) !== key) continue;
      conditions.push({
        id: `duplicate:${encodeURIComponent(other.id)}`,
        type: 'duplicate',
        ruleId: 'PD-DUP-001',
        counterpartId: other.id,
        fingerprint: JSON.stringify([RULE_SET_VERSION, [...[record.id, other.id]].sort(), key]),
        text: `Possible duplicate of ${other.id}: the normalized address, unit and service category match. Both requests are retained.`,
        resolution: null,
      });
    }
  }
  conditions.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const condition of conditions) {
    const previous = old.get(condition.id);
    if (previous?.fingerprint === condition.fingerprint && previous.resolution !== null) {
      condition.resolution = copy(previous.resolution);
    }
  }
  return conditions;
}

function suggestedPriority(record) {
  return record.conditions.some((condition) => condition.type === 'sample-leak') ? 'high' : 'normal';
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

function snapshot(record) {
  return {
    revision: record.revision,
    fields: copy(record.fields),
    priority: record.priority,
    conditions: copy(record.conditions),
    ruleSetVersion: RULE_SET_VERSION,
  };
}

function summary(record) {
  if (!record) return null;
  return copy({
    revision: record.revision,
    fields: record.fields,
    priority: record.priority,
    priorityOverride: record.priorityOverride,
    conditions: record.conditions,
    approval: record.approval,
  });
}

function event(record, type, actor, at, before, reason = '') {
  const item = {
    id: `${record.id}:r${record.revision}:${type}`,
    type,
    revision: record.revision,
    actor,
    at,
    reason,
    before: copy(before),
    after: summary(record),
  };
  if (before?.approval) item.approval = copy(before.approval);
  record.history.push(item);
}

function ready(record) {
  return missingFields(record).length === 0
    && SERVICE_CATEGORIES.includes(record.fields.category)
    && Array.isArray(record.conditions)
    && record.conditions.every((condition) => condition.resolution
      && typeof condition.resolution.reason === 'string' && condition.resolution.reason.trim()
      && typeof condition.resolution.actor === 'string' && condition.resolution.actor.trim()
      && typeof condition.resolution.at === 'string' && condition.resolution.at);
}

export function missingFields(record) {
  return FIELD_KEYS.filter((key) => typeof record?.fields?.[key] !== 'string'
    || !record.fields[key].trim()).map((key) => FIELD_LABELS[key]);
}

export function isEligible(record) {
  return Boolean(record && ready(record) && record.approval
    && record.approval.revision === record.revision
    && typeof record.approval.actor === 'string' && record.approval.actor.trim()
    && typeof record.approval.at === 'string' && record.approval.at
    && same(record.approval.snapshot, snapshot(record)));
}

export function canApprove(record) {
  return Boolean(record && ready(record) && !isEligible(record));
}

export function recordStatus(record) {
  if (missingFields(record).length) return 'Needs information';
  if (!SERVICE_CATEGORIES.includes(record.fields.category)) return 'Out of scope';
  return isEligible(record) ? 'Approved' : 'Needs review';
}

function freshRecord(id, fields, at) {
  return {
    id,
    revision: 1,
    fields,
    priority: 'normal',
    priorityOverride: null,
    conditions: [],
    approval: null,
    history: [],
    createdAt: at,
    updatedAt: at,
  };
}

export function createWorkspace(id, fixtures = []) {
  id = requiredText(id, 'Workspace ID');
  if (!Array.isArray(fixtures)) fail('INVALID_FIXTURES', 'Fixtures must be an array.');
  const at = instant();
  const records = fixtures.map((fixture, index) => {
    if (!plainObject(fixture)) fail('INVALID_FIXTURES', 'Each fixture must be an object.');
    const fixtureId = requiredText(fixture.id ?? `DEMO-${index + 1}`, 'Fixture ID');
    const input = fixture.fields ?? Object.fromEntries(FIELD_KEYS
      .filter((key) => Object.hasOwn(fixture, key)).map((key) => [key, fixture[key]]));
    return freshRecord(fixtureId, fieldsFrom(input), at);
  });
  const workspace = { schemaVersion: SCHEMA_VERSION, id, revision: 0, records };
  workspaceShape(workspace);
  for (const record of records) {
    record.conditions = conditionsFor(record, records);
    record.priority = suggestedPriority(record);
    event(record, 'created', 'Synthetic demonstration', at, null);
  }
  return workspace;
}

function recordId(command, options) {
  let id = command.id;
  if (id === undefined) id = typeof options.id === 'function' ? options.id() : options.id;
  if (id === undefined) {
    if (!globalThis.crypto?.randomUUID) fail('MISSING_ID', 'A new request ID is required in this browser.');
    id = `REQ-${globalThis.crypto.randomUUID()}`;
  }
  return requiredText(id, 'Request ID', 'INVALID_ID');
}

/** A new cloned workspace is the only return value; input and command stay untouched. */
export function applyCommand(workspace, command, options = {}) {
  workspaceShape(workspace);
  if (!plainObject(command) || !COMMANDS.has(command.type)) fail('INVALID_COMMAND', 'Unknown request operation.');
  if (!plainObject(options)) fail('INVALID_INPUT', 'Operation options must be an object.');
  const actor = command.actor === undefined ? 'Local reviewer' : requiredText(command.actor, 'Reviewer name', 'INVALID_ACTOR');
  const at = instant(options.now);
  const next = copy(workspace);
  const before = new Map(next.records.map((record) => [record.id, summary(record)]));
  let target;
  let reason = '';
  let eventType;

  if (command.type === 'create') {
    const fields = fieldsFrom(command.fields ?? {});
    const id = recordId(command, options);
    if (next.records.some((record) => record.id === id)) fail('ID_EXISTS', 'That request ID already exists.');
    target = freshRecord(id, fields, at);
    next.records.push(target);
    eventType = 'created';
  } else {
    target = next.records.find((record) => record.id === command.id);
    if (!target) fail('NOT_FOUND', 'The request was not found.');
    if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision !== target.revision) {
      fail('CONFLICT', 'This request changed since you opened it. Refresh the saved revision before trying again.', {
        id: target.id, expectedRevision: command.expectedRevision, actualRevision: target.revision,
      });
    }
    if (command.type === 'edit') {
      const fields = fieldsFrom(command.fields, target.fields);
      if (same(fields, target.fields)) fail('NO_CHANGE', 'No request fields changed.');
      target.fields = fields;
      eventType = 'edited';
    } else if (command.type === 'resolve') {
      reason = requiredText(command.reason, 'A review reason', 'REASON_REQUIRED');
      const condition = target.conditions.find((item) => item.id === command.conditionId);
      if (!condition) fail('CONDITION_NOT_FOUND', 'That review condition is no longer present. Refresh the request.');
      if (condition.resolution) fail('NO_CHANGE', 'That condition is already resolved.');
      condition.resolution = { reason, actor, at };
      eventType = 'resolved';
    } else if (command.type === 'priority') {
      reason = requiredText(command.reason, 'A priority-change reason', 'REASON_REQUIRED');
      if (!PRIORITIES.includes(command.priority)) fail('INVALID_PRIORITY', 'Choose normal or high priority.');
      if (target.priorityOverride === command.priority) fail('NO_CHANGE', 'That priority override is already applied.');
      target.priorityOverride = command.priority;
      eventType = 'priority';
    } else if (command.type === 'approve') {
      const missing = missingFields(target);
      if (missing.length) fail('INCOMPLETE', `Complete these fields before approval: ${missing.join(', ')}.`, { missing });
      if (!SERVICE_CATEGORIES.includes(target.fields.category)) fail('OUT_OF_SCOPE', 'This service category is outside the demonstration catalog.');
      if (!ready(target)) fail('UNRESOLVED', 'Resolve every current review condition with a reason before approval.');
      if (isEligible(target)) fail('ALREADY_APPROVED', 'The current saved revision is already approved.');
      target.revision += 1;
      target.updatedAt = at;
      target.approval = { revision: target.revision, snapshot: snapshot(target), actor, at };
      event(target, 'approved', actor, at, before.get(target.id));
      next.revision += 1;
      return next;
    }
  }

  // Derive every relationship before applying any review transition. This makes
  // the returned workspace an atomic candidate for the storage transaction.
  const derived = new Map(next.records.map((record) => [record.id, conditionsFor(record, next.records)]));
  for (const record of next.records) {
    const old = before.get(record.id);
    const conditions = derived.get(record.id);
    const isTarget = record.id === target.id;
    const relationshipChanged = old && !same(old.conditions, conditions);
    record.conditions = conditions;
    record.priority = record.priorityOverride ?? suggestedPriority(record);
    if (isTarget || relationshipChanged) {
      if (old) record.revision = old.revision + 1;
      record.approval = null;
      record.updatedAt = at;
      event(record, isTarget ? eventType : 'review-conditions-changed', actor, at, old ?? null,
        isTarget ? reason : 'The current duplicate relationships changed. Review is required again.');
    }
  }
  next.revision += 1;
  return next;
}

export function createPreview(workspace, ids) {
  workspaceShape(workspace);
  let selected = null;
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) fail('INVALID_SELECTION', 'Selected request IDs must be an array of strings.');
    selected = new Set(ids);
    if ([...selected].some((id) => !workspace.records.some((record) => record.id === id))) fail('NOT_FOUND', 'A selected request no longer exists.');
  }
  return workspace.records.filter((record) => (!selected || selected.has(record.id)) && isEligible(record))
    .map((record) => ({ workspaceId: workspace.id, id: record.id, revision: record.revision, approvalAt: record.approval.at }));
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/u.test(text) || /^[\u0000-\u001f\u007f-\u009f]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createCSV(workspace, preview) {
  workspaceShape(workspace);
  if (!Array.isArray(preview)) fail('INVALID_PREVIEW', 'Create an export preview before downloading.');
  if (!preview.length) fail('EMPTY_EXPORT', 'There are no approved revisions to export.');
  const seen = new Set();
  const records = preview.map((selection) => {
    if (!plainObject(selection) || typeof selection.id !== 'string' || seen.has(selection.id)
      || !Number.isSafeInteger(selection.revision) || typeof selection.approvalAt !== 'string') {
      fail('INVALID_PREVIEW', 'The export selection is invalid. Create a new preview.');
    }
    seen.add(selection.id);
    const record = workspace.records.find((item) => item.id === selection.id);
    if (selection.workspaceId !== workspace.id || !record || !isEligible(record)
      || record.revision !== selection.revision || record.approval.at !== selection.approvalAt) {
      fail('STALE_EXPORT', `Request ${selection.id} changed or lost approval. Refresh the preview before downloading.`, { id: selection.id });
    }
    return record;
  });
  const rows = [[
    'request_id', 'approved_revision', 'address', 'unit', 'category', 'work_instructions',
    'priority', 'preferred_time', 'approved_at', 'rule_set_version',
  ]];
  for (const record of records) {
    const approved = record.approval.snapshot;
    rows.push([
      record.id, record.approval.revision, approved.fields.address, approved.fields.unit,
      approved.fields.category, approved.fields.description, approved.priority,
      approved.fields.preferredTime, record.approval.at, approved.ruleSetVersion,
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
