/**
 * 作戦ボードのデータモデル。
 *
 * 保存時は「作戦ドキュメント (OperationDocument)」と
 * 「アセット (背景画像データ)」を分離して扱う。
 * ドキュメント側は背景画像を assetId で参照するだけで、画像バイナリは持たない。
 */

export const SCHEMA_VERSION = 1;

/** オブジェクト種別 */
export type ObjectKind =
  | 'person'
  | 'vehicle'
  | 'facility'
  | 'point'
  | 'crowd'
  | 'route'
  | 'zone'
  | 'arrow'
  | 'line'
  | 'shape'
  | 'marker'
  | 'memo'
  | 'freehand';

/** レイヤー (背景は別管理) */
export type LayerId =
  | 'zone'
  | 'crowd'
  | 'route'
  | 'facility'
  | 'vehicle'
  | 'person'
  | 'annotation'
  | 'memo';

export interface LayerState {
  visible: boolean;
  locked: boolean;
}

interface BaseObject {
  id: string;
  kind: ObjectKind;
  /** 原点 (ボード座標) */
  x: number;
  y: number;
  /** 度 */
  rotation: number;
  color: string;
  /** 個別ロック */
  locked?: boolean;
  notes: string;
}

/** アイコン系オブジェクトの共通サイズ (直径相当 px) */
interface IconSized {
  size: number;
}

export interface PersonObject extends BaseObject, IconSized {
  kind: 'person';
  name: string;
  role: string;
  affiliation: string;
  count: number;
  status: string;
}

export interface VehicleObject extends BaseObject, IconSized {
  kind: 'vehicle';
  name: string;
  vehicleType: string;
  assignee: string;
  crew: string;
}

export interface FacilityObject extends BaseObject, IconSized {
  kind: 'facility';
  name: string;
  facilityType: string;
  description: string;
}

export interface PointObject extends BaseObject, IconSized {
  kind: 'point';
  name: string;
  description: string;
  assignee: string;
}

export interface MarkerObject extends BaseObject, IconSized {
  kind: 'marker';
  label: string;
}

export type AreaShape = 'rect' | 'ellipse' | 'polygon';

/** 範囲系: rect/ellipse は width/height、polygon は points (原点相対) */
interface AreaGeometry {
  shape: AreaShape;
  width: number;
  height: number;
  points: number[];
}

export interface CrowdObject extends BaseObject, AreaGeometry {
  kind: 'crowd';
  crowdType: string;
  estimatedCount: number;
  description: string;
}

export interface ZoneObject extends BaseObject, AreaGeometry {
  kind: 'zone';
  name: string;
  zoneType: string;
  description: string;
}

export interface ShapeObject extends BaseObject {
  kind: 'shape';
  shape: 'rect' | 'ellipse';
  width: number;
  height: number;
  label: string;
}

/** 線系: points は原点相対の [x0,y0,x1,y1,...] */
interface LineGeometry {
  points: number[];
  strokeWidth: number;
}

export interface RouteObject extends BaseObject, LineGeometry {
  kind: 'route';
  name: string;
  routeType: string;
  startLabel: string;
  endLabel: string;
}

export interface ArrowObject extends BaseObject, LineGeometry {
  kind: 'arrow';
  label: string;
}

export interface LineObject extends BaseObject, LineGeometry {
  kind: 'line';
  label: string;
  dashed: boolean;
}

export interface FreehandObject extends BaseObject, LineGeometry {
  kind: 'freehand';
  label: string;
}

export interface MemoObject extends BaseObject {
  kind: 'memo';
  text: string;
  width: number;
  height: number;
  fontSize: number;
}

export type BoardObject =
  | PersonObject
  | VehicleObject
  | FacilityObject
  | PointObject
  | MarkerObject
  | CrowdObject
  | ZoneObject
  | ShapeObject
  | RouteObject
  | ArrowObject
  | LineObject
  | FreehandObject
  | MemoObject;

export type ObjectOf<K extends ObjectKind> = Extract<BoardObject, { kind: K }>;

/** 背景画像の表示設定 (画像データ本体は assetId で参照) */
export interface BackgroundSettings {
  assetId: string | null;
  name: string;
  mime: string;
  /** 画像の元サイズ */
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export interface TimelineEntry {
  id: string;
  /** HH:MM */
  time: string;
  action: string;
  location: string;
  /** キャンバス上の場所オブジェクトとの関連付け */
  locationId: string | null;
  transport: string;
  /** 使用ルートとの関連付け */
  routeId: string | null;
  assignee: string;
  notes: string;
}

export interface OperationMeta {
  title: string;
  /** datetime-local 形式 (YYYY-MM-DDTHH:MM) */
  datetime: string;
  /** 対象 (警護対象など。架空) */
  subject: string;
  description: string;
}

/** 種別ごとの候補名 (ユーザーが追加可能) */
export type PresetCategory =
  | 'personRole'
  | 'vehicleType'
  | 'facilityType'
  | 'crowdType'
  | 'zoneType'
  | 'routeType'
  | 'markerLabel';

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

export interface OperationSettings {
  presets: Record<PresetCategory, string[]>;
  /** 最後に保存したときのビューポート */
  viewport: ViewportState;
  showLabels: boolean;
}

/** 作戦ドキュメント本体 (画像バイナリを含まない) */
export interface OperationDocument {
  schemaVersion: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  meta: OperationMeta;
  background: BackgroundSettings;
  layers: Record<LayerId, LayerState>;
  objects: BoardObject[];
  timeline: TimelineEntry[];
  settings: OperationSettings;
}

/** 背景画像などのバイナリアセット */
export interface Asset {
  id: string;
  name: string;
  mime: string;
  /** data: URL */
  dataUrl: string;
}

/** ファイル書き出し用パッケージ */
export interface OperationPackage {
  format: 'operation-board';
  version: number;
  document: OperationDocument;
  /** 背景画像を含めない書き出しでは空 */
  assets: Asset[];
}
