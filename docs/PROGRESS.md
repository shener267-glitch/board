# 実装進捗

再開時はこのファイルで現在地を確認し、「未完了・今後の課題」から着手してください。
各機能の実装後は `npm run check`（typecheck + lint + test + build）と `npm run e2e` を実行します。

## 完了

| # | 機能 | 主なファイル |
| --- | --- | --- |
| 1 | 作戦ボードの基本UI（上部バー・左ツール・中央ボード・右詳細・下タイムライン、狭い画面ではボトムシート） | `src/App.tsx`, `src/components/*`, `src/styles.css` |
| 2 | 背景画像アップロード（PNG/JPG/SVG、D&D、サンプル背景）、拡大縮小・移動・回転・透明度・表示・ロック | `src/components/BackgroundPanel.tsx`, `src/store/actions.ts` |
| 3 | キャンバス操作（パン、ホイール/ピンチズーム、全体表示、100%） | `src/canvas/BoardCanvas.tsx` |
| 4 | オブジェクト配置（人物・車両・施設・ポイント・マーカー・メモ、パレットからの D&D、連続配置） | `src/store/tools.ts`, `src/model/factory.ts` |
| 5 | ドラッグ移動（複数選択の一括移動、矢印キー移動） | `BoardCanvas.tsx` |
| 6 | オブジェクト編集（種別ごとの属性、候補の追加、色、サイズ、回転、ロック、前面/背面） | `src/components/PropertyPanel.tsx`, `PresetPanel.tsx` |
| 7 | 群衆エリア（矩形・円・多角形、半透明、想定人数ラベル） | `ObjectVisual.tsx` |
| 8 | ルート（複数点、頂点ドラッグ・追加・削除、徒歩/予備は破線） | `BoardCanvas.tsx` |
| 9 | 区域（矩形・多角形） | 同上 |
| 10 | メモ（付箋、本文・文字サイズ・色） | 同上 |
| 11 | レイヤー（表示/非表示・ロック、オブジェクト一覧、ラベル表示切替） | `LayerPanel.tsx` |
| 12 | タイムライン（入力・D&D/ボタン並べ替え・時刻順ソート・場所/ルート関連付け・相互強調） | `Timeline.tsx` |
| 13 | 保存・読み込み（IndexedDB に作戦とアセットを分離保存、自動退避・復元、JSON 読み込み） | `src/storage/db.ts`, `LoadDialog.tsx` |
| 14 | Undo/Redo（履歴 150 件、連続入力のまとめ） | `src/store/boardStore.ts` |
| 15 | エクスポート（JSON 画像込み/配置のみ、PNG、印刷・PDF） | `src/export/exportBoard.ts`, `PrintSheet.tsx` |

## テスト

- ユニット: `src/model/model.test.ts`, `src/store/boardStore.test.ts`, `src/storage/db.test.ts`, `src/components/panels.test.tsx`
- E2E: `e2e/smoke.mjs`（背景アップロード→人物/車両/群衆/ルート/区域/メモ配置→編集→タイムライン→レイヤー→保存→再読み込み→書き出し→スマホ表示）

## 未完了・今後の課題

- 範囲選択（ドラッグで矩形選択）
- メモのキャンバス上での直接編集（現在はダブルクリックで右パネルの本文欄にフォーカス）
- PDF の直接生成（現在はブラウザの印刷機能で PDF 保存）
- 複数ボード（フェーズ/時間帯ごとのボード切り替え）やタイムライン時刻に応じた配置の表示切替
- 距離の縮尺設定（背景画像のピクセル→メートル換算）
- 画像の大きい背景（数十MB）の最適化（縮小保存オプション）
- オブジェクトのグループ化・整列
