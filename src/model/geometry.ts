import type { BoardObject } from './types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rotatePoint(px: number, py: number, deg: number): [number, number] {
  if (!deg) return [px, py];
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [px * c - py * s, px * s + py * c];
}

/** 原点相対のローカル座標点列 (外接矩形算出用) */
function localCorners(obj: BoardObject): number[] {
  switch (obj.kind) {
    case 'vehicle': {
      const hl = obj.size / 2;
      const hb = obj.breadth / 2;
      return [-hl, -hb, hl, -hb, hl, hb, -hl, hb];
    }
    case 'person':
    case 'facility':
    case 'point':
    case 'marker': {
      const r = obj.size / 2;
      return [-r, -r, r, -r, r, r, -r, r];
    }
    case 'crowd':
    case 'zone':
      if (obj.shape === 'polygon') return obj.points;
      return [0, 0, obj.width, 0, obj.width, obj.height, 0, obj.height];
    case 'shape':
    case 'memo':
      return [0, 0, obj.width, 0, obj.width, obj.height, 0, obj.height];
    case 'route':
    case 'arrow':
    case 'line':
    case 'freehand':
      return obj.points;
  }
}

/** オブジェクトのボード座標上の外接矩形 */
export function objectBounds(obj: BoardObject): Rect {
  const pts = localCorners(obj);
  if (pts.length < 2) return { x: obj.x, y: obj.y, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const [rx, ry] = rotatePoint(pts[i], pts[i + 1], obj.rotation);
    const x = obj.x + rx;
    const y = obj.y + ry;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function scalePoints(points: number[], sx: number, sy: number): number[] {
  return points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy));
}

const MIN = 4;

/**
 * Transformer で拡縮された結果 (scaleX/scaleY) を
 * オブジェクトのサイズ・点列に焼き込むためのパッチを返す。
 */
export function bakeScale(obj: BoardObject, sx: number, sy: number): Partial<BoardObject> {
  const ax = Math.abs(sx);
  const ay = Math.abs(sy);
  switch (obj.kind) {
    case 'vehicle': {
      const k = Math.max(ax, ay);
      return { size: Math.max(2, Math.round(obj.size * k * 10) / 10), breadth: Math.max(1, Math.round(obj.breadth * k * 10) / 10) };
    }
    case 'person':
    case 'facility':
    case 'point':
    case 'marker':
      return { size: Math.max(2, Math.round(obj.size * Math.max(ax, ay) * 10) / 10) };
    case 'crowd':
    case 'zone':
      if (obj.shape === 'polygon') return { points: scalePoints(obj.points, ax, ay) };
      return { width: Math.max(MIN, obj.width * ax), height: Math.max(MIN, obj.height * ay) };
    case 'shape':
    case 'memo':
      return { width: Math.max(MIN * 5, obj.width * ax), height: Math.max(MIN * 5, obj.height * ay) };
    case 'route':
    case 'arrow':
    case 'line':
    case 'freehand':
      return { points: scalePoints(obj.points, ax, ay) };
  }
}

/** 点列を最初の点が原点になるよう正規化 (x,y を返す) */
export function normalizePoints(absPoints: number[]): { x: number; y: number; points: number[] } {
  if (absPoints.length < 2) return { x: 0, y: 0, points: [] };
  const x = absPoints[0];
  const y = absPoints[1];
  return { x, y, points: absPoints.map((v, i) => (i % 2 === 0 ? v - x : v - y)) };
}

/** 2点が近いか */
export function isNear(ax: number, ay: number, bx: number, by: number, dist: number): boolean {
  return Math.hypot(ax - bx, ay - by) <= dist;
}

/** 点列の間引き (自由描画用) */
export function simplifyPoints(points: number[], minDist: number): number[] {
  if (points.length <= 4) return points;
  const out = [points[0], points[1]];
  for (let i = 2; i + 1 < points.length; i += 2) {
    const lx = out[out.length - 2];
    const ly = out[out.length - 1];
    if (Math.hypot(points[i] - lx, points[i + 1] - ly) >= minDist) out.push(points[i], points[i + 1]);
  }
  const n = points.length;
  if (out[out.length - 2] !== points[n - 2] || out[out.length - 1] !== points[n - 1]) {
    out.push(points[n - 2], points[n - 1]);
  }
  return out;
}

/** 範囲 (2点) から矩形 */
export function rectFromPoints(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}
