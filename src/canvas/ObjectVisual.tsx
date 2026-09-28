import { Arrow, Circle, Ellipse, Group, Label, Line, Rect, RegularPolygon, Tag, Text } from 'react-konva';
import type { BoardObject } from '../model/types';
import { FONT_FAMILY } from './canvasApi';

function initial(s: string, fallback: string): string {
  return (s.trim() || fallback).slice(0, 1);
}

/** 背景色に対して読みやすい文字色 */
function contrastText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#111' : '#fff';
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function isFootRoute(type: string): boolean {
  return type.includes('徒歩');
}

function isDashedRoute(type: string): boolean {
  return isFootRoute(type) || type.includes('予備');
}

/** オブジェクト本体の描画 (原点は obj.x/obj.y、回転は親 Group が担う) */
export function ObjectVisual({ obj }: { obj: BoardObject }) {
  switch (obj.kind) {
    case 'person': {
      const r = obj.size / 2;
      return (
        <>
          <Circle radius={r} fill={obj.color} stroke="#fff" strokeWidth={2} shadowColor="#000" shadowOpacity={0.3} shadowBlur={3} />
          <Text
            text={initial(obj.role, '人')}
            fontSize={r * 1.05}
            fontStyle="bold"
            fontFamily={FONT_FAMILY}
            fill={contrastText(obj.color)}
            width={r * 2}
            height={r * 2}
            offsetX={r}
            offsetY={r}
            align="center"
            verticalAlign="middle"
            listening={false}
          />
          {obj.count > 1 && (
            <Label x={r * 0.55} y={-r * 1.15} listening={false}>
              <Tag fill="#212121" cornerRadius={6} />
              <Text text={`×${obj.count}`} fontSize={Math.max(9, r * 0.6)} fill="#fff" padding={2} fontFamily={FONT_FAMILY} />
            </Label>
          )}
        </>
      );
    }
    case 'vehicle': {
      const w = obj.size;
      const h = obj.size * 0.56;
      return (
        <>
          <Rect
            x={-w / 2}
            y={-h / 2}
            width={w * 0.82}
            height={h}
            cornerRadius={h * 0.22}
            fill={obj.color}
            stroke="#fff"
            strokeWidth={2}
            shadowColor="#000"
            shadowOpacity={0.3}
            shadowBlur={3}
          />
          {/* 進行方向 (右向き) */}
          <RegularPolygon
            x={w * 0.36}
            y={0}
            sides={3}
            radius={h * 0.42}
            rotation={90}
            fill={obj.color}
            stroke="#fff"
            strokeWidth={2}
          />
          <Text
            text={initial(obj.vehicleType, '車')}
            fontSize={h * 0.6}
            fontStyle="bold"
            fontFamily={FONT_FAMILY}
            fill={contrastText(obj.color)}
            x={-w / 2}
            y={-h / 2}
            width={w * 0.82}
            height={h}
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        </>
      );
    }
    case 'facility': {
      const s = obj.size;
      return (
        <>
          <Rect
            x={-s / 2}
            y={-s / 2}
            width={s}
            height={s}
            cornerRadius={4}
            fill="#fff"
            stroke={obj.color}
            strokeWidth={3}
            shadowColor="#000"
            shadowOpacity={0.25}
            shadowBlur={3}
          />
          <Text
            text={initial(obj.facilityType, '施')}
            fontSize={s * 0.5}
            fontStyle="bold"
            fontFamily={FONT_FAMILY}
            fill={obj.color}
            width={s}
            height={s}
            offsetX={s / 2}
            offsetY={s / 2}
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        </>
      );
    }
    case 'point': {
      const r = obj.size / 2;
      return (
        <>
          <Circle radius={r} fill={withAlpha(obj.color, 0.25)} stroke={obj.color} strokeWidth={3} />
          <Circle radius={r * 0.3} fill={obj.color} />
          <Line points={[-r * 1.3, 0, -r * 0.6, 0]} stroke={obj.color} strokeWidth={2} listening={false} />
          <Line points={[r * 0.6, 0, r * 1.3, 0]} stroke={obj.color} strokeWidth={2} listening={false} />
          <Line points={[0, -r * 1.3, 0, -r * 0.6]} stroke={obj.color} strokeWidth={2} listening={false} />
          <Line points={[0, r * 0.6, 0, r * 1.3]} stroke={obj.color} strokeWidth={2} listening={false} />
        </>
      );
    }
    case 'marker': {
      const fs = obj.size * 0.55;
      return (
        <Label y={-4}>
          <Tag
            fill={obj.color}
            pointerDirection="down"
            pointerWidth={fs * 0.8}
            pointerHeight={fs * 0.6}
            cornerRadius={4}
            stroke="#fff"
            strokeWidth={1.5}
            shadowColor="#000"
            shadowOpacity={0.3}
            shadowBlur={3}
          />
          <Text
            text={obj.label || 'ここ'}
            fontSize={fs}
            fontStyle="bold"
            fontFamily={FONT_FAMILY}
            fill={contrastText(obj.color)}
            padding={fs * 0.35}
          />
        </Label>
      );
    }
    case 'crowd':
    case 'zone': {
      const crowd = obj.kind === 'crowd';
      const fill = withAlpha(obj.color, crowd ? 0.3 : 0.12);
      const common = {
        fill,
        stroke: obj.color,
        strokeWidth: crowd ? 2 : 2.5,
        dash: crowd ? [6, 4] : obj.zoneType.includes('制限') ? [14, 6] : undefined,
      };
      if (obj.shape === 'polygon') return <Line points={obj.points} closed {...common} />;
      if (obj.shape === 'ellipse')
        return <Ellipse x={obj.width / 2} y={obj.height / 2} radiusX={obj.width / 2} radiusY={obj.height / 2} {...common} />;
      return <Rect width={obj.width} height={obj.height} {...common} />;
    }
    case 'shape': {
      const common = { stroke: obj.color, strokeWidth: 3, fill: 'rgba(255,255,255,0.01)' };
      if (obj.shape === 'ellipse')
        return <Ellipse x={obj.width / 2} y={obj.height / 2} radiusX={obj.width / 2} radiusY={obj.height / 2} {...common} />;
      return <Rect width={obj.width} height={obj.height} cornerRadius={2} {...common} />;
    }
    case 'route': {
      const pts = obj.points;
      const n = pts.length;
      const sw = obj.strokeWidth;
      return (
        <>
          {/* 視認性のための白縁 */}
          <Line points={pts} stroke="#fff" strokeWidth={sw + 4} lineCap="round" lineJoin="round" opacity={0.8} listening={false} />
          <Arrow
            points={pts}
            stroke={obj.color}
            fill={obj.color}
            strokeWidth={sw}
            pointerLength={sw * 3}
            pointerWidth={sw * 3}
            lineCap="round"
            lineJoin="round"
            dash={isDashedRoute(obj.routeType) ? [sw * 2.4, sw * 1.6] : undefined}
            hitStrokeWidth={Math.max(18, sw * 3)}
          />
          {n >= 2 && <Circle x={pts[0]} y={pts[1]} radius={sw * 1.3} fill="#fff" stroke={obj.color} strokeWidth={2} />}
        </>
      );
    }
    case 'arrow':
      return (
        <Arrow
          points={obj.points}
          stroke={obj.color}
          fill={obj.color}
          strokeWidth={obj.strokeWidth}
          pointerLength={obj.strokeWidth * 3.5}
          pointerWidth={obj.strokeWidth * 3.5}
          lineCap="round"
          hitStrokeWidth={Math.max(18, obj.strokeWidth * 3)}
        />
      );
    case 'line':
      return (
        <Line
          points={obj.points}
          stroke={obj.color}
          strokeWidth={obj.strokeWidth}
          lineCap="round"
          lineJoin="round"
          dash={obj.dashed ? [obj.strokeWidth * 3, obj.strokeWidth * 2] : undefined}
          hitStrokeWidth={Math.max(18, obj.strokeWidth * 3)}
        />
      );
    case 'freehand':
      return (
        <Line
          points={obj.points}
          stroke={obj.color}
          strokeWidth={obj.strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={0.4}
          hitStrokeWidth={Math.max(16, obj.strokeWidth * 3)}
        />
      );
    case 'memo':
      return (
        <Group>
          <Rect
            width={obj.width}
            height={obj.height}
            fill={obj.color}
            stroke="rgba(0,0,0,0.25)"
            strokeWidth={1}
            shadowColor="#000"
            shadowOpacity={0.25}
            shadowBlur={6}
            shadowOffsetY={2}
          />
          <Rect width={obj.width} height={5} fill="rgba(0,0,0,0.12)" listening={false} />
          <Text
            text={obj.text}
            width={obj.width}
            height={obj.height}
            padding={8}
            y={2}
            fontSize={obj.fontSize}
            fontFamily={FONT_FAMILY}
            fill="#212121"
            lineHeight={1.3}
            ellipsis
            listening={false}
          />
        </Group>
      );
  }
}
