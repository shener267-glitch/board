import { normalizeDocument } from '../model/serialize';
import type { Asset, OperationDocument } from '../model/types';

/**
 * ブラウザ内保存 (IndexedDB)。
 * - plans  : 作戦ドキュメント (配置情報・タイムライン・設定)。画像は assetId 参照のみ
 * - assets : 背景画像などのバイナリ (data URL)
 * 2つのストアに分離して保存する。
 */

const DB_NAME = 'operation-board';
const DB_VERSION = 1;
const PLANS = 'plans';
const ASSETS = 'assets';
export const DRAFT_ID = '__draft__';

export interface PlanRecord {
  id: string;
  title: string;
  updatedAt: string;
  assetIds: string[];
  document: OperationDocument;
}

export interface PlanSummary {
  id: string;
  title: string;
  updatedAt: string;
  objectCount: number;
  timelineCount: number;
  hasBackground: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('このブラウザでは IndexedDB が利用できません。'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PLANS)) db.createObjectStore(PLANS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ASSETS)) db.createObjectStore(ASSETS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB を開けませんでした。'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** テスト用: 接続をリセット */
export function resetDbConnection(): void {
  dbPromise = null;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

function referencedAssets(doc: OperationDocument): string[] {
  return doc.background.assetId ? [doc.background.assetId] : [];
}

/** 作戦を保存 (recordId を省略するとドキュメント ID で保存) */
export async function savePlan(
  doc: OperationDocument,
  assets: Record<string, Asset>,
  recordId: string = doc.id,
): Promise<void> {
  const db = await openDb();
  const assetIds = referencedAssets(doc);
  const tx = db.transaction([PLANS, ASSETS], 'readwrite');
  const plans = tx.objectStore(PLANS);
  const assetStore = tx.objectStore(ASSETS);
  const record: PlanRecord = {
    id: recordId,
    title: doc.meta.title,
    updatedAt: doc.updatedAt,
    assetIds,
    document: doc,
  };
  plans.put(record);
  // アセットは ID ごとに不変なので、未保存のものだけ書き込む (自動退避時の負荷軽減)
  for (const id of assetIds) {
    const a = assets[id];
    if (!a) continue;
    const req = assetStore.getKey(id);
    req.onsuccess = () => {
      if (req.result === undefined) assetStore.put(a);
    };
  }
  await txDone(tx);
  await collectGarbage();
}

/** どの作戦からも参照されない画像を削除 */
async function collectGarbage(): Promise<void> {
  const db = await openDb();
  const readTx = db.transaction([PLANS, ASSETS], 'readonly');
  const [records, keys] = await Promise.all([
    reqToPromise(readTx.objectStore(PLANS).getAll() as IDBRequest<PlanRecord[]>),
    reqToPromise(readTx.objectStore(ASSETS).getAllKeys()),
  ]);
  const used = new Set(records.flatMap((r) => r.assetIds));
  const orphans = keys.filter((k) => !used.has(String(k)));
  if (!orphans.length) return;
  const tx = db.transaction(ASSETS, 'readwrite');
  for (const k of orphans) tx.objectStore(ASSETS).delete(k);
  await txDone(tx);
}

export async function listPlans(): Promise<PlanSummary[]> {
  const db = await openDb();
  const tx = db.transaction(PLANS, 'readonly');
  const records = await reqToPromise(tx.objectStore(PLANS).getAll() as IDBRequest<PlanRecord[]>);
  return records
    .filter((r) => r.id !== DRAFT_ID)
    .map((r) => ({
      id: r.id,
      title: r.title || '(無題)',
      updatedAt: r.updatedAt,
      objectCount: r.document.objects?.length ?? 0,
      timelineCount: r.document.timeline?.length ?? 0,
      hasBackground: r.assetIds.length > 0,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadPlan(id: string): Promise<{ document: OperationDocument; assets: Asset[] } | null> {
  const db = await openDb();
  const record = await reqToPromise(
    db.transaction(PLANS, 'readonly').objectStore(PLANS).get(id) as IDBRequest<PlanRecord | undefined>,
  );
  if (!record) return null;
  const assetStore = db.transaction(ASSETS, 'readonly').objectStore(ASSETS);
  const found = await Promise.all(
    record.assetIds.map((aid) => reqToPromise(assetStore.get(aid) as IDBRequest<Asset | undefined>)),
  );
  const assets = found.filter((a): a is Asset => !!a);
  return { document: normalizeDocument(record.document), assets };
}

export async function deletePlan(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PLANS, 'readwrite');
  tx.objectStore(PLANS).delete(id);
  await txDone(tx);
  await collectGarbage();
}

export async function planExists(id: string): Promise<boolean> {
  const db = await openDb();
  const tx = db.transaction(PLANS, 'readonly');
  const key = await reqToPromise(tx.objectStore(PLANS).getKey(id));
  return key !== undefined;
}
