import Konva from 'konva';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Arrow,
  Circle,
  Ellipse,
  Group,
  Image as KImage,
  Label,
  Layer,
  Line,
  Rect,
  Stage,
  Tag,
  Text,
  Transformer,
} from 'react-konva';
import { KIND_LAYER, LAYER_ORDER } from '../model/definitions';
import { bakeScale, isNear, normalizePoints, objectBounds, rectFromPoints, simplifyPoints, unionRects, type Rect as R } from '../model/geometry';
import type { BoardObject, ObjectKind } from '../model/types';
import { createFromTool, loadSampleBackground, uploadBackgroundFile } from '../store/actions';
import { objectEditable, timelineLinkedIds, useBoard } from '../store/boardStore';
import { TOOLS, type ToolId } from '../store/tools';
import { BG_ID, canvasApi, clampScale, FONT_FAMILY, measureText, TOOL_DRAG_TYPE } from './canvasApi';
import { labelFor } from './labels';
import { ObjectVisual } from './ObjectVisual';

Konva.hitOnDragEnabled = true;
Konva.dragDistance = 3;

type Draft =
  | { type: 'rect'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'free'; points: number[] }
  | { type: 'poly'; points: number[]; cursor: [number, number] | null }
  | { type: 'marquee'; x1: number; y1: number; x2: number; y2: number; additive: boolean };

const POINT_KINDS = new Set(['route', 'arrow', 'line']);
const ICON_KINDS = new Set(['person', 'vehicle', 'facility', 'point', 'marker']);
const LINE_KINDS = new Set(['route', 'arrow', 'line', 'freehand']);

/** 名称ラベルの文字サイズ (画面上 px) */
const LABEL_FS = 11;
/** 重なったときに優先して残すラベル (小さいほど優先) */
const LABEL_PRIORITY: Record<ObjectKind, number> = {
  person: 1,
  vehicle: 1,
  facility: 2,
  point: 2,
  route: 3,
  crowd: 4,
  zone: 5,
  arrow: 6,
  line: 6,
  shape: 6,
  freehand: 6,
  marker: 9,
  memo: 9,
};

/** 画面上の見た目の大きさに応じて使いやすい縮尺バーの長さを選ぶ */
const NICE_METERS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
function scaleBar(pxPerMeter: number, scale: number): { meters: number; px: number } {
  const perM = pxPerMeter * scale;
  const meters = NICE_METERS.find((m) => m * perM >= 60) ?? NICE_METERS[NICE_METERS.length - 1];
  return { meters, px: meters * perM };
}

function rectsOverlap(a: R, b: R): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

/** 頂点編集対象か */
function hasVertexHandles(o: BoardObject): boolean {
  return POINT_KINDS.has(o.kind) || ((o.kind === 'crowd' || o.kind === 'zone') && o.shape === 'polygon');
}

function useHtmlImage(src: string | undefined): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!src) return;
    const image = new window.Image();
    let cancelled = false;
    image.onload = () => {
      if (!cancelled) setLoaded({ src, img: image });
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return src && loaded?.src === src ? loaded.img : null;
}

function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 800, height: 600 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function BoardCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const size = useElementSize(containerRef);

  const doc = useBoard((s) => s.doc);
  const assets = useBoard((s) => s.assets);
  const selection = useBoard((s) => s.selection);
  const tool = useBoard((s) => s.tool);
  const viewport = useBoard((s) => s.viewport);
  const activeTimelineId = useBoard((s) => s.activeTimelineId);
  const setViewport = useBoard((s) => s.setViewport);
  const select = useBoard((s) => s.select);
  const toggleSelect = useBoard((s) => s.toggleSelect);
  const updateObject = useBoard((s) => s.updateObject);
  const updateObjects = useBoard((s) => s.updateObjects);
  const updateBackground = useBoard((s) => s.updateBackground);

  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const setDraftBoth = useCallback((d: Draft | null) => {
    draftRef.current = d;
    canvasApi.drawing = d !== null;
    setDraft(d);
  }, []);

  const toolDef = TOOLS[tool];
  const mode = toolDef.mode;
  const bg = doc.background;
  const bgAsset = bg.assetId ? assets[bg.assetId] : undefined;
  const bgImage = useHtmlImage(bgAsset?.dataUrl);
  const scale = viewport.scale;
  // タッチ操作では頂点・変形ハンドルを大きくする
  const [coarse] = useState(isCoarsePointer);
  const handleR = (coarse ? 12 : 7) / scale;

  // ツール切り替えで描きかけを破棄
  useEffect(
    () =>
      useBoard.subscribe((s, prev) => {
        if (s.tool !== prev.tool) setDraftBoth(null);
      }),
    [setDraftBoth],
  );

  const objById = useMemo(() => new Map(doc.objects.map((o) => [o.id, o])), [doc.objects]);

  // ---------- ビューポート操作 ----------
  const contentBounds = useCallback((): R | null => {
    const s = useBoard.getState();
    const rects: R[] = s.doc.objects.map(objectBounds);
    const b = s.doc.background;
    if (b.assetId && b.visible) {
      rects.push({ x: b.x, y: b.y, width: b.naturalWidth * b.scale, height: b.naturalHeight * b.scale });
    }
    return unionRects(rects);
  }, []);

  const fitToContent = useCallback(() => {
    const b = contentBounds();
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!b || b.width <= 0 || b.height <= 0) {
      setViewport({ x: w / 2 - (b?.x ?? 0), y: h / 2 - (b?.y ?? 0), scale: 1 });
      return;
    }
    const pad = 32;
    const s = clampScale(Math.min((w - pad * 2) / b.width, (h - pad * 2) / b.height));
    setViewport({ x: (w - b.width * s) / 2 - b.x * s, y: (h - b.height * s) / 2 - b.y * s, scale: s });
  }, [contentBounds, setViewport]);

  const zoomAt = useCallback(
    (factor: number, center?: { x: number; y: number }) => {
      const v = useBoard.getState().viewport;
      const el = containerRef.current;
      const c = center ?? { x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2 };
      const ns = clampScale(v.scale * factor);
      const bx = (c.x - v.x) / v.scale;
      const by = (c.y - v.y) / v.scale;
      setViewport({ scale: ns, x: c.x - bx * ns, y: c.y - by * ns });
    },
    [setViewport],
  );

  const revealRect = useCallback(
    (r: R) => {
      const el = containerRef.current;
      if (!el) return;
      const v = useBoard.getState().viewport;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const margin = 40;
      const left = r.x * v.scale + v.x;
      const top = r.y * v.scale + v.y;
      const right = left + r.width * v.scale;
      const bottom = top + r.height * v.scale;
      if (left >= margin && top >= margin && right <= w - margin && bottom <= h - margin) return;
      let s = v.scale;
      if (r.width * s > w - margin * 2 || r.height * s > h - margin * 2) {
        s = clampScale(Math.min((w - margin * 2) / Math.max(r.width, 1), (h - margin * 2) / Math.max(r.height, 1)));
      }
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      setViewport({ scale: s, x: w / 2 - cx * s, y: h / 2 - cy * s });
    },
    [setViewport],
  );

  useEffect(() => {
    canvasApi.stage = stageRef.current;
    canvasApi.fitToContent = fitToContent;
    canvasApi.revealRect = revealRect;
    canvasApi.zoomBy = (f) => zoomAt(f);
    canvasApi.resetZoom = () => zoomAt(1 / useBoard.getState().viewport.scale);
    return () => {
      canvasApi.stage = null;
    };
  }, [fitToContent, revealRect, zoomAt]);

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    if (e.evt.shiftKey && !e.evt.ctrlKey) {
      const v = useBoard.getState().viewport;
      setViewport({ ...v, x: v.x - (e.evt.deltaX || e.evt.deltaY), y: v.y });
      return;
    }
    const intensity = e.evt.ctrlKey ? 0.01 : 0.0015;
    const factor = Math.exp(-e.evt.deltaY * intensity);
    zoomAt(factor, pointer);
  };

  // ---------- ピンチ操作 ----------
  const pinchRef = useRef<{ dist: number; center: { x: number; y: number } } | null>(null);

  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    if (stage.isDragging()) stage.stopDrag();
    for (const id of useBoard.getState().selection) {
      const n = stage.findOne(`#${id}`);
      if (n?.isDragging()) n.stopDrag();
    }
    const rect = stage.container().getBoundingClientRect();
    const p1 = { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top };
    const p2 = { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top };
    const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const d = draftRef.current;
    if (d && d.type !== 'poly') setDraftBoth(null);
    const prev = pinchRef.current;
    pinchRef.current = { dist, center };
    if (!prev) return;
    const v = useBoard.getState().viewport;
    const ns = clampScale(v.scale * (dist / prev.dist));
    const bx = (prev.center.x - v.x) / v.scale;
    const by = (prev.center.y - v.y) / v.scale;
    setViewport({ scale: ns, x: center.x - bx * ns, y: center.y - by * ns });
  };

  const onTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) pinchRef.current = null;
  };

  // Konva 経由の touchend が届かない場合もあるため、ネイティブイベントでもピンチ状態を解除する
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const reset = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };
    el.addEventListener('touchend', reset);
    el.addEventListener('touchcancel', reset);
    return () => {
      el.removeEventListener('touchend', reset);
      el.removeEventListener('touchcancel', reset);
    };
  }, []);

  // ---------- ポインタ操作 (描画ツール) ----------
  const downRef = useRef<{ x: number; y: number } | null>(null);

  const boardPos = (): { x: number; y: number } | null => stageRef.current?.getRelativePointerPosition() ?? null;

  const finishRect = (d: Extract<Draft, { type: 'rect' }>) => {
    const r = rectFromPoints(d.x1, d.y1, d.x2, d.y2);
    const small = r.width < 8 / scale || r.height < 8 / scale;
    if (small) {
      // タップのみ: 既定サイズで中心配置
      const w = toolDef.kind === 'shape' ? 120 : 200;
      const h = toolDef.kind === 'shape' ? 80 : 120;
      createFromTool(tool, { x: d.x1 - w / 2, y: d.y1 - h / 2, width: w, height: h });
    } else {
      createFromTool(tool, { x: r.x, y: r.y, width: r.width, height: r.height });
    }
  };

  const finishMarquee = (d: Extract<Draft, { type: 'marquee' }>) => {
    const r = rectFromPoints(d.x1, d.y1, d.x2, d.y2);
    if (r.width < 4 / scale && r.height < 4 / scale) return;
    const s = useBoard.getState();
    const hits = s.doc.objects
      .filter((o) => s.doc.layers[KIND_LAYER[o.kind]].visible)
      .filter((o) => {
        const b = objectBounds(o);
        return b.x >= r.x && b.y >= r.y && b.x + b.width <= r.x + r.width && b.y + b.height <= r.y + r.height;
      })
      .map((o) => o.id);
    const base = d.additive ? s.selection.filter((id) => id !== BG_ID) : [];
    select([...new Set([...base, ...hits])]);
  };

  const finishLine = (d: Extract<Draft, { type: 'line' }>) => {
    let { x2, y2 } = d;
    if (isNear(d.x1, d.y1, x2, y2, 8 / scale)) {
      x2 = d.x1 + 120;
      y2 = d.y1;
    }
    const n = normalizePoints([d.x1, d.y1, x2, y2]);
    createFromTool(tool, n);
  };

  const finishPoly = useCallback(() => {
    const d = draftRef.current;
    if (!d || d.type !== 'poly') return;
    // ダブルクリックで生じる重複点を除去
    const pts: number[] = [];
    const tol = 4 / useBoard.getState().viewport.scale;
    for (let i = 0; i + 1 < d.points.length; i += 2) {
      const n = pts.length;
      if (n >= 2 && isNear(pts[n - 2], pts[n - 1], d.points[i], d.points[i + 1], tol)) continue;
      pts.push(d.points[i], d.points[i + 1]);
    }
    const isPolygon = TOOLS[useBoard.getState().tool].shape === 'polygon';
    const minPts = isPolygon ? 3 : 2;
    if (pts.length / 2 < minPts) {
      useBoard.getState().setNotice(isPolygon ? '多角形は3点以上指定してください。' : 'ルートは2点以上指定してください。');
      return;
    }
    setDraftBoth(null);
    createFromTool(useBoard.getState().tool, normalizePoints(pts));
  }, [setDraftBoth]);

  const undoPolyPoint = useCallback(() => {
    const d = draftRef.current;
    if (!d || d.type !== 'poly') return;
    if (d.points.length <= 2) setDraftBoth(null);
    else setDraftBoth({ ...d, points: d.points.slice(0, -2) });
  }, [setDraftBoth]);

  // 描画中のキー操作
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = draftRef.current;
      if (!d) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setDraftBoth(null);
      } else if (e.key === 'Enter' && d.type === 'poly') {
        e.preventDefault();
        finishPoly();
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && d.type === 'poly') {
        e.preventDefault();
        undoPolyPoint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finishPoly, undoPolyPoint, setDraftBoth]);

  const isMultiTouch = (e: Konva.KonvaEventObject<PointerEvent>) =>
    e.evt.pointerType === 'touch' && (pinchRef.current !== null || !e.evt.isPrimary);

  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    // 1本目の指が触れた = 新しい操作の開始
    if (e.evt.pointerType === 'touch' && e.evt.isPrimary) pinchRef.current = null;
    downRef.current = { x: e.evt.clientX, y: e.evt.clientY };
    if (isMultiTouch(e) || e.evt.button > 0) return;
    const p = boardPos();
    if (!p) return;
    const stage = stageRef.current;
    // Shift + 空白ドラッグで範囲選択
    if (mode === 'select' && stage && e.target === stage && e.evt.shiftKey) {
      stage.draggable(false);
      setDraftBoth({ type: 'marquee', x1: p.x, y1: p.y, x2: p.x, y2: p.y, additive: true });
      return;
    }
    if (mode === 'drag-rect') setDraftBoth({ type: 'rect', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    else if (mode === 'drag-line') setDraftBoth({ type: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    else if (mode === 'freehand') setDraftBoth({ type: 'free', points: [p.x, p.y] });
  };

  const onPointerMove = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const d = draftRef.current;
    if (!d || isMultiTouch(e)) return;
    const p = boardPos();
    if (!p) return;
    if (d.type === 'rect' || d.type === 'line' || d.type === 'marquee') setDraftBoth({ ...d, x2: p.x, y2: p.y });
    else if (d.type === 'free') setDraftBoth({ ...d, points: [...d.points, p.x, p.y] });
    else if (d.type === 'poly') setDraftBoth({ ...d, cursor: [p.x, p.y] });
  };

  /** ポインタ位置にある配置オブジェクトの ID */
  const objectIdAtPointer = (): string | null => {
    const stage = stageRef.current;
    const pos = stage?.getPointerPosition();
    if (!stage || !pos) return null;
    let node: Konva.Node | null = stage.getIntersection(pos);
    while (node && node !== stage) {
      if (objById.has(node.id())) return node.id();
      node = node.getParent();
    }
    return null;
  };

  const onPointerUp = (e: Konva.KonvaEventObject<PointerEvent>) => {
    // タッチでの選択は指を離した位置で判定する (Konva の tap はピンチ直後などに取りこぼすため)
    if (e.evt.pointerType === 'touch' && mode === 'select' && !movedSinceDown(e) && !pinchRef.current) {
      const id = objectIdAtPointer();
      if (id && !useBoard.getState().selection.includes(id)) select([id]);
    }
    const d = draftRef.current;
    if (!d || d.type === 'poly') return;
    setDraftBoth(null);
    if (d.type === 'marquee') {
      stageRef.current?.draggable(stageDraggable);
      finishMarquee(d);
      return;
    }
    if (d.type === 'rect') finishRect(d);
    else if (d.type === 'line') finishLine(d);
    else if (d.type === 'free') {
      const pts = simplifyPoints(d.points, 2 / scale);
      if (pts.length >= 4) createFromTool(tool, normalizePoints(pts));
    }
  };

  const movedSinceDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent | PointerEvent>) => {
    const d = downRef.current;
    if (!d) return false;
    const ev = e.evt as MouseEvent & TouchEvent;
    const cx = ev.clientX ?? ev.changedTouches?.[0]?.clientX ?? d.x;
    const cy = ev.clientY ?? ev.changedTouches?.[0]?.clientY ?? d.y;
    return Math.hypot(cx - d.x, cy - d.y) > 6;
  };

  // タッチ後にブラウザが発生させる互換マウスイベントで二重に処理しないための記録
  const lastTouchAt = useRef(0);

  const onStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent | PointerEvent>) => {
    if (e.evt.type.startsWith('touch')) lastTouchAt.current = Date.now();
    else if (Date.now() - lastTouchAt.current < 800) return;
    if (movedSinceDown(e) || pinchRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    if (mode === 'place') {
      const p = boardPos();
      if (p) createFromTool(tool, { x: p.x, y: p.y });
      return;
    }
    if (mode === 'polyline') {
      const p = boardPos();
      if (!p) return;
      const d = draftRef.current;
      if (d && d.type === 'poly') {
        // 多角形は始点付近をクリックで閉じる
        if (toolDef.shape === 'polygon' && d.points.length >= 6 && isNear(d.points[0], d.points[1], p.x, p.y, 10 / scale)) {
          finishPoly();
          return;
        }
        setDraftBoth({ ...d, points: [...d.points, p.x, p.y] });
      } else {
        setDraftBoth({ type: 'poly', points: [p.x, p.y], cursor: null });
      }
      return;
    }
    if (mode === 'select' && e.target === stage && !objectIdAtPointer()) select([]);
  };

  const onStageDblClick = () => {
    if (mode !== 'polyline') return;
    // Konva は位置に関係なく短時間の 2 クリックをダブルクリックとみなすため、
    // 直前の 2 点がほぼ同じ位置 (＝同じ場所でのダブルクリック) のときだけ確定する
    const d = draftRef.current;
    if (!d || d.type !== 'poly') return;
    const n = d.points.length;
    if (n >= 4 && isNear(d.points[n - 4], d.points[n - 3], d.points[n - 2], d.points[n - 1], 6 / scale)) finishPoly();
  };

  // ---------- ステージ (パン) ----------
  // ルート・多角形の入力中もドラッグで画面移動できる (タップ/クリックで点を追加)
  const stageDraggable = mode === 'select' || mode === 'pan' || mode === 'place' || mode === 'polyline';

  const onStageDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = stageRef.current;
    if (!stage || e.target !== stage) return;
    setViewport({ x: stage.x(), y: stage.y(), scale: stage.scaleX() });
  };

  // ---------- 名称ラベル ----------
  const labelMode = doc.settings.labelMode;
  const { labels, labelOffsets } = useMemo(() => {
    const list: { id: string; x: number; y: number; w: number; text: string; color: string }[] = [];
    const offsets = new Map<string, { ox: number; oy: number }>();
    if (labelMode === 'none') return { labels: list, labelOffsets: offsets };
    const selSet = new Set(selection);
    const candidates: { o: BoardObject; text: string; ox: number; oy: number; color: string; selected: boolean }[] = [];
    for (const o of doc.objects) {
      if (!doc.layers[KIND_LAYER[o.kind]].visible) continue;
      const selected = selSet.has(o.id);
      if (labelMode === 'selected' && !selected) continue;
      const l = labelFor(o);
      if (!l || !l.text) continue;
      if (labelMode === 'auto' && !selected) {
        // 縮小して対象が小さく見えるときは名前を出さない
        const b = objectBounds(o);
        const onScreen = Math.max(b.width, b.height) * scale;
        if (onScreen < (ICON_KINDS.has(o.kind) ? 9 : 48)) continue;
      }
      candidates.push({ o, ...l, selected });
    }
    candidates.sort((a, b) => Number(b.selected) - Number(a.selected) || LABEL_PRIORITY[a.o.kind] - LABEL_PRIORITY[b.o.kind]);
    const placed: R[] = [];
    const h = (LABEL_FS * 1.25 + 4) / scale;
    for (const c of candidates) {
      const w = (measureText(c.text, LABEL_FS) + 8) / scale;
      const x = c.o.x + c.ox;
      const y = c.o.y + c.oy;
      const rect = { x: x - w / 2, y, width: w, height: h };
      // 自動表示では重なる名前を省略
      if (labelMode === 'auto' && !c.selected && placed.some((p) => rectsOverlap(p, rect))) continue;
      placed.push(rect);
      offsets.set(c.o.id, { ox: c.ox, oy: c.oy });
      list.push({ id: c.o.id, x, y, w, text: c.text, color: c.color });
    }
    return { labels: list, labelOffsets: offsets };
  }, [doc.objects, doc.layers, labelMode, selection, scale]);

  // ---------- オブジェクトのドラッグ ----------
  const dragStart = useRef<Map<string, { x: number; y: number }>>(new Map());
  const moveLabel = (id: string, x: number, y: number) => {
    const stage = stageRef.current;
    const off = labelOffsets.get(id);
    if (!stage || !off) return;
    stage.findOne(`#lbl-${id}`)?.position({ x: x + off.ox, y: y + off.oy });
  };

  const onObjPointerDown = (obj: BoardObject, e: Konva.KonvaEventObject<PointerEvent>) => {
    if (mode !== 'select') return;
    if (e.evt.pointerType === 'touch') {
      // タッチでは未選択のオブジェクトは動かさず、画面移動を優先する (選択はタップで行う)
      if (!useBoard.getState().selection.includes(obj.id)) {
        const node = e.currentTarget;
        const was = node.draggable();
        node.draggable(false);
        const restore = () => {
          node.draggable(was);
          window.removeEventListener('pointerup', restore);
          window.removeEventListener('pointercancel', restore);
        };
        window.addEventListener('pointerup', restore);
        window.addEventListener('pointercancel', restore);
      }
      return;
    }
    if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) {
      toggleSelect(obj.id);
      return;
    }
    if (!useBoard.getState().selection.includes(obj.id)) select([obj.id]);
  };

  const onObjDragStart = (obj: BoardObject) => {
    const s = useBoard.getState();
    const ids = s.selection.includes(obj.id) ? s.selection : [obj.id];
    const m = new Map<string, { x: number; y: number }>();
    for (const id of ids) {
      const o = objById.get(id);
      if (o && objectEditable(s.doc, o)) m.set(id, { x: o.x, y: o.y });
    }
    dragStart.current = m;
  };

  const onObjDragMove = (obj: BoardObject, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const start = dragStart.current.get(obj.id);
    if (!start) return;
    const dx = node.x() - start.x;
    const dy = node.y() - start.y;
    const stage = stageRef.current;
    for (const [id, p] of dragStart.current) {
      if (id !== obj.id) stage?.findOne(`#${id}`)?.position({ x: p.x + dx, y: p.y + dy });
      moveLabel(id, p.x + dx, p.y + dy);
    }
  };

  const onObjDragEnd = (obj: BoardObject, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    const start = dragStart.current.get(obj.id);
    if (!start) return;
    const dx = node.x() - start.x;
    const dy = node.y() - start.y;
    updateObjects([...dragStart.current].map(([id, p]) => ({ id, patch: { x: p.x + dx, y: p.y + dy } })));
    dragStart.current = new Map();
  };

  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const editingMemo = editingMemoId ? objById.get(editingMemoId) : undefined;

  const onObjDblClick = (obj: BoardObject) => {
    if (obj.kind !== 'memo' || mode !== 'select') return;
    if (objectEditable(useBoard.getState().doc, obj)) {
      setEditingMemoId(obj.id);
      return;
    }
    const el = document.getElementById('prop-memo-text') as HTMLTextAreaElement | null;
    el?.focus();
  };

  // ---------- Transformer ----------
  const transformable = useMemo(() => {
    if (mode !== 'select') return [] as string[];
    return selection.filter((id) => {
      if (id === BG_ID) return bgAsset && bg.visible && !bg.locked;
      const o = objById.get(id);
      return o && objectEditable(doc, o) && !hasVertexHandles(o);
    });
  }, [selection, objById, doc, mode, bgAsset, bg.visible, bg.locked]);

  const trConfig = useMemo(() => {
    const objs = transformable.map((id) => objById.get(id)).filter((o): o is BoardObject => !!o);
    const allIcons = objs.length > 0 && objs.every((o) => ICON_KINDS.has(o.kind));
    const isBg = transformable.includes(BG_ID);
    const keepRatio = allIcons || isBg;
    return {
      keepRatio,
      enabledAnchors: keepRatio
        ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
        : ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right'],
    };
  }, [transformable, objById]);

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const nodes = transformable.map((id) => stage.findOne(`#${id}`)).filter((n): n is Konva.Node => !!n);
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [transformable, doc.objects, bgImage]);

  const onTransformEnd = () => {
    const tr = trRef.current;
    if (!tr) return;
    const patches: { id: string; patch: Partial<BoardObject> }[] = [];
    for (const node of tr.nodes()) {
      const id = node.id();
      if (id === BG_ID) {
        updateBackground({ x: node.x(), y: node.y(), scale: Math.abs(node.scaleX()), rotation: node.rotation() });
        continue;
      }
      const o = objById.get(id);
      if (!o) continue;
      const sx = node.scaleX();
      const sy = node.scaleY();
      node.scale({ x: 1, y: 1 });
      patches.push({
        id,
        patch: { ...bakeScale(o, sx, sy), x: node.x(), y: node.y(), rotation: Math.round(node.rotation() * 10) / 10 } as Partial<BoardObject>,
      });
    }
    if (patches.length) updateObjects(patches);
  };

  // ---------- 頂点ハンドル ----------
  const vertexTarget = useMemo(() => {
    if (mode !== 'select' || selection.length !== 1) return null;
    const o = objById.get(selection[0]);
    if (!o || !hasVertexHandles(o) || !objectEditable(doc, o)) return null;
    return o as Extract<BoardObject, { points: number[] }>;
  }, [mode, selection, objById, doc]);
  const vertexDragKey = useRef('');

  const setVertex = (o: Extract<BoardObject, { points: number[] }>, index: number, x: number, y: number) => {
    const pts = [...o.points];
    pts[index * 2] = x;
    pts[index * 2 + 1] = y;
    updateObject(o.id, { points: pts }, vertexDragKey.current);
  };

  const insertVertex = (o: Extract<BoardObject, { points: number[] }>, afterIndex: number, x: number, y: number) => {
    const pts = [...o.points];
    pts.splice((afterIndex + 1) * 2, 0, x, y);
    updateObject(o.id, { points: pts });
  };

  const removeVertex = (o: Extract<BoardObject, { points: number[] }>, index: number) => {
    const min = o.kind === 'route' ? 2 : o.kind === 'arrow' || o.kind === 'line' ? 2 : 3;
    if (o.points.length / 2 <= min) return;
    const pts = [...o.points];
    pts.splice(index * 2, 2);
    updateObject(o.id, { points: pts });
  };

  // ---------- 背景 ----------
  const bgInteractive = mode === 'select' && !!bgAsset && bg.visible && !bg.locked;

  // ---------- タイムライン強調 ----------
  const highlight = useMemo(() => {
    if (!activeTimelineId) return null;
    const entry = doc.timeline.find((t) => t.id === activeTimelineId);
    if (!entry) return null;
    const objs = timelineLinkedIds(doc, entry)
      .map((id) => objById.get(id))
      .filter((o): o is BoardObject => !!o && doc.layers[KIND_LAYER[o.kind]].visible);
    if (!objs.length) return null;
    const title = [entry.time, entry.action].filter(Boolean).join(' ');
    // 見出しは場所 (ルート以外) を優先、ルートは始点に付ける
    const first = objs.find((o) => !LINE_KINDS.has(o.kind)) ?? objs[0];
    let anchor: { x: number; y: number };
    if ('points' in first && LINE_KINDS.has(first.kind) && first.points.length >= 2) {
      const r = (first.rotation * Math.PI) / 180;
      const [px, py] = [first.points[0], first.points[1]];
      anchor = { x: first.x + px * Math.cos(r) - py * Math.sin(r), y: first.y + px * Math.sin(r) + py * Math.cos(r) };
    } else {
      const b = objectBounds(first);
      anchor = { x: b.x, y: b.y };
    }
    return { objs, rects: objs.map(objectBounds), title, anchor };
  }, [activeTimelineId, doc, objById]);

  useEffect(() => {
    if (!highlight) return;
    const u = unionRects(highlight.rects);
    if (u) revealRect({ x: u.x - 20, y: u.y - 20, width: u.width + 40, height: u.height + 40 });
    // 予定を選び直したときのみ移動
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTimelineId]);

  // ---------- 外部ドロップ ----------
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(TOOL_DRAG_TYPE) || e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (file.name.toLowerCase().endsWith('.json')) {
        useBoard.getState().setNotice('作戦データは上部の「開く」から読み込んでください。');
        return;
      }
      const hasBg = !!useBoard.getState().doc.background.assetId;
      if (!hasBg || window.confirm('背景画像を置き換えますか？')) void uploadBackgroundFile(file);
      return;
    }
    const t = e.dataTransfer.getData(TOOL_DRAG_TYPE) as ToolId;
    const def = TOOLS[t];
    if (!def?.kind) return;
    stage.setPointersPositions(e.nativeEvent);
    const p = stage.getRelativePointerPosition();
    if (!p) return;
    if (def.mode === 'place') createFromTool(t, { x: p.x, y: p.y });
    else if (def.mode === 'drag-rect') {
      const w = def.kind === 'shape' ? 120 : 200;
      const h = def.kind === 'shape' ? 80 : 120;
      createFromTool(t, { x: p.x - w / 2, y: p.y - h / 2, width: w, height: h });
    } else if (def.mode === 'drag-line') createFromTool(t, { x: p.x - 60, y: p.y, points: [0, 0, 120, 0] });
    else if (def.mode === 'polyline') {
      if (def.shape === 'polygon') createFromTool(t, { x: p.x, y: p.y - 60, points: [0, 0, 80, 100, -80, 100] });
      else createFromTool(t, { x: p.x - 80, y: p.y, points: [0, 0, 80, -30, 160, 0] });
    }
  };

  // ---------- 描画 ----------
  const objectsListening = mode === 'select';


  // ロック等で Transformer が付かない選択オブジェクトの枠 (頂点ハンドルが出ているものは不要)
  const plainSelected = selection
    .filter((id) => id !== BG_ID && !transformable.includes(id) && id !== vertexTarget?.id)
    .map((id) => objById.get(id))
    .filter((o): o is BoardObject => !!o && doc.layers[KIND_LAYER[o.kind]].visible);

  const gridSize = 50 * scale;
  const hint = draft?.type === 'poly' ? `${toolDef.hint}（${draft.points.length / 2} 点）` : toolDef.hint;
  const isEmpty = !bgAsset && doc.objects.length === 0;

  return (
    <div
      className={`board-canvas mode-${mode}`}
      ref={containerRef}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
      data-testid="board-canvas"
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={scale}
        scaleY={scale}
        draggable={stageDraggable}
        onDragEnd={onStageDragEnd}
        onWheel={onWheel}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onStageClick}
        onTap={onStageClick}
        onDblClick={onStageDblClick}
        onDblTap={onStageDblClick}
      >
        {/* 背景レイヤー */}
        <Layer listening={bgInteractive}>
          {bgImage && bg.visible && (
            <KImage
              id={BG_ID}
              image={bgImage}
              x={bg.x}
              y={bg.y}
              width={bg.naturalWidth}
              height={bg.naturalHeight}
              scaleX={bg.scale}
              scaleY={bg.scale}
              rotation={bg.rotation}
              opacity={bg.opacity}
              draggable={bgInteractive}
              onPointerDown={() => bgInteractive && select([BG_ID])}
              onDragEnd={(e) => updateBackground({ x: e.target.x(), y: e.target.y() })}
            />
          )}
        </Layer>

        {/* 配置オブジェクト */}
        <Layer listening={objectsListening}>
          {LAYER_ORDER.map((layer) => {
            const ls = doc.layers[layer.id];
            if (!ls.visible) return null;
            return (
              <Group key={layer.id} name={`layer-${layer.id}`}>
                {doc.objects
                  .filter((o) => KIND_LAYER[o.kind] === layer.id)
                  .map((o) => {
                    const editable = !ls.locked && !o.locked;
                    return (
                      <Group
                        key={o.id}
                        id={o.id}
                        x={o.x}
                        y={o.y}
                        rotation={o.rotation}
                        draggable={editable && mode === 'select'}
                        onPointerDown={(e) => onObjPointerDown(o, e)}
                        onDragStart={() => onObjDragStart(o)}
                        onDragMove={(e) => onObjDragMove(o, e)}
                        onDragEnd={(e) => onObjDragEnd(o, e)}
                        onDblClick={() => onObjDblClick(o)}
                        onDblTap={() => onObjDblClick(o)}
                      >
                        <ObjectVisual obj={o} scale={scale} />
                      </Group>
                    );
                  })}
              </Group>
            );
          })}
        </Layer>

        {/* 名称ラベル */}
        <Layer listening={false}>
          <Group>
            {labels.map((l) => (
              // 画面上で一定の小さめの文字サイズ
              <Label key={l.id} id={`lbl-${l.id}`} x={l.x} y={l.y} offsetX={l.w / 2}>
                <Tag fill="rgba(255,255,255,0.78)" stroke={l.color} strokeWidth={0.8 / scale} cornerRadius={2 / scale} />
                <Text text={l.text} fontSize={LABEL_FS / scale} fontFamily={FONT_FAMILY} fill="#1a1a1a" padding={2 / scale} />
              </Label>
            ))}
          </Group>
        </Layer>

        {/* 操作用 UI (書き出し時は非表示) */}
        <Layer name="ui-layer">
          {highlight && (
            <Group listening={false}>
              {highlight.objs.map((o) => (
                <HighlightShape key={o.id} obj={o} scale={scale} />
              ))}
              {highlight.title && (
                <Label x={highlight.anchor.x} y={highlight.anchor.y - 8 / scale} offsetY={22 / scale}>
                  <Tag fill="#ff6d00" cornerRadius={3 / scale} />
                  <Text text={highlight.title} fontSize={12 / scale} fill="#fff" padding={4 / scale} fontStyle="bold" fontFamily={FONT_FAMILY} />
                </Label>
              )}
            </Group>
          )}

          {plainSelected.map((o) => {
            const b = objectBounds(o);
            const locked = !objectEditable(doc, o);
            return (
              <Rect
                key={`sel-${o.id}`}
                x={b.x - 6 / scale}
                y={b.y - 6 / scale}
                width={b.width + 12 / scale}
                height={b.height + 12 / scale}
                stroke={locked ? '#9e9e9e' : '#1e88e5'}
                strokeWidth={1.5 / scale}
                dash={[5 / scale, 4 / scale]}
                listening={false}
              />
            );
          })}

          <Transformer
            ref={trRef}
            rotateEnabled
            keepRatio={trConfig.keepRatio}
            enabledAnchors={trConfig.enabledAnchors}
            anchorSize={coarse ? 20 : 10}
            rotateAnchorOffset={coarse ? 36 : 24}
            padding={coarse ? 6 : 2}
            anchorCornerRadius={2}
            borderStroke="#1e88e5"
            anchorStroke="#1e88e5"
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            rotationSnapTolerance={4}
            ignoreStroke
            flipEnabled={false}
            boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8 ? oldBox : newBox)}
            onTransformEnd={onTransformEnd}
          />

          {vertexTarget && (
            <Group x={vertexTarget.x} y={vertexTarget.y} rotation={vertexTarget.rotation}>
              {/* 中間点 (ダブルクリックで点を追加) */}
              {(vertexTarget.kind === 'route' || vertexTarget.kind === 'crowd' || vertexTarget.kind === 'zone') &&
                midpoints(vertexTarget.points, vertexTarget.kind !== 'route').map(([mx, my, i]) => (
                  <Rect
                    key={`m-${i}`}
                    x={mx - handleR * 0.6}
                    y={my - handleR * 0.6}
                    width={handleR * 1.2}
                    height={handleR * 1.2}
                    fill="#1e88e5"
                    opacity={0.7}
                    hitStrokeWidth={(coarse ? 18 : 10) / scale}
                    onClick={() => insertVertex(vertexTarget, i, mx, my)}
                    onTap={() => insertVertex(vertexTarget, i, mx, my)}
                  />
                ))}
              {pointPairs(vertexTarget.points).map(([px, py], i) => (
                <Circle
                  key={`v-${i}`}
                  x={px}
                  y={py}
                  radius={handleR}
                  fill="#fff"
                  stroke="#1e88e5"
                  strokeWidth={2 / scale}
                  hitStrokeWidth={(coarse ? 16 : 10) / scale}
                  draggable
                  onDragStart={(e) => {
                    e.cancelBubble = true;
                    vertexDragKey.current = `vtx-${Date.now()}`;
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true;
                    setVertex(vertexTarget, i, e.target.x(), e.target.y());
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true;
                  }}
                  onDblClick={() => removeVertex(vertexTarget, i)}
                  onDblTap={() => removeVertex(vertexTarget, i)}
                />
              ))}
            </Group>
          )}

          {draft && <DraftPreview draft={draft} scale={scale} toolId={tool} />}
        </Layer>
      </Stage>

      {editingMemo?.kind === 'memo' && (
        <MemoEditor
          key={editingMemo.id}
          memo={editingMemo}
          viewport={viewport}
          onCommit={(text) => {
            if (text !== editingMemo.text) updateObject(editingMemo.id, { text });
            setEditingMemoId(null);
          }}
          onCancel={() => setEditingMemoId(null)}
        />
      )}

      {isEmpty && (
        <div className="empty-board">
          <div className="empty-card">
            <h2>作戦ボードを始める</h2>
            <p>航空写真・地図・平面図・会場図などの画像（PNG / JPG / SVG）を背景として読み込み、その上に人物・車両・ルートなどを配置します。</p>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>
              背景画像をアップロード
            </button>
            <button className="btn" onClick={() => void loadSampleBackground()}>
              サンプル背景（架空の会場図）で試す
            </button>
            <p className="muted">画像ファイルをここへドラッグ＆ドロップしても読み込めます。背景なしで左のツールから配置を始めることもできます。</p>
            <p className="muted small">※ 架空のシナリオを前提とした計画作成用ツールです。</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadBackgroundFile(f);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {draft?.type === 'poly' && (
        <div className="draw-actions">
          <span>{draft.points.length / 2} 点</span>
          <button className="btn primary small" onClick={finishPoly}>
            確定
          </button>
          <button className="btn small" onClick={undoPolyPoint}>
            1点戻す
          </button>
          <button className="btn small" onClick={() => setDraftBoth(null)}>
            取消
          </button>
        </div>
      )}

      {(() => {
        const bar = scaleBar(doc.settings.pxPerMeter, scale);
        return (
          <div className="scale-bar" title="縮尺（背景タブで設定）" aria-label={`縮尺 ${bar.meters}m`}>
            <div className="scale-bar-line" style={{ width: bar.px }} />
            <span>{bar.meters >= 1000 ? `${bar.meters / 1000}km` : `${bar.meters}m`}</span>
          </div>
        );
      })()}

      <div className="canvas-hint" aria-live="polite">
        <strong>{toolDef.label}</strong>
        <span>{hint}</span>
      </div>

      <div className="zoom-controls">
        <button className="btn icon" title="縮小" aria-label="縮小" onClick={() => zoomAt(1 / 1.25)}>
          −
        </button>
        <button className="btn zoom-value" title="100%表示" onClick={() => zoomAt(1 / scale)}>
          {Math.round(scale * 100)}%
        </button>
        <button className="btn icon" title="拡大" aria-label="拡大" onClick={() => zoomAt(1.25)}>
          ＋
        </button>
        <button className="btn" title="全体を表示" onClick={fitToContent}>
          全体
        </button>
      </div>
    </div>
  );
}

function pointPairs(points: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push([points[i], points[i + 1]]);
  return out;
}

function midpoints(points: number[], closed: boolean): [number, number, number][] {
  const pairs = pointPairs(points);
  const out: [number, number, number][] = [];
  for (let i = 0; i < pairs.length - 1; i++) {
    out.push([(pairs[i][0] + pairs[i + 1][0]) / 2, (pairs[i][1] + pairs[i + 1][1]) / 2, i]);
  }
  if (closed && pairs.length >= 3) {
    const a = pairs[pairs.length - 1];
    const b = pairs[0];
    out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pairs.length - 1]);
  }
  return out;
}

function DraftPreview({ draft, scale, toolId }: { draft: Draft; scale: number; toolId: ToolId }) {
  const def = TOOLS[toolId];
  const color = '#1e88e5';
  const sw = 2 / scale;
  const dash = [6 / scale, 4 / scale];
  if (draft.type === 'marquee') {
    const r = rectFromPoints(draft.x1, draft.y1, draft.x2, draft.y2);
    return <Rect {...r} stroke={color} strokeWidth={1 / scale} dash={[4 / scale, 3 / scale]} fill="rgba(30,136,229,0.08)" listening={false} />;
  }
  if (draft.type === 'rect') {
    const r = rectFromPoints(draft.x1, draft.y1, draft.x2, draft.y2);
    if (def.shape === 'ellipse')
      return (
        <Ellipse
          x={r.x + r.width / 2}
          y={r.y + r.height / 2}
          radiusX={r.width / 2}
          radiusY={r.height / 2}
          stroke={color}
          strokeWidth={sw}
          dash={dash}
          fill="rgba(30,136,229,0.1)"
          listening={false}
        />
      );
    return <Rect {...r} stroke={color} strokeWidth={sw} dash={dash} fill="rgba(30,136,229,0.1)" listening={false} />;
  }
  if (draft.type === 'line') {
    const pts = [draft.x1, draft.y1, draft.x2, draft.y2];
    return def.kind === 'arrow' ? (
      <Arrow points={pts} stroke={color} fill={color} strokeWidth={3 / scale} pointerLength={12 / scale} pointerWidth={12 / scale} listening={false} />
    ) : (
      <Line points={pts} stroke={color} strokeWidth={3 / scale} listening={false} />
    );
  }
  if (draft.type === 'free') {
    return <Line points={draft.points} stroke={color} strokeWidth={3 / scale} lineCap="round" lineJoin="round" tension={0.4} listening={false} />;
  }
  const pts = draft.cursor ? [...draft.points, ...draft.cursor] : draft.points;
  const closed = def.shape === 'polygon';
  return (
    <Group listening={false}>
      <Line points={pts} stroke={color} strokeWidth={sw * 1.5} dash={dash} closed={closed && pts.length >= 6} fill={closed ? 'rgba(30,136,229,0.1)' : undefined} />
      {pointPairs(draft.points).map(([x, y], i) => (
        <Circle key={i} x={x} y={y} radius={(i === 0 ? 6 : 4) / scale} fill={i === 0 ? color : '#fff'} stroke={color} strokeWidth={sw} />
      ))}
    </Group>
  );
}

interface MemoEditorProps {
  memo: Extract<BoardObject, { kind: 'memo' }>;
  viewport: { x: number; y: number; scale: number };
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/** メモのキャンバス上での直接編集 */
function MemoEditor({ memo, viewport, onCommit, onCancel }: MemoEditorProps) {
  const [text, setText] = useState(memo.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const s = viewport.scale;
  return (
    <textarea
      ref={ref}
      className="memo-editor"
      aria-label="メモ本文"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          onCommit(text);
        }
      }}
      style={{
        left: memo.x * s + viewport.x,
        top: memo.y * s + viewport.y,
        width: memo.width * s,
        height: memo.height * s,
        fontSize: memo.fontSize * s,
        padding: 8 * s,
        paddingTop: 10 * s,
        background: memo.color,
        transform: `rotate(${memo.rotation}deg)`,
      }}
    />
  );
}

/** タイムラインで選んだ予定に関連するオブジェクトを、その形に沿って強調する */
function HighlightShape({ obj, scale }: { obj: BoardObject; scale: number }) {
  const color = '#ff6d00';
  const glow = { stroke: color, opacity: 0.55, lineCap: 'round' as const, lineJoin: 'round' as const };
  const outline = { stroke: color, strokeWidth: 3 / scale, dash: [8 / scale, 5 / scale] };
  const pad = 6 / scale;
  let shape: React.ReactNode;
  switch (obj.kind) {
    case 'route':
    case 'arrow':
    case 'line':
    case 'freehand':
      shape = <Line points={obj.points} strokeWidth={obj.strokeWidth + 12 / scale} tension={obj.kind === 'freehand' ? 0.4 : 0} {...glow} />;
      break;
    case 'crowd':
    case 'zone':
      if (obj.shape === 'polygon') shape = <Line points={obj.points} closed {...outline} strokeWidth={5 / scale} opacity={0.9} />;
      else if (obj.shape === 'ellipse')
        shape = <Ellipse x={obj.width / 2} y={obj.height / 2} radiusX={obj.width / 2 + pad} radiusY={obj.height / 2 + pad} {...outline} />;
      else shape = <Rect x={-pad} y={-pad} width={obj.width + pad * 2} height={obj.height + pad * 2} {...outline} />;
      break;
    case 'shape':
    case 'memo':
      shape = <Rect x={-pad} y={-pad} width={obj.width + pad * 2} height={obj.height + pad * 2} {...outline} />;
      break;
    case 'vehicle':
      shape = <Rect x={-obj.size / 2 - pad} y={-obj.breadth / 2 - pad} width={obj.size + pad * 2} height={obj.breadth + pad * 2} cornerRadius={pad} {...outline} />;
      break;
    default:
      shape = <Circle radius={obj.size / 2 + 8 / scale} {...outline} fill="rgba(255,109,0,0.12)" />;
  }
  return (
    <Group x={obj.x} y={obj.y} rotation={obj.rotation}>
      {shape}
    </Group>
  );
}
