/**
 * 作業状態の自動保存（IndexedDB）。音声データは localStorage の容量（約5MB）に収まらないため
 * IndexedDB に .wvsp と同じ形式の Blob を1件だけ保存する。
 */
const DB_NAME = 'wevocalsynth'
const STORE = 'kv'
const KEY = 'autosave'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** ストアに対して1回の操作を行う */
async function withStore<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export const saveAutosave = (blob: Blob) => withStore('readwrite', (s) => s.put(blob, KEY)).then(() => {})

export const loadAutosave = () =>
  withStore<Blob | undefined>('readonly', (s) => s.get(KEY) as IDBRequest<Blob | undefined>).then((b) => b ?? null)

export const clearAutosave = () => withStore('readwrite', (s) => s.delete(KEY)).then(() => {})
