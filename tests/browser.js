const PREFIX = 'phantomdesk-test-';
const ACTOR = 'Synthetic browser test';
const STORE = 'workspaces';
let openRepository;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(function (key) {
      return [key, canonical(value[key])];
    }));
  }
  return value;
}

function equal(actual, expected, message) {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error(message + '\nExpected: ' + JSON.stringify(expected) + '\nActual: ' + JSON.stringify(actual));
  }
}

async function rejects(action, code, message) {
  let caught;
  try { await action(); } catch (error) { caught = error; }
  assert(caught, message + ': the operation unexpectedly succeeded.');
  if (code) assert(caught.code === code, message + ': expected ' + code + ', received ' + (caught.code || caught.name) + '. ' + caught.message);
  return caught;
}

function completeFields(overrides = {}) {
  return {
    address: '101 Synthetic Court',
    unit: 'TEST-1',
    category: 'repair',
    description: 'Synthetic cupboard hinge inspection.',
    preferredTime: 'Synthetic Tuesday, 10:00',
    ...overrides,
  };
}

function record(workspace, id) {
  const matches = workspace.records.filter(function (item) { return item.id === id; });
  assert(matches.length === 1, 'Expected exactly one saved record with ID ' + id + '.');
  return matches[0];
}

function assertTestDatabase(name) {
  assert(typeof name === 'string' && name.startsWith(PREFIX), 'Refusing to access a database outside the disposable test namespace.');
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  const timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () { reject(new Error(message)); }, milliseconds);
  });
  return Promise.race([promise, timeout]).finally(function () { clearTimeout(timer); });
}

function databaseName() {
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  return PREFIX + suffix;
}

function createContext() {
  const dbName = databaseName();
  const repositories = new Set();
  const databases = new Set();
  let closed = false;
  assertTestDatabase(dbName);

  return {
    dbName,
    async open(options = {}) {
      assert(!closed, 'This test context is already closed.');
      const repository = await openRepository({ ...options, fixtures: options.fixtures || [], dbName });
      if (closed) {
        repository.close();
        throw new Error('The test finished before its repository opened.');
      }
      repositories.add(repository);
      return repository;
    },
    close(repository) {
      repository.close();
      repositories.delete(repository);
    },
    async rawDatabase() {
      assertTestDatabase(dbName);
      assert(!closed, 'This test context is already closed.');
      const db = await new Promise(function (resolve, reject) {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = function () {
          if (!request.result.objectStoreNames.contains(STORE)) {
            request.result.createObjectStore(STORE, { keyPath: 'id' });
          }
        };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
        request.onblocked = function () { reject(new Error('Disposable database opening was blocked.')); };
      });
      if (closed) {
        db.close();
        throw new Error('The test finished before its disposable database opened.');
      }
      databases.add(db);
      return db;
    },
    async cleanup() {
      closed = true;
      for (const repository of repositories) repository.close();
      repositories.clear();
      for (const db of databases) db.close();
      databases.clear();
      assertTestDatabase(dbName);
      await withTimeout(new Promise(function (resolve, reject) {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = function () { resolve(); };
        request.onerror = function () { reject(request.error); };
        request.onblocked = function () { reject(new Error('Disposable database cleanup was blocked.')); };
      }), 5000, 'Disposable database cleanup timed out.');
    },
  };
}

function rawTransaction(db, mode, operation) {
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(STORE, mode);
    const request = operation(tx.objectStore(STORE));
    let result;
    request.onsuccess = function () { result = request.result; };
    tx.oncomplete = function () { resolve(result); };
    tx.onabort = function () { reject(tx.error || new Error('Test fixture transaction aborted.')); };
    tx.onerror = function () { /* onabort reports the failure */ };
  });
}

async function create(repository, workspaceId, id, fields = completeFields()) {
  return repository.mutate(workspaceId, { type: 'create', id, fields, actor: ACTOR });
}

async function approve(repository, workspaceId, id, workspace) {
  return repository.mutate(workspaceId, {
    type: 'approve', id, expectedRevision: record(workspace, id).revision, actor: ACTOR,
  });
}

async function checkPersistence(context) {
  const repository = await context.open();
  await repository.loadWorkspace('mine');
  await create(repository, 'mine', 'PERSIST-A');
  let workspace = await create(repository, 'mine', 'PERSIST-B', completeFields({ description: 'Synthetic matching request.' }));
  const current = record(workspace, 'PERSIST-A');
  const condition = current.conditions.find(function (item) { return item.type === 'duplicate' && item.counterpartId === 'PERSIST-B'; });
  assert(condition, 'The persistence fixture must contain a real duplicate condition.');
  const reason = 'Synthetic review confirmed these are separate appointments.';
  workspace = await repository.mutate('mine', {
    type: 'resolve', id: current.id, expectedRevision: current.revision,
    conditionId: condition.id, reason, actor: ACTOR,
  });
  workspace = await approve(repository, 'mine', current.id, workspace);
  const saved = structuredClone(workspace);
  const approval = record(saved, current.id).approval;
  assert(approval && approval.revision === record(saved, current.id).revision, 'Approval must bind the saved revision.');
  equal(approval.snapshot.fields, completeFields(), 'Approval must retain the exact approved fields.');
  assert(approval.snapshot.conditions.some(function (item) { return item.resolution && item.resolution.reason === reason; }), 'Approval snapshot must retain the duplicate review reason.');
  context.close(repository);
  const reopened = await context.open();
  equal(await reopened.loadWorkspace('mine'), saved, 'Reopening must preserve every field, condition, revision, approval, and history event.');
}

async function checkStaleWrite(context) {
  const first = await context.open();
  await first.loadWorkspace('mine');
  const baseline = await create(first, 'mine', 'STALE-A');
  const second = await context.open();
  const stale = record(await second.loadWorkspace('mine'), 'STALE-A');
  const winnerFields = { ...stale.fields, description: 'SYNTHETIC accepted first edit.' };
  const winner = await first.mutate('mine', { type: 'edit', id: stale.id, expectedRevision: stale.revision, fields: winnerFields, actor: ACTOR });
  await rejects(function () {
    return second.mutate('mine', {
      type: 'edit', id: stale.id, expectedRevision: stale.revision,
      fields: { ...stale.fields, description: 'SYNTHETIC stale edit must not persist.' }, actor: ACTOR,
    });
  }, 'CONFLICT', 'A second repository must reject a stale edit');
  equal(await second.loadWorkspace('mine'), winner, 'Rejected stale edits must leave the winning workspace untouched.');
  assert(record(winner, stale.id).history.length === record(baseline, stale.id).history.length + 1, 'Only the successful edit may add history.');
}

async function checkRollbackAndRetry(context, mode) {
  let failNext = false;
  let injected = 0;
  let draftReachedCrossRecordChange = false;
  const repository = await context.open({
    beforeCommit: function (event) {
      if (!failNext) return;
      failNext = false;
      injected += 1;
      const affected = event.after.records.find(function (item) { return item.id === 'DUP-A'; });
      draftReachedCrossRecordChange = event.after.records.length === 3
        && affected && affected.approval === null
        && affected.conditions.some(function (item) { return item.type === 'duplicate' && item.counterpartId === 'DUP-B'; });
      if (mode === 'throw') throw new Error('SYNTHETIC injected failure after put.');
      event.transaction.abort();
    },
  });
  await repository.loadWorkspace('mine');
  let workspace = await create(repository, 'mine', 'DUP-A');
  workspace = await approve(repository, 'mine', 'DUP-A', workspace);
  workspace = await create(repository, 'mine', 'UNRELATED-C', completeFields({ address: '202 Synthetic Court', unit: 'TEST-2' }));
  workspace = await approve(repository, 'mine', 'UNRELATED-C', workspace);
  const baseline = structuredClone(workspace);
  let notifications = 0;
  repository.subscribe(function () { notifications += 1; });
  const command = {
    type: 'create', id: 'DUP-B',
    fields: completeFields({ description: 'SYNTHETIC duplicate introduced by this save.' }), actor: ACTOR,
  };
  failNext = true;
  await rejects(function () { return repository.mutate('mine', command); }, null, 'Injected ' + mode + ' must reject the save');
  assert(injected === 1 && draftReachedCrossRecordChange, 'The injected failure must occur after preparing all duplicate and approval changes.');
  assert(notifications === 0, 'A failed transaction must not announce a successful save.');
  const observer = await context.open();
  equal(await observer.loadWorkspace('mine'), baseline, 'After failure, ALL records, revisions, approvals, and histories must match the prior committed workspace.');

  const retried = await repository.mutate('mine', command);
  assert(retried.records.length === 3, 'Retry must create exactly one new record.');
  assert(retried.revision === baseline.revision + 1, 'Retry must commit exactly one workspace transition.');
  const beforeA = record(baseline, 'DUP-A');
  const afterA = record(retried, 'DUP-A');
  assert(afterA.revision === beforeA.revision + 1, 'Retry must advance the affected existing record once.');
  assert(afterA.history.length === beforeA.history.length + 1, 'Retry must append one cross-record history event.');
  assert(afterA.history.at(-1).type === 'review-conditions-changed', 'The new history event must describe the duplicate condition change.');
  equal(afterA.history.at(-1).approval, beforeA.approval, 'Invalidation must preserve the previous approval in history.');
  assert(afterA.approval === null, 'The duplicate must invalidate the prior current approval.');
  const created = record(retried, 'DUP-B');
  assert(created.history.length === 1 && created.history[0].type === 'created', 'Retry must create exactly one creation event.');
  equal(record(retried, 'UNRELATED-C'), record(baseline, 'UNRELATED-C'), 'The unrelated approved record must remain unchanged.');
  assert(notifications === 1, 'Only the successful retry may announce the save.');
  equal(await observer.loadWorkspace('mine'), retried, 'The complete successful retry must be visible to another repository.');
}

async function checkWorkspaceIsolation(context) {
  const fixtures = [{ id: 'SYNTHETIC-DEMO', ...completeFields({ address: '303 Synthetic Court' }) }];
  const repository = await context.open({ fixtures });
  const initialDemo = await repository.loadWorkspace('demo');
  const emptyMine = await repository.loadWorkspace('mine');
  assert(initialDemo.records.length === 1 && emptyMine.records.length === 0, 'Only the demo workspace may receive fixtures.');
  let mine = await create(repository, 'mine', 'MINE-A', completeFields({ address: '404 Synthetic Court' }));
  mine = await approve(repository, 'mine', 'MINE-A', mine);
  const savedMine = structuredClone(mine);
  const demoRecord = record(initialDemo, 'SYNTHETIC-DEMO');
  await repository.mutate('demo', {
    type: 'edit', id: demoRecord.id, expectedRevision: demoRecord.revision,
    fields: { ...demoRecord.fields, description: 'Synthetic modified demo.' }, actor: ACTOR,
  });
  await create(repository, 'demo', 'EXTRA-DEMO', completeFields({ address: '505 Synthetic Court' }));
  const reset = await repository.resetDemo();
  assert(reset.records.length === 1, 'Demo reset must discard only the additional demo record.');
  equal(record(reset, demoRecord.id).fields, demoRecord.fields, 'Demo reset must restore the fixture fields.');
  equal(await repository.loadWorkspace('mine'), savedMine, 'Demo reset must preserve user records, history, and approval.');
  context.close(repository);
  const reopened = await context.open({ fixtures });
  equal(await reopened.loadWorkspace('mine'), savedMine, 'The isolated user workspace must survive reopen after demo reset.');
}

async function checkResetRevisionGuards(context) {
  const fixtures = [{ id: 'RESET-A', ...completeFields({ address: '606 Synthetic Court' }) }];
  const first = await context.open({ fixtures });
  const opened = await first.loadWorkspace('demo');
  const second = await context.open({ fixtures });
  const stale = record(await second.loadWorkspace('demo'), 'RESET-A');
  const reset = await first.resetDemo();
  const resetRecord = record(reset, stale.id);
  assert(resetRecord.revision > stale.revision && resetRecord.revision > opened.revision,
    'Reset must advance fixture revisions beyond every revision held before reset.');
  assert(resetRecord.history.length === 1 && resetRecord.history[0].revision === resetRecord.revision,
    'The rebuilt creation history must use the reset record revision.');
  assert(resetRecord.history[0].after.revision === resetRecord.revision
    && resetRecord.history[0].id === resetRecord.id + ':r' + resetRecord.revision + ':created',
  'The rebuilt history snapshot and event ID must agree with the reset revision.');
  await rejects(function () {
    return second.mutate('demo', {
      type: 'edit', id: stale.id, expectedRevision: stale.revision,
      fields: { ...stale.fields, description: 'SYNTHETIC pre-reset draft must not persist.' }, actor: ACTOR,
    });
  }, 'CONFLICT', 'A draft opened before reset must not overwrite a rebuilt fixture');
  equal(await first.loadWorkspace('demo'), reset, 'Rejected pre-reset edits must leave all reset state unchanged.');

  let approved = await approve(first, 'demo', stale.id, reset);
  const oldPreview = await second.createPreview('demo');
  const preResetApproval = record(approved, stale.id).approval;
  approved = await create(first, 'demo', 'RESET-EXTRA', completeFields({ address: '607 Synthetic Court' }));
  const beforeSecondReset = structuredClone(approved);
  const again = await second.resetDemo();
  const highWater = Math.max(beforeSecondReset.revision, ...beforeSecondReset.records.map(function (item) { return item.revision; }));
  assert(again.revision > highWater && record(again, stale.id).revision > highWater,
    'A later reset must advance beyond both the whole-workspace revision and every record revision.');
  const reapproved = await approve(first, 'demo', stale.id, again);
  assert(record(reapproved, stale.id).approval.revision > preResetApproval.revision,
    'Reapproval after reset must never reuse the previous approval revision.');
  await rejects(function () { return second.exportCSV('demo', oldPreview); }, 'STALE_EXPORT',
    'A preview from before reset must remain blocked after the fixture is approved again');
  equal(await first.loadWorkspace('demo'), reapproved, 'The rejected pre-reset export must not alter reapproved state.');
}

async function checkFutureSchema(context) {
  const db = await context.rawDatabase();
  const futureMine = {
    id: 'mine', schemaVersion: 99, revision: 871, records: [],
    futureSentinel: { preserve: ['all', 'unknown', 'fields'], approvalFormat: 'future-format' },
  };
  const futureDemo = { ...structuredClone(futureMine), id: 'demo', revision: 872 };
  await rawTransaction(db, 'readwrite', function (store) { return store.put(futureMine); });
  await rawTransaction(db, 'readwrite', function (store) { return store.put(futureDemo); });
  const before = await rawTransaction(db, 'readonly', function (store) { return store.getAll(); });
  const repository = await context.open();
  await rejects(function () { return repository.loadWorkspace('mine'); }, 'FUTURE_SCHEMA', 'Unknown saved schema must block opening');
  await rejects(function () {
    return create(repository, 'mine', 'MUST-NOT-EXIST');
  }, 'FUTURE_SCHEMA', 'Unknown saved schema must block mutation');
  await rejects(function () { return repository.resetDemo(); }, 'FUTURE_SCHEMA', 'Reset must not erase an unknown demo schema');
  const after = await rawTransaction(db, 'readonly', function (store) { return store.getAll(); });
  equal(after, before, 'Unknown-version workspaces and every unknown field must remain exactly unchanged.');
}

async function checkFreshExport(context) {
  const first = await context.open();
  await first.loadWorkspace('mine');
  let workspace = await create(first, 'mine', 'EXPORT-STABLE', completeFields({
    address: '777 Synthetic Court', description: 'SYNTHETIC stable approved instructions.',
  }));
  workspace = await approve(first, 'mine', 'EXPORT-STABLE', workspace);
  workspace = await create(first, 'mine', 'EXPORT-A', completeFields({ description: 'SYNTHETIC old approved instructions.' }));
  workspace = await approve(first, 'mine', 'EXPORT-A', workspace);
  const oldPreview = await first.createPreview('mine', ['EXPORT-STABLE', 'EXPORT-A']);
  assert(oldPreview.length === 2, 'Both initial saved approvals must be previewable.');
  const second = await context.open();
  const original = record(await second.loadWorkspace('mine'), 'EXPORT-A');
  workspace = await second.mutate('mine', {
    type: 'edit', id: original.id, expectedRevision: original.revision,
    fields: { ...original.fields, description: 'SYNTHETIC latest approved instructions.' }, actor: ACTOR,
  });
  await rejects(function () { return first.exportCSV('mine', oldPreview); }, 'STALE_EXPORT', 'Export must reject the entire mixed selection when one preview is stale');
  equal(await first.loadWorkspace('mine'), workspace, 'Rejected export must not write any state.');
  workspace = await approve(second, 'mine', original.id, workspace);
  await rejects(function () { return first.exportCSV('mine', oldPreview); }, 'STALE_EXPORT', 'Reapproval must not make the old preview valid again');
  const freshPreview = await first.createPreview('mine', ['EXPORT-STABLE', 'EXPORT-A']);
  const approved = record(workspace, 'EXPORT-A');
  const updatedSelection = freshPreview.find(function (item) { return item.id === approved.id; });
  assert(freshPreview.length === 2 && updatedSelection && updatedSelection.revision === approved.revision, 'A new preview must bind the latest saved revision.');
  assert(updatedSelection.approvalAt === approved.approval.at, 'A new preview must bind the current approval time.');
  const csv = await first.exportCSV('mine', freshPreview);
  assert(typeof csv === 'string' && csv.includes('EXPORT-A') && csv.includes('EXPORT-STABLE'), 'The successful export must return CSV for both selected requests.');
  assert(csv.includes('SYNTHETIC latest approved instructions.'), 'CSV must contain the current approved instructions.');
  assert(!csv.includes('SYNTHETIC old approved instructions.'), 'CSV must not contain superseded instructions.');
  assert(csv.includes(approved.approval.at), 'CSV must contain the exact current approval timestamp.');
  equal(await first.loadWorkspace('mine'), workspace, 'Successful export must not mutate the saved workspace.');
}

async function checkConcurrentSaves(context) {
  const first = await context.open();
  await first.loadWorkspace('mine');
  const baseline = await create(first, 'mine', 'RACE-A');
  const second = await context.open();
  await second.loadWorkspace('mine');
  const original = record(baseline, 'RACE-A');
  const outcomes = await Promise.allSettled([
    first.mutate('mine', {
      type: 'edit', id: original.id, expectedRevision: original.revision,
      fields: { ...original.fields, description: 'SYNTHETIC concurrent edit A.' }, actor: ACTOR,
    }),
    second.mutate('mine', {
      type: 'edit', id: original.id, expectedRevision: original.revision,
      fields: { ...original.fields, description: 'SYNTHETIC concurrent edit B.' }, actor: ACTOR,
    }),
  ]);
  const successes = outcomes.filter(function (outcome) { return outcome.status === 'fulfilled'; });
  const failures = outcomes.filter(function (outcome) { return outcome.status === 'rejected'; });
  assert(successes.length === 1 && failures.length === 1, 'Exactly one concurrent save must commit and one must fail.');
  assert(failures[0].reason.code === 'CONFLICT', 'The losing concurrent save must report a conflict.');
  const final = await first.loadWorkspace('mine');
  equal(final, successes[0].value, 'The saved workspace must equal the winning transaction.');
  assert(final.revision === baseline.revision + 1, 'Concurrent saves must commit one workspace revision.');
  assert(record(final, original.id).revision === original.revision + 1, 'Concurrent saves must commit one record revision.');
  assert(record(final, original.id).history.length === original.history.length + 1, 'Concurrent saves must append only one history event.');
}

const checks = [
  { name: 'Approved state survives close and reopen', description: 'Persists fields, duplicate resolutions, approval snapshots, revisions, and full history.', run: checkPersistence },
  { name: 'A stale edit cannot overwrite a newer save', description: 'Two repository connections disagree on the revision; only the current edit survives.', run: checkStaleWrite },
  { name: 'Thrown save failure rolls back every record', description: 'Fails after preparing cross-record duplicate changes, verifies complete rollback, then retries exactly once.', run: function (context) { return checkRollbackAndRetry(context, 'throw'); } },
  { name: 'Aborted transaction rolls back every record', description: 'Aborts the actual IndexedDB transaction after put, checks approvals and history, then retries exactly once.', run: function (context) { return checkRollbackAndRetry(context, 'abort'); } },
  { name: 'Demo reset preserves the separate user workspace', description: 'Resets synthetic examples while retaining the other workspace’s saved approval and history.', run: checkWorkspaceIsolation },
  { name: 'Demo reset rejects old drafts and export previews', description: 'Rebuilt fixture revisions advance monotonically, so another tab cannot reuse a pre-reset revision or approval.', run: checkResetRevisionGuards },
  { name: 'Future schema data remains untouched', description: 'Unknown saved versions block opening, mutation, and demo reset without losing unknown fields.', run: checkFutureSchema },
  { name: 'Export reads current storage after a stale preview', description: 'Rejects superseded previews and exports only the latest saved, approved instructions.', run: checkFreshExport },
  { name: 'Concurrent saves produce one commit and one conflict', description: 'Submits two edits at once through separate connections and verifies the single committed transition.', run: checkConcurrentSaves },
];

const list = document.getElementById('tests');
const runButton = document.getElementById('run-tests');
const summary = document.getElementById('summary');
const contextLine = document.getElementById('run-context');
const reportElement = document.getElementById('report');
const rows = checks.map(function (check, index) {
  const row = document.createElement('li');
  row.className = 'test';
  const heading = document.createElement('div');
  heading.className = 'test-heading';
  const title = document.createElement('h2');
  title.textContent = (index + 1) + '. ' + check.name;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = 'NOT RUN';
  heading.append(title, badge);
  const description = document.createElement('p');
  description.textContent = check.description;
  const details = document.createElement('details');
  const detailTitle = document.createElement('summary');
  detailTitle.textContent = 'Check details';
  const output = document.createElement('pre');
  output.textContent = 'Not run.';
  details.append(detailTitle, output);
  row.append(heading, description, details);
  list.append(row);
  return { row, badge, details, output };
});

runButton.addEventListener('click', async function () {
  if (runButton.disabled) return;
  runButton.disabled = true;
  const startedAt = new Date().toISOString();
  const results = [];
  summary.textContent = 'Starting real IndexedDB checks…';
  contextLine.textContent = 'Started ' + new Date(startedAt).toLocaleString() + '. Synthetic data only; databases are removed after each check.';
  reportElement.textContent = 'Running…';
  for (const ui of rows) {
    ui.row.className = 'test';
    ui.badge.textContent = 'QUEUED';
    ui.output.textContent = 'Waiting to run.';
    ui.details.open = false;
  }
  try {
    assert(typeof indexedDB !== 'undefined', 'IndexedDB is unavailable in this browser.');
    ({ openRepository } = await import('../storage/repository.js'));
    for (const [index, check] of checks.entries()) {
      const ui = rows[index];
      ui.row.className = 'test running';
      ui.badge.textContent = 'RUNNING';
      summary.textContent = 'Running check ' + (index + 1) + ' of ' + checks.length + ': ' + check.name;
      const context = createContext();
      const began = performance.now();
      let error = null;
      let cleanupError = null;
      try {
        await withTimeout(check.run(context), 15000, 'Check timed out after 15 seconds.');
      } catch (caught) {
        error = caught;
      } finally {
        try { await context.cleanup(); } catch (caught) { cleanupError = caught; }
      }
      const passed = !error && !cleanupError;
      const result = {
        name: check.name, status: passed ? 'PASS' : 'FAIL',
        durationMs: Math.round(performance.now() - began), database: context.dbName,
        cleanup: cleanupError ? 'FAILED: ' + cleanupError.message : 'Database deleted',
        error: error ? { name: error.name, code: error.code || null, message: error.message, stack: error.stack || null } : null,
      };
      results.push(result);
      ui.row.className = 'test ' + (passed ? 'pass' : 'fail');
      ui.badge.textContent = result.status + ' · ' + result.durationMs + ' ms';
      ui.output.textContent = JSON.stringify(result, null, 2);
      ui.details.open = !passed;
      reportElement.textContent = JSON.stringify({ startedAt, status: 'RUNNING', results }, null, 2);
    }
    const passed = results.filter(function (result) { return result.status === 'PASS'; }).length;
    const failed = results.length - passed;
    summary.textContent = passed + ' passed · ' + failed + ' failed · ' + results.length + ' real IndexedDB checks completed.';
    reportElement.textContent = JSON.stringify({
      suite: 'PhantomDesk actual-browser IndexedDB checks', startedAt, finishedAt: new Date().toISOString(),
      passed, failed, scope: 'Repository storage behavior only; application interface not verified.',
      results,
    }, null, 2);
  } catch (error) {
    summary.textContent = 'Could not start the checks: ' + error.message;
    reportElement.textContent = JSON.stringify({ startedAt, status: 'BOOT_FAILED', error: error.message }, null, 2);
    document.getElementById('report-details').open = true;
  } finally {
    runButton.disabled = false;
    runButton.textContent = 'Run browser checks again';
  }
});
