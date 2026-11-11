import type { DiscoveredToken } from '../types';

export interface TokenLifecycleCacheRecord {
  mint: string;
  state_version: number;
  cached_at: number;
  lifecycle: Partial<DiscoveredToken>;
  token: DiscoveredToken;
}

const DATABASE_NAME = 'nodex-token-registry';
const STORE_NAME = 'lifecycle';
const DATABASE_VERSION = 1;
const MAX_CACHED_TOKENS = 500;

const LIFECYCLE_FIELDS: (keyof DiscoveredToken)[] = [
  'mint', 'state_version', 'security_scanned_at', 'strategy_decision', 'strategy_reasons', 'strategy_evaluated_at', 'name', 'symbol', 'metadata_uri', 'logo_url', 'metadata_status',
  'scan_status', 'monitoring_status',
  'authority_status', 'authority_rechecks', 'creator_wallet', 'launch_time',
  'venue', 'safety_status', 'qualification_status', 'rejection_reason',
  'diagnostics', 'safety_details',
];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'mint' });
        store.createIndex('cached_at', 'cached_at');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open NodeX token cache.'));
  });
}

function lifecycleOf(token: DiscoveredToken): Partial<DiscoveredToken> {
  const lifecycle: Record<string, unknown> = {};
  for (const field of LIFECYCLE_FIELDS) {
    lifecycle[field] = token[field];
  }
  return lifecycle as Partial<DiscoveredToken>;
}

export async function loadTokenLifecycleCache(): Promise<TokenLifecycleCacheRecord[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve((request.result || []) as TokenLifecycleCacheRecord[]);
      request.onerror = () => reject(request.error || new Error('Could not read NodeX token cache.'));
    });
  } finally {
    database.close();
  }
}

export async function saveTokenLifecycleCache(token: DiscoveredToken): Promise<void> {
  const database = await openDatabase();
  try {
    const record: TokenLifecycleCacheRecord = {
      mint: token.mint,
      state_version: Number(token.state_version || 0),
      cached_at: Date.now(),
      lifecycle: lifecycleOf(token),
      token: { ...token, price_history_5m: [] },
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not save NodeX token cache.'));
      transaction.onabort = () => reject(transaction.error || new Error('NodeX token cache write was aborted.'));
    });
    await trimCache(database);
  } finally {
    database.close();
  }
}

async function trimCache(database: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const records = (request.result || []) as TokenLifecycleCacheRecord[];
      if (records.length > MAX_CACHED_TOKENS) {
        records.sort((a, b) => a.cached_at - b.cached_at);
        for (const record of records.slice(0, records.length - MAX_CACHED_TOKENS)) {
          store.delete(record.mint);
        }
      }
    };
    request.onerror = () => reject(request.error || new Error('Could not trim NodeX token cache.'));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not trim NodeX token cache.'));
  });
}

export async function clearTokenLifecycleCache(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not clear NodeX token cache.'));
    });
  } finally {
    database.close();
  }
}

export function lifecycleCacheSignature(token: DiscoveredToken): string {
  return JSON.stringify({
    state_version: token.state_version || 0,
    security_scanned_at: token.security_scanned_at,
    strategy_decision: token.strategy_decision,
    strategy_reasons: token.strategy_reasons,
    strategy_evaluated_at: token.strategy_evaluated_at,
    scan_status: token.scan_status,
    monitoring_status: token.monitoring_status,
    safety_status: token.safety_status,
    qualification_status: token.qualification_status,
    rejection_reason: token.rejection_reason,
    safety_details: token.safety_details,
    diagnostics: token.diagnostics,
    metadata_status: token.metadata_status,
    name: token.name,
    symbol: token.symbol,
    logo_url: token.logo_url,
    creator_wallet: token.creator_wallet,
    launch_time: token.launch_time,
  });
}
