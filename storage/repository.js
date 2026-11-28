import { createWorkspace, applyCommand, createPreview, createCSV } from '../domain/requests.js';

const DEFAULT_DB = 'phantomdesk-local-v1';
const STORE = 'workspaces';
const SCHEMA = 1;

export class StorageError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'StorageError';
    this.code = 'STORAGE_FAILED';
  }
}

function validateWorkspace(workspace) {
  if (workspace && workspace.schemaVersion !== SCHEMA) {
    const error = new StorageError('This workspace uses an unsupported data version. Your stored data has been left unchanged.');
    error.code = 'FUTURE_SCHEMA';
    throw error;
  }
  if (workspace && (!Array.isArray(workspace.records) || typeof workspace.id !== 'string')) {
    throw new StorageError('This workspace could not be read safely. Your stored data has been left unchanged.');
  }
  return workspace;
}

function openDatabase(name) {
  return new Promise((resolve, reject) => {
    let request;
    try { request = indexedDB.open(name, 1); }
    catch (error) { reject(new StorageError('Browser storage is unavailable. Changes cannot be saved here.', error)); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError(
      request.error?.name === 'VersionError'
        ? 'This browser has a newer PhantomDesk database. It has been left unchanged.'
        : 'Browser storage could not open. Check that this browser allows local site data.',
      request.error,
    ));
    request.onblocked = () => reject(new StorageError('Another PhantomDesk tab is holding the database open. Close that tab and retry.'));
  });
}

/** One workspace value contains all records, approval snapshots and history.
 * A single IndexedDB transaction commits the whole value or none of it.
 * beforeCommit is a synchronous failure-injection hook for the browser tests;
 * the application never supplies it.
 */
export async function openRepository(options = {}) {
  const dbName = options.dbName || DEFAULT_DB;
  const db = await openDatabase(dbName);
  db.onversionchange = () => db.close();
  let fixtures;
  try {
    if (options.fixtures) fixtures = options.fixtures;
    else {
      const response = await fetch(new URL('../fixtures/requests.json', import.meta.url));
      if (!response.ok) throw new Error(`Fixture request failed (${response.status}).`);
      const data = await response.json();
      if (data.schemaVersion !== SCHEMA || !Array.isArray(data.records)) throw new Error('Unsupported fixture format.');
      fixtures = data.records;
    }
  } catch (error) {
    db.close();
    throw new StorageError('The synthetic demonstration could not load. Reload the page to retry.', error);
  }

  const listeners = new Set();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`${dbName}:changes`) : null;
  if (channel) channel.onmessage = ({ data }) => {
    if (data?.type === 'workspace-changed' && typeof data.id === 'string') {
      for (const listener of listeners) listener({ ...data, external: true });
    }
  };
  function notify(workspace) {
    const message = { type: 'workspace-changed', id: workspace.id, revision: workspace.revision };
    channel?.postMessage(message);
    for (const listener of listeners) listener({ ...message, external: false });
  }

  function transaction(id, mode, transform) {
    if (typeof id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(id)) return Promise.reject(new StorageError('Invalid workspace identifier.'));
    return new Promise((resolve, reject) => {
      let tx, result, operationError;
      try { tx = db.transaction(STORE, mode); }
      catch (error) { reject(new StorageError('Storage is closed or unavailable. Reload to reconnect; keep a copy of any unsaved draft.', error)); return; }
      const store = tx.objectStore(STORE);
      const request = store.get(id);
      request.onsuccess = () => {
        try {
          const current = validateWorkspace(request.result);
          const change = transform(current);
          result = change.result;
          if (change.write) {
            validateWorkspace(change.write);
            store.put(change.write);
            if (options.beforeCommit) options.beforeCommit({ id, before: current, after: change.write, transaction: tx });
          }
        } catch (error) {
          operationError = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(operationError || new StorageError('The save did not complete. Your previous saved records are unchanged; retry your unsaved changes.', tx.error));
      tx.onerror = () => { /* onabort handles errors without claiming a save. */ };
    });
  }

  async function loadWorkspace(id) {
    return transaction(id, 'readwrite', current => {
      if (current) return { result: current };
      const initial = createWorkspace(id, id === 'demo' ? fixtures : []);
      return { write: initial, result: initial };
    });
  }

  async function mutate(id, command) {
    const workspace = await transaction(id, 'readwrite', current => {
      if (!current) throw new StorageError('Open this workspace before saving a request.');
      const next = applyCommand(current, command);
      return { write: next, result: next };
    });
    notify(workspace);
    return workspace;
  }

  async function resetDemo() {
    const workspace = await transaction('demo', 'readwrite', current => {
      const initial = createWorkspace('demo', fixtures);
      // Reusing the fixture IDs must not reuse their revision guards. Another
      // tab can still hold a draft or export preview from before this reset.
      let highestRevision = current?.revision ?? 0;
      for (const record of current?.records ?? []) {
        if (!Number.isSafeInteger(record.revision) || record.revision < 1) {
          throw new StorageError('The demo contains an invalid revision. Its saved data has been left unchanged.');
        }
        highestRevision = Math.max(highestRevision, record.revision);
      }
      if (!Number.isSafeInteger(highestRevision) || highestRevision < 0 || highestRevision >= Number.MAX_SAFE_INTEGER) {
        throw new StorageError('The demo revision cannot be advanced safely. Its saved data has been left unchanged.');
      }
      const resetRevision = highestRevision + 1;
      initial.revision = resetRevision;
      for (const record of initial.records) {
        record.revision = resetRevision;
        for (const entry of record.history) {
          entry.id = `${record.id}:r${resetRevision}:${entry.type}`;
          entry.revision = resetRevision;
          if (entry.after) entry.after.revision = resetRevision;
        }
      }
      return { write: initial, result: initial };
    });
    notify(workspace);
    return workspace;
  }

  return {
    loadWorkspace,
    mutate,
    resetDemo,
    createPreview(id, ids) {
      return transaction(id, 'readonly', current => {
        if (!current) throw new StorageError('The workspace is not open.');
        return { result: createPreview(current, ids) };
      });
    },
    exportCSV(id, preview) {
      return transaction(id, 'readonly', current => {
        if (!current) throw new StorageError('The workspace is not open.');
        return { result: createCSV(current, preview) };
      });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { channel?.close(); listeners.clear(); db.close(); },
  };
}
