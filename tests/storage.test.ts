import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspace, saveWorkspace } from '../src/lib/storage';

const STATE_KEY = 'resume-editor-state';
type Document = { name: string };
type Payload = { key: string; value: Document; updatedAt: string };
function payload(name: string, milliseconds: number): Payload {
  return { key: STATE_KEY, value: { name }, updatedAt: new Date(milliseconds).toISOString() };
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
function mockStorage() {
  const state = {
    indexed: undefined as unknown,
    local: null as string | null,
    openError: null as Error | null,
    readError: null as Error | null,
    writeError: null as Error | null,
    localReadError: null as Error | null,
    localWriteError: null as Error | null,
    removeError: null as Error | null,
    readAbort: false,
    writeAbort: false,
    closed: 0,
    activeWrites: 0,
    maximumWrites: 0,
    startedWrites: [] as Payload[],
    finishedWrites: [] as Payload[],
    localWrites: [] as Payload[],
    gates: [] as ReturnType<typeof gate>[],
  };
  function database() {
    return {
      close() { state.closed += 1; },
      transaction() {
        const transaction = {
          error: null as Error | null,
          oncomplete: null as (() => void) | null,
          onerror: null as (() => void) | null,
          onabort: null as (() => void) | null,
          objectStore() {
            return {
              get() {
                const request = { result: undefined as unknown, error: null as Error | null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
                queueMicrotask(() => {
                  if (state.readAbort) { transaction.onabort?.(); return; }
                  if (state.readError) { request.error = state.readError; request.onerror?.(); return; }
                  request.result = structuredClone(state.indexed);
                  request.onsuccess?.();
                  transaction.oncomplete?.();
                });
                return request;
              },
              put(value: Payload) {
                const pending = structuredClone(value);
                const wait = state.gates.shift();
                const failure = state.writeError;
                const aborted = state.writeAbort;
                state.startedWrites.push(pending);
                state.activeWrites += 1;
                state.maximumWrites = Math.max(state.maximumWrites, state.activeWrites);
                queueMicrotask(() => { void (async () => {
                  await wait?.promise;
                  state.activeWrites -= 1;
                  if (aborted) { transaction.onabort?.(); return; }
                  if (failure) { transaction.error = failure; transaction.onerror?.(); return; }
                  state.indexed = pending;
                  state.finishedWrites.push(pending);
                  transaction.oncomplete?.();
                })(); });
              },
            };
          },
        };
        return transaction;
      },
    };
  }
  const fakeWindow = {
    indexedDB: {
      open() {
        const request = { result: undefined as unknown, error: null as Error | null, onupgradeneeded: null as (() => void) | null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
        queueMicrotask(() => {
          if (state.openError) { request.error = state.openError; request.onerror?.(); return; }
          request.result = database(); request.onsuccess?.();
        });
        return request;
      },
    },
    localStorage: {
      getItem(key: string) { assert.equal(key, STATE_KEY); if (state.localReadError) throw state.localReadError; return state.local; },
      setItem(key: string, value: string) { assert.equal(key, STATE_KEY); if (state.localWriteError) throw state.localWriteError; state.local = value; state.localWrites.push(JSON.parse(value)); },
      removeItem(key: string) { assert.equal(key, STATE_KEY); if (state.removeError) throw state.removeError; state.local = null; },
    },
  };
  return { state, fakeWindow };
}
async function withStorage(run: (mock: ReturnType<typeof mockStorage>) => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const mock = mockStorage();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: mock.fakeWindow });
  try { await run(mock); }
  finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('fallback after failed IndexedDB write reloads the newer workspace instead of old IndexedDB data', async () => {
  await withStorage(async ({ state }) => {
    state.indexed = payload('old indexed version', Date.now() - 10000);
    state.writeError = new Error('IndexedDB quota');
    await saveWorkspace({ name: 'restored version' });
    assert.equal(state.closed, 1);
    assert.equal(state.localWrites.length, 1);
    assert.equal((state.indexed as Payload).value.name, 'old indexed version');
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'restored version' });
    assert.equal(state.closed, 2);
  });
});

test('load compares both timestamps even when IndexedDB is available and supports fallback-only data', async () => {
  await withStorage(async ({ state }) => {
    const now = Date.now();
    state.indexed = payload('new indexed version', now);
    state.local = JSON.stringify(payload('old fallback version', now - 1000));
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'new indexed version' });
    state.local = JSON.stringify(payload('newest fallback version', now + 1000));
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'newest fallback version' });
    state.indexed = undefined;
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'newest fallback version' });
  });
});

test('successful IndexedDB writes remove older fallback but cleanup failure does not fail the committed save', async () => {
  await withStorage(async ({ state }) => {
    state.local = JSON.stringify(payload('old fallback', Date.now() - 10000));
    await saveWorkspace({ name: 'indexed commit' });
    assert.equal(state.local, null);
    state.local = JSON.stringify(payload('another old fallback', Date.now() - 10000));
    state.removeError = new Error('remove denied');
    await assert.doesNotReject(() => saveWorkspace({ name: 'latest indexed commit' }));
    assert.notEqual(state.local, null);
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'latest indexed commit' });
  });
});

test('reading failure without a usable fallback throws, while confirmed empty stores return null', async () => {
  await withStorage(async ({ state }) => {
    assert.equal(await loadWorkspace<Document>(), null);
    state.readError = new Error('IndexedDB read failed');
    await assert.rejects(() => loadWorkspace<Document>(), /读取失败/);
    assert.equal(state.closed, 2);
    state.local = JSON.stringify(payload('recoverable fallback', Date.now()));
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'recoverable fallback' });
    state.local = '{invalid JSON';
    await assert.rejects(() => loadWorkspace<Document>(), /读取失败/);
    state.readError = null;
    state.local = null;
    state.localReadError = new Error('localStorage blocked');
    await assert.rejects(() => loadWorkspace<Document>(), /读取失败/);
    state.indexed = payload('usable indexed version', Date.now());
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'usable indexed version' });
  });
});

test('open failure and malformed stored envelopes cannot be confused with an empty workspace', async () => {
  await withStorage(async ({ state }) => {
    state.openError = new Error('database unavailable');
    await assert.rejects(() => loadWorkspace<Document>(), /读取失败/);
    state.local = JSON.stringify(payload('fallback after failed open', Date.now()));
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'fallback after failed open' });
    state.openError = null;
    state.indexed = { key: STATE_KEY, value: { name: 'invalid timestamp' }, updatedAt: 'invalid date' };
    state.local = null;
    await assert.rejects(() => loadWorkspace<Document>(), /读取失败/);
  });
});

test('read and write transaction aborts settle the promises and close their database connections', async () => {
  await withStorage(async ({ state }) => {
    state.readAbort = true;
    await assert.rejects(() => loadWorkspace<Document>(), /读取失败/);
    assert.equal(state.closed, 1);
    state.readAbort = false;
    state.writeAbort = true;
    await saveWorkspace({ name: 'fallback from aborted transaction' });
    assert.equal(state.closed, 2);
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'fallback from aborted transaction' });
    state.localWriteError = new Error('fallback quota');
    await assert.rejects(() => saveWorkspace({ name: 'both writes failed' }), /fallback quota/);
    assert.equal(state.closed, 4);
    state.writeAbort = false;
    state.localWriteError = null;
    await saveWorkspace({ name: 'next save recovers' });
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'next save recovers' });
  });
});

test('concurrent autosave and restoration writes share one queue and use distinct increasing timestamps', async () => {
  await withStorage(async ({ state }) => {
    const firstGate = gate();
    state.gates.push(firstGate);
    const first = saveWorkspace({ name: 'old autosave' });
    const second = saveWorkspace({ name: 'restored workspace' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(state.startedWrites.length, 1);
    assert.equal(state.startedWrites[0].value.name, 'old autosave');
    assert.equal(state.maximumWrites, 1);
    firstGate.release();
    await Promise.all([first, second]);
    assert.deepEqual(state.finishedWrites.map(entry => entry.value.name), ['old autosave', 'restored workspace']);
    assert.ok(Date.parse(state.finishedWrites[1].updatedAt) > Date.parse(state.finishedWrites[0].updatedAt));
    assert.equal(state.maximumWrites, 1);
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'restored workspace' });
  });
});

test('load waits for queued restoration and later saves survive preceding failed writes', async () => {
  await withStorage(async ({ state }) => {
    state.writeError = new Error('write failed');
    state.localWriteError = new Error('fallback failed');
    await assert.rejects(() => saveWorkspace({ name: 'failed save' }), /fallback failed/);
    state.writeError = null;
    state.localWriteError = null;
    const waiting = gate();
    state.gates.push(waiting);
    const save = saveWorkspace({ name: 'queued restoration' });
    let readFinished = false;
    const load = loadWorkspace<Document>().then(value => { readFinished = true; return value; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(readFinished, false);
    waiting.release();
    await save;
    assert.deepEqual(await load, { name: 'queued restoration' });
  });
});

test('browsers without IndexedDB can create and reload workspaces using localStorage alone', async () => {
  await withStorage(async ({ fakeWindow }) => {
    Reflect.deleteProperty(fakeWindow, 'indexedDB');
    assert.equal(await loadWorkspace<Document>(), null);
    await saveWorkspace({ name: 'local only' });
    assert.deepEqual(await loadWorkspace<Document>(), { name: 'local only' });
  });
});
