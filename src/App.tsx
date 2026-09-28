import { useCallback, useEffect, useRef, useState } from 'react';
import { BoardCanvas } from './canvas/BoardCanvas';
import { canvasApi } from './canvas/canvasApi';
import { BackgroundPanel } from './components/BackgroundPanel';
import { LayerPanel } from './components/LayerPanel';
import { LoadDialog } from './components/LoadDialog';
import { PresetPanel } from './components/PresetPanel';
import { PrintSheet } from './components/PrintSheet';
import { PropertyPanel } from './components/PropertyPanel';
import { Timeline } from './components/Timeline';
import { ToolPalette } from './components/ToolPalette';
import { TopBar } from './components/TopBar';
import { documentForSave, exportJson, exportPng, renderBoardImage } from './export/exportBoard';
import { KIND_LAYER } from './model/definitions';
import { useBoard } from './store/boardStore';
import type { ToolId } from './store/tools';
import { DRAFT_ID, loadPlan, savePlan } from './storage/db';

type PanelTab = 'props' | 'layers' | 'background' | 'presets' | 'timeline';

const TAB_LABEL: Record<PanelTab, string> = {
  props: '詳細',
  layers: 'レイヤー',
  background: '背景',
  presets: '候補',
  timeline: '予定',
};

function useNarrow(): boolean {
  const query = '(max-width: 900px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return !!narrow;
}

function isTextInput(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'range', 'color', 'file'].includes(type);
  }
  return false;
}

const SHORTCUT_TOOLS: Record<string, ToolId> = { v: 'select', h: 'pan' };

export default function App() {
  const narrow = useNarrow();
  const [tabState, setTab] = useState<PanelTab>('props');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [printImage, setPrintImage] = useState<string | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const notice = useBoard((s) => s.notice);
  const setNotice = useBoard((s) => s.setNotice);
  const doc = useBoard((s) => s.doc);
  const selection = useBoard((s) => s.selection);

  // ---- 起動時: 前回の編集内容を復元 ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await loadPlan(DRAFT_ID);
        if (cancelled || !draft) return;
        const saved = await loadPlan(draft.document.id);
        const isSaved = !!saved && saved.document.updatedAt === draft.document.updatedAt;
        useBoard.getState().loadDocument(draft.document, draft.assets, { saved: isSaved });
        // 未保存のまま復元した内容は「未保存の変更あり」として扱い、破棄前に確認する
        const hasContent = draft.document.objects.length > 0 || !!draft.document.background.assetId || draft.document.timeline.length > 0;
        if (!isSaved) useBoard.getState().setSaveStatus(saved || hasContent ? 'dirty' : 'new');
        if (draft.document.objects.length || draft.document.background.assetId) {
          useBoard.getState().setNotice('前回の編集内容を復元しました');
        }
      } catch {
        // 保存領域が使えない環境では何もしない
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- 作業中データの自動退避 (クラッシュ・再読み込み対策) ----
  const draftTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    const unsub = useBoard.subscribe((s, prev) => {
      if (s.doc === prev.doc && s.assets === prev.assets && s.viewport === prev.viewport) return;
      window.clearTimeout(draftTimer.current);
      draftTimer.current = window.setTimeout(() => {
        const st = useBoard.getState();
        savePlan(documentForSave(), st.assets, DRAFT_ID).catch(() => {});
      }, 800);
    });
    return () => {
      unsub();
      window.clearTimeout(draftTimer.current);
    };
  }, [ready]);

  // ---- お知らせの自動消去 ----
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [notice, setNotice]);

  // ---- 選択したら詳細タブへ ----
  useEffect(
    () =>
      useBoard.subscribe((s, prev) => {
        if (s.selection !== prev.selection && s.selection.length) {
          setTab((t) => (t === 'layers' || t === 'presets' || t === 'timeline' ? t : 'props'));
        }
      }),
    [],
  );

  const confirmDiscard = useCallback(() => {
    const st = useBoard.getState().saveStatus;
    if (st === 'saved' || (st === 'new' && useBoard.getState().past.length === 0)) return true;
    return window.confirm('保存していない変更があります。破棄して続けますか？');
  }, []);

  const save = useCallback(async () => {
    const s = useBoard.getState();
    s.setSaveStatus('saving');
    try {
      const d = documentForSave();
      await savePlan(d, s.assets);
      await savePlan(d, s.assets, DRAFT_ID);
      useBoard.getState().markSaved(d.updatedAt);
      useBoard.getState().setNotice(`「${d.meta.title}」をこのブラウザに保存しました`);
    } catch (e) {
      useBoard.getState().setSaveStatus('error');
      useBoard.getState().setNotice(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const newDoc = () => {
    if (!confirmDiscard()) return;
    useBoard.getState().newDocument();
    requestAnimationFrame(() => canvasApi.fitToContent());
  };

  const print = () => {
    const img = renderBoardImage(2);
    setPrintImage(img);
  };

  useEffect(() => {
    if (printImage === undefined) return;
    const done = () => setPrintImage(undefined);
    window.addEventListener('afterprint', done, { once: true });
    const t = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [printImage]);

  // ---- 離脱時の確認 ----
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (useBoard.getState().saveStatus === 'dirty') e.preventDefault();
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, []);

  // ---- キーボードショートカット ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useBoard.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') {
        e.preventDefault();
        void save();
        return;
      }
      if (isTextInput(e.target) || loadOpen) return;
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && key === 'c') {
        s.copySelection();
      } else if (mod && key === 'v') {
        e.preventDefault();
        s.paste();
      } else if (mod && key === 'd') {
        e.preventDefault();
        s.duplicateSelection();
      } else if (mod && key === 'a') {
        e.preventDefault();
        s.select(s.doc.objects.filter((o) => s.doc.layers[KIND_LAYER[o.kind]].visible).map((o) => o.id));
      } else if (canvasApi.drawing) {
        return;
      } else if (key === 'delete' || key === 'backspace') {
        if (s.selection.length) {
          e.preventDefault();
          s.deleteSelection();
        }
      } else if (key === 'escape') {
        if (s.tool !== 'select') s.setTool('select');
        else s.select([]);
        s.setActiveTimeline(null);
      } else if (key.startsWith('arrow') && s.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        s.nudgeSelection(dx, dy);
      } else if (!mod && !e.altKey && SHORTCUT_TOOLS[key]) {
        s.setTool(SHORTCUT_TOOLS[key]);
      } else if (!mod && (key === '+' || key === '=')) {
        canvasApi.zoomBy(1.25);
      } else if (!mod && key === '-') {
        canvasApi.zoomBy(0.8);
      } else if (!mod && key === '0') {
        canvasApi.fitToContent();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, loadOpen]);

  // 狭い画面ではタイムラインもタブの一つにする
  const tab = !narrow && tabState === 'timeline' ? 'props' : tabState;
  const tabs: PanelTab[] = narrow ? ['props', 'timeline', 'layers', 'background', 'presets'] : ['props', 'layers', 'background', 'presets'];

  const panelContent = (t: PanelTab) => {
    switch (t) {
      case 'props':
        return <PropertyPanel />;
      case 'layers':
        return <LayerPanel />;
      case 'background':
        return (
          <div className="panel-body">
            <BackgroundPanel />
          </div>
        );
      case 'presets':
        return <PresetPanel />;
      case 'timeline':
        return <Timeline />;
    }
  };

  const tabBar = (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={tab === t}
          className={`tab ${tab === t ? 'active' : ''}`}
          onClick={() => {
            if (narrow && tab === t) setSheetOpen(!sheetOpen);
            else {
              setTab(t);
              if (narrow) setSheetOpen(true);
            }
          }}
        >
          {TAB_LABEL[t]}
          {t === 'props' && selection.length > 0 && <span className="tab-badge">{selection.length}</span>}
          {t === 'timeline' && doc.timeline.length > 0 && <span className="tab-badge">{doc.timeline.length}</span>}
        </button>
      ))}
      {narrow && (
        <button className="tab sheet-toggle" onClick={() => setSheetOpen(!sheetOpen)} aria-expanded={sheetOpen}>
          {sheetOpen ? '▼' : '▲'}
        </button>
      )}
    </div>
  );

  return (
    <div className={`app ${narrow ? 'narrow' : 'wide'} ${timelineCollapsed ? 'tl-collapsed' : ''}`}>
      <TopBar
        narrow={narrow}
        onNew={newDoc}
        onOpen={() => setLoadOpen(true)}
        onSave={() => void save()}
        onExportJson={exportJson}
        onExportPng={() => {
          if (!exportPng()) setNotice('書き出す内容がありません。');
        }}
        onPrint={print}
      />
      <aside className="left-panel">
        <ToolPalette compact={narrow} />
      </aside>
      <main className="center">
        <BoardCanvas />
      </main>
      {narrow ? (
        <section className={`bottom-sheet ${sheetOpen ? 'open' : ''}`}>
          {tabBar}
          {sheetOpen && <div className="sheet-content">{panelContent(tab)}</div>}
        </section>
      ) : (
        <>
          <aside className="right-panel">
            {tabBar}
            <div className="panel-scroll">{panelContent(tab)}</div>
          </aside>
          <div className="bottom-panel">
            <Timeline collapsed={timelineCollapsed} onToggleCollapsed={() => setTimelineCollapsed(!timelineCollapsed)} />
          </div>
        </>
      )}
      {loadOpen && <LoadDialog onClose={() => setLoadOpen(false)} confirmDiscard={confirmDiscard} />}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {printImage !== undefined && <PrintSheet doc={doc} image={printImage} />}
    </div>
  );
}
