import { describe, expect, it } from 'vitest';
import { createDocument, createObject, createTimelineEntry } from './factory';
import { bakeScale, normalizePoints, objectBounds, simplifyPoints } from './geometry';
import { ImportError, parsePackage, toPackage } from './serialize';
import { colorForType, KIND_LAYER } from './definitions';
import type { Asset } from './types';

describe('factory', () => {
  it('creates each kind with its layer', () => {
    const kinds = Object.keys(KIND_LAYER) as (keyof typeof KIND_LAYER)[];
    for (const k of kinds) {
      const o = createObject(k, { x: 10, y: 20 });
      expect(o.kind).toBe(k);
      expect(o.x).toBe(10);
      expect(o.id).toBeTruthy();
    }
  });

  it('applies presets', () => {
    const p = createObject('person', { x: 0, y: 0, preset: '要人' });
    expect(p.role).toBe('要人');
    expect(p.color).toBe(colorForType('要人'));
    const c = createObject('crowd', { x: 0, y: 0, preset: '報道', shape: 'ellipse', width: 50, height: 40 });
    expect(c.crowdType).toBe('報道');
    expect(c.shape).toBe('ellipse');
    expect(c.width).toBe(50);
  });

  it('gives unknown custom types a stable color', () => {
    expect(colorForType('独自区分')).toBe(colorForType('独自区分'));
  });
});

describe('geometry', () => {
  it('computes bounds for icon and line objects', () => {
    const p = createObject('person', { x: 100, y: 100 });
    expect(objectBounds(p)).toEqual({ x: 84, y: 84, width: 32, height: 32 });
    const r = createObject('route', { x: 10, y: 10, points: [0, 0, 50, 20, -10, 40] });
    expect(objectBounds(r)).toEqual({ x: 0, y: 10, width: 60, height: 40 });
  });

  it('bakes scale into size/points', () => {
    const z = createObject('zone', { x: 0, y: 0, width: 100, height: 50 });
    expect(bakeScale(z, 2, 3)).toEqual({ width: 200, height: 150 });
    const l = createObject('arrow', { x: 0, y: 0, points: [0, 0, 10, 10] });
    expect(bakeScale(l, 2, -1)).toEqual({ points: [0, 0, 20, 10] });
    const v = createObject('vehicle', { x: 0, y: 0 });
    expect(bakeScale(v, 2, 1)).toEqual({ size: 88 });
  });

  it('normalizes and simplifies points', () => {
    expect(normalizePoints([10, 20, 30, 50])).toEqual({ x: 10, y: 20, points: [0, 0, 20, 30] });
    expect(simplifyPoints([0, 0, 1, 0, 2, 0, 10, 0, 11, 0], 5)).toEqual([0, 0, 10, 0, 11, 0]);
  });
});

describe('serialize', () => {
  const asset: Asset = { id: 'img_1', name: 'map.png', mime: 'image/png', dataUrl: 'data:image/png;base64,AAAA' };

  it('round-trips a package with separated background asset', () => {
    const doc = createDocument();
    doc.meta.title = '訓練計画A';
    doc.background.assetId = 'img_1';
    const person = createObject('person', { x: 5, y: 6, preset: '要人' });
    const place = createObject('facility', { x: 50, y: 60 });
    doc.objects.push(person, place);
    doc.timeline.push(createTimelineEntry({ time: '09:00', action: '出発', locationId: place.id }));

    const pkg = toPackage(doc, { img_1: asset }, true);
    expect(pkg.assets).toHaveLength(1);
    // ドキュメントには画像データが含まれない
    expect(JSON.stringify(pkg.document)).not.toContain('base64');

    const parsed = parsePackage(JSON.stringify(pkg));
    expect(parsed.document.meta.title).toBe('訓練計画A');
    expect(parsed.document.objects).toHaveLength(2);
    expect(parsed.document.timeline[0].locationId).toBe(place.id);
    expect(parsed.assets[0].dataUrl).toBe(asset.dataUrl);
  });

  it('can export without assets', () => {
    const doc = createDocument();
    doc.background.assetId = 'img_1';
    expect(toPackage(doc, { img_1: asset }, false).assets).toHaveLength(0);
  });

  it('fills defaults and drops invalid data', () => {
    const parsed = parsePackage(
      JSON.stringify({
        format: 'operation-board',
        document: {
          meta: { title: 'X', subject: 123 },
          objects: [
            { kind: 'person', id: 'a', x: 1, y: 2, name: '甲' },
            { kind: 'unknown', id: 'b' },
            { kind: 'route', id: 'c', points: [0, 0, 'x', 5, 10, 10] },
            { kind: 'person', id: 'a' },
          ],
          timeline: [{ time: '10:00', locationId: 'missing' }],
          layers: { person: { visible: false } },
        },
        assets: [{ id: 'z', dataUrl: 'javascript:alert(1)' }],
      }),
    );
    const d = parsed.document;
    expect(d.meta.title).toBe('X');
    expect(d.meta.subject).toBe('');
    expect(d.objects.map((o) => o.id)).toEqual(['a', 'c']);
    const person = d.objects[0];
    expect(person.kind === 'person' && person.role).toBe('警護員');
    const route = d.objects[1];
    expect(route.kind === 'route' && route.points).toEqual([0, 0, 5, 10]);
    expect(d.timeline[0].locationId).toBeNull();
    expect(d.layers.person).toEqual({ visible: false, locked: false });
    expect(d.layers.vehicle).toEqual({ visible: true, locked: false });
    expect(parsed.assets).toHaveLength(0);
  });

  it('rejects non-board data', () => {
    expect(() => parsePackage('not json')).toThrow(ImportError);
    expect(() => parsePackage('{"foo":1}')).toThrow(ImportError);
    expect(() => parsePackage(JSON.stringify({ format: 'operation-board', document: { schemaVersion: 999 } }))).toThrow(
      ImportError,
    );
  });
});
