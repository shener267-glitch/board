import { useMemo, useState } from 'react';
import { KIND_LABEL, LOCATION_KINDS, objectDisplayName } from '../model/definitions';
import type { TimelineEntry } from '../model/types';
import { useBoard } from '../store/boardStore';

interface Props {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function Timeline({ collapsed, onToggleCollapsed }: Props) {
  const timeline = useBoard((s) => s.doc.timeline);
  const objects = useBoard((s) => s.doc.objects);
  const active = useBoard((s) => s.activeTimelineId);
  const setActive = useBoard((s) => s.setActiveTimeline);
  const add = useBoard((s) => s.addTimelineEntry);
  const sortByTime = useBoard((s) => s.sortTimelineByTime);
  const move = useBoard((s) => s.moveTimelineEntry);
  const select = useBoard((s) => s.select);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const locationOptions = useMemo(
    () => objects.filter((o) => LOCATION_KINDS.includes(o.kind)).map((o) => ({ id: o.id, label: `${KIND_LABEL[o.kind]}：${objectDisplayName(o)}` })),
    [objects],
  );
  const routeOptions = useMemo(
    () => objects.filter((o) => o.kind === 'route').map((o) => ({ id: o.id, label: objectDisplayName(o) })),
    [objects],
  );

  const onDrop = (to: number) => {
    if (dragIndex !== null) move(dragIndex, dragIndex < to ? to - 1 : to);
    setDragIndex(null);
    setOverIndex(null);
  };

  const outOfOrder = timeline.some((t, i) => i > 0 && t.time && timeline[i - 1].time && t.time < timeline[i - 1].time);

  return (
    <section className={`timeline ${collapsed ? 'collapsed' : ''}`} aria-label="作戦タイムライン">
      <header className="timeline-header">
        <h2>作戦タイムライン</h2>
        <span className="muted small">{timeline.length} 件</span>
        {outOfOrder && <span className="warn small">時刻順になっていない予定があります</span>}
        <div className="spacer" />
        <button className="btn small primary" onClick={() => add({}, active)}>
          ＋ 予定を追加
        </button>
        <button className="btn small" onClick={sortByTime} disabled={timeline.length < 2}>
          時刻順に並べ替え
        </button>
        {onToggleCollapsed && (
          <button className="btn small ghost" onClick={onToggleCollapsed} aria-expanded={!collapsed}>
            {collapsed ? '▲ 開く' : '▼ 閉じる'}
          </button>
        )}
      </header>
      {!collapsed && (
        <div className="timeline-body">
          <div className="tl-row tl-head" aria-hidden>
            <span />
            <span>時刻</span>
            <span>行動</span>
            <span>場所</span>
            <span>移動手段</span>
            <span>担当</span>
            <span>備考</span>
            <span />
          </div>
          {timeline.length === 0 && (
            <div className="tl-empty">
              予定はまだありません。「＋ 予定を追加」で時刻ごとの行動を入力してください。
              <br />
              例：09:00 出発（公邸）→ 09:30 到着（会場）→ 10:00 会談（会議室）
            </div>
          )}
          <ol className="tl-list">
            {timeline.map((t, i) => (
              <TimelineRow
                key={t.id}
                entry={t}
                index={i}
                count={timeline.length}
                active={active === t.id}
                dragOver={overIndex === i && dragIndex !== null && dragIndex !== i}
                locationOptions={locationOptions}
                routeOptions={routeOptions}
                onActivate={() => {
                  const next = active === t.id ? null : t.id;
                  setActive(next);
                  if (next) {
                    const ids = [t.locationId, t.routeId].filter((x): x is string => !!x);
                    if (ids.length) select(ids);
                  }
                }}
                onDragStart={() => setDragIndex(i)}
                onDragOver={() => setOverIndex(i)}
                onDrop={() => onDrop(i)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
              />
            ))}
            {dragIndex !== null && (
              <li
                className={`tl-dropzone ${overIndex === timeline.length ? 'over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIndex(timeline.length);
                }}
                onDrop={() => onDrop(timeline.length)}
              >
                末尾へ移動
              </li>
            )}
          </ol>
        </div>
      )}
    </section>
  );
}

interface RowProps {
  entry: TimelineEntry;
  index: number;
  count: number;
  active: boolean;
  dragOver: boolean;
  locationOptions: { id: string; label: string }[];
  routeOptions: { id: string; label: string }[];
  onActivate: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function TimelineRow({
  entry: t,
  index,
  count,
  active,
  dragOver,
  locationOptions,
  routeOptions,
  onActivate,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: RowProps) {
  const update = useBoard((s) => s.updateTimelineEntry);
  const remove = useBoard((s) => s.removeTimelineEntry);
  const move = useBoard((s) => s.moveTimelineEntry);
  const objects = useBoard((s) => s.doc.objects);
  const [draggable, setDraggable] = useState(false);
  const set = (patch: Partial<TimelineEntry>) => update(t.id, patch, Object.keys(patch).join(','));

  const linkName = (id: string | null) => {
    const o = id ? objects.find((x) => x.id === id) : undefined;
    return o ? objectDisplayName(o) : '';
  };

  return (
    <li
      id={`tl-${t.id}`}
      className={`tl-row ${active ? 'active' : ''} ${dragOver ? 'drag-over' : ''}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.id);
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={() => {
        setDraggable(false);
        onDragEnd();
      }}
    >
      <span className="tl-handle-cell">
        <span
          className="tl-handle"
          title="ドラッグで並べ替え"
          onPointerDown={() => setDraggable(true)}
          onPointerUp={() => setDraggable(false)}
          aria-hidden
        >
          ⋮⋮
        </span>
        <button className={`tl-focus ${active ? 'on' : ''}`} onClick={onActivate} title="この予定の場所をボード上で強調表示" aria-pressed={active}>
          {index + 1}
        </button>
      </span>
      <span className="tl-cell" data-label="時刻">
        <input className="input" type="time" value={t.time} aria-label="時刻" onChange={(e) => set({ time: e.target.value })} />
      </span>
      <span className="tl-cell" data-label="行動">
        <input className="input" value={t.action} placeholder="例: 出発" aria-label="行動" onChange={(e) => set({ action: e.target.value })} />
      </span>
      <span className="tl-cell" data-label="場所">
        <input className="input" value={t.location} placeholder="例: 会場" aria-label="場所" onChange={(e) => set({ location: e.target.value })} />
        <select
          className="input link-select"
          aria-label="場所をボード上のオブジェクトと関連付け"
          value={t.locationId ?? ''}
          onChange={(e) => {
            const id = e.target.value || null;
            set({ locationId: id, ...(id ? { location: linkName(id) } : {}) });
          }}
        >
          <option value="">（ボード上の場所と関連付け）</option>
          {locationOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
      <span className="tl-cell" data-label="移動手段">
        <input className="input" value={t.transport} placeholder="例: 要人車" aria-label="移動手段" onChange={(e) => set({ transport: e.target.value })} />
        <select
          className="input link-select"
          aria-label="使用ルートを関連付け"
          value={t.routeId ?? ''}
          onChange={(e) => set({ routeId: e.target.value || null })}
        >
          <option value="">（ルートと関連付け）</option>
          {routeOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
      <span className="tl-cell" data-label="担当">
        <input className="input" value={t.assignee} aria-label="担当" onChange={(e) => set({ assignee: e.target.value })} />
      </span>
      <span className="tl-cell" data-label="備考">
        <input className="input" value={t.notes} aria-label="備考" onChange={(e) => set({ notes: e.target.value })} />
      </span>
      <span className="tl-actions">
        <button className="btn icon ghost" aria-label="上へ" disabled={index === 0} onClick={() => move(index, index - 1)}>
          ↑
        </button>
        <button className="btn icon ghost" aria-label="下へ" disabled={index === count - 1} onClick={() => move(index, index + 1)}>
          ↓
        </button>
        <button
          className="btn icon ghost danger"
          aria-label="予定を削除"
          onClick={() => {
            if (!t.action && !t.time) remove(t.id);
            else if (window.confirm(`予定「${t.time} ${t.action}」を削除しますか？`)) remove(t.id);
          }}
        >
          ×
        </button>
      </span>
    </li>
  );
}
