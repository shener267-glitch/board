import type Konva from 'konva';
import { Arrow, Circle, Ellipse, Group, Label, Line, Rect, Tag, Text } from 'react-konva';
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

type HitFunc = (ctx: Konva.Context, shape: Konva.Shape) => void;

/** 画面上で最低限タップしやすい大きさ (半径 px) */
const MIN_HIT_SCREEN_RADIUS = 14;

/**
 * 小さなオブジェクトでも選択しやすいよう、当たり判定を画面上の最小サイズまで広げる。
 * (太い hitStroke は小さな図形で正しく塗られないため、hitFunc で塗りつぶす)
 */
function hitCircle(radius: number, scale: number): HitFunc {
  const r = Math.max(radius, MIN_HIT_SCREEN_RADIUS / scale);
  return (ctx, shape) => {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2, false);
    ctx.closePath();
    ctx.fillShape(shape);
  };
}

/** 左上原点 (x=-w/2, y=-h/2 に置いた Rect) 用 */
function hitRectAt(width: number, height: number, scale: number): HitFunc {
  const f = hitRect(width, height, scale);
  return (ctx, shape) => {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    f(ctx, shape);
    ctx.restore();
  };
}

function hitRect(width: number, height: number, scale: number): HitFunc {
  const min = (MIN_HIT_SCREEN_RADIUS * 2) / scale;
  const w = Math.max(width, min);
  const h = Math.max(height, min);
  return (ctx, shape) => {
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.closePath();
    ctx.fillShape(shape);
  };
}

/** オブジェクト本体の描画 (原点は obj.x/obj.y、回転は親 Group が担う) */
export function ObjectVisual({ obj, scale = 1 }: { obj: BoardObject; scale?: number }) {
  switch (obj.kind) {
    case 'person': {
      const r = obj.size / 2;
      // 画面上で小さい場合は中の文字を省略
      const showText = r * scale >= 7;
      return (
        <>
          <Circle
            radius={r}
            fill={obj.color}
            stroke="#fff"
            strokeWidth={Math.min(2, r * 0.25)}
            hitFunc={hitCircle(r, scale)}
            shadowColor="#000"
            shadowOpacity={0.35}
            shadowBlur={Math.min(3, r)}
          />
          {showText && (
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
          )}
          {obj.count > 1 && (
            <Label x={r * 0.55} y={-r - 12 / scale} listening={false}>
              <Tag fill="#212121" cornerRadius={4 / scale} />
              <Text text={`×${obj.count}`} fontSize={10 / scale} fill="#fff" padding={2 / scale} fontFamily={FONT_FAMILY} />
            </Label>
          )}
        </>
      );
    }
    case 'vehicle': {
      // 上から見た車両 (右向きが前)。size = 全長, breadth = 車幅
      const l = obj.size;
      const b = obj.breadth;
      const showText = b * scale >= 12;
      return (
        <>
          <Rect
            x={-l / 2}
            y={-b / 2}
            width={l}
            height={b}
            cornerRadius={Math.min(b * 0.25, l * 0.12)}
            fill={obj.color}
            stroke="#fff"
            strokeWidth={Math.min(2, b * 0.08)}
            hitFunc={hitRectAt(l, b, scale)}
            shadowColor="#000"
            shadowOpacity={0.35}
            shadowBlur={Math.min(3, b * 0.3)}
          />
          {/* フロントガラス (進行方向の目印) */}
          <Rect
            x={l / 2 - l * 0.3}
            y={-b / 2 + b * 0.14}
            width={l * 0.12}
            height={b * 0.72}
            cornerRadius={b * 0.08}
            fill="rgba(255,255,255,0.75)"
            listening={false}
          />
          {showText && (
            <Text
              text={initial(obj.vehicleType, '車')}
              fontSize={b * 0.55}
              fontStyle="bold"
              fontFamily={FONT_FAMILY}
              fill={contrastText(obj.color)}
              x={-l / 2}
              y={-b / 2}
              width={l * 0.7}
              height={b}
              align="center"
              verticalAlign="middle"
              listening={false}
            />
          )}
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
            cornerRadius={Math.min(4, s * 0.12)}
            fill="#fff"
            stroke={obj.color}
            strokeWidth={Math.min(3, s * 0.1)}
            hitFunc={hitRectAt(s, s, scale)}
            shadowColor="#000"
            shadowOpacity={0.25}
            shadowBlur={3}
          />
          {s * scale >= 14 && (
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
          )}
        </>
      );
    }
    case 'point': {
      const r = obj.size / 2;
      return (
        <>
          <Circle radius={r} fill={withAlpha(obj.color, 0.25)} stroke={obj.color} strokeWidth={Math.min(3, r * 0.2)} hitFunc={hitCircle(r, scale)} />
          <Circle radius={r * 0.3} fill={obj.color} listening={false} />
          <Line points={[-r * 1.3, 0, -r * 0.6, 0]} stroke={obj.color} strokeWidth={Math.min(2, r * 0.15)} listening={false} />
          <Line points={[r * 0.6, 0, r * 1.3, 0]} stroke={obj.color} strokeWidth={Math.min(2, r * 0.15)} listening={false} />
          <Line points={[0, -r * 1.3, 0, -r * 0.6]} stroke={obj.color} strokeWidth={Math.min(2, r * 0.15)} listening={false} />
          <Line points={[0, r * 0.6, 0, r * 1.3]} stroke={obj.color} strokeWidth={Math.min(2, r * 0.15)} listening={false} />
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
      const outlineOnly = !crowd && obj.outlineOnly;
      const common = {
        fill: outlineOnly ? undefined : withAlpha(obj.color, crowd ? 0.3 : 0.12),
        stroke: obj.color,
        strokeWidth: crowd ? 2 : 2.5,
        dash: crowd ? [6, 4] : obj.zoneType.includes('制限') ? [14, 6] : undefined,
        // 縁取りのみの区域は内側では反応させず、線の付近で選択できるようにする
        hitStrokeWidth: outlineOnly ? 16 / scale : undefined,
        fillEnabled: !outlineOnly,
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
            hitStrokeWidth={Math.max(24 / scale, sw * 3)}
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
          hitStrokeWidth={Math.max(24 / scale, obj.strokeWidth * 3)}
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
          hitStrokeWidth={Math.max(24 / scale, obj.strokeWidth * 3)}
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
          hitStrokeWidth={Math.max(20 / scale, obj.strokeWidth * 3)}
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
