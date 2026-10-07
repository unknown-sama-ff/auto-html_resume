export type PersistedState<T> = {
  key: string;
  value: T;
  updatedAt: string;
};

const DB_NAME = 'folio-atelier';
const STORE_NAME = 'workspace';
const STATE_KEY = 'resume-editor-state';

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

export async function saveWorkspace<T>(value: T): Promise<void> {
  const payload: PersistedState<T> = {
    key: STATE_KEY,
    value,
    updatedAt: new Date().toISOString(),
  };

  try {
    const database = await openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(payload);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save workspace'));
    });
    database.close();
  } catch {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(payload));
  }
}

export async function loadWorkspace<T>(): Promise<T | null> {
  try {
    const database = await openDb();
    const result = await new Promise<PersistedState<T> | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result as PersistedState<T> | undefined);
      request.onerror = () => reject(request.error ?? new Error('Could not load workspace'));
    });
    database.close();
    return result?.value ?? null;
  } catch {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as PersistedState<T>;
      return parsed.value;
    } catch {
      return null;
    }
  }
}
