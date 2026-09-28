import { beforeEach, describe, expect, it } from 'vitest';
import { createObject } from '../model/factory';
import { relatedTimeline, timelineLinkedIds, useBoard } from './boardStore';

const s = () => useBoard.getState();

beforeEach(() => {
  s().newDocument();
});

describe('board store', () => {
  it('adds, updates and deletes objects with undo/redo', () => {
    const p = createObject('person', { x: 0, y: 0 });
    s().addObject(p);
    expect(s().doc.objects).toHaveLength(1);
    expect(s().selection).toEqual([p.id]);

    s().updateObject(p.id, { name: '甲' });
    expect(s().doc.objects[0]).toMatchObject({ name: '甲' });

    s().deleteSelection();
    expect(s().doc.objects).toHaveLength(0);
    expect(s().selection).toEqual([]);

    s().undo();
    expect(s().doc.objects[0]).toMatchObject({ name: '甲' });
    s().undo();
    expect(s().doc.objects[0]).toMatchObject({ name: '' });
    s().undo();
    expect(s().doc.objects).toHaveLength(0);
    expect(s().canUndo()).toBe(false);

    s().redo();
    s().redo();
    expect(s().doc.objects[0]).toMatchObject({ name: '甲' });
    expect(s().canRedo()).toBe(true);
  });

  it('merges rapid edits with the same merge key into one history step', () => {
    const p = createObject('person', { x: 0, y: 0 });
    s().addObject(p);
    s().updateObject(p.id, { name: 'a' }, 'name');
    s().updateObject(p.id, { name: 'ab' }, 'name');
    s().updateObject(p.id, { name: 'abc' }, 'name');
    expect(s().past).toHaveLength(2);
    s().undo();
    expect(s().doc.objects[0]).toMatchObject({ name: '' });
  });

  it('does not move objects in locked layers', () => {
    const p = createObject('person', { x: 0, y: 0 });
    s().addObject(p);
    s().updateLayer('person', { locked: true });
    s().nudgeSelection(10, 0);
    expect(s().doc.objects[0].x).toBe(0);
    s().deleteSelection();
    expect(s().doc.objects).toHaveLength(1);
  });

  it('hiding a layer clears selection in that layer', () => {
    const p = createObject('vehicle', { x: 0, y: 0 });
    s().addObject(p);
    s().updateLayer('vehicle', { visible: false });
    expect(s().selection).toEqual([]);
  });

  it('copies and pastes with offset and new ids', () => {
    const p = createObject('memo', { x: 10, y: 10 });
    s().addObject(p);
    s().copySelection();
    s().paste();
    const objs = s().doc.objects;
    expect(objs).toHaveLength(2);
    expect(objs[1].id).not.toBe(p.id);
    expect(objs[1].x).toBe(34);
    s().paste();
    expect(s().doc.objects[2].x).toBe(58);
  });

  it('reorders within a layer', () => {
    const a = createObject('person', { x: 0, y: 0 });
    const v = createObject('vehicle', { x: 0, y: 0 });
    const b = createObject('person', { x: 0, y: 0 });
    s().addObject(a);
    s().addObject(v);
    s().addObject(b);
    s().reorder(a.id, 'front');
    expect(s().doc.objects.map((o) => o.id)).toEqual([v.id, b.id, a.id]);
    s().reorder(a.id, 'back');
    const persons = s().doc.objects.filter((o) => o.kind === 'person').map((o) => o.id);
    expect(persons).toEqual([a.id, b.id]);
  });

  it('manages timeline entries and links', () => {
    const place = createObject('facility', { x: 0, y: 0 });
    s().addObject(place);
    s().updateObject(place.id, { name: '会議室' });
    const t1 = s().addTimelineEntry({ time: '10:00', action: '会談', locationId: place.id });
    const t2 = s().addTimelineEntry({ time: '09:00', action: '出発', location: '会議室' });
    s().addTimelineEntry({ time: '', action: '未定' });
    s().sortTimelineByTime();
    expect(s().doc.timeline.map((t) => t.action)).toEqual(['出発', '会談', '未定']);
    s().moveTimelineEntry(2, 0);
    expect(s().doc.timeline[0].action).toBe('未定');

    const obj = s().doc.objects[0];
    expect(relatedTimeline(s().doc, obj).map((t) => t.id).sort()).toEqual([t1, t2].sort());
    const e2 = s().doc.timeline.find((t) => t.id === t2)!;
    expect(timelineLinkedIds(s().doc, e2)).toEqual([place.id]);

    // 削除すると関連付けが外れる
    s().deleteObjects([place.id]);
    expect(s().doc.timeline.find((t) => t.id === t1)!.locationId).toBeNull();
  });

  it('changes the board scale and resizes people/vehicles to real size', () => {
    const p = createObject('person', { x: 0, y: 0 });
    const v = createObject('vehicle', { x: 0, y: 0, preset: 'バス' });
    s().addObject(p);
    s().addObject(v);
    s().setPxPerMeter(20);
    s().applyRealisticSizes();
    const [p2, v2] = s().doc.objects;
    expect(p2).toMatchObject({ size: 20 });
    expect(v2).toMatchObject({ size: 220, breadth: 50 });
    s().setPxPerMeter(0);
    expect(s().doc.settings.pxPerMeter).toBe(20);
  });

  it('manages custom presets', () => {
    s().addPreset('personRole', '通訳');
    s().addPreset('personRole', '通訳');
    expect(s().doc.settings.presets.personRole.filter((p) => p === '通訳')).toHaveLength(1);
    s().removePreset('personRole', '通訳');
    expect(s().doc.settings.presets.personRole).not.toContain('通訳');
  });

  it('keeps background asset separate and undoable', () => {
    s().setBackgroundImage({ id: 'img_a', name: 'a.png', mime: 'image/png', dataUrl: 'data:image/png;base64,A' }, 800, 600);
    expect(s().doc.background.assetId).toBe('img_a');
    expect(s().assets.img_a).toBeDefined();
    s().setBackgroundImage({ id: 'img_b', name: 'b.png', mime: 'image/png', dataUrl: 'data:image/png;base64,B' }, 10, 10);
    expect(s().assets.img_a).toBeUndefined();
    s().undo();
    expect(s().doc.background.assetId).toBe('img_a');
    expect(s().assets.img_a).toBeDefined();
    s().removeBackground();
    expect(s().doc.background.assetId).toBeNull();
  });
});
