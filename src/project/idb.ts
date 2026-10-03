// IndexedDB の最小限の読み書き。画面（メインスレッド）と自動保存の Worker の両方から使う
const DB_NAME = 'wevocalsynth'
const STORE = 'kv'

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

export const idbGet = (key: string) => withStore<unknown>('readonly', (s) => s.get(key))
export const idbPut = (key: string, value: unknown) => withStore('readwrite', (s) => s.put(value, key)).then(() => {})
export const idbDelete = (key: string) => withStore('readwrite', (s) => s.delete(key)).then(() => {})
/** `prefix` で始まるキーをすべて消す（前回の残りの掃除に使う） */
export async function idbDeletePrefix(prefix: string) {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(IDBKeyRange.bound(prefix, `${prefix}￿`))
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** 保存したものをすべて消す（設定の「作業データを削除」） */
export const idbClear = () => withStore('readwrite', (s) => s.clear()).then(() => {})
