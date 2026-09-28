import { KIND_LABEL, objectDisplayName } from '../model/definitions';
import type { BoardObject, OperationDocument } from '../model/types';

interface Props {
  doc: OperationDocument;
  image: string | null;
}

function detailOf(o: BoardObject): string {
  switch (o.kind) {
    case 'person':
      return [o.role, o.affiliation, o.count > 1 ? `${o.count}人` : '', o.status].filter(Boolean).join(' / ');
    case 'vehicle':
      return [o.vehicleType, o.assignee && `担当:${o.assignee}`, o.crew && `乗員:${o.crew}`].filter(Boolean).join(' / ');
    case 'facility':
      return [o.facilityType, o.description].filter(Boolean).join(' / ');
    case 'point':
      return [o.description, o.assignee && `担当:${o.assignee}`].filter(Boolean).join(' / ');
    case 'crowd':
      return [o.crowdType, o.estimatedCount !== null ? `想定${o.estimatedCount}人` : '', o.description].filter(Boolean).join(' / ');
    case 'zone':
      return [o.zoneType, o.description].filter(Boolean).join(' / ');
    case 'route':
      return [o.routeType, o.startLabel && `${o.startLabel} → ${o.endLabel || '?'}`].filter(Boolean).join(' / ');
    case 'memo':
      return o.text;
    default:
      return '';
  }
}

const LIST_KINDS: BoardObject['kind'][] = ['person', 'vehicle', 'facility', 'point', 'crowd', 'zone', 'route', 'memo'];

/** 印刷 / PDF 保存用のシート (画面では非表示) */
export function PrintSheet({ doc, image }: Props) {
  const dt = doc.meta.datetime ? doc.meta.datetime.replace('T', ' ') : '';
  const objs = doc.objects.filter((o) => LIST_KINDS.includes(o.kind));
  return (
    <div className="print-sheet" aria-hidden>
      <header>
        <h1>{doc.meta.title || '作戦計画'}</h1>
        <div className="print-meta">
          {dt && <span>日時：{dt}</span>}
          {doc.meta.subject && <span>対象：{doc.meta.subject}</span>}
          <span>出力：{new Date().toLocaleString('ja-JP')}</span>
        </div>
        {doc.meta.description && <p>{doc.meta.description}</p>}
        <p className="print-note">※ 架空のシナリオに基づく計画資料</p>
      </header>
      {image && <img className="print-image" src={image} alt="作戦ボード" />}
      {doc.timeline.length > 0 && (
        <section>
          <h2>タイムライン</h2>
          <table>
            <thead>
              <tr>
                <th>時刻</th>
                <th>行動</th>
                <th>場所</th>
                <th>移動手段</th>
                <th>担当</th>
                <th>備考</th>
              </tr>
            </thead>
            <tbody>
              {doc.timeline.map((t) => (
                <tr key={t.id}>
                  <td>{t.time}</td>
                  <td>{t.action}</td>
                  <td>{t.location}</td>
                  <td>{t.transport}</td>
                  <td>{t.assignee}</td>
                  <td>{t.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {objs.length > 0 && (
        <section>
          <h2>配置一覧</h2>
          <table>
            <thead>
              <tr>
                <th>区分</th>
                <th>名称</th>
                <th>詳細</th>
                <th>備考</th>
              </tr>
            </thead>
            <tbody>
              {objs.map((o) => (
                <tr key={o.id}>
                  <td>{KIND_LABEL[o.kind]}</td>
                  <td>{o.kind === 'memo' ? '' : objectDisplayName(o)}</td>
                  <td>{detailOf(o)}</td>
                  <td>{o.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
