/**
 * 実ブラウザでの E2E スモークテスト。
 *   npm run build && npm run e2e
 * Chromium のパスは CHROMIUM_PATH で指定可能 (既定: /opt/pw-browsers/chromium)。
 * スクリーンショットは e2e/screenshots/ に出力される。
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'e2e', 'screenshots');
mkdirSync(shots, { recursive: true });
const PORT = 4179;
const URL = `http://localhost:${PORT}/?e2e`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true });
const stopServer = () => {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already stopped */
  }
};
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server timeout')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(PORT))) {
      clearTimeout(t);
      resolve();
    }
  });
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
});

let failures = 0;
function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.log(`  ✗ ${msg}`);
  }
}

// Linux ではロケール未設定だと日本語のダウンロードファイル名が "download" になるため UTF-8 を指定
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());

  const state = () => page.evaluate(() => {
    const s = window.__board.getState();
    return { doc: s.doc, selection: s.selection, tool: s.tool, saveStatus: s.saveStatus, past: s.past.length, viewport: s.viewport };
  });
  const count = async (kind) => (await state()).doc.objects.filter((o) => o.kind === kind).length;
  const tool = (label) => page.locator('.tool-palette .tool-btn', { hasText: label }).first().click();

  await page.goto(URL);
  await page.waitForSelector('.board-canvas canvas');
  console.log('1-2. 背景画像アップロード');
  await page.locator('.empty-board input[type=file]').setInputFiles(path.join(root, 'public/samples/sample-venue.svg'));
  await page.waitForFunction(() => window.__board.getState().doc.background.assetId);
  await page.waitForTimeout(300);
  const s1 = await state();
  check(s1.doc.background.naturalWidth === 1600, `背景サイズ ${s1.doc.background.naturalWidth}x${s1.doc.background.naturalHeight}`);
  check(s1.viewport.scale < 1, 'アップロード後に全体表示へフィット');

  const box = await page.locator('.board-canvas').boundingBox();
  const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
  const click = async (fx, fy) => {
    const p = at(fx, fy);
    await page.mouse.click(p.x, p.y);
  };
  const toScreen = async (bx, by) => {
    const v = (await state()).viewport;
    return { x: box.x + v.x + bx * v.scale, y: box.y + v.y + by * v.scale };
  };
  const drag = async (a, b) => {
    const p = at(...a);
    const q = at(...b);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 });
    await page.mouse.move(q.x, q.y, { steps: 4 });
    await page.mouse.up();
  };

  console.log('3. 人物を配置');
  await tool('人物');
  await page.locator('.tool-options .chip', { hasText: '要人' }).click();
  await click(0.55, 0.3);
  check((await count('person')) === 1, '人物 1 件');
  const person = (await state()).doc.objects.find((o) => o.kind === 'person');
  check(person.role === '要人', `役割プリセット適用 (${person.role})`);
  check((await state()).tool === 'select', '配置後は選択ツールへ戻る');

  console.log('9. 人物の情報を編集');
  await page.getByLabel('名前').fill('来賓A');
  await page.getByLabel('所属').fill('架空団体');
  const edited = (await state()).doc.objects.find((o) => o.kind === 'person');
  check(edited.name === '来賓A' && edited.affiliation === '架空団体', '名前・所属を編集');

  console.log('4. 車両を配置 (パレットからドラッグ&ドロップ)');
  const src = page.locator('.tool-palette .tool-btn', { hasText: '車両' }).first();
  const dst = at(0.45, 0.62);
  await src.dragTo(page.locator('.board-canvas'), { targetPosition: { x: dst.x - box.x, y: dst.y - box.y } });
  check((await count('vehicle')) === 1, '車両 1 件 (D&D)');

  console.log('5. 群衆エリア');
  await tool('群衆(矩形)');
  await drag([0.5, 0.5], [0.62, 0.62]);
  const crowd = (await state()).doc.objects.find((o) => o.kind === 'crowd');
  check(!!crowd && crowd.width > 50, `群衆エリア作成 (${Math.round(crowd?.width)}x${Math.round(crowd?.height)})`);
  await page.getByLabel('想定人数').fill('350');
  check((await state()).doc.objects.find((o) => o.kind === 'crowd').estimatedCount === 350, '想定人数を編集');

  console.log('6. ルート');
  await tool('ルート');
  await click(0.2, 0.75);
  await click(0.3, 0.5);
  await click(0.45, 0.5);
  await page.mouse.dblclick(at(0.55, 0.33).x, at(0.55, 0.33).y);
  const route = (await state()).doc.objects.find((o) => o.kind === 'route');
  check(!!route && route.points.length === 8, `ルート作成 (${route?.points.length / 2} 点)`);
  await page.getByLabel('名称').fill('第1ルート');

  console.log('   ルート頂点をドラッグ編集');
  const before = (await state()).doc.objects.find((o) => o.kind === 'route').points.slice();
  await drag([0.3, 0.5], [0.3, 0.42]);
  const after = (await state()).doc.objects.find((o) => o.kind === 'route').points;
  check(after[3] < before[3] - 10, '頂点を移動');

  console.log('7. 区域 (多角形)');
  await tool('区域(多角形)');
  await click(0.7, 0.15);
  await click(0.85, 0.15);
  await click(0.85, 0.35);
  await click(0.7, 0.35);
  await page.keyboard.press('Enter');
  const zone = (await state()).doc.objects.find((o) => o.kind === 'zone');
  check(!!zone && zone.shape === 'polygon' && zone.points.length === 8, '多角形区域を作成');

  console.log('8. メモ');
  await tool('メモ');
  await click(0.15, 0.2);
  await page.locator('#prop-memo-text').fill('ここで集合\n14:00開始');
  check((await state()).doc.objects.find((o) => o.kind === 'memo').text.includes('集合'), 'メモ本文を編集');

  console.log('   メモをキャンバス上で直接編集');
  {
    const m = (await state()).doc.objects.find((o) => o.kind === 'memo');
    const p = await toScreen(m.x + m.width / 2, m.y + m.height / 2);
    await page.mouse.dblclick(p.x, p.y);
    const editor = page.locator('textarea.memo-editor');
    await editor.waitFor();
    await editor.fill('車両待機');
    await page.keyboard.press('Control+Enter');
    check((await state()).doc.objects.find((o) => o.kind === 'memo').text === '車両待機', 'ダブルクリックでメモを直接編集');
  }

  console.log('   変形ハンドルでリサイズ');
  {
    const c = (await state()).doc.objects.find((o) => o.kind === 'crowd');
    const center = await toScreen(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.click(center.x, center.y);
    const br = await toScreen(c.x + c.width, c.y + c.height);
    await page.mouse.move(br.x, br.y);
    await page.mouse.down();
    await page.mouse.move(br.x + 30, br.y + 20, { steps: 5 });
    await page.mouse.up();
    const c2 = (await state()).doc.objects.find((o) => o.kind === 'crowd');
    check(c2.width > c.width + 20 && c2.height > c.height + 10, `群衆エリアを拡大 (${Math.round(c.width)}→${Math.round(c2.width)})`);
  }

  console.log('   矢印・マーカー・施設');
  await tool('矢印');
  await drag([0.3, 0.2], [0.4, 0.28]);
  await tool('マーカー');
  await click(0.8, 0.6);
  await tool('施設');
  await page.locator('.tool-options .chip', { hasText: '会場' }).click();
  await click(0.62, 0.22);
  await page.getByLabel('名称').fill('会議室');
  check((await count('arrow')) === 1 && (await count('marker')) === 1 && (await count('facility')) === 1, '矢印・マーカー・施設');

  console.log('   コピー / 貼り付け / 削除 / Undo / Redo');
  const n0 = (await state()).doc.objects.length;
  await page.locator('.board-canvas canvas').first().focus().catch(() => {});
  await page.keyboard.press('Escape');
  await page.mouse.click(box.x + 5, box.y + 5);
  await click(0.62, 0.22); // 施設を選択
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  check((await state()).doc.objects.length === n0 + 1, '貼り付けで 1 件増える');
  await page.keyboard.press('Delete');
  check((await state()).doc.objects.length === n0, 'Delete で削除');
  await page.keyboard.press('Control+z');
  check((await state()).doc.objects.length === n0 + 1, 'Undo で復元');
  await page.keyboard.press('Control+Shift+z');
  check((await state()).doc.objects.length === n0, 'Redo で再削除');

  console.log('   Shift+ドラッグで範囲選択');
  {
    await page.keyboard.press('Escape');
    await page.keyboard.down('Shift');
    await page.mouse.move(box.x + 3, box.y + 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 3, box.y + box.height - 60, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const st = await state();
    check(st.selection.length >= 5, `範囲選択 (${st.selection.length} 件)`);
    await page.keyboard.press('Escape');
  }

  console.log('10. タイムライン');
  await page.getByRole('button', { name: '＋ 予定を追加' }).click();
  let row = page.locator('.tl-list .tl-row').nth(0);
  await row.getByLabel('時刻').fill('10:00');
  await row.getByLabel('行動').fill('会談');
  const facilityId = (await state()).doc.objects.find((o) => o.kind === 'facility').id;
  await row.getByLabel('場所をボード上のオブジェクトと関連付け').selectOption(facilityId);
  await page.getByRole('button', { name: '＋ 予定を追加' }).click();
  row = page.locator('.tl-list .tl-row').nth(1);
  await row.getByLabel('時刻').fill('09:00');
  await row.getByLabel('行動').fill('出発');
  await page.getByRole('button', { name: '時刻順に並べ替え' }).click();
  const tl = (await state()).doc.timeline;
  check(tl[0].action === '出発' && tl[1].action === '会談' && tl[1].location === '会議室', '予定入力・場所関連付け・並べ替え');
  await page.locator('.tl-list .tl-row').nth(1).locator('.tl-focus').click();
  check((await state()).selection.includes(facilityId), '予定選択で場所オブジェクトを強調・選択');
  await page.screenshot({ path: path.join(shots, 'desktop-board.png') });

  console.log('11. レイヤー管理');
  await page.getByRole('tab', { name: 'レイヤー' }).click();
  await page.getByLabel('人物 表示').click();
  check((await state()).doc.layers.person.visible === false, '人物レイヤー非表示');
  await page.getByLabel('人物 表示').click();
  await page.getByLabel('車両 ロック').click();
  check((await state()).doc.layers.vehicle.locked === true, '車両レイヤーをロック');
  await page.screenshot({ path: path.join(shots, 'desktop-layers.png') });

  console.log('12. 保存');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForFunction(() => window.__board.getState().saveStatus === 'saved');
  check(true, '保存済み状態');
  const savedCount = (await state()).doc.objects.length;

  console.log('13. 再読み込みして再編集');
  await page.reload();
  await page.waitForFunction(() => window.__board && window.__board.getState().doc.objects.length > 0, null, { timeout: 5000 });
  const r = await state();
  check(r.doc.objects.length === savedCount && r.doc.timeline.length === 2, '再読み込み後に復元');
  check(!!r.doc.background.assetId, '背景画像も復元');
  await page.getByRole('button', { name: '開く' }).click();
  check((await page.locator('.plan-list li').count()) >= 1, '保存一覧に表示');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();

  console.log('   PNG 書き出し');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: '書き出し ▾' }).click();
  await page.getByRole('menuitem', { name: '画像（PNG）' }).click();
  const file = await dl;
  check(file.suggestedFilename().endsWith('.png'), `PNG 書き出し (${file.suggestedFilename()})`);

  const dl2 = page.waitForEvent('download');
  await page.getByRole('button', { name: '書き出し ▾' }).click();
  await page.getByRole('menuitem', { name: '作戦データを書き出し（JSON・背景画像を含む）' }).click();
  const jf = await dl2;
  check(jf.suggestedFilename().endsWith('.json'), `JSON 書き出し (${jf.suggestedFilename()})`);

  console.log('   スマートフォン表示');
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mp = await mobile.newPage();
  mp.on('pageerror', (e) => errors.push(String(e)));
  await mp.goto(URL);
  await mp.waitForSelector('.board-canvas canvas');
  await mp.locator('.empty-board input[type=file]').setInputFiles(path.join(root, 'public/samples/sample-venue.svg'));
  await mp.waitForFunction(() => window.__board.getState().doc.background.assetId);
  await mp.locator('.tool-palette .tool-btn', { hasText: '人物' }).first().tap();
  const mb = await mp.locator('.board-canvas').boundingBox();
  await mp.touchscreen.tap(mb.x + mb.width * 0.5, mb.y + mb.height * 0.5);
  const mcount = await mp.evaluate(() => window.__board.getState().doc.objects.length);
  check(mcount === 1, 'タップで人物を配置');
  {
    const cdp = await mobile.newCDPSession(mp);
    const vp = () => mp.evaluate(() => window.__board.getState().viewport);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const cx = mb.x + mb.width / 2;
    const cy = mb.y + mb.height * 0.25;
    const v0 = await vp();
    await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 40 - i * 10, cy], [cx + 40 + i * 10, cy]]);
    await touch('touchEnd', []);
    const v1 = await vp();
    check(v1.scale > v0.scale * 1.5, `ピンチで拡大 (${Math.round(v0.scale * 100)}% → ${Math.round(v1.scale * 100)}%)`);
    await mp.waitForTimeout(450);
    const sx = mb.x + 20;
    const sy = mb.y + 30;
    await touch('touchStart', [[sx, sy]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[sx + i * 12, sy + i * 6]]);
    await touch('touchEnd', []);
    const v2 = await vp();
    check(Math.abs(v2.x - v1.x) > 40, `1本指ドラッグでパン (Δx=${Math.round(v2.x - v1.x)})`);
  }
  {
    // 未選択のオブジェクトの上から指でドラッグすると、オブジェクトは動かず画面が動く
    const cdp = await mobile.newCDPSession(mp);
    const st = () => mp.evaluate(() => {
      const s = window.__board.getState();
      return { v: s.viewport, o: s.doc.objects[0], sel: s.selection };
    });
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    await mp.evaluate(() => window.__board.getState().select([]));
    const a = await st();
    const px = mb.x + a.v.x + a.o.x * a.v.scale;
    const py = mb.y + a.v.y + a.o.y * a.v.scale;
    await touch('touchStart', [[px, py]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[px - i * 6, py - i * 4]]);
    await touch('touchEnd', []);
    await mp.waitForTimeout(300);
    const b = await st();
    check(b.o.x === a.o.x && b.o.y === a.o.y && Math.abs(b.v.x - a.v.x) > 40, '未選択オブジェクト上のドラッグは画面移動になる');
    // タップで選択 → そのままドラッグで移動できる
    const qx = mb.x + b.v.x + b.o.x * b.v.scale;
    const qy = mb.y + b.v.y + b.o.y * b.v.scale;
    const hit = await mp.evaluate(([x, y]) => {
      const stg = window.__canvas.stage;
      const r = stg.container().getBoundingClientRect();
      const n = stg.getIntersection({ x: x - r.left, y: y - r.top });
      return n ? n.getParent().id() : 'none';
    }, [qx, qy]);
    await mp.touchscreen.tap(qx, qy);
    check((await st()).sel.includes(b.o.id), `タップで選択 (hit=${hit}, id=${b.o.id}, sel=${(await st()).sel})`);
    await mp.waitForTimeout(450);
    await touch('touchStart', [[qx, qy]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[qx + i * 8, qy]]);
    await touch('touchEnd', []);
    const c = await st();
    check(c.o.x > b.o.x, '選択済みオブジェクトは指で移動できる');
  }
  {
    // スマホでルート作成: タップで点を追加、ドラッグは画面移動、「確定」で完成
    const cdp = await mobile.newCDPSession(mp);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    await mp.locator('.tool-palette .tool-btn', { hasText: 'ルート' }).first().tap();
    const cx = mb.x + mb.width / 2;
    const cy = mb.y + mb.height / 2;
    await mp.touchscreen.tap(cx - 80, cy);
    await mp.waitForTimeout(450);
    const v0 = await mp.evaluate(() => window.__board.getState().viewport);
    await touch('touchStart', [[cx, cy - 60]]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx + i * 8, cy - 60]]);
    await touch('touchEnd', []);
    await mp.waitForTimeout(450);
    const v1 = await mp.evaluate(() => window.__board.getState().viewport);
    await mp.touchscreen.tap(cx, cy + 40);
    await mp.waitForTimeout(450);
    await mp.touchscreen.tap(cx + 80, cy);
    await mp.waitForTimeout(300);
    const txt = await mp.locator('.draw-actions').textContent();
    check(txt.includes('3 点'), `ルート入力中のドラッグは点を追加せず画面移動 (${txt})`);
    check(v1.x !== v0.x, 'ルート入力中にパンできる');
    await mp.getByRole('button', { name: '確定' }).tap();
    const route = await mp.evaluate(() => window.__board.getState().doc.objects.find((o) => o.kind === 'route'));
    check(route && route.points.length === 6, 'スマホでルートを作成');
  }
  await mp.getByRole('tab', { name: '詳細' }).tap();
  await mp.screenshot({ path: path.join(shots, 'mobile-board.png') });

  check(errors.length === 0, `ブラウザエラーなし${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  stopServer();
}

if (failures) {
  console.log(`\n${failures} 件失敗`);
  process.exit(1);
}
console.log('\nE2E スモークテスト: すべて成功');
