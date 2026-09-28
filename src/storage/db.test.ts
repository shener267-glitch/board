import { describe, expect, it } from 'vitest';
import { createDocument, createObject } from '../model/factory';
import { deletePlan, listPlans, loadPlan, savePlan } from './db';

describe('IndexedDB storage', () => {
  it('saves document and background asset separately and loads them back', async () => {
    const doc = createDocument();
    doc.meta.title = '保存テスト';
    doc.background.assetId = 'img_x';
    doc.objects.push(createObject('person', { x: 1, y: 2 }));
    const assets = { img_x: { id: 'img_x', name: 'x.png', mime: 'image/png', dataUrl: 'data:image/png;base64,QQ' } };
    await savePlan(doc, assets);

    const list = await listPlans();
    expect(list.find((p) => p.id === doc.id)).toMatchObject({ title: '保存テスト', objectCount: 1, hasBackground: true });

    const loaded = await loadPlan(doc.id);
    expect(loaded?.document.objects).toHaveLength(1);
    expect(loaded?.assets[0].id).toBe('img_x');

    // 背景を差し替えて保存すると古い画像は削除される
    doc.background.assetId = 'img_y';
    await savePlan(doc, { img_y: { ...assets.img_x, id: 'img_y' } });
    const again = await loadPlan(doc.id);
    expect(again?.assets.map((a) => a.id)).toEqual(['img_y']);

    await deletePlan(doc.id);
    expect(await loadPlan(doc.id)).toBeNull();
  });
});
