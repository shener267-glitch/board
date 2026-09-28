import type { ObjectKind, PresetCategory } from '../model/types';

export type ToolId =
  | 'select'
  | 'pan'
  | 'person'
  | 'vehicle'
  | 'facility'
  | 'point'
  | 'marker'
  | 'memo'
  | 'crowd-rect'
  | 'crowd-ellipse'
  | 'crowd-polygon'
  | 'zone-rect'
  | 'zone-polygon'
  | 'route'
  | 'arrow'
  | 'line'
  | 'shape-rect'
  | 'shape-ellipse'
  | 'freehand';

/** 操作方式 */
export type ToolMode = 'select' | 'pan' | 'place' | 'drag-rect' | 'polyline' | 'drag-line' | 'freehand';

export interface ToolDef {
  id: ToolId;
  label: string;
  mode: ToolMode;
  kind?: ObjectKind;
  shape?: 'rect' | 'ellipse' | 'polygon';
  presetCategory?: PresetCategory;
  hint: string;
  shortcut?: string;
}

export const TOOLS: Record<ToolId, ToolDef> = {
  select: {
    id: 'select',
    label: '選択',
    mode: 'select',
    hint: 'クリックで選択、ドラッグで移動。Shift+クリックで複数選択。空白部分のドラッグで画面移動。',
    shortcut: 'V',
  },
  pan: { id: 'pan', label: '画面移動', mode: 'pan', hint: 'ドラッグで画面を移動。ホイール/ピンチで拡大縮小。', shortcut: 'H' },
  person: {
    id: 'person',
    label: '人物',
    mode: 'place',
    kind: 'person',
    presetCategory: 'personRole',
    hint: 'ボード上をクリック（タップ）して人物を配置。ツールをボードへドラッグしても配置できます。',
  },
  vehicle: {
    id: 'vehicle',
    label: '車両',
    mode: 'place',
    kind: 'vehicle',
    presetCategory: 'vehicleType',
    hint: 'ボード上をクリックして車両を配置。向きは回転ハンドルで変更。',
  },
  facility: {
    id: 'facility',
    label: '施設',
    mode: 'place',
    kind: 'facility',
    presetCategory: 'facilityType',
    hint: 'ボード上をクリックして施設を配置。',
  },
  point: { id: 'point', label: 'ポイント', mode: 'place', kind: 'point', hint: 'ボード上をクリックしてポイントを配置。' },
  marker: {
    id: 'marker',
    label: 'マーカー',
    mode: 'place',
    kind: 'marker',
    presetCategory: 'markerLabel',
    hint: 'ボード上をクリックして注記マーカーを配置。',
  },
  memo: { id: 'memo', label: 'メモ', mode: 'place', kind: 'memo', hint: 'ボード上をクリックして付箋メモを配置。' },
  'crowd-rect': {
    id: 'crowd-rect',
    label: '群衆(矩形)',
    mode: 'drag-rect',
    kind: 'crowd',
    shape: 'rect',
    presetCategory: 'crowdType',
    hint: 'ドラッグして群衆エリアの範囲を指定。',
  },
  'crowd-ellipse': {
    id: 'crowd-ellipse',
    label: '群衆(円)',
    mode: 'drag-rect',
    kind: 'crowd',
    shape: 'ellipse',
    presetCategory: 'crowdType',
    hint: 'ドラッグして円形の群衆エリアを指定。',
  },
  'crowd-polygon': {
    id: 'crowd-polygon',
    label: '群衆(多角形)',
    mode: 'polyline',
    kind: 'crowd',
    shape: 'polygon',
    presetCategory: 'crowdType',
    hint: 'クリックで頂点を追加。ダブルクリック / Enter / 「確定」で完成、Esc で取消。',
  },
  'zone-rect': {
    id: 'zone-rect',
    label: '区域(矩形)',
    mode: 'drag-rect',
    kind: 'zone',
    shape: 'rect',
    presetCategory: 'zoneType',
    hint: 'ドラッグして区域の範囲を指定。',
  },
  'zone-polygon': {
    id: 'zone-polygon',
    label: '区域(多角形)',
    mode: 'polyline',
    kind: 'zone',
    shape: 'polygon',
    presetCategory: 'zoneType',
    hint: 'クリックで頂点を追加。ダブルクリック / Enter / 「確定」で完成、Esc で取消。',
  },
  route: {
    id: 'route',
    label: 'ルート',
    mode: 'polyline',
    kind: 'route',
    presetCategory: 'routeType',
    hint: 'クリックで経由点を追加。ダブルクリック / Enter / 「確定」で完成、Esc で取消。',
  },
  arrow: { id: 'arrow', label: '矢印', mode: 'drag-line', kind: 'arrow', hint: '始点から終点へドラッグして矢印を描く。' },
  line: { id: 'line', label: '線', mode: 'drag-line', kind: 'line', hint: '始点から終点へドラッグして線を描く。' },
  'shape-rect': {
    id: 'shape-rect',
    label: '四角形',
    mode: 'drag-rect',
    kind: 'shape',
    shape: 'rect',
    hint: 'ドラッグして四角形を描く。',
  },
  'shape-ellipse': {
    id: 'shape-ellipse',
    label: '円',
    mode: 'drag-rect',
    kind: 'shape',
    shape: 'ellipse',
    hint: 'ドラッグして円を描く。',
  },
  freehand: { id: 'freehand', label: '自由描画', mode: 'freehand', kind: 'freehand', hint: 'ドラッグして自由に線を描く。' },
};

export interface ToolGroup {
  label: string;
  tools: ToolId[];
}

export const TOOL_GROUPS: ToolGroup[] = [
  { label: '操作', tools: ['select', 'pan'] },
  { label: '配置', tools: ['person', 'vehicle', 'facility', 'point'] },
  { label: '範囲', tools: ['crowd-rect', 'crowd-ellipse', 'crowd-polygon', 'zone-rect', 'zone-polygon'] },
  { label: '線', tools: ['route', 'arrow', 'line', 'freehand'] },
  { label: '注記', tools: ['memo', 'marker', 'shape-rect', 'shape-ellipse'] },
];
