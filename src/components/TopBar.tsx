import { useEffect, useRef, useState } from 'react';
import { useBoard, type SaveStatus } from '../store/boardStore';

interface Props {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExportJson: (withImage: boolean) => void;
  onExportPng: () => void;
  onPrint: () => void;
  narrow: boolean;
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  new: '未保存（新規）',
  saved: '保存済み',
  dirty: '未保存の変更あり',
  saving: '保存中…',
  error: '保存に失敗',
};

const SHORT_STATUS: Record<SaveStatus, string> = {
  new: '未保存',
  saved: '保存済',
  dirty: '未保存',
  saving: '保存中',
  error: '失敗',
};

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

export function TopBar({ onNew, onOpen, onSave, onExportJson, onExportPng, onPrint, narrow }: Props) {
  const meta = useBoard((s) => s.doc.meta);
  const setMeta = useBoard((s) => s.setMeta);
  const status = useBoard((s) => s.saveStatus);
  const lastSavedAt = useBoard((s) => s.lastSavedAt);
  const canUndo = useBoard((s) => s.past.length > 0);
  const canRedo = useBoard((s) => s.future.length > 0);
  const undo = useBoard((s) => s.undo);
  const redo = useBoard((s) => s.redo);
  const selectionCount = useBoard((s) => s.selection.length);
  const [menu, setMenu] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menu]);

  const metaFields = (
    <div className="meta-fields">
      <label className="meta-field title">
        <span>作戦名</span>
        <input className="input" value={meta.title} onChange={(e) => setMeta({ title: e.target.value })} aria-label="作戦名" />
      </label>
      <label className="meta-field">
        <span>作戦日時</span>
        <input
          className="input"
          type="datetime-local"
          value={meta.datetime}
          onChange={(e) => setMeta({ datetime: e.target.value })}
          aria-label="作戦日時"
        />
      </label>
      <label className="meta-field">
        <span>対象</span>
        <input
          className="input"
          value={meta.subject}
          placeholder="例: 来賓A（架空）"
          onChange={(e) => setMeta({ subject: e.target.value })}
          aria-label="対象"
        />
      </label>
    </div>
  );

  return (
    <header className="topbar">
      <div className="brand" title="要人警護作戦ボード（架空シナリオ用 計画作成ツール）">
        <span className="brand-mark" aria-hidden>
          ▣
        </span>
        <span className="brand-name">作戦ボード</span>
      </div>
      {narrow ? (
        <button className="btn meta-toggle" onClick={() => setMetaOpen(!metaOpen)} aria-expanded={metaOpen}>
          <span className="ellipsis">{meta.title || '作戦名未設定'}</span> ▾
        </button>
      ) : (
        metaFields
      )}
      <div className={`status-chip status-${status}`} title={lastSavedAt ? `最終保存 ${formatTime(lastSavedAt)}` : ''} data-testid="save-status">
        <span className="status-dot" />
        {narrow ? SHORT_STATUS[status] : STATUS_LABEL[status]}
        {status === 'saved' && lastSavedAt && !narrow && <span className="muted"> {formatTime(lastSavedAt)}</span>}
        {selectionCount > 0 && !narrow && <span className="muted"> ・ {selectionCount} 件選択中</span>}
      </div>
      <div className="topbar-actions">
        <button className="btn icon" onClick={undo} disabled={!canUndo} title="元に戻す (Ctrl/⌘+Z)" aria-label="元に戻す">
          ↶
        </button>
        <button className="btn icon" onClick={redo} disabled={!canRedo} title="やり直す (Ctrl/⌘+Shift+Z)" aria-label="やり直す">
          ↷
        </button>
        {!narrow && (
          <>
            <button className="btn" onClick={onNew}>
              新規
            </button>
            <button className="btn" onClick={onOpen}>
              開く
            </button>
          </>
        )}
        <button className="btn primary" onClick={onSave} title="このブラウザに保存 (Ctrl/⌘+S)">
          保存
        </button>
        <div className="menu-wrap" ref={menuRef}>
          <button
            className="btn"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label={narrow ? 'メニュー' : undefined}
            onClick={() => setMenu(!menu)}
          >
            {narrow ? '≡' : '書き出し ▾'}
          </button>
          {menu && (
            <div className="menu" role="menu">
              {narrow && (
                <>
                  <button role="menuitem" onClick={() => (setMenu(false), onNew())}>
                    新規作成
                  </button>
                  <button role="menuitem" onClick={() => (setMenu(false), onOpen())}>
                    開く…
                  </button>
                  <div className="menu-sep" />
                </>
              )}
              <button role="menuitem" onClick={() => (setMenu(false), onExportJson(true))}>
                作戦データを書き出し（JSON・背景画像を含む）
              </button>
              <button role="menuitem" onClick={() => (setMenu(false), onExportJson(false))}>
                作戦データを書き出し（JSON・配置情報のみ）
              </button>
              <button role="menuitem" onClick={() => (setMenu(false), onExportPng())}>
                画像（PNG）
              </button>
              <button role="menuitem" onClick={() => (setMenu(false), onPrint())}>
                印刷 / PDF として保存
              </button>
            </div>
          )}
        </div>
      </div>
      {narrow && metaOpen && <div className="meta-drawer">{metaFields}</div>}
    </header>
  );
}
