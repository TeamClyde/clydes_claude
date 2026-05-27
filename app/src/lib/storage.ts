import { openDB, type IDBPDatabase } from 'idb'
import type { AppProgress } from '../data/types'
import { emptyProgress } from '../data/types'

const DB_NAME = 'japanese-learner'
const DB_VERSION = 1
const STORE = 'kv'
const PROGRESS_KEY = 'progress'

let dbPromise: Promise<IDBPDatabase> | null = null

const getDb = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      },
    })
  }
  return dbPromise
}

export async function loadProgress(): Promise<AppProgress> {
  try {
    const db = await getDb()
    const value = (await db.get(STORE, PROGRESS_KEY)) as AppProgress | undefined
    return value ?? emptyProgress()
  } catch (e) {
    console.error('Storage load failed:', e)
    return emptyProgress()
  }
}

export async function saveProgress(data: AppProgress): Promise<void> {
  try {
    const db = await getDb()
    await db.put(STORE, data, PROGRESS_KEY)
  } catch (e) {
    console.error('Storage save failed:', e)
  }
}

export async function clearProgress(): Promise<void> {
  const db = await getDb()
  await db.delete(STORE, PROGRESS_KEY)
}
