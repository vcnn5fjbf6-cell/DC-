import type { AttachmentMeta } from '../types'

const DB_NAME = 'allknow-file-store'
const DB_VERSION = 1
const META_STORE = 'attachments'
const BLOB_STORE = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(META_STORE)) {
          const metaStore = db.createObjectStore(META_STORE, { keyPath: 'id' })
          metaStore.createIndex('noteId', 'noteId', { unique: false })
        }
        if (!db.objectStoreNames.contains(BLOB_STORE)) {
          db.createObjectStore(BLOB_STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return dbPromise
}

export async function saveAttachmentFile(
  meta: AttachmentMeta,
  blob: Blob,
): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite')
    tx.objectStore(META_STORE).put(meta)
    tx.objectStore(BLOB_STORE).put(blob, meta.id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function listAttachmentMetas(
  noteId: string,
): Promise<AttachmentMeta[]> {
  const db = await openDatabase()
  const store = db
    .transaction(META_STORE, 'readonly')
    .objectStore(META_STORE)
  const index = store.index('noteId')
  return new Promise((resolve, reject) => {
    const request = index.getAll(noteId)
    request.onsuccess = () => resolve((request.result ?? []) as AttachmentMeta[])
    request.onerror = () => reject(request.error)
  })
}

export async function getAttachmentBlob(id: string): Promise<Blob> {
  const db = await openDatabase()
  const request = db.transaction(BLOB_STORE, 'readonly').objectStore(BLOB_STORE).get(id)
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      if (!request.result) reject(new Error('file not found'))
      else resolve(request.result as Blob)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function deleteAttachmentFile(id: string): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite')
    tx.objectStore(META_STORE).delete(id)
    tx.objectStore(BLOB_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function deleteAttachmentsForNote(noteId: string): Promise<void> {
  const metas = await listAttachmentMetas(noteId)
  await Promise.all(metas.map((meta) => deleteAttachmentFile(meta.id)))
}

export async function clearAttachmentFiles(): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, BLOB_STORE], 'readwrite')
    tx.objectStore(META_STORE).clear()
    tx.objectStore(BLOB_STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
