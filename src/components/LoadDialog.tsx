import { useEffect, useRef, useState } from 'react';
import { canvasApi } from '../canvas/canvasApi';
import { ImportError, parsePackage } from '../model/serialize';
import { useBoard } from '../store/boardStore';
import { deletePlan, listPlans, loadPlan, type PlanSummary } from '../storage/db';
import { readFileAsText } from '../storage/files';

interface Props {
  onClose: () => void;
  confirmDiscard: () => boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function LoadDialog({ onClose, confirmDiscard }: Props) {
  const [plans, setPlans] = useState<PlanSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadDocument = useBoard((s) => s.loadDocument);
  const setNotice = useBoard((s) => s.setNotice);
  const currentId = useBoard((s) => s.doc.id);

  const refresh = () =>
    listPlans()
      .then(setPlans)
      .catch((e: unknown) => {
        setPlans([]);
        setError(e instanceof Error ? e.message : String(e));
      });

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const afterLoad = (title: string) => {
    setNotice(`「${title}」を読み込みました`);
    onClose();
    requestAnimationFrame(() => {
      const v = useBoard.getState().viewport;
      if (v.scale === 1 && v.x === 0 && v.y === 0) canvasApi.fitToContent();
    });
  };

  const open = async (id: string) => {
    if (!confirmDiscard()) return;
    try {
      const r = await loadPlan(id);
      if (!r) {
        setError('作戦データが見つかりませんでした。');
        return;
      }
      loadDocument(r.document, r.assets, { saved: true });
      afterLoad(r.document.meta.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const importFile = async (file: File) => {
    if (!confirmDiscard()) return;
    try {
      const text = await readFileAsText(file);
      const { document, assets } = parsePackage(text);
      const missingBg = document.background.assetId && !assets.some((a) => a.id === document.background.assetId);
      loadDocument(document, assets, { saved: false });
      afterLoad(document.meta.title);
      if (missingBg) setNotice('配置情報のみのデータのため、背景画像は「背景」タブから読み込み直してください。');
    } catch (e) {
      setError(e instanceof ImportError ? e.message : `読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="load-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 id="load-title">作戦データを開く</h2>
          <button className="btn icon ghost" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">
          {error && <div className="notice-inline error">{error}</div>}
          <section>
            <h3 className="section-title">ファイルから読み込む</h3>
            <p className="muted small">「書き出し」で保存した作戦データ（.json）を読み込みます。</p>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              ファイルを選択…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
          </section>
          <section>
            <h3 className="section-title">このブラウザに保存した作戦</h3>
            {plans === null ? (
              <p className="muted">読み込み中…</p>
            ) : plans.length === 0 ? (
              <p className="muted">保存された作戦はありません。「保存」ボタンでこのブラウザに保存できます。</p>
            ) : (
              <ul className="plan-list">
                {plans.map((p) => (
                  <li key={p.id} className={p.id === currentId ? 'current' : ''}>
                    <div className="plan-info">
                      <strong>{p.title}</strong>
                      <span className="muted small">
                        更新 {formatDate(p.updatedAt)} ・ オブジェクト {p.objectCount} ・ 予定 {p.timelineCount}
                        {p.hasBackground ? ' ・ 背景あり' : ''}
                        {p.id === currentId ? ' ・ 編集中' : ''}
                      </span>
                    </div>
                    <div className="button-row">
                      <button className="btn primary small" onClick={() => void open(p.id)}>
                        開く
                      </button>
                      <button
                        className="btn small danger"
                        onClick={async () => {
                          if (!window.confirm(`「${p.title}」を削除しますか？この操作は取り消せません。`)) return;
                          await deletePlan(p.id);
                          void refresh();
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
