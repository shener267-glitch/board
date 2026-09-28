import { DEFAULT_PX_PER_METER, defaultLayers, defaultPresets, KIND_LABEL } from './definitions';
import { createDocument, createObject, createTimelineEntry, emptyBackground } from './factory';
import {
  SCHEMA_VERSION,
  type Asset,
  type BoardObject,
  type LabelMode,
  type LayerId,
  type ObjectKind,
  type OperationDocument,
  type OperationPackage,
  type PresetCategory,
} from './types';

export const PACKAGE_FORMAT = 'operation-board';

export class ImportError extends Error {}

const LABEL_MODES: LabelMode[] = ['auto', 'all', 'selected', 'none'];

type Dict = Record<string, unknown>;

function isDict(v: unknown): v is Dict {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 既定値 base に対し、同じ型の値だけを上書きする */
function mergeTyped<T extends object>(base: T, input: unknown): T {
  if (!isDict(input)) return base;
  const out: Dict = { ...(base as Dict) };
  for (const [k, v] of Object.entries(base as Dict)) {
    const iv = input[k];
    if (iv === undefined) continue;
    if (Array.isArray(v)) {
      if (Array.isArray(iv)) out[k] = iv;
    } else if (v === null) {
      if (iv === null || typeof iv === 'string') out[k] = iv;
    } else if (typeof v === typeof iv) {
      if (typeof iv === 'number' && !Number.isFinite(iv)) continue;
      out[k] = iv;
    }
  }
  return out as T;
}

function normalizeObject(raw: unknown): BoardObject | null {
  if (!isDict(raw) || typeof raw.kind !== 'string' || !(raw.kind in KIND_LABEL)) return null;
  const kind = raw.kind as ObjectKind;
  const base = createObject(kind, { x: 0, y: 0 });
  const obj = mergeTyped(base as BoardObject, raw);
  if (typeof raw.id === 'string' && raw.id) obj.id = raw.id;
  if (typeof raw.locked === 'boolean') obj.locked = raw.locked;
  if (obj.kind === 'crowd') {
    const n = raw.estimatedCount;
    obj.estimatedCount = typeof n === 'number' && Number.isFinite(n) ? n : null;
  }
  // 旧形式 (車幅なし) は全長から補完
  if (obj.kind === 'vehicle' && typeof raw.breadth !== 'number') obj.breadth = Math.round(obj.size * 0.4 * 10) / 10;
  if ('points' in obj) {
    const pts = (obj as { points: unknown[] }).points.filter(
      (n): n is number => typeof n === 'number' && Number.isFinite(n),
    );
    if (pts.length % 2 === 1) pts.pop();
    (obj as { points: number[] }).points = pts;
  }
  return obj;
}

/** 読み込んだ JSON を検証・正規化して作戦ドキュメントにする */
export function normalizeDocument(raw: unknown): OperationDocument {
  if (!isDict(raw)) throw new ImportError('作戦データの形式が正しくありません。');
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION) {
    throw new ImportError('このデータは新しいバージョンのアプリで作成されています。');
  }
  const fresh = createDocument();
  const doc: OperationDocument = {
    ...fresh,
    schemaVersion: SCHEMA_VERSION,
    id: typeof raw.id === 'string' && raw.id ? raw.id : fresh.id,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : fresh.createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fresh.updatedAt,
    meta: mergeTyped(fresh.meta, raw.meta),
    background: mergeTyped(emptyBackground(), raw.background),
  };

  const layers = defaultLayers();
  if (isDict(raw.layers)) {
    for (const id of Object.keys(layers) as LayerId[]) {
      layers[id] = mergeTyped(layers[id], raw.layers[id]);
    }
  }
  doc.layers = layers;

  const seen = new Set<string>();
  doc.objects = (Array.isArray(raw.objects) ? raw.objects : [])
    .map(normalizeObject)
    .filter((o): o is BoardObject => {
      if (!o || seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });

  const objectIds = new Set(doc.objects.map((o) => o.id));
  doc.timeline = (Array.isArray(raw.timeline) ? raw.timeline : [])
    .filter(isDict)
    .map((t) => {
      const entry = mergeTyped(createTimelineEntry(), t);
      if (typeof t.id === 'string' && t.id) entry.id = t.id;
      if (entry.locationId && !objectIds.has(entry.locationId)) entry.locationId = null;
      if (entry.routeId && !objectIds.has(entry.routeId)) entry.routeId = null;
      return entry;
    });

  const settingsRaw = isDict(raw.settings) ? raw.settings : {};
  const presets = defaultPresets();
  if (isDict(settingsRaw.presets)) {
    for (const cat of Object.keys(presets) as PresetCategory[]) {
      const list = settingsRaw.presets[cat];
      if (Array.isArray(list)) {
        presets[cat] = list.filter((s): s is string => typeof s === 'string' && s.trim() !== '');
      }
    }
  }
  doc.settings = {
    presets,
    viewport: mergeTyped(fresh.settings.viewport, settingsRaw.viewport),
    labelMode: LABEL_MODES.includes(settingsRaw.labelMode as LabelMode)
      ? (settingsRaw.labelMode as LabelMode)
      : settingsRaw.showLabels === false
        ? 'none'
        : 'auto',
    pxPerMeter:
      typeof settingsRaw.pxPerMeter === 'number' && settingsRaw.pxPerMeter > 0 ? settingsRaw.pxPerMeter : DEFAULT_PX_PER_METER,
  };
  if (doc.settings.viewport.scale <= 0) doc.settings.viewport.scale = 1;
  return doc;
}

function normalizeAsset(raw: unknown): Asset | null {
  if (!isDict(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.dataUrl !== 'string') return null;
  if (!raw.dataUrl.startsWith('data:image/')) return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '',
    mime: typeof raw.mime === 'string' ? raw.mime : '',
    dataUrl: raw.dataUrl,
  };
}

/** 書き出し用パッケージを作る */
export function toPackage(
  doc: OperationDocument,
  assets: Record<string, Asset>,
  includeAssets: boolean,
): OperationPackage {
  const used = doc.background.assetId ? assets[doc.background.assetId] : undefined;
  return {
    format: PACKAGE_FORMAT,
    version: SCHEMA_VERSION,
    document: doc,
    assets: includeAssets && used ? [used] : [],
  };
}

export interface ParsedPackage {
  document: OperationDocument;
  assets: Asset[];
}

/** パッケージ (または生のドキュメント) JSON 文字列を読み込む */
export function parsePackage(text: string): ParsedPackage {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('JSON として読み込めませんでした。');
  }
  if (isDict(raw) && raw.format === PACKAGE_FORMAT) {
    const document = normalizeDocument(raw.document);
    const assets = (Array.isArray(raw.assets) ? raw.assets : [])
      .map(normalizeAsset)
      .filter((a): a is Asset => a !== null);
    return { document, assets };
  }
  if (isDict(raw) && 'objects' in raw) {
    return { document: normalizeDocument(raw), assets: [] };
  }
  throw new ImportError('作戦ボードのデータではありません。');
}
