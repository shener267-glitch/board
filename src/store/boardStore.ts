import { create } from 'zustand';
import { KIND_LAYER, LAYER_ORDER } from '../model/definitions';
import { createDocument, createTimelineEntry, newId } from '../model/factory';
import type {
  Asset,
  BackgroundSettings,
  BoardObject,
  LayerId,
  LayerState,
  OperationDocument,
  OperationMeta,
  PresetCategory,
  TimelineEntry,
  ViewportState,
} from '../model/types';
import type { ToolId } from './tools';

const HISTORY_LIMIT = 150;
/** 同じ mergeKey の連続変更をまとめる時間 (ms) */
const MERGE_WINDOW = 1200;

interface Snapshot {
  doc: OperationDocument;
  assets: Record<string, Asset>;
}

export type SaveStatus = 'new' | 'saved' | 'dirty' | 'saving' | 'error';

export interface BoardState {
  doc: OperationDocument;
  assets: Record<string, Asset>;
  selection: string[];
  tool: ToolId;
  /** 配置ツールで使う種類 (役割・車種など) */
  toolPresets: Partial<Record<ToolId, string>>;
  activeTimelineId: string | null;
  viewport: ViewportState;
  past: Snapshot[];
  future: Snapshot[];
  lastMergeKey: string | null;
  lastCommitAt: number;
  clipboard: BoardObject[];
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  /** 一時的なお知らせ */
  notice: string | null;
  /** 配置後もツールを維持する */
  continuousPlace: boolean;

  // ---- 共通 ----
  commit: (fn: (doc: OperationDocument) => OperationDocument, mergeKey?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ---- ドキュメント ----
  loadDocument: (doc: OperationDocument, assets: Asset[], opts?: { saved?: boolean }) => void;
  newDocument: () => void;
  setMeta: (patch: Partial<OperationMeta>) => void;
  markSaved: (at: string) => void;
  setSaveStatus: (s: SaveStatus) => void;
  setNotice: (msg: string | null) => void;

  // ---- 背景 ----
  setBackgroundImage: (asset: Asset, width: number, height: number) => void;
  updateBackground: (patch: Partial<BackgroundSettings>, mergeKey?: string) => void;
  removeBackground: () => void;

  // ---- レイヤー ----
  updateLayer: (id: LayerId, patch: Partial<LayerState>) => void;
  setAllLayers: (patch: Partial<LayerState>) => void;

  // ---- オブジェクト ----
  addObject: (obj: BoardObject, select?: boolean) => void;
  updateObject: (id: string, patch: Partial<BoardObject>, mergeKey?: string) => void;
  updateObjects: (patches: { id: string; patch: Partial<BoardObject> }[], mergeKey?: string) => void;
  deleteObjects: (ids: string[]) => void;
  deleteSelection: () => void;
  copySelection: () => void;
  paste: (offset?: number) => void;
  duplicateSelection: () => void;
  reorder: (id: string, direction: 'front' | 'back' | 'forward' | 'backward') => void;
  nudgeSelection: (dx: number, dy: number) => void;

  // ---- 選択・ツール ----
  select: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  setTool: (tool: ToolId) => void;
  setToolPreset: (tool: ToolId, preset: string) => void;
  setViewport: (v: ViewportState) => void;
  setContinuousPlace: (v: boolean) => void;

  // ---- タイムライン ----
  addTimelineEntry: (partial?: Partial<TimelineEntry>, afterId?: string | null) => string;
  updateTimelineEntry: (id: string, patch: Partial<TimelineEntry>, mergeKey?: string) => void;
  removeTimelineEntry: (id: string) => void;
  moveTimelineEntry: (fromIndex: number, toIndex: number) => void;
  sortTimelineByTime: () => void;
  setActiveTimeline: (id: string | null) => void;

  // ---- 候補 ----
  addPreset: (cat: PresetCategory, name: string) => void;
  removePreset: (cat: PresetCategory, name: string) => void;
  setShowLabels: (v: boolean) => void;
}

function isEditable(doc: OperationDocument, obj: BoardObject): boolean {
  const layer = doc.layers[KIND_LAYER[obj.kind]];
  return layer.visible && !layer.locked && !obj.locked;
}

export function objectEditable(doc: OperationDocument, obj: BoardObject): boolean {
  return isEditable(doc, obj);
}

/** 時刻文字列の比較 (空は末尾) */
export function compareTime(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function initialState() {
  const doc = createDocument();
  return {
    doc,
    assets: {} as Record<string, Asset>,
    selection: [] as string[],
    tool: 'select' as ToolId,
    toolPresets: {},
    activeTimelineId: null,
    viewport: { ...doc.settings.viewport },
    past: [] as Snapshot[],
    future: [] as Snapshot[],
    lastMergeKey: null,
    lastCommitAt: 0,
    clipboard: [] as BoardObject[],
    saveStatus: 'new' as SaveStatus,
    lastSavedAt: null,
    notice: null,
    continuousPlace: false,
  };
}

export const useBoard = create<BoardState>()((set, get) => {
  /** アセットも含めて履歴に積む変更 */
  const commitFull = (
    fn: (s: Snapshot) => Snapshot,
    mergeKey?: string,
    extra?: Partial<BoardState>,
  ) => {
    const state = get();
    const now = Date.now();
    const prev: Snapshot = { doc: state.doc, assets: state.assets };
    const next = fn(prev);
    if (next.doc === prev.doc && next.assets === prev.assets) {
      if (extra) set(extra);
      return;
    }
    const merge = mergeKey != null && mergeKey === state.lastMergeKey && now - state.lastCommitAt < MERGE_WINDOW;
    const past = merge ? state.past : [...state.past, prev].slice(-HISTORY_LIMIT);
    set({
      doc: { ...next.doc, updatedAt: new Date().toISOString() },
      assets: next.assets,
      past,
      future: [],
      lastMergeKey: mergeKey ?? null,
      lastCommitAt: now,
      saveStatus: state.saveStatus === 'new' ? 'new' : 'dirty',
      ...extra,
    });
  };

  const commit = (fn: (doc: OperationDocument) => OperationDocument, mergeKey?: string) =>
    commitFull((s) => {
      const doc = fn(s.doc);
      return doc === s.doc ? s : { ...s, doc };
    }, mergeKey);

  const mapObjects = (
    doc: OperationDocument,
    fn: (o: BoardObject) => BoardObject,
  ): OperationDocument => {
    let changed = false;
    const objects = doc.objects.map((o) => {
      const n = fn(o);
      if (n !== o) changed = true;
      return n;
    });
    return changed ? { ...doc, objects } : doc;
  };

  const pruneSelection = (doc: OperationDocument, selection: string[]) => {
    const ids = new Set(doc.objects.map((o) => o.id));
    return selection.filter((id) => ids.has(id));
  };

  const cloneForPaste = (objs: BoardObject[], offset: number): BoardObject[] =>
    objs.map((o) => ({
      ...structuredClone(o),
      id: newId(),
      x: o.x + offset,
      y: o.y + offset,
    }));

  return {
    ...initialState(),

    commit,

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    undo: () => {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      set({
        doc: prev.doc,
        assets: prev.assets,
        past: s.past.slice(0, -1),
        future: [{ doc: s.doc, assets: s.assets }, ...s.future].slice(0, HISTORY_LIMIT),
        selection: pruneSelection(prev.doc, s.selection),
        lastMergeKey: null,
        saveStatus: 'dirty',
      });
    },

    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      set({
        doc: next.doc,
        assets: next.assets,
        past: [...s.past, { doc: s.doc, assets: s.assets }].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        selection: pruneSelection(next.doc, s.selection),
        lastMergeKey: null,
        saveStatus: 'dirty',
      });
    },

    loadDocument: (doc, assets, opts) => {
      const map: Record<string, Asset> = {};
      for (const a of assets) map[a.id] = a;
      set({
        ...initialState(),
        doc,
        assets: map,
        viewport: { ...doc.settings.viewport },
        saveStatus: opts?.saved ? 'saved' : 'dirty',
        lastSavedAt: opts?.saved ? doc.updatedAt : null,
        clipboard: get().clipboard,
        continuousPlace: get().continuousPlace,
      });
    },

    newDocument: () => set({ ...initialState(), clipboard: get().clipboard, continuousPlace: get().continuousPlace }),

    setMeta: (patch) => commit((d) => ({ ...d, meta: { ...d.meta, ...patch } }), `meta:${Object.keys(patch).join(',')}`),

    markSaved: (at) => set({ saveStatus: 'saved', lastSavedAt: at }),
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setNotice: (notice) => set({ notice }),

    setBackgroundImage: (asset, width, height) =>
      commitFull((s) => {
        const old = s.doc.background.assetId;
        const assets = { ...s.assets, [asset.id]: asset };
        if (old && old !== asset.id) delete assets[old];
        return {
          assets,
          doc: {
            ...s.doc,
            background: {
              ...s.doc.background,
              assetId: asset.id,
              name: asset.name,
              mime: asset.mime,
              naturalWidth: width,
              naturalHeight: height,
              x: 0,
              y: 0,
              scale: 1,
              rotation: 0,
              visible: true,
              locked: true,
            },
          },
        };
      }),

    updateBackground: (patch, mergeKey) =>
      commit((d) => ({ ...d, background: { ...d.background, ...patch } }), mergeKey),

    removeBackground: () =>
      commitFull((s) => {
        const id = s.doc.background.assetId;
        if (!id) return s;
        const assets = { ...s.assets };
        delete assets[id];
        return {
          assets,
          doc: {
            ...s.doc,
            background: { ...s.doc.background, assetId: null, name: '', mime: '', naturalWidth: 0, naturalHeight: 0 },
          },
        };
      }),

    updateLayer: (id, patch) => {
      commit((d) => ({ ...d, layers: { ...d.layers, [id]: { ...d.layers[id], ...patch } } }));
      if (patch.visible === false) {
        const s = get();
        set({
          selection: s.selection.filter((sid) => {
            const o = s.doc.objects.find((x) => x.id === sid);
            return o && KIND_LAYER[o.kind] !== id;
          }),
        });
      }
    },

    setAllLayers: (patch) =>
      commit((d) => {
        const layers = { ...d.layers };
        for (const l of LAYER_ORDER) layers[l.id] = { ...layers[l.id], ...patch };
        return { ...d, layers };
      }),

    addObject: (obj, select = true) => {
      commit((d) => ({ ...d, objects: [...d.objects, obj] }));
      if (select) set({ selection: [obj.id] });
    },

    updateObject: (id, patch, mergeKey) =>
      commit(
        (d) => mapObjects(d, (o) => (o.id === id ? ({ ...o, ...patch } as BoardObject) : o)),
        mergeKey ? `${id}:${mergeKey}` : undefined,
      ),

    updateObjects: (patches, mergeKey) => {
      const map = new Map(patches.map((p) => [p.id, p.patch]));
      commit((d) => mapObjects(d, (o) => (map.has(o.id) ? ({ ...o, ...map.get(o.id) } as BoardObject) : o)), mergeKey);
    },

    deleteObjects: (ids) => {
      const del = new Set(ids);
      commit((d) => {
        const objects = d.objects.filter((o) => !del.has(o.id) || !isEditable(d, o));
        if (objects.length === d.objects.length) return d;
        const remaining = new Set(objects.map((o) => o.id));
        const timeline = d.timeline.map((t) =>
          (t.locationId && !remaining.has(t.locationId)) || (t.routeId && !remaining.has(t.routeId))
            ? {
                ...t,
                locationId: t.locationId && remaining.has(t.locationId) ? t.locationId : null,
                routeId: t.routeId && remaining.has(t.routeId) ? t.routeId : null,
              }
            : t,
        );
        return { ...d, objects, timeline };
      });
      const s = get();
      set({ selection: pruneSelection(s.doc, s.selection) });
    },

    deleteSelection: () => get().deleteObjects(get().selection),

    copySelection: () => {
      const s = get();
      const sel = new Set(s.selection);
      const objs = s.doc.objects.filter((o) => sel.has(o.id));
      if (objs.length) set({ clipboard: structuredClone(objs), notice: `${objs.length} 件をコピーしました` });
    },

    paste: (offset = 24) => {
      const s = get();
      if (!s.clipboard.length) return;
      const clones = cloneForPaste(s.clipboard, offset);
      commit((d) => ({ ...d, objects: [...d.objects, ...clones] }));
      // 連続貼り付けでずらしていく
      set({
        selection: clones.map((c) => c.id),
        clipboard: s.clipboard.map((o) => ({ ...o, x: o.x + offset, y: o.y + offset })),
      });
    },

    duplicateSelection: () => {
      const s = get();
      const sel = new Set(s.selection);
      const objs = s.doc.objects.filter((o) => sel.has(o.id));
      if (!objs.length) return;
      const clones = cloneForPaste(objs, 24);
      commit((d) => ({ ...d, objects: [...d.objects, ...clones] }));
      set({ selection: clones.map((c) => c.id) });
    },

    reorder: (id, direction) =>
      commit((d) => {
        const objects = [...d.objects];
        const idx = objects.findIndex((o) => o.id === id);
        if (idx < 0) return d;
        const layer = KIND_LAYER[objects[idx].kind];
        // 同一レイヤー内のインデックス一覧
        const sameLayer = objects.map((o, i) => (KIND_LAYER[o.kind] === layer ? i : -1)).filter((i) => i >= 0);
        const pos = sameLayer.indexOf(idx);
        const targetPos =
          direction === 'front'
            ? sameLayer.length - 1
            : direction === 'back'
              ? 0
              : direction === 'forward'
                ? Math.min(sameLayer.length - 1, pos + 1)
                : Math.max(0, pos - 1);
        if (targetPos === pos) return d;
        const [item] = objects.splice(idx, 1);
        const without = sameLayer.filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i));
        let insertAt: number;
        if (targetPos >= without.length) insertAt = (without[without.length - 1] ?? -1) + 1;
        else insertAt = without[targetPos];
        objects.splice(insertAt, 0, item);
        return { ...d, objects };
      }),

    nudgeSelection: (dx, dy) => {
      const s = get();
      const sel = new Set(s.selection);
      commit(
        (d) => mapObjects(d, (o) => (sel.has(o.id) && isEditable(d, o) ? { ...o, x: o.x + dx, y: o.y + dy } : o)),
        'nudge',
      );
    },

    select: (ids) => set({ selection: ids }),
    toggleSelect: (id) => {
      const sel = get().selection;
      set({ selection: sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id] });
    },
    setTool: (tool) => set({ tool }),
    setToolPreset: (tool, preset) => set({ toolPresets: { ...get().toolPresets, [tool]: preset } }),
    setViewport: (viewport) => set({ viewport }),
    setContinuousPlace: (continuousPlace) => set({ continuousPlace }),

    addTimelineEntry: (partial, afterId) => {
      const entry = createTimelineEntry(partial);
      commit((d) => {
        const timeline = [...d.timeline];
        const idx = afterId ? timeline.findIndex((t) => t.id === afterId) : -1;
        if (idx >= 0) timeline.splice(idx + 1, 0, entry);
        else timeline.push(entry);
        return { ...d, timeline };
      });
      set({ activeTimelineId: entry.id });
      return entry.id;
    },

    updateTimelineEntry: (id, patch, mergeKey) =>
      commit(
        (d) => ({ ...d, timeline: d.timeline.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
        mergeKey ? `tl:${id}:${mergeKey}` : undefined,
      ),

    removeTimelineEntry: (id) => {
      commit((d) => ({ ...d, timeline: d.timeline.filter((t) => t.id !== id) }));
      if (get().activeTimelineId === id) set({ activeTimelineId: null });
    },

    moveTimelineEntry: (from, to) =>
      commit((d) => {
        if (from === to || from < 0 || from >= d.timeline.length) return d;
        const timeline = [...d.timeline];
        const [item] = timeline.splice(from, 1);
        timeline.splice(Math.max(0, Math.min(to, timeline.length)), 0, item);
        return { ...d, timeline };
      }),

    sortTimelineByTime: () =>
      commit((d) => {
        const timeline = d.timeline
          .map((t, i) => ({ t, i }))
          .sort((a, b) => compareTime(a.t.time, b.t.time) || a.i - b.i)
          .map((x) => x.t);
        const same = timeline.every((t, i) => t === d.timeline[i]);
        return same ? d : { ...d, timeline };
      }),

    setActiveTimeline: (activeTimelineId) => set({ activeTimelineId }),

    addPreset: (cat, name) => {
      const n = name.trim();
      if (!n) return;
      commit((d) => {
        if (d.settings.presets[cat].includes(n)) return d;
        return {
          ...d,
          settings: { ...d.settings, presets: { ...d.settings.presets, [cat]: [...d.settings.presets[cat], n] } },
        };
      });
    },

    removePreset: (cat, name) =>
      commit((d) => ({
        ...d,
        settings: {
          ...d.settings,
          presets: { ...d.settings.presets, [cat]: d.settings.presets[cat].filter((p) => p !== name) },
        },
      })),

    setShowLabels: (showLabels) => commit((d) => ({ ...d, settings: { ...d.settings, showLabels } })),
  };
});

/** 選択中オブジェクト */
export function selectedObjects(s: Pick<BoardState, 'doc' | 'selection'>): BoardObject[] {
  const sel = new Set(s.selection);
  return s.doc.objects.filter((o) => sel.has(o.id));
}

/** オブジェクトに関連する予定 */
export function relatedTimeline(doc: OperationDocument, obj: BoardObject): TimelineEntry[] {
  const name = 'name' in obj ? obj.name : '';
  return doc.timeline.filter(
    (t) => t.locationId === obj.id || t.routeId === obj.id || (!!name && !t.locationId && t.location.trim() === name.trim()),
  );
}

/** 予定に関連するオブジェクト ID */
export function timelineLinkedIds(doc: OperationDocument, entry: TimelineEntry): string[] {
  const ids: string[] = [];
  if (entry.locationId) ids.push(entry.locationId);
  if (entry.routeId) ids.push(entry.routeId);
  if (!entry.locationId && entry.location.trim()) {
    const loc = entry.location.trim();
    for (const o of doc.objects) if ('name' in o && o.name && o.name.trim() === loc) ids.push(o.id);
  }
  return ids;
}
