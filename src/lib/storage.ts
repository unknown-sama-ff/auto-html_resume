export type PersistedState<T> = {
  key: string;
  value: T;
  updatedAt: string;
};

const DB_NAME = 'folio-atelier';
const STORE_NAME = 'workspace';
const STATE_KEY = 'resume-editor-state';
let saveQueue: Promise<void> = Promise.resolve();
let latestTimestamp = 0;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local database'));
  });
}

async function writeWorkspace<T>(payload: PersistedState<T>): Promise<void> {
  let database: IDBDatabase | undefined;
  try {
    const opened = await openDb();
    database = opened;
    await new Promise<void>((resolve, reject) => {
      const transaction = opened.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(payload);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save workspace'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Workspace save was aborted'));
    });
  } catch {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(payload));
    return;
  } finally {
    database?.close();
  }
  try {
    const fallback = readLocalPayload<T>();
    if (fallback && Date.parse(fallback.updatedAt) <= Date.parse(payload.updatedAt)) window.localStorage.removeItem(STATE_KEY);
  } catch { /* The IndexedDB commit succeeded; an unavailable fallback must not turn it into a save failure. */ }
}

export function saveWorkspace<T>(value: T): Promise<void> {
  latestTimestamp = Math.max(Date.now(), latestTimestamp + 1);
  const payload: PersistedState<T> = { key: STATE_KEY, value, updatedAt: new Date(latestTimestamp).toISOString() };
  const saving = saveQueue.then(() => writeWorkspace(payload));
  // Keep every save ordered, including backup restoration, while allowing recovery after a failed write.
  saveQueue = saving.catch(() => undefined);
  return saving;
}

function parsePayload<T>(raw: unknown): PersistedState<T> | null {
  if (raw === undefined || raw === null) return null;
  if (!raw || typeof raw !== 'object' || !('key' in raw) || raw.key !== STATE_KEY || !('value' in raw) || !('updatedAt' in raw) || typeof raw.updatedAt !== 'string' || !Number.isFinite(Date.parse(raw.updatedAt))) {
    throw new Error('Saved workspace data is invalid');
  }
  return raw as PersistedState<T>;
}

function readLocalPayload<T>(): PersistedState<T> | null {
  const raw = window.localStorage.getItem(STATE_KEY);
  return raw === null ? null : parsePayload<T>(JSON.parse(raw));
}

async function readIndexedPayload<T>(): Promise<PersistedState<T> | null> {
  // Browsers without IndexedDB use localStorage as their sole store.
  if (!('indexedDB' in window)) return null;
  let database: IDBDatabase | undefined;
  try {
    const opened = await openDb();
    database = opened;
    const result = await new Promise<unknown>((resolve, reject) => {
      const transaction = opened.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
      let value: unknown;
      request.onsuccess = () => { value = request.result; };
      request.onerror = () => reject(request.error ?? new Error('Could not load workspace'));
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not load workspace'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Workspace read was aborted'));
    });
    return parsePayload<T>(result);
  } finally {
    database?.close();
  }
}

export async function loadWorkspace<T>(): Promise<T | null> {
  await saveQueue;
  const results = await Promise.allSettled([
    readIndexedPayload<T>(),
    Promise.resolve().then(() => readLocalPayload<T>()),
  ]);
  const available = results.flatMap(result => result.status === 'fulfilled' && result.value ? [result.value] : []);
  if (available.length) {
    const latest = available.reduce((selected, candidate) => Date.parse(candidate.updatedAt) > Date.parse(selected.updatedAt) ? candidate : selected);
    latestTimestamp = Math.max(latestTimestamp, Date.parse(latest.updatedAt));
    return latest.value;
  }
  if (results.some(result => result.status === 'rejected')) throw new Error('本地资料读取失败，请重试或从已下载的备份恢复。');
  return null;
}
