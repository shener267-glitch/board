import { useMemo, useState } from 'react';
import { BG_ID, canvasApi } from '../canvas/canvasApi';
import { KIND_LABEL, KIND_LAYER, LAYER_ORDER, objectDisplayName } from '../model/definitions';
import { objectBounds } from '../model/geometry';
import type { BoardObject, LayerId } from '../model/types';
import { useBoard } from '../store/boardStore';
import { CheckField } from './fields';

export function LayerPanel() {
  const doc = useBoard((s) => s.doc);
  const selection = useBoard((s) => s.selection);
  const updateLayer = useBoard((s) => s.updateLayer);
  const setAllLayers = useBoard((s) => s.setAllLayers);
  const updateBackground = useBoard((s) => s.updateBackground);
  const setShowLabels = useBoard((s) => s.setShowLabels);
  const select = useBoard((s) => s.select);
  const [open, setOpen] = useState<Partial<Record<LayerId, boolean>>>({});

  const byLayer = useMemo(() => {
    const m = new Map<LayerId, BoardObject[]>();
    for (const o of doc.objects) {
      const l = KIND_LAYER[o.kind];
      if (!m.has(l)) m.set(l, []);
      m.get(l)!.push(o);
    }
    return m;
  }, [doc.objects]);

  const sel = new Set(selection);
  const bg = doc.background;
  // 上のレイヤーから表示
  const layers = [...LAYER_ORDER].reverse();

  return (
    <div className="panel-body">
      <div className="button-row">
        <button className="btn small" onClick={() => setAllLayers({ visible: true })}>
          すべて表示
        </button>
        <button className="btn small" onClick={() => setAllLayers({ locked: false })}>
          すべてロック解除
        </button>
      </div>
      <CheckField label="名称ラベルを表示" checked={doc.settings.showLabels} onChange={setShowLabels} />
      <ul className="layer-list" aria-label="レイヤー">
        {layers.map((l) => {
          const st = doc.layers[l.id];
          const items = byLayer.get(l.id) ?? [];
          const isOpen = !!open[l.id];
          return (
            <li key={l.id} className={`layer-item ${st.visible ? '' : 'hidden-layer'}`}>
              <div className="layer-row">
                <button
                  className="btn icon ghost"
                  aria-label={isOpen ? '閉じる' : '開く'}
                  onClick={() => setOpen({ ...open, [l.id]: !isOpen })}
                  disabled={!items.length}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
                <span className="layer-name">{l.label}</span>
                <span className="layer-count">{items.length}</span>
                <button
                  className={`toggle ${st.visible ? 'on' : ''}`}
                  aria-pressed={st.visible}
                  aria-label={`${l.label} 表示`}
                  title={st.visible ? '表示中（クリックで非表示）' : '非表示（クリックで表示）'}
                  onClick={() => updateLayer(l.id, { visible: !st.visible })}
                >
                  {st.visible ? '表示' : '非表示'}
                </button>
                <button
                  className={`toggle lock ${st.locked ? 'on' : ''}`}
                  aria-pressed={st.locked}
                  aria-label={`${l.label} ロック`}
                  title={st.locked ? 'ロック中（クリックで解除）' : '編集可（クリックでロック）'}
                  onClick={() => updateLayer(l.id, { locked: !st.locked })}
                >
                  {st.locked ? 'ロック' : '編集可'}
                </button>
              </div>
              {isOpen && (
                <ul className="layer-objects">
                  {[...items].reverse().map((o) => (
                    <li key={o.id}>
                      <button
                        className={`link ${sel.has(o.id) ? 'active' : ''}`}
                        disabled={!st.visible}
                        onClick={() => {
                          select([o.id]);
                          canvasApi.revealRect(objectBounds(o));
                        }}
                      >
                        <span className="dot" style={{ background: o.color }} />
                        <span className="ellipsis">
                          {KIND_LABEL[o.kind]}：{objectDisplayName(o)}
                        </span>
                        {o.locked && <span className="tag">固定</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        <li className={`layer-item ${bg.visible ? '' : 'hidden-layer'}`}>
          <div className="layer-row">
            <span className="btn icon ghost" aria-hidden />
            <button className="layer-name link" disabled={!bg.assetId} onClick={() => select([BG_ID])}>
              背景{bg.assetId ? '' : '（未設定）'}
            </button>
            <span className="layer-count">{bg.assetId ? 1 : 0}</span>
            <button
              className={`toggle ${bg.visible ? 'on' : ''}`}
              aria-pressed={bg.visible}
              aria-label="背景 表示"
              onClick={() => updateBackground({ visible: !bg.visible })}
            >
              {bg.visible ? '表示' : '非表示'}
            </button>
            <button
              className={`toggle lock ${bg.locked ? 'on' : ''}`}
              aria-pressed={bg.locked}
              aria-label="背景 ロック"
              onClick={() => updateBackground({ locked: !bg.locked })}
            >
              {bg.locked ? 'ロック' : '編集可'}
            </button>
          </div>
        </li>
      </ul>
      <p className="muted small">上にあるレイヤーほど手前に表示されます。ロックしたレイヤーのオブジェクトは選択・閲覧のみ可能です。</p>
    </div>
  );
}
