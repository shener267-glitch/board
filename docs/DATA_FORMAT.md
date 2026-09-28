# 作戦データ形式

型定義の正本は `src/model/types.ts`、読み込み時の検証・正規化は `src/model/serialize.ts` です。

## 分離の方針

- **作戦ドキュメント (`OperationDocument`)** — 配置情報・レイヤー・タイムライン・設定。背景画像は `background.assetId` で参照するだけで、画像データは含みません。
- **アセット (`Asset`)** — 背景画像のデータ（data URL）。

ブラウザ内保存（IndexedDB `operation-board`）では `plans` ストアと `assets` ストアに分けて保存し、どの作戦からも参照されなくなった画像は自動で削除します。

## 書き出しファイル（`*.opboard.json`）

```jsonc
{
  "format": "operation-board",
  "version": 1,
  "document": {
    "schemaVersion": 1,
    "id": "op_…",
    "createdAt": "ISO8601", "updatedAt": "ISO8601",
    "meta": { "title": "作戦名", "datetime": "YYYY-MM-DDTHH:MM", "subject": "対象", "description": "概要" },
    "background": {
      "assetId": "img_…" | null, "name": "map.png", "mime": "image/png",
      "naturalWidth": 1600, "naturalHeight": 1100,
      "x": 0, "y": 0, "scale": 1, "rotation": 0, "opacity": 1, "visible": true, "locked": true
    },
    "layers": { "zone": { "visible": true, "locked": false }, "crowd": {…}, "route": {…}, "facility": {…},
                "vehicle": {…}, "person": {…}, "annotation": {…}, "memo": {…} },
    "objects": [
      { "id": "o_…", "kind": "person", "x": 100, "y": 200, "rotation": 0, "color": "#c62828", "notes": "",
        "size": 6, "name": "", "role": "要人", "affiliation": "", "count": 1, "status": "配置予定" },
      { "kind": "vehicle", "size": 49, "breadth": 18.5, "vehicleType": "警護車", … },   // size=全長, breadth=車幅 (px)
      { "kind": "zone", "shape": "rect", "outlineOnly": false, … },
      { "kind": "crowd", "shape": "rect|ellipse|polygon", "width": 200, "height": 120, "points": [], "crowdType": "観客", "estimatedCount": 100 /* 未記入は null */, … },
      { "kind": "route", "points": [0,0, 120,40, …], "strokeWidth": 5, "routeType": "車両移動", "startLabel": "", "endLabel": "", … }
    ],
    "timeline": [
      { "id": "t_…", "time": "09:00", "action": "出発", "location": "公邸", "locationId": "o_…" | null,
        "transport": "要人車", "routeId": "o_…" | null, "assignee": "", "notes": "" }
    ],
    "settings": { "presets": { "personRole": ["要人", …], … }, "viewport": { "x": 0, "y": 0, "scale": 1 },
                  "labelMode": "auto|all|selected|none", "pxPerMeter": 10 }
  },
  "assets": [ { "id": "img_…", "name": "map.png", "mime": "image/png", "dataUrl": "data:image/png;base64,…" } ]
}
```

- 座標はボード座標（背景画像の等倍ピクセルが基準）。`settings.pxPerMeter` が 1m あたりの px（縮尺）。旧形式の `showLabels: false` は `labelMode: "none"` として読み込みます。`points` を持つオブジェクトは `x, y` を原点とした相対座標です。
- 「配置情報のみ」で書き出した場合 `assets` は空になり、読み込み後に背景画像を再設定します。
- 読み込み時は未知の種別・不正な値を除外し、欠けている項目は既定値で補います。存在しないオブジェクトを指すタイムラインの関連付けは解除されます。
- 将来の形式変更は `schemaVersion` を上げ、`normalizeDocument` で移行処理を行います。
