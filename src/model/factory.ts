import {
  colorForType,
  DEFAULT_PX_PER_METER,
  defaultLayers,
  defaultPresets,
  MEMO_COLORS,
  PERSON_SIZE_M,
  vehicleDimensions,
} from './definitions';
import {
  SCHEMA_VERSION,
  type BackgroundSettings,
  type BoardObject,
  type ObjectKind,
  type ObjectOf,
  type OperationDocument,
  type TimelineEntry,
} from './types';

let counter = 0;
export function newId(prefix = 'o'): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

export function emptyBackground(): BackgroundSettings {
  return {
    assetId: null,
    name: '',
    mime: '',
    naturalWidth: 0,
    naturalHeight: 0,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: true,
  };
}

export function createDocument(partial?: Partial<OperationDocument>): OperationDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('op'),
    createdAt: now,
    updatedAt: now,
    meta: { title: '新規作戦計画', datetime: '', subject: '', description: '' },
    background: emptyBackground(),
    layers: defaultLayers(),
    objects: [],
    timeline: [],
    settings: {
      presets: defaultPresets(),
      viewport: { x: 0, y: 0, scale: 1 },
      labelMode: 'auto',
      pxPerMeter: DEFAULT_PX_PER_METER,
    },
    ...partial,
  };
}

export interface CreateOptions {
  x: number;
  y: number;
  /** 種類 (役割・車種など) のプリセット */
  preset?: string;
  width?: number;
  height?: number;
  points?: number[];
  shape?: 'rect' | 'ellipse' | 'polygon';
  /** 縮尺 (人物・車両の実寸サイズ算出用) */
  pxPerMeter?: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 車種の実寸に合わせた全長・車幅 (px) */
export function vehicleSize(type: string, pxPerMeter: number): { size: number; breadth: number } {
  const [l, w] = vehicleDimensions(type);
  return { size: round1(l * pxPerMeter), breadth: round1(w * pxPerMeter) };
}

export function personSize(pxPerMeter: number): number {
  return round1(PERSON_SIZE_M * pxPerMeter);
}

/** 新規オブジェクト生成 */
export function createObject<K extends ObjectKind>(kind: K, opts: CreateOptions): ObjectOf<K> {
  const base = { id: newId(), x: opts.x, y: opts.y, rotation: 0, notes: '' };
  const preset = opts.preset ?? '';
  const w = opts.width ?? 160;
  const h = opts.height ?? 100;
  const ppm = opts.pxPerMeter ?? DEFAULT_PX_PER_METER;
  let obj: BoardObject;
  switch (kind) {
    case 'person': {
      const role = preset || '警護員';
      obj = {
        ...base,
        kind,
        size: personSize(ppm),
        color: colorForType(role),
        name: '',
        role,
        affiliation: '',
        count: 1,
        status: '配置予定',
      };
      break;
    }
    case 'vehicle': {
      const vehicleType = preset || '警護車';
      obj = {
        ...base,
        kind,
        ...vehicleSize(vehicleType, ppm),
        color: colorForType(vehicleType),
        name: '',
        vehicleType,
        assignee: '',
        crew: '',
      };
      break;
    }
    case 'facility': {
      const facilityType = preset || '建物';
      obj = { ...base, kind, size: 36, color: colorForType(facilityType), name: '', facilityType, description: '' };
      break;
    }
    case 'point':
      obj = { ...base, kind, size: 28, color: '#ef6c00', name: '', description: '', assignee: '' };
      break;
    case 'marker': {
      const label = preset || 'ここ';
      const color = label === '集合' ? '#ef6c00' : label === '入口' ? '#2e7d32' : '#c62828';
      obj = { ...base, kind, size: 30, color, label };
      break;
    }
    case 'crowd': {
      const crowdType = preset || '観客';
      obj = {
        ...base,
        kind,
        shape: opts.shape ?? 'rect',
        width: w,
        height: h,
        points: opts.points ?? [],
        color: colorForType(crowdType),
        crowdType,
        estimatedCount: null,
        description: '',
      };
      break;
    }
    case 'zone': {
      const zoneType = preset || '警戒区域';
      obj = {
        ...base,
        kind,
        shape: opts.shape ?? 'rect',
        width: w,
        height: h,
        points: opts.points ?? [],
        color: colorForType(zoneType),
        name: '',
        zoneType,
        description: '',
        outlineOnly: false,
      };
      break;
    }
    case 'shape':
      obj = {
        ...base,
        kind,
        shape: opts.shape === 'ellipse' ? 'ellipse' : 'rect',
        width: w,
        height: h,
        color: '#c62828',
        label: '',
      };
      break;
    case 'route': {
      const routeType = preset || '車両移動';
      obj = {
        ...base,
        kind,
        points: opts.points ?? [0, 0, 100, 0],
        strokeWidth: 5,
        color: colorForType(routeType),
        name: '',
        routeType,
        startLabel: '',
        endLabel: '',
      };
      break;
    }
    case 'arrow':
      obj = { ...base, kind, points: opts.points ?? [0, 0, 100, 0], strokeWidth: 4, color: '#c62828', label: '' };
      break;
    case 'line':
      obj = {
        ...base,
        kind,
        points: opts.points ?? [0, 0, 100, 0],
        strokeWidth: 3,
        color: '#212121',
        label: '',
        dashed: false,
      };
      break;
    case 'freehand':
      obj = { ...base, kind, points: opts.points ?? [], strokeWidth: 3, color: '#c62828', label: '' };
      break;
    case 'memo':
      obj = {
        ...base,
        kind,
        text: preset || 'メモ',
        width: opts.width ?? 160,
        height: opts.height ?? 90,
        fontSize: 14,
        color: MEMO_COLORS[0],
      };
      break;
    default: {
      const never: never = kind as never;
      throw new Error(`unknown kind ${String(never)}`);
    }
  }
  return obj as ObjectOf<K>;
}

export function createTimelineEntry(partial?: Partial<TimelineEntry>): TimelineEntry {
  return {
    id: newId('t'),
    time: '',
    action: '',
    location: '',
    locationId: null,
    transport: '',
    routeId: null,
    assignee: '',
    notes: '',
    ...partial,
  };
}
