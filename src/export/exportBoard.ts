import { canvasApi } from '../canvas/canvasApi';
import { KIND_LAYER } from '../model/definitions';
import { objectBounds, unionRects, type Rect } from '../model/geometry';
import { toPackage } from '../model/serialize';
import type { OperationDocument } from '../model/types';
import { useBoard } from '../store/boardStore';
import { downloadDataUrl, downloadText, safeFileName } from '../storage/files';

const MAX_EXPORT_PX = 8000;

/** 保存・書き出し用: 現在のビューポートを設定に含めたドキュメント */
export function documentForSave(): OperationDocument {
  const s = useBoard.getState();
  return { ...s.doc, settings: { ...s.doc.settings, viewport: { ...s.viewport } } };
}

export function exportJson(includeAssets: boolean): void {
  const s = useBoard.getState();
  const doc = documentForSave();
  const pkg = toPackage(doc, s.assets, includeAssets);
  const name = safeFileName(doc.meta.title, 'operation');
  downloadText(`${name}${includeAssets ? '' : '_配置のみ'}.opboard.json`, JSON.stringify(pkg, null, 2));
}

/** 背景とオブジェクト全体の範囲 */
export function boardBounds(): Rect | null {
  const { doc } = useBoard.getState();
  const rects = doc.objects.filter((o) => doc.layers[KIND_LAYER[o.kind]].visible).map(objectBounds);
  const bg = doc.background;
  if (bg.assetId && bg.visible) rects.push({ x: bg.x, y: bg.y, width: bg.naturalWidth * bg.scale, height: bg.naturalHeight * bg.scale });
  const u = unionRects(rects);
  if (!u) return null;
  const pad = 40;
  return { x: u.x - pad, y: u.y - pad, width: u.width + pad * 2, height: u.height + pad * 2 };
}

/** 作戦ボード全体を画像化 (data URL)。UI 要素 (選択枠など) は含めない */
export function renderBoardImage(pixelRatio = 2): string | null {
  const stage = canvasApi.stage;
  const b = boardBounds();
  if (!stage || !b) return null;
  const pr = Math.min(pixelRatio, MAX_EXPORT_PX / Math.max(b.width, b.height));
  const saved = { x: stage.x(), y: stage.y(), sx: stage.scaleX(), sy: stage.scaleY() };
  const ui = stage.findOne('.ui-layer');
  ui?.visible(false);
  try {
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: -b.x, y: -b.y });
    const canvas = stage.toCanvas({ x: 0, y: 0, width: b.width, height: b.height, pixelRatio: pr });
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    return out.toDataURL('image/png');
  } finally {
    stage.scale({ x: saved.sx, y: saved.sy });
    stage.position({ x: saved.x, y: saved.y });
    ui?.visible(true);
    stage.batchDraw();
  }
}

export function exportPng(): boolean {
  const url = renderBoardImage(2);
  if (!url) return false;
  const title = useBoard.getState().doc.meta.title;
  downloadDataUrl(`${safeFileName(title, 'operation')}.png`, url);
  return true;
}
