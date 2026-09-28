import { useBoard } from '../store/boardStore';
import { NumberField } from './fields';

/** 縮尺設定 (人物・車両の実寸表示に使用) */
export function ScaleSettings() {
  const ppm = useBoard((s) => s.doc.settings.pxPerMeter);
  const setPxPerMeter = useBoard((s) => s.setPxPerMeter);
  const applyRealisticSizes = useBoard((s) => s.applyRealisticSizes);
  return (
    <section className="subsection-plain">
      <h3 className="section-title">縮尺（実寸の目安）</h3>
      <NumberField label="1m あたりの長さ（背景画像のピクセル）" value={ppm} min={0.1} max={1000} step={0.5} onChange={setPxPerMeter} suffix="px/m" />
      <p className="muted small">
        人物（約0.6m）や車両（乗用車 約4.9m、バス 約11m など）は、この縮尺で実寸の大きさで配置されます。
        道路の幅（片側1車線 約3m）や建物の長さを目安に合わせてください。ボード左下の縮尺バーで確認できます。
      </p>
      <button
        className="btn small"
        onClick={() => {
          if (window.confirm('配置済みの人物・車両の大きさを、この縮尺の実寸に揃えますか？')) applyRealisticSizes();
        }}
      >
        配置済みの人物・車両を実寸に揃える
      </button>
    </section>
  );
}
