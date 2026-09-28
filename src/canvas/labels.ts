import { objectBounds } from '../model/geometry';
import type { BoardObject } from '../model/types';

export interface LabelSpec {
  text: string;
  /** obj.x/obj.y からのオフセット (ラベル中心上端) */
  ox: number;
  oy: number;
  color: string;
}

function lineMid(points: number[]): [number, number] {
  const n = points.length / 2;
  if (n < 1) return [0, 0];
  if (n === 1) return [points[0], points[1]];
  const i = Math.floor((n - 1) / 2);
  const x = (points[i * 2] + points[i * 2 + 2]) / 2;
  const y = (points[i * 2 + 1] + points[i * 2 + 3]) / 2;
  return [x, y];
}

function rotate(x: number, y: number, deg: number): [number, number] {
  if (!deg) return [x, y];
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
}

/** 名称ラベル (回転しない別ノードとして描画) */
export function labelFor(obj: BoardObject): LabelSpec | null {
  const b = objectBounds(obj);
  const bottom = (text: string): LabelSpec => ({ text, ox: 0, oy: b.y + b.height - obj.y + 4, color: obj.color });
  switch (obj.kind) {
    case 'person': {
      const t = obj.name || obj.role;
      return bottom(obj.count > 1 && !obj.name ? `${t} ×${obj.count}` : t);
    }
    case 'vehicle':
      return bottom(obj.name || obj.vehicleType);
    case 'facility':
      return bottom(obj.name || obj.facilityType);
    case 'point':
      return obj.name ? bottom(obj.name) : null;
    case 'crowd': {
      const text = `${obj.crowdType || '群衆'}${obj.estimatedCount !== null ? ` 約${obj.estimatedCount.toLocaleString()}人` : ''}`;
      return { text, ox: b.x + b.width / 2 - obj.x, oy: b.y + b.height / 2 - obj.y - 9, color: obj.color };
    }
    case 'zone': {
      const text = obj.name ? `${obj.name}（${obj.zoneType}）` : obj.zoneType;
      return { text, ox: b.x + b.width / 2 - obj.x, oy: b.y - obj.y + 6, color: obj.color };
    }
    case 'route': {
      const [mx, my] = rotate(...lineMid(obj.points), obj.rotation);
      return { text: obj.name || obj.routeType, ox: mx, oy: my + 8, color: obj.color };
    }
    case 'arrow':
    case 'line':
    case 'freehand': {
      if (!obj.label) return null;
      const [mx, my] = rotate(...lineMid(obj.points), obj.rotation);
      return { text: obj.label, ox: mx, oy: my + 8, color: obj.color };
    }
    case 'shape':
      return obj.label ? { text: obj.label, ox: b.x + b.width / 2 - obj.x, oy: b.y - obj.y - 22, color: obj.color } : null;
    case 'marker':
    case 'memo':
      return null;
  }
}
