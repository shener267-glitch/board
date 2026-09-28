import { canvasApi } from '../canvas/canvasApi';
import { KIND_LAYER } from '../model/definitions';
import { createObject, type CreateOptions } from '../model/factory';
import type { BoardObject } from '../model/types';
import { imageFileToAsset } from '../storage/files';
import { useBoard } from './boardStore';
import { TOOLS, type ToolId } from './tools';

/** ツールの現在の種類 (未指定ならその分類の先頭候補) */
export function presetForTool(tool: ToolId): string | undefined {
  const s = useBoard.getState();
  const def = TOOLS[tool];
  const chosen = s.toolPresets[tool];
  if (chosen) return chosen;
  if (def.presetCategory) return s.doc.settings.presets[def.presetCategory][0];
  return undefined;
}

/** ツールに応じたオブジェクトを生成して追加 */
export function createFromTool(tool: ToolId, opts: CreateOptions): BoardObject | null {
  const def = TOOLS[tool];
  if (!def.kind) return null;
  const s = useBoard.getState();
  const layer = s.doc.layers[KIND_LAYER[def.kind]];
  if (layer.locked || !layer.visible) {
    s.setNotice('対象のレイヤーが非表示またはロック中のため配置できません。');
    return null;
  }
  const obj = createObject(def.kind, {
    preset: presetForTool(tool),
    shape: def.shape,
    pxPerMeter: s.doc.settings.pxPerMeter,
    ...opts,
  });
  s.addObject(obj);
  if (!s.continuousPlace) s.setTool('select');
  return obj;
}

/** 背景画像ファイルを読み込んで設定 */
export async function uploadBackgroundFile(file: File): Promise<void> {
  const s = useBoard.getState();
  try {
    const { asset, width, height } = await imageFileToAsset(file);
    s.setBackgroundImage(asset, width, height);
    s.setNotice(`背景画像「${file.name}」を読み込みました（${width}×${height}px）`);
    requestAnimationFrame(() => canvasApi.fitToContent());
  } catch (e) {
    s.setNotice(e instanceof Error ? e.message : '背景画像を読み込めませんでした。');
  }
}

/** 同梱のサンプル背景 (架空の会場図) を読み込む */
export async function loadSampleBackground(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}samples/sample-venue.svg`);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    await uploadBackgroundFile(new File([blob], 'sample-venue.svg', { type: 'image/svg+xml' }));
  } catch {
    useBoard.getState().setNotice('サンプル背景を読み込めませんでした。');
  }
}
