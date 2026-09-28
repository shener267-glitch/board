import type Konva from 'konva';
import type { Rect } from '../model/geometry';

/**
 * キャンバス外 (エクスポート、タイムライン連携など) から
 * Konva ステージを操作するための登録口。
 */
interface CanvasApi {
  stage: Konva.Stage | null;
  fitToContent: () => void;
  /** 指定範囲が表示されるようにスクロール (必要ならズーム) */
  revealRect: (r: Rect) => void;
  zoomBy: (factor: number) => void;
  resetZoom: () => void;
  /** 多角形・ルートなどを描画中か */
  drawing: boolean;
}

export const canvasApi: CanvasApi = {
  stage: null,
  fitToContent: () => {},
  revealRect: () => {},
  zoomBy: () => {},
  resetZoom: () => {},
  drawing: false,
};

/** ツールパレットからキャンバスへのドラッグ＆ドロップ用 MIME */
export const TOOL_DRAG_TYPE = 'application/x-board-tool';

export const BG_ID = '__background__';

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

let measureCtx: CanvasRenderingContext2D | null = null;

export const FONT_FAMILY =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, system-ui, sans-serif';

/** テキスト幅の概算 (ラベル中央寄せ用) */
export function measureText(text: string, fontSize: number, bold = false): number {
  if (!measureCtx && typeof document !== 'undefined') {
    try {
      measureCtx = document.createElement('canvas').getContext('2d');
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return text.length * fontSize;
  measureCtx.font = `${bold ? 'bold ' : ''}${fontSize}px ${FONT_FAMILY}`;
  return measureCtx.measureText(text).width;
}
