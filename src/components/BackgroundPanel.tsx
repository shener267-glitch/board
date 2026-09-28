import { useRef } from 'react';
import { canvasApi } from '../canvas/canvasApi';
import { uploadBackgroundFile } from '../store/actions';
import { useBoard } from '../store/boardStore';
import { ACCEPT_ATTR } from '../storage/files';
import { CheckField, Field, NumberField } from './fields';
import { ScaleSettings } from './ScaleSettings';

export function BackgroundPanel() {
  const bg = useBoard((s) => s.doc.background);
  const update = useBoard((s) => s.updateBackground);
  const removeBackground = useBoard((s) => s.removeBackground);
  const fileRef = useRef<HTMLInputElement>(null);
  const has = !!bg.assetId;
  const disabled = !has || bg.locked;

  return (
    <div className="bg-panel">
      <div className="button-row">
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          {has ? '背景画像を差し替え' : '背景画像をアップロード'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_ATTR}
          hidden
          data-testid="bg-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadBackgroundFile(f);
            e.target.value = '';
          }}
        />
      </div>
      <p className="muted small">PNG / JPG / SVG に対応。航空写真・地図・平面図・会場図など。画像自体は編集されず、配置情報とは別に保存されます。</p>
      <ScaleSettings />
      {has && (
        <>
          <div className="field-static">
            <strong>{bg.name || '背景画像'}</strong>
            <br />
            {bg.naturalWidth} × {bg.naturalHeight} px
          </div>
          <div className="field-row">
            <CheckField label="表示" checked={bg.visible} onChange={(v) => update({ visible: v })} />
            <CheckField label="ロック（誤操作防止）" checked={bg.locked} onChange={(v) => update({ locked: v })} />
          </div>
          <Field label={`透明度（不透明度 ${Math.round(bg.opacity * 100)}%）`}>
            <input
              className="range"
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={bg.opacity}
              onChange={(e) => update({ opacity: parseFloat(e.target.value) }, 'bg-opacity')}
            />
          </Field>
          <Field label={`拡大率 ${Math.round(bg.scale * 100)}%`}>
            <input
              className="range"
              type="range"
              min={-3}
              max={3}
              step={0.01}
              disabled={disabled}
              value={Math.log2(bg.scale)}
              onChange={(e) => update({ scale: Math.round(2 ** parseFloat(e.target.value) * 1000) / 1000 }, 'bg-scale')}
            />
          </Field>
          <div className="field-row">
            <NumberField label="X" value={bg.x} disabled={disabled} onChange={(v) => update({ x: v }, 'bg-x')} />
            <NumberField label="Y" value={bg.y} disabled={disabled} onChange={(v) => update({ y: v }, 'bg-y')} />
            <NumberField label="回転" value={bg.rotation} min={-360} max={360} disabled={disabled} suffix="°" onChange={(v) => update({ rotation: v }, 'bg-rot')} />
          </div>
          {bg.locked ? (
            <p className="muted small">背景はロック中です。移動・拡大縮小するにはロックを外してください（ロック解除後はキャンバス上で背景をドラッグ・変形できます）。</p>
          ) : (
            <p className="muted small">キャンバス上の背景をドラッグで移動、選択してハンドルで拡大縮小・回転できます。作業後はロックを推奨します。</p>
          )}
          <div className="button-row">
            <button className="btn" disabled={disabled} onClick={() => update({ x: 0, y: 0, scale: 1, rotation: 0 })}>
              位置・倍率をリセット
            </button>
            <button className="btn" onClick={() => canvasApi.fitToContent()}>
              全体を表示
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (window.confirm('背景画像を削除しますか？（配置したオブジェクトは残ります）')) removeBackground();
              }}
            >
              背景を削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}
