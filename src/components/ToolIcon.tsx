import type { ToolId } from '../store/tools';

/** ツールの簡易アイコン (SVG) */
export function ToolIcon({ tool }: { tool: ToolId }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': true as const, className: 'tool-icon' };
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (tool) {
    case 'select':
      return (
        <svg {...common}>
          <path d="M5 3l14 8-6 1.5L10 19z" {...stroke} />
        </svg>
      );
    case 'pan':
      return (
        <svg {...common}>
          <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" {...stroke} />
        </svg>
      );
    case 'person':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" {...stroke} />
          <path d="M5 20c0-4 3-6 7-6s7 2 7 6" {...stroke} />
        </svg>
      );
    case 'vehicle':
      return (
        <svg {...common}>
          <rect x="3" y="8" width="14" height="8" rx="2" {...stroke} />
          <path d="M17 9l4 3-4 3" {...stroke} />
        </svg>
      );
    case 'facility':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" {...stroke} />
          <path d="M9 20v-5h6v5" {...stroke} />
        </svg>
      );
    case 'point':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="5" {...stroke} />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" {...stroke} />
        </svg>
      );
    case 'marker':
      return (
        <svg {...common}>
          <path d="M4 4h16v10H13l-1 4-1-4H4z" {...stroke} />
        </svg>
      );
    case 'memo':
      return (
        <svg {...common}>
          <path d="M4 4h16v11l-5 5H4z" {...stroke} />
          <path d="M15 20v-5h5M8 9h8M8 12h5" {...stroke} />
        </svg>
      );
    case 'crowd-rect':
    case 'crowd-ellipse':
    case 'crowd-polygon':
      return (
        <svg {...common}>
          {tool === 'crowd-rect' && <rect x="3" y="5" width="18" height="14" rx="1" {...stroke} strokeDasharray="3 2" />}
          {tool === 'crowd-ellipse' && <ellipse cx="12" cy="12" rx="9" ry="7" {...stroke} strokeDasharray="3 2" />}
          {tool === 'crowd-polygon' && <path d="M4 7l8-4 8 6-3 11H6z" {...stroke} strokeDasharray="3 2" />}
          <circle cx="9" cy="11" r="1.4" fill="currentColor" />
          <circle cx="13" cy="10" r="1.4" fill="currentColor" />
          <circle cx="15" cy="14" r="1.4" fill="currentColor" />
          <circle cx="10" cy="15" r="1.4" fill="currentColor" />
        </svg>
      );
    case 'zone-rect':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" {...stroke} />
          <path d="M3 10l5-5M3 15l10-10M6 19l14-14M11 19l10-10M16 19l5-5" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
        </svg>
      );
    case 'zone-polygon':
      return (
        <svg {...common}>
          <path d="M4 8l7-5 9 5-2 12H6z" {...stroke} />
        </svg>
      );
    case 'route':
      return (
        <svg {...common}>
          <circle cx="4" cy="19" r="2" {...stroke} />
          <path d="M6 18l5-6 4 3 5-9" {...stroke} />
          <path d="M17 6h3v3" {...stroke} />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...common}>
          <path d="M4 20L20 4M11 4h9v9" {...stroke} />
        </svg>
      );
    case 'line':
      return (
        <svg {...common}>
          <path d="M4 20L20 4" {...stroke} />
        </svg>
      );
    case 'shape-rect':
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="12" {...stroke} />
        </svg>
      );
    case 'shape-ellipse':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" {...stroke} />
        </svg>
      );
    case 'freehand':
      return (
        <svg {...common}>
          <path d="M3 17c3-6 5-8 7-5s3 5 5 1 3-7 6-6" {...stroke} />
        </svg>
      );
  }
}
