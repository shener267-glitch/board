import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createObject } from '../model/factory';
import { useBoard } from '../store/boardStore';
import { LayerPanel } from './LayerPanel';
import { PropertyPanel } from './PropertyPanel';
import { Timeline } from './Timeline';

const s = () => useBoard.getState();

beforeEach(() => s().newDocument());
afterEach(cleanup);

describe('PropertyPanel', () => {
  it('edits person attributes and adds a custom role preset', () => {
    const p = createObject('person', { x: 0, y: 0 });
    s().addObject(p);
    render(<PropertyPanel />);
    fireEvent.change(screen.getByLabelText('名前'), { target: { value: '警護員B' } });
    fireEvent.change(screen.getByLabelText('所属'), { target: { value: '第1班' } });
    fireEvent.change(screen.getByLabelText('役割'), { target: { value: '通訳' } });
    const o = s().doc.objects[0];
    expect(o).toMatchObject({ name: '警護員B', affiliation: '第1班', role: '通訳' });
    fireEvent.click(screen.getByRole('button', { name: /「通訳」を候補に追加/ }));
    expect(s().doc.settings.presets.personRole).toContain('通訳');
  });

  it('disables editing for objects in a locked layer', () => {
    s().addObject(createObject('vehicle', { x: 0, y: 0 }));
    s().updateLayer('vehicle', { locked: true });
    render(<PropertyPanel />);
    expect((screen.getByLabelText('車両名') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/ロックされています/)).toBeTruthy();
  });

  it('adds a related timeline entry for a facility', () => {
    const f = createObject('facility', { x: 0, y: 0 });
    s().addObject(f);
    s().updateObject(f.id, { name: '会議室' });
    render(<PropertyPanel />);
    fireEvent.click(screen.getByRole('button', { name: /この場所で予定を追加/ }));
    expect(s().doc.timeline[0]).toMatchObject({ locationId: f.id, location: '会議室' });
    expect(screen.getByText('関連する予定（1）')).toBeTruthy();
  });
});

describe('Timeline', () => {
  it('adds, edits, links and reorders entries', () => {
    const f = createObject('facility', { x: 0, y: 0 });
    s().addObject(f, false);
    render(<Timeline />);
    fireEvent.click(screen.getByRole('button', { name: '＋ 予定を追加' }));
    fireEvent.change(screen.getAllByLabelText('時刻')[0], { target: { value: '10:00' } });
    fireEvent.change(screen.getAllByLabelText('行動')[0], { target: { value: '会談' } });
    fireEvent.change(screen.getAllByLabelText('場所をボード上のオブジェクトと関連付け')[0], { target: { value: f.id } });
    s().setActiveTimeline(null);
    fireEvent.click(screen.getByRole('button', { name: '＋ 予定を追加' }));
    fireEvent.change(screen.getAllByLabelText('時刻')[1], { target: { value: '09:00' } });
    fireEvent.change(screen.getAllByLabelText('行動')[1], { target: { value: '出発' } });
    expect(screen.getByText('時刻順になっていない予定があります')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '時刻順に並べ替え' }));
    expect(s().doc.timeline.map((t) => t.action)).toEqual(['出発', '会談']);
    expect(s().doc.timeline[1].locationId).toBe(f.id);
    fireEvent.click(screen.getAllByRole('button', { name: '上へ' })[1]);
    expect(s().doc.timeline.map((t) => t.action)).toEqual(['会談', '出発']);
    // 予定を選ぶと関連する場所が選択される
    fireEvent.click(screen.getAllByTitle('この予定の場所をボード上で強調表示')[0]);
    expect(s().selection).toEqual([f.id]);
  });
});

describe('LayerPanel', () => {
  it('toggles visibility and lock', () => {
    render(<LayerPanel />);
    fireEvent.click(screen.getByLabelText('群衆 表示'));
    expect(s().doc.layers.crowd.visible).toBe(false);
    fireEvent.click(screen.getByLabelText('ルート ロック'));
    expect(s().doc.layers.route.locked).toBe(true);
    fireEvent.click(screen.getByLabelText('背景 ロック'));
    expect(s().doc.background.locked).toBe(false);
  });
});
