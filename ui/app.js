import { openRepository } from '../storage/repository.js';
import { missingFields, recordStatus, canApprove, isEligible, SERVICE_CATEGORIES, listApprovals, compareApprovals } from '../domain/requests.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = {
  repo: null, workspace: null, workspaceId: 'demo', selectedId: null,
  isNew: false, draft: null, original: null, baseRevision: null, dirty: false,
  busy: false, filter: 'all', search: '', actor: 'Night-shift reviewer',
  preview: null, previewRows: [], previewError: '', resolutionDrafts: new Map(),
  pendingExternalRefresh: false,
  // View state only: keep the selected approval stable when new history arrives.
  approvalSelection: null,
};
const fields = ['address', 'unit', 'category', 'description', 'preferredTime'];
const emptyFields = () => ({ address: '', unit: '', category: 'repair', description: '', preferredTime: '' });
const clone = value => structuredClone(value);
const selected = () => state.workspace?.records.find(record => record.id === state.selectedId) ?? null;

// Dynamic values always enter the document as text, never as HTML.
function node(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key === 'value') element.value = value;
    else if (key === 'disabled') element.disabled = Boolean(value);
    else if (key === 'checked') element.checked = Boolean(value);
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value);
    else element.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

function dateLabel(value) {
  if (!value) return 'Time not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(date);
}
function titleCase(value) { return String(value ?? '').replace(/^./, character => character.toUpperCase()); }
function shortTitle(record) {
  const text = record.fields.description.trim() || 'Untitled request';
  return text.length > 75 ? `${text.slice(0, 72)}…` : text;
}
function oldApproval(record) {
  return [...record.history].reverse().find(event => event.approval)?.approval ?? null;
}
function statusClass(status) {
  return { Approved: 'status-approved', 'Needs information': 'status-information', 'Out of scope': 'status-out', 'Needs review': 'status-review' }[status] ?? 'status-review';
}
function statusBadge(status) { return node('span', { class: `status-badge ${statusClass(status)}`, text: status }); }

function notice(message, tone = '') {
  const region = $('#notice');
  region.textContent = message;
  region.className = `notice ${tone}`;
  region.hidden = !message;
  region.setAttribute('role', tone === 'error' ? 'alert' : 'status');
}
function setBusy(value) {
  state.busy = value;
  $('#editor').setAttribute('aria-busy', String(value));
  updateControls();
  if (!value && state.pendingExternalRefresh) {
    state.pendingExternalRefresh = false;
    refreshExternalWorkspace(state.workspaceId);
  }
}
function requireActor() {
  const actor = state.actor.trim();
  if (!actor) throw new Error('Add a reviewer label before saving a decision. It is a local label, not a verified identity.');
  return actor;
}
function updateDraft() {
  state.dirty = fields.some(field => state.draft[field] !== state.original[field]);
  updateControls();
}
function updateControls() {
  const record = selected();
  const differentSavedRevision = record && state.baseRevision !== null && state.baseRevision !== record.revision;
  const editorId = $('.editor-id', $('#editor'));
  if (editorId && !state.isNew) editorId.textContent = !record
    ? `${state.selectedId} / DRAFT BASE REVISION ${state.baseRevision} / SAVED REQUEST UNAVAILABLE`
    : differentSavedRevision
      ? `${record.id} / DRAFT BASE REVISION ${state.baseRevision} / LATEST SAVED REVISION ${record.revision}`
      : `${record.id} / SAVED REVISION ${record.revision}`;
  const indicator = $('#save-indicator');
  if (indicator) {
    indicator.textContent = state.busy ? 'Saving…' : state.dirty ? 'Unsaved changes' : state.isNew ? 'New draft' : differentSavedRevision ? 'Earlier revision in editor' : 'Saved locally';
    indicator.className = `save-indicator${state.dirty ? ' dirty' : ''}${state.busy ? ' busy' : ''}`;
  }
  const fieldset = $('#request-fieldset');
  if (fieldset) fieldset.disabled = state.busy;
  const save = $('#save-request');
  if (save) save.disabled = state.busy || (!state.dirty && !state.isNew);
  const discard = $('#discard-draft');
  if (discard) discard.disabled = state.busy || (!state.dirty && !state.isNew);
  const approve = $('#approve-request');
  if (approve) {
    approve.disabled = state.busy || state.dirty || !record || !canApprove(record);
    approve.textContent = state.dirty ? 'Save or discard draft'
      : !record ? 'Saved request unavailable'
        : isEligible(record) ? '✓ Revision approved' : '✓ Approve saved revision';
  }
  const reviewStatus = $('#review-status');
  if (reviewStatus) {
    const status = record ? recordStatus(record) : 'Saved request unavailable';
    reviewStatus.textContent = status;
    reviewStatus.className = `status-badge ${statusClass(status)}`;
  }
  $$('[data-resolve], [data-priority]').forEach(button => { button.disabled = state.busy || state.dirty; });
  const help = $('#approval-help');
  if (help) help.textContent = !record
    ? 'The saved request is no longer available. Your draft remains in the editor.'
    : state.dirty
      ? `Current saved revision ${record.revision}: ${recordStatus(record)}. Save or discard the visible changes before approving or exporting.`
      : isEligible(record)
        ? 'This saved revision is approved. Any relevant change will require a new review.'
        : canApprove(record)
          ? 'Approval applies to the complete, resolved revision currently saved in this browser.'
          : 'Complete the required fields and resolve every current review condition first.';
  const draftMessage = $('#draft-message');
  if (draftMessage) draftMessage.textContent = state.dirty
    ? 'These changes are not saved or approved.'
    : state.isNew ? 'Start with the details you have. Missing details remain visible.'
      : 'Changes create a new saved revision.';
  const dirtyWarning = $('#export-dirty-warning');
  if (dirtyWarning) dirtyWarning.hidden = !state.dirty;
  const comparisonDraftNote = $('#comparison-draft-note');
  if (comparisonDraftNote) comparisonDraftNote.hidden = !state.dirty;
  const download = $('#download-csv');
  if (download) download.disabled = state.busy || state.dirty || !state.preview?.length;
  const refresh = $('#refresh-preview');
  if (refresh) refresh.disabled = state.busy || state.dirty;
  $('#new-request').disabled = state.busy;
  $('#export-open').disabled = state.busy || state.dirty;
  $('#reset-demo').disabled = state.busy;
  $$('[data-workspace]').forEach(button => { button.disabled = state.busy; });
}

let confirmResolver = null;
function confirmAction(title, body, label) {
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  $('#confirm-accept').textContent = label;
  $('#confirm-dialog').showModal();
  return new Promise(resolve => { confirmResolver = resolve; });
}
function finishConfirm(result) {
  $('#confirm-dialog').close();
  const resolver = confirmResolver;
  confirmResolver = null;
  resolver?.(result);
}
async function mayLeaveDraft() {
  if (!state.dirty) return true;
  return confirmAction('Leave these unsaved changes?', 'The saved request will stay as it is. Your unsaved field changes will be discarded.', 'Discard changes');
}

function initializeDraft(record) {
  state.draft = clone(record?.fields ?? emptyFields());
  state.original = clone(state.draft);
  state.baseRevision = record?.revision ?? null;
  state.dirty = false;
}
function applyWorkspace(workspace, options = {}) {
  state.workspace = workspace;
  if (options.selectedId !== undefined) state.selectedId = options.selectedId;
  // A retained draft is bound to its original request ID and revision. In
  // particular, another tab resetting the demo must never retarget that draft
  // to the first surviving fixture with the same revision number.
  if (!options.keepDraft) {
    if (state.selectedId && !selected()) state.selectedId = null;
    if (!state.selectedId && !state.isNew && workspace.records.length) state.selectedId = workspace.records[0].id;
  }
  if (!options.keepDraft) initializeDraft(selected());
  renderQueue();
  renderWorkspaceBar();
  if (!options.keepDraft) renderEditor();
  else {
    const record = selected();
    const seal = $('.seal-row', $('#editor'));
    if (seal) {
      if (record) seal.replaceWith(makeSeal(record));
      else seal.replaceChildren(node('p', { text: 'The saved request is no longer available. No current approval is shown.' }));
    }
    refreshHistory();
  }
  renderExport();
  updateControls();
}
function renderWorkspaceBar() {
  $$('[data-workspace]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.workspace === state.workspaceId)));
  $('#workspace-description').textContent = state.workspaceId === 'demo'
    ? 'Made-up requests. A real review workflow.'
    : 'Starts empty. Your records stay in this browser.';
  $('#reset-demo').hidden = state.workspaceId !== 'demo';
}
function renderQueue() {
  if (!state.workspace) return;
  const list = $('#request-list');
  list.replaceChildren();
  $('#record-count').textContent = String(state.workspace.records.length);
  $$('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter)));
  const query = state.search.trim().toLocaleLowerCase();
  const records = state.workspace.records.filter(record => {
    if (state.filter === 'approved' && !isEligible(record)) return false;
    if (state.filter === 'review' && isEligible(record)) return false;
    if (!query) return true;
    return [record.id, ...Object.values(record.fields)].join(' ').toLocaleLowerCase().includes(query);
  });
  if (!records.length) {
    list.append(node('div', { class: 'empty-state' }, [
      node('span', { class: 'empty-icon', 'aria-hidden': 'true', text: '◇' }),
      node('h3', { text: state.workspace.records.length ? 'A quiet corner' : 'A fresh ledger' }),
      node('p', { text: state.workspace.records.length ? 'No requests match this view. Try another filter or search.' : 'Add a request to begin. This workspace is separate from the synthetic demo.' }),
    ]));
    return;
  }
  for (const record of records) {
    const card = node('button', {
      class: `request-card${record.id === state.selectedId && !state.isNew ? ' selected' : ''}`,
      type: 'button', 'aria-pressed': String(record.id === state.selectedId && !state.isNew),
      'aria-label': `${record.id}: ${shortTitle(record)}. ${recordStatus(record)}.`,
      onclick: () => selectRecord(record.id),
    }, [
      node('div', { class: 'request-card-top' }, [node('span', { text: record.id }), node('span', { text: `REV. ${record.revision}` })]),
      node('h3', { text: shortTitle(record) }),
      node('p', { class: 'address-line', text: `${record.fields.address || 'Address missing'} · ${record.fields.unit ? `Unit ${record.fields.unit}` : 'Unit missing'}` }),
      node('div', { class: 'request-card-bottom' }, [statusBadge(recordStatus(record))]),
    ]);
    list.append(card);
  }
}
async function selectRecord(id) {
  if (state.busy || (id === state.selectedId && !state.isNew)) return;
  if (!await mayLeaveDraft()) return;
  state.isNew = false;
  state.selectedId = id;
  state.approvalSelection = null;
  initializeDraft(selected());
  renderQueue();
  renderEditor();
  renderExport();
  updateControls();
}
async function beginNew() {
  if (!await mayLeaveDraft()) return;
  state.isNew = true;
  state.selectedId = null;
  state.approvalSelection = null;
  initializeDraft(null);
  renderQueue();
  renderEditor();
  renderExport();
  $('#field-address')?.focus();
}

function sectionHeading(text, action = null) {
  const children = [node('h3', { text })];
  if (action) children.push(action);
  return node('div', { class: 'section-heading' }, children);
}
function makeField(name, label, options = {}) {
  const id = `field-${name}`;
  const input = node(options.textarea ? 'textarea' : options.options ? 'select' : 'input', {
    id, name, type: options.textarea || options.options ? undefined : 'text',
    rows: options.textarea ? 3 : undefined,
    placeholder: options.placeholder, autocomplete: 'off',
    value: options.options ? undefined : state.draft[name],
    oninput: event => { state.draft[name] = event.target.value; updateDraft(); },
  });
  if (options.options) {
    for (const value of options.options) input.append(node('option', { value, text: titleCase(value) }));
    if (state.draft[name] && !options.options.includes(state.draft[name])) input.append(node('option', { value: state.draft[name], text: `${titleCase(state.draft[name])} — out of scope` }));
    input.value = state.draft[name];
  }
  const labelNode = node('label', { class: `field${options.full ? ' full' : ''}`, for: id }, [node('span', { text: label }), input]);
  return labelNode;
}
function makeSeal(record) {
  const approved = isEligible(record);
  const broken = !approved && Boolean(oldApproval(record));
  const seal = node('div', { class: `approval-seal ${approved ? 'approved' : broken ? 'broken' : ''}`, 'aria-hidden': 'true' }, [
    node('span', { class: 'seal-glyph', text: approved ? '✓' : broken ? '◇' : '✧' }),
    node('span', { class: 'seal-word', text: approved ? 'APPROVED' : broken ? 'REVIEW AGAIN' : 'AWAITING' }),
    node('span', { class: 'seal-revision', text: `revision ${record.revision}` }),
  ]);
  const copy = node('div', { class: 'seal-copy' }, [
    node('h3', { text: approved ? 'This revision carries the seal.' : broken ? 'The old seal no longer applies.' : 'A little review before the seal.' }),
    node('p', { text: approved
      ? `Approval belongs to the saved instructions in revision ${record.revision}.`
      : broken ? 'Something changed. The previous approval stays in history; this saved revision needs a new review.'
        : 'Complete the request and resolve its review conditions, then approve the saved revision.' }),
  ]);
  if (approved) copy.append(node('p', { class: 'approval-meta', text: `${record.approval.actor} · ${dateLabel(record.approval.at)}` }));
  return node('div', { class: 'seal-row' }, [seal, copy]);
}
function renderEditor() {
  const container = $('#editor');
  container.replaceChildren();
  const record = selected();
  if (!record && !state.isNew) {
    container.append(node('div', { class: 'empty-state editor-empty' }, [
      node('span', { class: 'empty-icon', 'aria-hidden': 'true', text: '✧' }),
      node('h3', { text: 'A clear desk. A fresh start.' }),
      node('p', { text: 'Create a maintenance request, review its details, and approve the exact instructions you want to export.' }),
      node('button', { type: 'button', class: 'button button-primary', text: '＋ Add your first request', onclick: beginNew }),
    ]));
    updateControls();
    return;
  }
  container.append(node('header', { class: 'editor-head' }, [
    node('div', {}, [node('p', { class: 'eyebrow editor-id', text: state.isNew ? 'A NEW PAGE IN THE LEDGER' : `${record.id} / SAVED REVISION ${record.revision}` }), node('h2', { text: state.isNew ? 'A new request' : 'The request file' }), node('p', { text: state.isNew ? 'Capture the work before the review.' : `${titleCase(record.fields.category)} · ${record.fields.address || 'Address not entered'}` })]),
    node('span', { id: 'save-indicator', class: 'save-indicator', text: state.isNew ? 'New draft' : 'Saved locally' }),
  ]));
  if (record) container.append(makeSeal(record));
  const form = node('form', { id: 'request-form', class: 'editor-section', onsubmit: event => { event.preventDefault(); saveRequest(); } });
  form.append(sectionHeading('Work instructions'));
  const fieldset = node('fieldset', { id: 'request-fieldset', class: 'form-fieldset' }, [
    node('legend', { class: 'sr-only', text: 'Request details' }),
    node('div', { class: 'field-grid' }, [
      makeField('address', 'Property address', { placeholder: 'For example, 12 Sample Street' }),
      makeField('unit', 'Unit', { placeholder: 'For example, 4' }),
      makeField('category', 'Service category', { options: SERVICE_CATEGORIES }),
      makeField('description', 'Work instructions', { textarea: true, full: true, placeholder: 'What needs to be done?' }),
      makeField('preferredTime', 'Preferred time', { full: true, placeholder: 'For example, Tuesday 10:00–12:00' }),
    ]),
  ]);
  form.append(fieldset);
  form.append(node('div', { class: 'form-actions' }, [
    node('p', { id: 'draft-message', class: 'draft-message' }),
    node('div', { class: 'form-actions-right' }, [
      node('button', { type: 'button', id: 'discard-draft', class: 'button button-secondary button-small', text: state.isNew ? 'Cancel' : 'Discard changes', onclick: discardDraft }),
      node('button', { type: 'submit', id: 'save-request', class: 'button button-primary button-small', text: state.isNew ? 'Save request' : 'Save revision' }),
    ]),
  ]));
  container.append(form);
  if (record) {
    container.append(renderReview(record));
    container.append(renderHistory(record));
  } else {
    container.append(node('section', { class: 'editor-section' }, [
      node('label', { class: 'field reviewer-field', for: 'new-reviewer-label' }, [
        node('span', { text: 'Reviewer label' }),
        node('input', { id: 'new-reviewer-label', type: 'text', value: state.actor, autocomplete: 'off', maxlength: 100, oninput: event => { state.actor = event.target.value; } }),
        node('span', { class: 'field-help', text: 'A local label, not a verified identity.' }),
      ]),
      node('p', { class: 'review-summary', text: 'Saving adds this request to the ledger. It never approves it automatically. Missing details and any review conditions will be explained next.' }),
    ]));
  }
  updateControls();
}

function renderReview(record) {
  const section = node('section', { class: 'editor-section' });
  const status = statusBadge(recordStatus(record));
  status.id = 'review-status';
  section.append(sectionHeading('Review & approval', status));
  const actorInput = node('input', { id: 'reviewer-label', type: 'text', value: state.actor, autocomplete: 'off', maxlength: 100, oninput: event => { state.actor = event.target.value; } });
  section.append(node('label', { class: 'field reviewer-field', for: 'reviewer-label' }, [node('span', { text: 'Reviewer label' }), actorInput, node('span', { class: 'field-help', text: 'A local label, not a verified identity.' })]));
  const missing = missingFields(record);
  if (missing.length) section.append(node('div', { class: 'missing-box' }, [node('strong', { text: 'A few details are missing' }), node('ul', {}, missing.map(label => node('li', { text: label })))]));
  if (!SERVICE_CATEGORIES.includes(record.fields.category)) section.append(node('div', { class: 'missing-box' }, [node('strong', { text: 'This service is outside the demo catalog' }), 'Review the category before approval. Supported services are repair, plumbing, and electrical.']));
  if (!record.conditions.length) section.append(node('p', { class: 'review-summary', text: 'No review conditions are currently flagged. Check the saved instructions before approving.' }));
  for (const condition of record.conditions) {
    const resolved = Boolean(condition.resolution);
    const card = node('div', { class: `condition${resolved ? ' resolved' : ''}` });
    card.append(node('div', { class: 'condition-title' }, [node('span', {}, [node('span', { class: 'condition-symbol', 'aria-hidden': 'true', text: resolved ? '✓ ' : '◇ ' }), condition.type === 'duplicate' ? 'Possible duplicate' : 'Sample leak rule']), node('span', { text: resolved ? 'Reviewed' : 'Review needed' })]));
    card.append(node('p', { text: condition.text }));
    card.append(node('span', { class: 'rule-id', text: `${condition.ruleId}${condition.counterpartId ? ` · related request ${condition.counterpartId}` : ''}` }));
    if (resolved) {
      card.append(node('div', { class: 'resolution-reason', text: condition.resolution.reason }));
      card.append(node('p', { class: 'resolution-meta', text: `${condition.resolution.actor} · ${dateLabel(condition.resolution.at)}` }));
    } else {
      const key = `${record.id}:${condition.id}`;
      const reasonId = `reason-${record.id}-${condition.id}`;
      const input = node('textarea', { id: reasonId, rows: 2, value: state.resolutionDrafts.get(key) ?? '', placeholder: condition.type === 'duplicate' ? 'Why should these remain separate requests?' : 'Explain your review of this condition.', oninput: event => state.resolutionDrafts.set(key, event.target.value) });
      card.append(node('label', { class: 'field', for: reasonId }, [node('span', { text: 'Reason for resolving this condition' }), input]));
      card.append(node('div', { class: 'condition-actions' }, [node('button', { type: 'button', class: 'button button-secondary button-small', 'data-resolve': condition.id, text: 'Record review decision', onclick: () => resolveCondition(condition, input.value) })]));
    }
    section.append(card);
  }
  section.append(node('div', { class: 'priority-row' }, [
    node('span', { class: 'priority-label' }, ['Priority: ', node('strong', { class: record.priority === 'high' ? 'high' : '', text: titleCase(record.priority) }), record.priorityOverride ? ' · reviewer decision' : ' · rule suggestion']),
    node('button', { type: 'button', class: 'text-button', 'data-priority': true, text: 'Change with a reason', onclick: openPriority }),
  ]));
  section.append(node('div', { class: 'approval-action' }, [
    node('button', { id: 'approve-request', type: 'button', class: 'button button-approve', text: isEligible(record) ? '✓ Revision approved' : '✓ Approve saved revision', onclick: approveRequest }),
    node('p', { id: 'approval-help', class: 'approval-help' }),
  ]));
  return section;
}
function approvalForComparison(record, entries) {
  const selection = state.approvalSelection;
  const inScope = selection?.workspaceId === state.workspaceId && selection?.recordId === record.id;
  const entry = (inScope && entries.find(item => item.key === selection.key)) || entries[0] || null;
  state.approvalSelection = entry
    ? { workspaceId: state.workspaceId, recordId: record.id, key: entry.key }
    : null;
  return entry;
}

// Refresh saved history without replacing the editor, its draft, or its base revision.
function refreshHistory() {
  const existing = $('.history-section', $('#editor'));
  if (!existing) return;
  const open = $('details', existing)?.open;
  const focused = document.activeElement;
  const focusWasInside = existing.contains(focused);
  const focusWasSelector = focusWasInside && focused.matches('.approval-selector');
  const replacement = renderHistory(selected());
  const details = $('details', replacement);
  if (details && open !== undefined) details.open = open;
  existing.replaceWith(replacement);
  if (focusWasInside) {
    const target = (focusWasSelector && $('.approval-selector', replacement)) || $('summary', replacement) || replacement;
    if (target === replacement) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
}

function renderSavedComparison(container, entry, record) {
  container.replaceChildren();
  try {
    container.append(renderApprovalComparison(compareApprovals(entry, record)));
  } catch {
    container.append(node('p', { class: 'comparison-error', text: 'This approval snapshot could not be compared with the current saved revision.' }));
  }
}

function renderHistory(record) {
  const section = node('section', { class: 'editor-section history-section' });
  if (!record) {
    section.append(node('p', { class: 'comparison-none', text: 'The saved request is no longer available. Your unsaved draft remains in the editor; there is no current saved revision to compare.' }));
    return section;
  }

  const approvalEntries = listApprovals(record);
  const selectedEntry = approvalForComparison(record, approvalEntries);
  const details = node('details', { open: Boolean(approvalEntries.length) });
  details.append(node('summary', { class: 'history-title', text: `Approval history · ${record.history.length} ${record.history.length === 1 ? 'event' : 'events'}` }));
  const content = node('div', { class: 'history-content' });

  if (selectedEntry) {
    const workspaceId = state.workspaceId;
    const recordId = record.id;
    const selectId = `approval-selector-${record.id}`;
    const selectorLabel = node('label', { class: 'approval-selector-label', for: selectId, text: 'Compare with approved revision:' });
    const selectEl = node('select', { id: selectId, class: 'approval-selector' });
    for (const entry of approvalEntries) {
      const optionText = `Revision ${entry.approval.revision} · ${dateLabel(entry.approval.at)} · ${entry.approval.actor || 'Local reviewer'}${entry.isCurrent ? ' · current approval' : ''}`;
      selectEl.append(node('option', { value: entry.key, text: optionText }));
    }
    selectEl.value = selectedEntry.key;

    const comparisonBody = node('div', { class: 'approval-comparison-body' });
    selectEl.addEventListener('change', () => {
      // Read the latest saved record; the open editor may contain an older draft.
      const currentRecord = selected();
      if (state.workspaceId !== workspaceId || currentRecord?.id !== recordId) return;
      const entry = listApprovals(currentRecord).find(item => item.key === selectEl.value);
      if (!entry) { refreshHistory(); return; }
      state.approvalSelection = { workspaceId, recordId, key: entry.key };
      // Keep the native selector in place so its keyboard focus and popup survive.
      renderSavedComparison(comparisonBody, entry, currentRecord);
    });

    content.append(node('div', { class: 'approval-selector-row' }, [
      selectorLabel,
      selectEl,
      node('p', {
        id: 'comparison-draft-note', class: 'comparison-draft-note', hidden: !state.dirty,
        text: 'Unsaved changes are shown in the editor. This comparison uses the current saved revision.',
      }),
    ]));
    renderSavedComparison(comparisonBody, selectedEntry, record);
    content.append(comparisonBody);
  } else {
    content.append(node('p', { class: 'comparison-none', text: 'No approvals have been recorded for this request.' }));
  }

  // Chronological event list (unchanged from original behaviour).
  const names = { created: 'Request saved', edited: 'Instructions revised', resolved: 'Review condition resolved', priority: 'Priority decision recorded', approved: 'Saved revision approved', 'review-conditions-changed': 'Related request changed the review' };
  const list = node('ol', { class: 'history-list' });
  for (const event of [...record.history].reverse()) {
    const item = node('li', {}, [node('p', { class: 'history-event-name', text: names[event.type] ?? 'Request updated' }), node('p', { class: 'history-meta', text: `Revision ${event.revision} · ${event.actor || 'Local reviewer'} · ${dateLabel(event.at)}` })]);
    if (event.reason) item.append(node('p', { class: 'history-reason', text: event.reason }));
    if (event.approval) item.append(node('p', { class: 'history-reason', text: `Approval for revision ${event.approval.revision} retained as history.` }));
    list.append(item);
  }
  content.append(list);
  details.append(content);
  section.append(details);
  return section;
}

/** Render the two-column field-by-field comparison for one selected approval diff. */
function renderApprovalComparison(diff) {
  const container = node('section', { class: 'comparison', 'aria-label': `Comparison: revision ${diff.approvedRevision} approved versus revision ${diff.currentRevision} saved` });
  const sideLabel = side => node('p', {
    class: 'comparison-side-label',
    text: side === 'approved' ? `Approved · revision ${diff.approvedRevision}` : `Current saved · revision ${diff.currentRevision}`,
  });
  const changeLabel = (changed, detail = '') => node('span', {
    class: `comparison-status${changed ? ' comparison-status-changed' : ''}`,
    text: `${changed ? 'Changed' : 'Unchanged'}${detail ? ` · ${detail}` : ''}`,
  });

  const approvedHead = node('div', { class: 'comparison-col comparison-approved comparison-head' }, [
    node('h4', { text: `Approved revision ${diff.approvedRevision}` }),
    node('p', { class: 'comparison-meta', text: `${dateLabel(diff.approvedAt)} · ${diff.approvedActor || 'Local reviewer'}` }),
  ]);
  const currentHead = node('div', { class: 'comparison-col comparison-current comparison-head' }, [
    node('h4', { text: `Current saved revision ${diff.currentRevision}` }),
    node('p', { class: 'comparison-meta', text: diff.currentStatus }),
  ]);
  container.append(approvedHead, currentHead);

  const fieldCell = (side, label, value, changed) => node('div', {
    class: `comparison-col comparison-${side} comparison-field${changed ? ' comparison-changed' : ''}`,
  }, [
    sideLabel(side),
    node('p', { class: 'comparison-field-label' }, [
      node('strong', { text: label }),
      changeLabel(changed),
    ]),
    node('p', { class: 'comparison-value', text: value || 'Not entered' }),
  ]);

  for (const field of diff.fields) {
    container.append(
      fieldCell('approved', field.label, field.approved, field.changed),
      fieldCell('current', field.label, field.current, field.changed),
    );
  }
  container.append(
    fieldCell('approved', 'Priority', titleCase(diff.priorityApproved), diff.priorityChanged),
    fieldCell('current', 'Priority', titleCase(diff.priorityCurrent), diff.priorityChanged),
  );

  const conditionCell = (side, comparison) => {
    const condition = comparison[side];
    const detail = comparison.change === 'added' ? 'added' : comparison.change === 'removed' ? 'removed' : '';
    const cell = node('div', {
      class: `comparison-col comparison-${side} comparison-cond${comparison.changed ? ' comparison-changed' : ''}`,
    }, [sideLabel(side)]);
    const title = !condition ? 'Review condition'
      : condition.type === 'duplicate' ? 'Possible duplicate'
        : condition.type === 'sample-leak' ? 'Sample leak rule' : 'Review condition';
    cell.append(node('div', { class: 'condition-title' }, [
      node('span', {}, [
        condition ? node('span', { class: 'condition-symbol', 'aria-hidden': 'true', text: condition.resolution ? '✓ ' : '◇ ' }) : null,
        title,
      ]),
      changeLabel(comparison.changed, detail),
    ]));
    if (!condition) {
      cell.append(node('p', {
        class: 'comparison-absent',
        text: side === 'approved' ? 'Not present at approval.' : 'Not present in the current saved revision.',
      }));
    } else {
      cell.append(
        node('p', { class: 'comparison-value', text: condition.text }),
        node('p', { class: 'rule-id', text: `${condition.ruleId}${condition.counterpartId ? ` · related request ${condition.counterpartId}` : ''}` }),
        node('p', {
          class: 'comparison-resolution-label',
          text: condition.resolution
            ? (side === 'approved' ? 'Resolved at approval' : 'Resolved in the current saved revision')
            : (side === 'approved' ? 'Unresolved at approval' : 'Unresolved in the current saved revision'),
        }),
      );
      if (condition.resolution) {
        cell.append(
          node('p', { class: 'comparison-resolution-reason' }, [
            node('strong', { text: 'Recorded reason: ' }), condition.resolution.reason,
          ]),
          node('p', { class: 'comparison-resolution-meta', text: `${condition.resolution.actor || 'Local reviewer'} · ${dateLabel(condition.resolution.at)}` }),
        );
      }
    }
    if (side === 'current' && comparison.note) cell.append(node('p', { class: 'comparison-cond-note', text: comparison.note }));
    return cell;
  };

  if (diff.conditions.length) {
    container.append(node('div', { class: 'comparison-col comparison-col-full' }, [
      node('h4', { text: 'Review conditions' }),
    ]));
    for (const comparison of diff.conditions) {
      container.append(conditionCell('approved', comparison), conditionCell('current', comparison));
    }
  } else {
    container.append(node('div', { class: 'comparison-col comparison-col-full' }, [
      node('p', { class: 'comparison-none', text: 'No review conditions were present at this approval or in the current saved revision.' }),
    ]));
  }

  return container;
}

async function saveRequest() {
  if (state.busy || (!state.dirty && !state.isNew)) return;
  setBusy(true);
  try {
    const actor = requireActor();
    const wasNew = state.isNew;
    // Choose our own ID before the transaction. Selecting the first unknown ID
    // in its result could select a different tab's concurrent creation.
    const id = wasNew ? `REQ-${crypto.randomUUID()}` : state.selectedId;
    const command = wasNew ? { type: 'create', id, fields: clone(state.draft), actor } : { type: 'edit', id, expectedRevision: state.baseRevision, fields: clone(state.draft), actor };
    const workspace = await state.repo.mutate(state.workspaceId, command);
    state.isNew = false;
    applyWorkspace(workspace, { selectedId: id });
    notice(wasNew ? 'Request saved. Review the details and any conditions before approving.' : 'New revision saved. Review this revision before approving it.', 'success');
    queueMicrotask(() => $('#reviewer-label')?.focus({ preventScroll: true }));
  } catch (error) {
    notice(`${error.message} Your draft is still here and has not been marked saved.`, 'error');
  } finally { setBusy(false); }
}
async function discardDraft() {
  if (state.dirty && !await confirmAction('Discard the unsaved changes?', 'Your last saved revision and its history will remain unchanged.', 'Discard changes')) return;
  state.isNew = false;
  if (!selected()) state.selectedId = state.workspace.records[0]?.id ?? null;
  initializeDraft(selected());
  renderQueue(); renderEditor(); renderExport(); updateControls();
  notice('Draft discarded. The current saved ledger is shown.');
}
async function runDecision(command, success) {
  if (state.busy) return false;
  if (state.dirty) { notice('Save or discard the visible instructions before making a review decision.', 'warning'); return false; }
  setBusy(true);
  try {
    const workspace = await state.repo.mutate(state.workspaceId, { ...command, actor: requireActor() });
    applyWorkspace(workspace);
    notice(success, 'success');
    queueMicrotask(() => {
      const approve = $('#approve-request');
      if (approve && !approve.disabled) approve.focus({ preventScroll: true });
      else $('#reviewer-label')?.focus({ preventScroll: true });
    });
    return true;
  } catch (error) { notice(error.message, 'error'); return false; }
  finally { setBusy(false); }
}
async function resolveCondition(condition, reason) {
  if (!reason.trim()) { notice('Write a reason before recording this review decision.', 'warning'); return; }
  const record = selected();
  const done = await runDecision({ type: 'resolve', id: record.id, expectedRevision: state.baseRevision, conditionId: condition.id, reason: reason.trim() }, condition.type === 'duplicate'
    ? 'Review decision saved for this request. Both possible duplicate records remain in the ledger.'
    : 'Review decision saved for this request. A person still needs to approve the saved revision.');
  if (done) state.resolutionDrafts.delete(`${record.id}:${condition.id}`);
}
async function approveRequest() {
  const record = selected();
  if (!record) return;
  await runDecision({ type: 'approve', id: record.id, expectedRevision: state.baseRevision }, 'The saved revision is approved. Its exact instructions and review decisions are retained in history.');
}
function openPriority() {
  const record = selected();
  if (!record || state.dirty || state.busy) return;
  $('#priority-value').value = record.priority;
  $('#priority-reason').value = '';
  $('#priority-error').textContent = '';
  $('#priority-dialog').showModal();
  $('#priority-reason').focus();
}
async function savePriority(event) {
  event.preventDefault();
  const reason = $('#priority-reason').value.trim();
  if (!reason) { $('#priority-error').textContent = 'A reason is required for a priority decision.'; return; }
  const record = selected();
  $('#priority-submit').disabled = true;
  const done = await runDecision({ type: 'priority', id: record.id, expectedRevision: state.baseRevision, priority: $('#priority-value').value, reason }, 'Priority decision saved. Review and approve the new revision.');
  $('#priority-submit').disabled = false;
  if (done) {
    $('#priority-dialog').close();
    // The save rendered a new editor, so the dialog's original opener no
    // longer exists for native focus restoration.
    const approve = $('#approve-request');
    if (approve && !approve.disabled) approve.focus({ preventScroll: true });
    else $('#reviewer-label')?.focus({ preventScroll: true });
  }
  else $('#priority-error').textContent = $('#notice').textContent;
}

async function refreshPreview() {
  if (state.busy || state.dirty) { if (state.dirty) notice('Save or discard the visible changes before preparing an export.', 'warning'); return; }
  setBusy(true);
  try {
    const preview = await state.repo.createPreview(state.workspaceId);
    const latest = await state.repo.loadWorkspace(state.workspaceId);
    state.preview = preview;
    state.previewRows = preview.map(entry => {
      const record = latest.records.find(candidate => candidate.id === entry.id);
      const matches = record && record.revision === entry.revision && record.approval?.at === entry.approvalAt && isEligible(record);
      return { ...entry, title: matches ? shortTitle(record) : entry.id,
        description: matches ? record.approval.snapshot.fields.description : 'This saved record changed while the preview was being prepared. Refresh to inspect its current approved instructions.',
        address: matches ? record.fields.address : '' };
    });
    state.previewError = '';
    applyWorkspace(latest);
  } catch (error) { notice(error.message, 'error'); }
  finally { setBusy(false); }
}
function renderExport() {
  const panel = $('#export-panel');
  const open = state.preview !== null;
  panel.hidden = !open;
  $('#desk').classList.toggle('preview-open', open);
  panel.replaceChildren();
  if (!open) return;
  panel.append(node('header', { class: 'export-head' }, [node('div', {}, [node('p', { class: 'eyebrow', text: 'THE CURRENT WORK LIST' }), node('h2', { id: 'export-title', text: 'Export preview' })]), node('button', { class: 'icon-button', type: 'button', 'aria-label': 'Close export preview', text: '×', onclick: () => { state.preview = null; state.previewRows = []; state.previewError = ''; renderExport(); } })]));
  const body = node('div', { class: 'export-body' });
  body.append(node('p', { class: 'export-intro', text: 'A snapshot of the approved revisions selected for export. Download checks them again against the latest saved records.' }));
  body.append(node('div', { class: 'export-count' }, [node('span', { text: 'Selected approved revisions' }), node('strong', { text: String(state.preview.length) })]));
  const rows = node('div', { class: 'export-rows' });
  let stale = false;
  for (const entry of state.previewRows) {
    const current = state.workspace.records.find(record => record.id === entry.id);
    const changed = !current || current.revision !== entry.revision || current.approval?.at !== entry.approvalAt || !isEligible(current);
    stale ||= changed;
    rows.append(node('div', { class: `export-row${changed ? ' stale' : ''}` }, [
      node('p', { class: 'export-row-meta', text: `${entry.id} · PREVIEW REV. ${entry.revision}` }),
      node('h3', { text: entry.title }),
      node('p', { text: entry.description }),
      node('p', { class: 'export-row-meta', text: changed ? 'Saved record has changed' : `Approved ${dateLabel(entry.approvalAt)}` }),
    ]));
  }
  if (!state.preview.length) rows.append(node('div', { class: 'empty-state' }, [node('span', { class: 'empty-icon', 'aria-hidden': 'true', text: '◇' }), node('p', { text: 'No current revisions are eligible yet. Approve a complete, resolved request, then refresh this preview.' })]));
  body.append(rows);
  if (stale) body.append(node('p', { class: 'export-warning', text: 'This preview includes a changed record. Download will recheck the selection and block an outdated revision.' }));
  const dirtyWarning = node('p', { id: 'export-dirty-warning', class: 'export-warning', text: 'There are unsaved instructions in the editor. Save or discard them before exporting.' });
  dirtyWarning.hidden = !state.dirty;
  body.append(dirtyWarning);
  if (state.previewError) body.append(node('p', { class: 'export-warning export-error', role: 'alert', text: state.previewError }));
  body.append(node('div', { class: 'export-actions' }, [
    node('button', { id: 'download-csv', type: 'button', class: 'button button-primary', text: 'Download CSV', onclick: downloadCSV }),
    node('button', { id: 'refresh-preview', type: 'button', class: 'button button-secondary', text: 'Refresh preview', onclick: refreshPreview }),
  ]));
  body.append(node('p', { class: 'export-help', text: 'Includes request ID, approved revision, exact work instructions, and approval time. Exporting does not send or dispatch work.' }));
  panel.append(body);
  updateControls();
}
async function downloadCSV() {
  if (state.busy || state.dirty || !state.preview?.length) return;
  setBusy(true);
  try {
    const csv = await state.repo.exportCSV(state.workspaceId, clone(state.preview));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = node('a', { href: url, download: `phantomdesk-${state.workspaceId}-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    state.previewError = '';
    notice('CSV download prepared from the current saved approvals. Open the downloaded file to inspect the instructions and revisions.', 'success');
    renderExport();
  } catch (error) {
    state.previewError = error.message;
    notice('Download blocked. The preview has not been treated as approval for a changed request.', 'warning');
    try { applyWorkspace(await state.repo.loadWorkspace(state.workspaceId)); } catch { /* Keep the saved draft and original actionable error. */ }
    renderExport();
  } finally { setBusy(false); }
}

async function switchWorkspace(id) {
  if (state.busy || id === state.workspaceId || !await mayLeaveDraft()) return;
  setBusy(true);
  try {
    const workspace = await state.repo.loadWorkspace(id);
    state.workspaceId = id; state.selectedId = null; state.isNew = false;
    state.preview = null; state.previewRows = []; state.previewError = ''; state.filter = 'all'; state.search = '';
    $('#search').value = '';
    applyWorkspace(workspace);
    notice(id === 'mine' ? 'Your workspace is separate from the synthetic demo and is saved only in this browser.' : 'Synthetic demo opened. These examples do not contain real customer information.');
  } catch (error) { notice(error.message, 'error'); }
  finally { setBusy(false); }
}
async function resetDemo() {
  if (state.workspaceId !== 'demo' || state.busy) return;
  const confirmed = await confirmAction('Reset the synthetic demo?', 'This replaces the made-up demo requests and their demo history. Your separate workspace will stay unchanged. Unsaved demo changes will be discarded.', 'Reset demo only');
  if (!confirmed) return;
  setBusy(true);
  try {
    const workspace = await state.repo.resetDemo();
    state.selectedId = null; state.isNew = false; state.preview = null; state.previewRows = []; state.previewError = ''; state.resolutionDrafts.clear();
    applyWorkspace(workspace);
    notice('Synthetic demo reset. Your separate workspace was not changed.', 'success');
  } catch (error) { notice(error.message, 'error'); }
  finally { setBusy(false); }
}

$$('[data-open-rules]').forEach(button => button.addEventListener('click', () => $('#rules-dialog').showModal()));
$$('[data-open-about]').forEach(button => button.addEventListener('click', () => $('#about-dialog').showModal()));
$$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$$('[data-workspace]').forEach(button => button.addEventListener('click', () => switchWorkspace(button.dataset.workspace)));
$$('[data-filter]').forEach(button => button.addEventListener('click', () => { state.filter = button.dataset.filter; renderQueue(); }));
$('#search').addEventListener('input', event => { state.search = event.target.value; renderQueue(); });
$('#new-request').addEventListener('click', beginNew);
$('#export-open').addEventListener('click', refreshPreview);
$('#reset-demo').addEventListener('click', resetDemo);
$('#priority-form').addEventListener('submit', savePriority);
$('#confirm-accept').addEventListener('click', () => finishConfirm(true));
$('#confirm-cancel').addEventListener('click', () => finishConfirm(false));
$('#confirm-dialog').addEventListener('cancel', event => { event.preventDefault(); finishConfirm(false); });
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });

async function refreshExternalWorkspace(id) {
  if (id !== state.workspaceId) return;
  if (state.busy) { state.pendingExternalRefresh = true; return; }
  try {
    const latest = await state.repo.loadWorkspace(id);
    // A workspace switch or save may have begun while IndexedDB was reading.
    if (id !== state.workspaceId) return;
    if (state.busy) { state.pendingExternalRefresh = true; return; }
    if (state.dirty) {
      const originalStillExists = latest.records.some(record => record.id === state.selectedId);
      applyWorkspace(latest, { keepDraft: true });
      notice(!state.isNew && !originalStillExists
        ? 'Another tab removed the saved request. Your unsaved draft is kept and cannot overwrite a different request. Copy the draft before discarding it or starting a new request.'
        : 'Another tab saved changes. Your current draft is kept; saving will check for a revision conflict.', 'warning');
    } else applyWorkspace(latest);
  } catch (error) { notice(`Could not refresh another tab’s change: ${error.message}`, 'warning'); }
}

try {
  state.repo = await openRepository();
  applyWorkspace(await state.repo.loadWorkspace(state.workspaceId));
  state.repo.subscribe(event => {
    if (!event.external || event.id !== state.workspaceId) return;
    refreshExternalWorkspace(event.id);
  });
} catch (error) {
  notice(`The saved workspace could not be opened. ${error.message} Existing browser data has not been intentionally cleared.`, 'error');
  $('#request-list').replaceChildren(node('div', { class: 'empty-state' }, [node('h3', { text: 'The ledger needs attention' }), node('p', { text: 'Reload after resolving the browser storage problem. Your existing data has not been replaced.' })]));
  $('#editor').replaceChildren(node('div', { class: 'empty-state editor-empty' }, [node('span', { class: 'empty-icon', 'aria-hidden': 'true', text: '◇' }), node('h3', { text: 'Workspace unavailable' }), node('p', { text: 'PhantomDesk cannot report a request as saved until browser storage is available.' })]));
  $('#new-request').disabled = true; $('#export-open').disabled = true; $('#reset-demo').disabled = true;
  $$('[data-workspace]').forEach(button => { button.disabled = true; });
}
