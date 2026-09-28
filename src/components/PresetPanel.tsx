import { useState } from 'react';
import { defaultPresets, PRESET_LABEL } from '../model/definitions';
import type { PresetCategory } from '../model/types';
import { useBoard } from '../store/boardStore';

/** 種類 (役割・車種など) の候補リスト管理 */
export function PresetPanel() {
  const presets = useBoard((s) => s.doc.settings.presets);
  const addPreset = useBoard((s) => s.addPreset);
  const removePreset = useBoard((s) => s.removePreset);
  const [drafts, setDrafts] = useState<Partial<Record<PresetCategory, string>>>({});
  const defaults = defaultPresets();

  return (
    <div className="panel-body">
      <p className="muted small">配置ツールや詳細編集で選べる「種類」の候補です。自由に追加・削除できます（作戦データと一緒に保存されます）。</p>
      {(Object.keys(PRESET_LABEL) as PresetCategory[]).map((cat) => (
        <section key={cat} className="preset-section">
          <h3 className="section-title">{PRESET_LABEL[cat]}</h3>
          <div className="chips">
            {presets[cat].map((p) => (
              <span key={p} className="chip static">
                {p}
                <button
                  className="chip-remove"
                  aria-label={`${p} を削除`}
                  onClick={() => removePreset(cat, p)}
                  disabled={presets[cat].length <= 1}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              addPreset(cat, drafts[cat] ?? '');
              setDrafts({ ...drafts, [cat]: '' });
            }}
          >
            <input
              className="input"
              placeholder="新しい候補名"
              aria-label={`${PRESET_LABEL[cat]}を追加`}
              value={drafts[cat] ?? ''}
              onChange={(e) => setDrafts({ ...drafts, [cat]: e.target.value })}
            />
            <button className="btn small" type="submit">
              追加
            </button>
            {defaults[cat].some((d) => !presets[cat].includes(d)) && (
              <button
                className="btn small ghost"
                type="button"
                onClick={() => defaults[cat].forEach((d) => addPreset(cat, d))}
              >
                既定を復元
              </button>
            )}
          </form>
        </section>
      ))}
    </div>
  );
}
