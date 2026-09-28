import type {
  BoardObject,
  LayerId,
  LayerState,
  ObjectKind,
  PresetCategory,
} from './types';

export interface LayerDef {
  id: LayerId;
  label: string;
}

/** 描画順 (下 → 上) */
export const LAYER_ORDER: LayerDef[] = [
  { id: 'zone', label: '区域' },
  { id: 'crowd', label: '群衆' },
  { id: 'route', label: 'ルート' },
  { id: 'facility', label: '施設・ポイント' },
  { id: 'vehicle', label: '車両' },
  { id: 'person', label: '人物' },
  { id: 'annotation', label: 'その他 (矢印・図形・描画)' },
  { id: 'memo', label: 'メモ' },
];

export const LAYER_LABEL: Record<LayerId, string> = Object.fromEntries(
  LAYER_ORDER.map((l) => [l.id, l.label]),
) as Record<LayerId, string>;

export const KIND_LAYER: Record<ObjectKind, LayerId> = {
  person: 'person',
  vehicle: 'vehicle',
  facility: 'facility',
  point: 'facility',
  crowd: 'crowd',
  route: 'route',
  zone: 'zone',
  arrow: 'annotation',
  line: 'annotation',
  shape: 'annotation',
  marker: 'annotation',
  freehand: 'annotation',
  memo: 'memo',
};

export const KIND_LABEL: Record<ObjectKind, string> = {
  person: '人物',
  vehicle: '車両',
  facility: '施設',
  point: 'ポイント',
  crowd: '群衆',
  route: 'ルート',
  zone: '区域',
  arrow: '矢印',
  line: '線',
  shape: '図形',
  marker: 'マーカー',
  memo: 'メモ',
  freehand: '自由描画',
};

export function layerOf(obj: Pick<BoardObject, 'kind'>): LayerId {
  return KIND_LAYER[obj.kind];
}

export function defaultLayers(): Record<LayerId, LayerState> {
  return Object.fromEntries(
    LAYER_ORDER.map((l) => [l.id, { visible: true, locked: false }]),
  ) as Record<LayerId, LayerState>;
}

export const PRESET_LABEL: Record<PresetCategory, string> = {
  personRole: '人物の役割',
  vehicleType: '車両の種類',
  facilityType: '施設の種類',
  crowdType: '群衆の種類',
  zoneType: '区域の種類',
  routeType: 'ルートの種類',
  markerLabel: 'マーカー文言',
};

export function defaultPresets(): Record<PresetCategory, string[]> {
  return {
    personRole: ['要人', '警護員', '責任者', 'スタッフ', '来賓', '医療担当', '警察', '消防', '報道', 'その他'],
    vehicleType: ['要人車', '警護車', '先導車', '随伴車', 'バス', '救急車', '消防車', 'その他'],
    facilityType: ['入口', '出口', '会場', '駐車場', '集合場所', '待機場所', '建物', 'その他'],
    crowdType: ['観客', '一般参加者', '報道', '関係者', '来賓', 'その他'],
    zoneType: ['警戒区域', '関係者区域', '立入制限区域', '集合区域', '待機区域', 'その他'],
    routeType: ['車両移動', '徒歩移動', '予備ルート', 'その他'],
    markerLabel: ['ここ', '集合', '入口', '注意'],
  };
}

/** 種類名 → 既定色。未知の名称はハッシュで色を決める */
const TYPE_COLORS: Record<string, string> = {
  要人: '#c62828',
  警護員: '#1565c0',
  責任者: '#4527a0',
  スタッフ: '#00838f',
  来賓: '#ad1457',
  医療担当: '#2e7d32',
  警察: '#283593',
  消防: '#d84315',
  報道: '#6d4c41',
  要人車: '#c62828',
  警護車: '#1565c0',
  先導車: '#00695c',
  随伴車: '#4527a0',
  バス: '#5d4037',
  救急車: '#2e7d32',
  消防車: '#d84315',
  入口: '#2e7d32',
  出口: '#c62828',
  会場: '#4527a0',
  駐車場: '#1565c0',
  集合場所: '#ef6c00',
  待機場所: '#00838f',
  建物: '#546e7a',
  観客: '#f9a825',
  一般参加者: '#ef6c00',
  関係者: '#00838f',
  警戒区域: '#c62828',
  関係者区域: '#1565c0',
  立入制限区域: '#6a1b9a',
  集合区域: '#ef6c00',
  待機区域: '#00838f',
  車両移動: '#1565c0',
  徒歩移動: '#2e7d32',
  予備ルート: '#757575',
  注意: '#c62828',
  集合: '#ef6c00',
};

const FALLBACK_PALETTE = ['#455a64', '#5e35b1', '#00897b', '#6d4c41', '#3949ab', '#8e24aa', '#7cb342'];

export function colorForType(type: string): string {
  if (TYPE_COLORS[type]) return TYPE_COLORS[type];
  let h = 0;
  for (const ch of type) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

export const DEFAULT_PX_PER_METER = 10;

/** 実寸の目安 (m) */
export const PERSON_SIZE_M = 0.6;

/** 車種ごとの全長・車幅の目安 (m) */
const VEHICLE_DIMENSIONS: Record<string, [number, number]> = {
  要人車: [5.2, 1.9],
  警護車: [4.9, 1.85],
  先導車: [4.7, 1.8],
  随伴車: [4.9, 1.85],
  バス: [11, 2.5],
  救急車: [5.7, 1.9],
  消防車: [8.5, 2.5],
};

export function vehicleDimensions(type: string): [number, number] {
  if (VEHICLE_DIMENSIONS[type]) return VEHICLE_DIMENSIONS[type];
  if (type.includes('バス')) return VEHICLE_DIMENSIONS['バス'];
  if (type.includes('トラック') || type.includes('消防')) return VEHICLE_DIMENSIONS['消防車'];
  return [4.8, 1.85];
}

/** 色選択肢 */
export const COLOR_SWATCHES = [
  '#c62828',
  '#ef6c00',
  '#f9a825',
  '#2e7d32',
  '#00838f',
  '#1565c0',
  '#4527a0',
  '#ad1457',
  '#6d4c41',
  '#455a64',
  '#212121',
  '#ffffff',
];

export const MEMO_COLORS = ['#fff59d', '#ffe0b2', '#c8e6c9', '#b3e5fc', '#f8bbd0', '#ffffff'];

/** 表示名 (ラベル) を取得 */
export function objectDisplayName(obj: BoardObject): string {
  switch (obj.kind) {
    case 'person':
      return obj.name || obj.role || '人物';
    case 'vehicle':
      return obj.name || obj.vehicleType || '車両';
    case 'facility':
      return obj.name || obj.facilityType || '施設';
    case 'point':
      return obj.name || 'ポイント';
    case 'crowd':
      return obj.crowdType || '群衆';
    case 'zone':
      return obj.name || obj.zoneType || '区域';
    case 'route':
      return obj.name || obj.routeType || 'ルート';
    case 'marker':
      return obj.label || 'マーカー';
    case 'memo':
      return obj.text.split('\n')[0]?.slice(0, 20) || 'メモ';
    case 'arrow':
    case 'line':
    case 'shape':
    case 'freehand':
      return obj.label || KIND_LABEL[obj.kind];
  }
}

/** タイムラインの「場所」として関連付け可能な種別 */
export const LOCATION_KINDS: ObjectKind[] = ['facility', 'point', 'zone', 'crowd', 'marker', 'memo', 'shape'];
