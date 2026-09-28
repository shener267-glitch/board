import { TOOL_DRAG_TYPE } from '../canvas/canvasApi';
import { presetForTool } from '../store/actions';
import { useBoard } from '../store/boardStore';
import { TOOL_GROUPS, TOOLS, type ToolId } from '../store/tools';
import { ToolIcon } from './ToolIcon';

export function ToolPalette({ compact = false }: { compact?: boolean }) {
  const tool = useBoard((s) => s.tool);
  const setTool = useBoard((s) => s.setTool);
  const presets = useBoard((s) => s.doc.settings.presets);
  const toolPresets = useBoard((s) => s.toolPresets);
  const setToolPreset = useBoard((s) => s.setToolPreset);
  const continuous = useBoard((s) => s.continuousPlace);
  const setContinuous = useBoard((s) => s.setContinuousPlace);
  const def = TOOLS[tool];
  const cat = def.presetCategory;
  const current = cat ? (toolPresets[tool] ?? presetForTool(tool)) : undefined;

  const onDragStart = (e: React.DragEvent, id: ToolId) => {
    if (!TOOLS[id].kind) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(TOOL_DRAG_TYPE, id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <nav className={`tool-palette ${compact ? 'compact' : ''}`} aria-label="配置ツール">
      {TOOL_GROUPS.map((g) => (
        <div key={g.label} className="tool-group">
          {!compact && <div className="tool-group-label">{g.label}</div>}
          <div className="tool-grid">
            {g.tools.map((id) => {
              const t = TOOLS[id];
              return (
                <button
                  key={id}
                  className={`tool-btn ${tool === id ? 'active' : ''}`}
                  aria-pressed={tool === id}
                  title={`${t.label}${t.shortcut ? ` (${t.shortcut})` : ''}\n${t.hint}`}
                  draggable={!!t.kind}
                  onDragStart={(e) => onDragStart(e, id)}
                  onClick={() => setTool(tool === id && id !== 'select' ? 'select' : id)}
                >
                  <ToolIcon tool={id} />
                  <span className="tool-label">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {cat && (
        <div className="tool-options">
          <div className="tool-group-label">{def.label}の種類</div>
          <div className="chips">
            {presets[cat].map((p) => (
              <button key={p} className={`chip ${p === current ? 'active' : ''}`} onClick={() => setToolPreset(tool, p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
      {def.mode === 'place' && (
        <label className="check tool-continuous">
          <input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} />
          <span>連続して配置する</span>
        </label>
      )}
    </nav>
  );
}
