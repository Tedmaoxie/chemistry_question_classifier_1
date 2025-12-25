import { RatingSession, RatingSessionSummary } from '../types';

const DB_NAME = 'ChemistryRatingDB';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event) => {
            reject((event.target as IDBOpenDBRequest).error);
        };
    });
}

async function withStore<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    
    return new Promise((resolve, reject) => {
        const request = callback(store);
        
        transaction.oncomplete = () => {
            // Transaction completed
        };
        
        transaction.onerror = () => {
            reject(transaction.error);
        };

        request.then(resolve).catch(reject);
    });
}

export async function saveSessionToIndexedDB(session: RatingSession, retention = 5): Promise<void> {
    await withStore('readwrite', async (store) => {
        // Save new session
        await new Promise<void>((resolve, reject) => {
            const req = store.put(session);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });

        // Cleanup old sessions (keep latest 'retention' count per type)
        const all: RatingSession[] = await new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result as RatingSession[]);
            req.onerror = () => reject(req.error);
        });

        // Filter by current session type
        const typeToCheck = session.type;
        const sameTypeSessions = all.filter(s => s.type === typeToCheck);

        if (sameTypeSessions.length > retention) {
            const sorted = sameTypeSessions.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
            const toDelete = sorted.slice(retention);
            
            await Promise.all(toDelete.map(item => new Promise<void>((resolve, reject) => {
                const del = store.delete(item.id);
                del.onsuccess = () => resolve();
                del.onerror = () => reject(del.error);
            })));
        }
    });
}

export async function getSessionList(): Promise<RatingSessionSummary[]> {
    return withStore('readonly', async (store) => {
        const all: RatingSession[] = await new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result as RatingSession[]);
            req.onerror = () => reject(req.error);
        });
        
        return all
            .map(item => ({
                id: item.id,
                examName: item.examName,
                createdAt: item.createdAt,
                questionCount: item.questions?.length || 0,
                type: item.type
            }))
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    });
}

export async function getSessionDetail(id: string): Promise<RatingSession> {
    return withStore('readonly', async (store) => {
        return new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => {
                if (req.result) resolve(req.result);
                else reject(new Error('Session not found'));
            };
            req.onerror = () => reject(req.error);
        });
    });
}


export async function deleteSession(id: string): Promise<void> {
    await withStore('readwrite', async (store) => {
        return new Promise<void>((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    });
}
