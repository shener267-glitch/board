import { useMemo } from 'react';
import { BG_ID, canvasApi } from '../canvas/canvasApi';
import {
  COLOR_SWATCHES,
  colorForType,
  KIND_LABEL,
  KIND_LAYER,
  LAYER_LABEL,
  LOCATION_KINDS,
  MEMO_COLORS,
  objectDisplayName,
} from '../model/definitions';
import { vehicleSize } from '../model/factory';
import { objectBounds } from '../model/geometry';
import type { BoardObject, PresetCategory } from '../model/types';
import { objectEditable, relatedTimeline, useBoard } from '../store/boardStore';
import { BackgroundPanel } from './BackgroundPanel';
import { CheckField, ColorField, ComboField, NumberField, TextAreaField, TextField } from './fields';

const PERSON_STATUS = ['配置予定', '配置済', '待機', '移動中', '交代', '休憩'];

type TypeKey = 'role' | 'vehicleType' | 'facilityType' | 'crowdType' | 'zoneType' | 'routeType' | 'label';

/** 種類フィールドと候補カテゴリ */
function typeFieldOf(obj: BoardObject): { key: TypeKey; cat: PresetCategory; label: string } | null {
  switch (obj.kind) {
    case 'person':
      return { key: 'role', cat: 'personRole', label: '役割' };
    case 'vehicle':
      return { key: 'vehicleType', cat: 'vehicleType', label: '種類' };
    case 'facility':
      return { key: 'facilityType', cat: 'facilityType', label: '種類' };
    case 'crowd':
      return { key: 'crowdType', cat: 'crowdType', label: '種類' };
    case 'zone':
      return { key: 'zoneType', cat: 'zoneType', label: '種類' };
    case 'route':
      return { key: 'routeType', cat: 'routeType', label: '種類' };
    case 'marker':
      return { key: 'label', cat: 'markerLabel', label: '表示文言' };
    default:
      return null;
  }
}

export function PropertyPanel() {
  const doc = useBoard((s) => s.doc);
  const selection = useBoard((s) => s.selection);

  const selected = useMemo(() => {
    const set = new Set(selection);
    return doc.objects.filter((o) => set.has(o.id));
  }, [doc.objects, selection]);

  if (selection.includes(BG_ID)) {
    return (
      <div className="panel-body">
        <div className="prop-header">
          <span className="kind-badge">背景</span>
          <strong>背景画像</strong>
        </div>
        <BackgroundPanel />
      </div>
    );
  }
  if (selected.length === 0) return <NothingSelected />;
  if (selected.length > 1) return <MultiSelection objects={selected} />;
  return <SingleObject obj={selected[0]} />;
}

function NothingSelected() {
  const doc = useBoard((s) => s.doc);
  const setMeta = useBoard((s) => s.setMeta);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of doc.objects) c[KIND_LABEL[o.kind]] = (c[KIND_LABEL[o.kind]] ?? 0) + 1;
    return c;
  }, [doc.objects]);
  return (
    <div className="panel-body">
      <p className="muted">キャンバス上のオブジェクトを選択すると、ここで詳細を編集できます。</p>
      <h3 className="section-title">作戦概要</h3>
      <TextAreaField
        label="作戦の概要・目的"
        rows={4}
        value={doc.meta.description}
        placeholder="例: 架空の式典における来賓の移動・会場警備計画"
        onChange={(v) => setMeta({ description: v })}
      />
      <h3 className="section-title">配置済みオブジェクト</h3>
      {Object.keys(counts).length === 0 ? (
        <p className="muted">まだ何も配置されていません。</p>
      ) : (
        <ul className="count-list">
          {Object.entries(counts).map(([k, n]) => (
            <li key={k}>
              <span>{k}</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="section-title">操作のヒント</h3>
      <ul className="tips">
        <li>左のツールを選んでボードをクリック（タップ）すると配置できます。</li>
        <li>ドラッグで移動、四隅のハンドルで拡大縮小、上部の丸いハンドルで回転。</li>
        <li>ルート・多角形は頂点をドラッグで編集。■をクリックで頂点追加、頂点をダブルクリックで削除。</li>
        <li>Ctrl/⌘+Z 元に戻す、Ctrl/⌘+Shift+Z やり直し、Ctrl/⌘+C/V コピー/貼り付け、Delete 削除。</li>
        <li>ホイールまたはピンチで拡大縮小、空白部分のドラッグで画面移動。</li>
        <li>スマートフォンでは、タップで選択してからドラッグで移動します（未選択のものの上をなぞると画面移動）。</li>
        <li>人物・車両は「背景」タブの縮尺に合わせた実寸で配置されます。名前の表示方法は「レイヤー」タブで変更できます。</li>
      </ul>
    </div>
  );
}

function MultiSelection({ objects }: { objects: BoardObject[] }) {
  const doc = useBoard((s) => s.doc);
  const updateObjects = useBoard((s) => s.updateObjects);
  const deleteSelection = useBoard((s) => s.deleteSelection);
  const duplicateSelection = useBoard((s) => s.duplicateSelection);
  const select = useBoard((s) => s.select);
  const editable = objects.filter((o) => objectEditable(doc, o));
  return (
    <div className="panel-body">
      <div className="prop-header">
        <span className="kind-badge">複数</span>
        <strong>{objects.length} 件を選択中</strong>
      </div>
      <ul className="sel-list">
        {objects.map((o) => (
          <li key={o.id}>
            <button className="link" onClick={() => select([o.id])}>
              <span className="dot" style={{ background: o.color }} />
              {KIND_LABEL[o.kind]}：{objectDisplayName(o)}
            </button>
          </li>
        ))}
      </ul>
      <ColorField
        label="色を一括変更"
        value=""
        swatches={COLOR_SWATCHES}
        disabled={!editable.length}
        onChange={(c) => updateObjects(editable.filter((o) => o.kind !== 'memo').map((o) => ({ id: o.id, patch: { color: c } })))}
      />
      <CheckField
        label="個別ロック"
        checked={objects.every((o) => o.locked)}
        onChange={(v) => updateObjects(objects.map((o) => ({ id: o.id, patch: { locked: v } })))}
      />
      <div className="button-row">
        <button className="btn" onClick={duplicateSelection}>
          複製
        </button>
        <button className="btn danger" onClick={deleteSelection} disabled={!editable.length}>
          削除
        </button>
      </div>
    </div>
  );
}

function SingleObject({ obj }: { obj: BoardObject }) {
  const doc = useBoard((s) => s.doc);
  const updateObject = useBoard((s) => s.updateObject);
  const deleteObjects = useBoard((s) => s.deleteObjects);
  const duplicateSelection = useBoard((s) => s.duplicateSelection);
  const reorder = useBoard((s) => s.reorder);
  const addPreset = useBoard((s) => s.addPreset);
  const addTimelineEntry = useBoard((s) => s.addTimelineEntry);
  const setActiveTimeline = useBoard((s) => s.setActiveTimeline);
  const activeTimelineId = useBoard((s) => s.activeTimelineId);

  const layer = KIND_LAYER[obj.kind];
  const layerLocked = doc.layers[layer].locked;
  const editable = objectEditable(doc, obj);
  const disabled = !editable;

  const set = (patch: Record<string, unknown>, key?: string) =>
    updateObject(obj.id, patch as Partial<BoardObject>, key ?? Object.keys(patch).join(','));

  const typeField = typeFieldOf(obj);
  const related = relatedTimeline(doc, obj);

  const locationNames = useMemo(
    () =>
      doc.objects
        .filter((o) => LOCATION_KINDS.includes(o.kind) && 'name' in o && o.name)
        .map((o) => ('name' in o ? o.name : '')),
    [doc.objects],
  );

  const changeType = (value: string) => {
    if (!typeField) return;
    const old = (obj as unknown as Record<string, string>)[typeField.key];
    const patch: Record<string, unknown> = { [typeField.key]: value };
    // 色が旧種類の既定色のままなら新しい種類の色に合わせる
    if (obj.kind !== 'marker' && obj.color === colorForType(old)) patch.color = colorForType(value);
    // 車両の大きさが旧車種の実寸のままなら新しい車種の実寸に合わせる
    if (obj.kind === 'vehicle') {
      const ppm = doc.settings.pxPerMeter;
      const prev = vehicleSize(old, ppm);
      if (Math.abs(prev.size - obj.size) < 0.5 && Math.abs(prev.breadth - obj.breadth) < 0.5) Object.assign(patch, vehicleSize(value, ppm));
    }
    set(patch, typeField.key);
  };

  const addRelated = () => {
    const name = objectDisplayName(obj);
    if (obj.kind === 'route') addTimelineEntry({ routeId: obj.id, transport: obj.routeType });
    else addTimelineEntry({ locationId: obj.id, location: name });
  };

  return (
    <div className="panel-body">
      <div className="prop-header">
        <span className="kind-badge" style={{ borderColor: obj.color }}>
          {KIND_LABEL[obj.kind]}
        </span>
        <strong className="ellipsis">{objectDisplayName(obj)}</strong>
      </div>
      {!editable && (
        <div className="notice-inline">
          {layerLocked ? `レイヤー「${LAYER_LABEL[layer]}」がロックされています。` : 'このオブジェクトはロックされています。'}
          編集するにはロックを解除してください。
        </div>
      )}

      {'name' in obj && (
        <TextField
          label={obj.kind === 'person' ? '名前' : obj.kind === 'vehicle' ? '車両名' : '名称'}
          value={obj.name}
          disabled={disabled}
          onChange={(v) => set({ name: v })}
        />
      )}

      {typeField && (
        <ComboField
          label={typeField.label}
          value={(obj as unknown as Record<string, string>)[typeField.key]}
          options={doc.settings.presets[typeField.cat]}
          disabled={disabled}
          onChange={changeType}
          onAddOption={(v) => addPreset(typeField.cat, v)}
        />
      )}

      {obj.kind === 'person' && (
        <>
          <TextField label="所属" value={obj.affiliation} disabled={disabled} onChange={(v) => set({ affiliation: v })} />
          <NumberField label="人数" value={obj.count} min={1} max={9999} disabled={disabled} onChange={(v) => set({ count: Math.round(v) })} suffix="人" />
          <TextField label="状態" value={obj.status} suggestions={PERSON_STATUS} disabled={disabled} onChange={(v) => set({ status: v })} />
        </>
      )}

      {obj.kind === 'vehicle' && (
        <>
          <TextField label="担当" value={obj.assignee} disabled={disabled} onChange={(v) => set({ assignee: v })} />
          <TextField label="乗員" value={obj.crew} placeholder="例: 運転1・警護2" disabled={disabled} onChange={(v) => set({ crew: v })} />
        </>
      )}

      {(obj.kind === 'facility' || obj.kind === 'zone' || obj.kind === 'crowd' || obj.kind === 'point') && (
        <TextAreaField label="説明" rows={2} value={obj.description} disabled={disabled} onChange={(v) => set({ description: v })} />
      )}

      {obj.kind === 'point' && (
        <TextField label="担当" value={obj.assignee} disabled={disabled} onChange={(v) => set({ assignee: v })} />
      )}

      {obj.kind === 'crowd' && (
        <>
          <NumberField
            label="想定人数"
            value={obj.estimatedCount}
            min={0}
            step={10}
            disabled={disabled}
            onChange={(v) => set({ estimatedCount: Math.round(v) }, 'estimatedCount')}
            onClear={() => set({ estimatedCount: null }, 'estimatedCount')}
            suffix="人"
          />
          <div className="field-static">範囲：{obj.shape === 'rect' ? '矩形' : obj.shape === 'ellipse' ? '円形' : '多角形'}</div>
        </>
      )}

      {obj.kind === 'route' && (
        <>
          <TextField label="開始地点" value={obj.startLabel} suggestions={locationNames} disabled={disabled} onChange={(v) => set({ startLabel: v })} />
          <TextField label="終了地点" value={obj.endLabel} suggestions={locationNames} disabled={disabled} onChange={(v) => set({ endLabel: v })} />
          <div className="field-static">経由点：{obj.points.length / 2} 点（約 {Math.round(routeLength(obj.points))} px）</div>
        </>
      )}

      {(obj.kind === 'arrow' || obj.kind === 'line' || obj.kind === 'freehand' || obj.kind === 'shape') && (
        <TextField label="ラベル" value={obj.label} disabled={disabled} onChange={(v) => set({ label: v })} />
      )}

      {obj.kind === 'zone' && (
        <CheckField label="縁取りのみ（塗りつぶさない）" checked={obj.outlineOnly} disabled={disabled} onChange={(v) => set({ outlineOnly: v })} />
      )}

      {obj.kind === 'line' && (
        <CheckField label="破線" checked={obj.dashed} disabled={disabled} onChange={(v) => set({ dashed: v })} />
      )}

      {obj.kind === 'memo' && (
        <>
          <TextAreaField id="prop-memo-text" label="メモ本文" rows={4} value={obj.text} disabled={disabled} onChange={(v) => set({ text: v })} />
          <NumberField label="文字サイズ" value={obj.fontSize} min={8} max={72} disabled={disabled} onChange={(v) => set({ fontSize: v })} suffix="px" />
        </>
      )}

      {obj.kind !== 'memo' && (
        <TextAreaField label="備考" rows={2} value={obj.notes} disabled={disabled} onChange={(v) => set({ notes: v })} />
      )}

      <details className="subsection" open>
        <summary>表示・配置</summary>
        <ColorField
          label="色"
          value={obj.color}
          swatches={obj.kind === 'memo' ? MEMO_COLORS : COLOR_SWATCHES}
          disabled={disabled}
          onChange={(c) => set({ color: c })}
        />
        {'strokeWidth' in obj && (
          <NumberField label="線の太さ" value={obj.strokeWidth} min={1} max={40} disabled={disabled} onChange={(v) => set({ strokeWidth: v })} suffix="px" />
        )}
        {obj.kind === 'vehicle' ? (
          <div className="field-row">
            <NumberField label="全長" value={obj.size / doc.settings.pxPerMeter} min={0.5} max={50} step={0.1} disabled={disabled} onChange={(v) => set({ size: v * doc.settings.pxPerMeter }, 'size')} suffix="m" />
            <NumberField label="車幅" value={obj.breadth / doc.settings.pxPerMeter} min={0.3} max={10} step={0.1} disabled={disabled} onChange={(v) => set({ breadth: v * doc.settings.pxPerMeter }, 'breadth')} suffix="m" />
          </div>
        ) : obj.kind === 'person' ? (
          <NumberField label="大きさ" value={obj.size / doc.settings.pxPerMeter} min={0.1} max={20} step={0.1} disabled={disabled} onChange={(v) => set({ size: v * doc.settings.pxPerMeter }, 'size')} suffix="m" />
        ) : (
          'size' in obj && (
            <NumberField label="大きさ" value={obj.size} min={2} max={400} disabled={disabled} onChange={(v) => set({ size: v }, 'size')} suffix="px" />
          )
        )}
        {'width' in obj && 'height' in obj && !('shape' in obj && obj.shape === 'polygon') && (
          <div className="field-row">
            <NumberField label="幅" value={obj.width} min={4} disabled={disabled} onChange={(v) => set({ width: v })} />
            <NumberField label="高さ" value={obj.height} min={4} disabled={disabled} onChange={(v) => set({ height: v })} />
          </div>
        )}
        <div className="field-row">
          <NumberField label="X" value={obj.x} disabled={disabled} onChange={(v) => set({ x: v })} />
          <NumberField label="Y" value={obj.y} disabled={disabled} onChange={(v) => set({ y: v })} />
          <NumberField label="回転" value={obj.rotation} min={-360} max={360} disabled={disabled} onChange={(v) => set({ rotation: v })} suffix="°" />
        </div>
        <CheckField label="このオブジェクトをロック" checked={!!obj.locked} disabled={layerLocked} onChange={(v) => set({ locked: v })} />
        <div className="button-row">
          <button className="btn small" onClick={() => reorder(obj.id, 'front')} disabled={disabled}>
            最前面
          </button>
          <button className="btn small" onClick={() => reorder(obj.id, 'forward')} disabled={disabled}>
            前面へ
          </button>
          <button className="btn small" onClick={() => reorder(obj.id, 'backward')} disabled={disabled}>
            背面へ
          </button>
          <button className="btn small" onClick={() => reorder(obj.id, 'back')} disabled={disabled}>
            最背面
          </button>
        </div>
      </details>

      <details className="subsection" open>
        <summary>関連する予定（{related.length}）</summary>
        {related.length === 0 ? (
          <p className="muted small">この{KIND_LABEL[obj.kind]}に関連付けられた予定はありません。</p>
        ) : (
          <ul className="related-list">
            {related.map((t) => (
              <li key={t.id}>
                <button
                  className={`link ${activeTimelineId === t.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTimeline(t.id);
                    document.getElementById(`tl-${t.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }}
                >
                  <span className="time">{t.time || '--:--'}</span> {t.action || '(行動未入力)'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {(LOCATION_KINDS.includes(obj.kind) || obj.kind === 'route') && (
          <button className="btn small" onClick={addRelated}>
            ＋ {obj.kind === 'route' ? 'このルートを使う予定を追加' : 'この場所で予定を追加'}
          </button>
        )}
      </details>

      <div className="button-row">
        <button className="btn" onClick={() => canvasApi.revealRect(objectBounds(obj))}>
          表示位置へ移動
        </button>
        <button className="btn" onClick={duplicateSelection}>
          複製
        </button>
        <button className="btn danger" disabled={disabled} onClick={() => deleteObjects([obj.id])}>
          削除
        </button>
      </div>
    </div>
  );
}

function routeLength(points: number[]): number {
  let len = 0;
  for (let i = 2; i + 1 < points.length; i += 2) {
    len += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  }
  return len;
}
