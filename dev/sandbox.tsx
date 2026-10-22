import React from 'react';
import { createRoot } from 'react-dom/client';
import Markdown, { type Components } from 'react-markdown';
import 'bootstrap/dist/css/bootstrap.min.css';
import './sandbox.css';
import { createPortalCardsGrid } from '../src/components/PortalCardsGrid';
import type { GrowiPageItem } from '../src/growi-pages';
import { normalizeGrowiPath, remarkPortalCardsPlugin } from '../src/remark-portal-cards';

// 本物のAPIと同じページング形式を返し、通信先を持たない環境でも検証できます。
const MOCK_DB: GrowiPageItem[] = [
  { _id: 'b0', path: '/BackOffice' },
  { _id: 'b1', path: '/BackOffice/経費精算', updatedAt: '2026-10-10', seenUsers: ['1', '2', '3', '4', '5'], liker: ['1', '2'] },
  { _id: 'b2', path: '/BackOffice/休暇申請', updatedAt: '2026-10-12', seenUsers: ['1', '2', '3', '4', '5', '6'], liker: ['1', '2', '3'] },
  { _id: 'b3', path: '/BackOffice/年末調整', updatedAt: '2026-10-15', seenUsers: ['1', '2'], liker: ['1'] },
  { _id: 'b4', path: '/BackOffice/備品購入', updatedAt: '2026-10-16', seenUsers: ['1'] },
  { _id: 'e1', path: '/Engineering/Onboarding/PC初期設定', updatedAt: '2026-10-11', seenUsers: ['1', '2', '3', '4'], liker: ['1', '2', '3'] },
  { _id: 'e2', path: '/Engineering/Onboarding/Git運用ルール', updatedAt: '2026-10-14', seenUsers: ['1', '2', '3'], liker: ['1', '2'] },
  { _id: 'e3', path: '/Engineering/Onboarding/開発規約', updatedAt: '2026-10-09', seenUsers: ['1', '2'] },
  { _id: 't0', path: '/TechKnowhow' },
  { _id: 't1', path: '/TechKnowhow/Azure/データ基盤設計', updatedAt: '2026-10-16', seenUsers: ['1', '2', '3', '4'], liker: ['1', '2', '3'] },
  { _id: 't2', path: '/TechKnowhow/CSharp/性能改善', updatedAt: '2026-10-15', seenUsers: ['1', '2', '3'], liker: ['1', '2'] },
  { _id: 't3', path: '/TechKnowhow/障害対応/調査手順', updatedAt: '2026-10-13', seenUsers: ['1', '2'] },
  { _id: 's1', path: '/Sandbox/EmptyBody', seenUsers: [] },
  { _id: 's2', path: '/Sandbox/BrokenImage', seenUsers: ['1'] },
  { _id: 's3', path: '/Sandbox/MetadataUnavailable', seenUsers: ['1'] },
  // 一覧には存在しても、閲覧者向けメタAPIからは返らないページを再現します。
  { _id: 'p1', path: '/AccessCheck/Hidden', seenUsers: ['1', '2', '3', '4', '5'] },
  { _id: 'p2', path: '/AccessCheck/ReadableA', seenUsers: ['1', '2', '3', '4'] },
  { _id: 'p3', path: '/AccessCheck/ReadableB', seenUsers: ['1', '2'] },
  { _id: 'd1', path: '/DeniedOnly/HiddenA', seenUsers: ['1'] },
  { _id: 'd2', path: '/DeniedOnly/HiddenB', seenUsers: ['1'] },
  { _id: 'f1', path: '/MetaError/Only', seenUsers: ['1'] },
].map((page, index) => ({
  seenUsers: [], liker: [], updatedAt: '2026-10-01', ...page,
  // MongoIdと画像フィールドも実APIに揃え、親なしの開発カテゴリを含めます。
  _id: (index + 1).toString(16).padStart(24, '0'),
  lastUpdateUser: { username: 'sandbox-user', imageUrlCached: page.path.endsWith('BrokenImage') ? '/sandbox-missing-avatar.png' : '/images/icons/user.svg' },
}));

const MOCK_BODIES: Record<string, string> = {
  '/AccessCheck/ReadableA': '現在の閲覧者が参照できるページです。参照不可のピンを飛ばした後も、このページはカードとして表示されます。',
  '/AccessCheck/ReadableB': '表示枠に空きがある場合、閲覧可能な次の候補を補充します。バッジは実際に表示するカード数だけを数えます。',
  '/BackOffice/経費精算': '交通費・出張旅費・立替購入の精算手順をまとめています。領収書の添付、勘定科目の選択、申請期限、承認後の振込予定まで確認できます。月末の申請は翌営業日までに提出してください。不備で差し戻された場合は、修正理由をコメントに記載して再申請します。海外出張の換算レートと証憑の保存方法も掲載しています。',
  '/BackOffice/休暇申請': '有給休暇・特別休暇の申請方法です。取得予定日と引継ぎ先を入力し、所属長へ承認を依頼します。半日休暇と時間単位休暇の取り扱い、残日数の確認先、申請後の変更手順もこちらから確認できます。',
  '/BackOffice/年末調整': '年末調整に必要な書類と提出スケジュールを掲載しています。扶養控除、保険料控除、住宅ローン控除の対象となる方は、入力内容と添付書類を確認してください。提出後の修正は担当窓口へご連絡ください。',
  '/BackOffice/備品購入': '備品の購入前に見積書を添えて申請してください。金額別の承認ルート、納品後の検収、資産管理番号の付与について説明しています。',
  '/Engineering/Onboarding/PC初期設定': '開発PCのセットアップ手順です。アカウント登録、VPN接続、エディター設定、コンテナー環境の導入を順に進めます。初回の動作確認にはサンプルアプリを使用してください。',
  '/Engineering/Onboarding/Git運用ルール': 'ブランチ作成からレビュー、マージまでのチーム共通ルールです。コミット粒度とレビュー依頼時の確認項目をまとめています。',
  '/Engineering/Onboarding/開発規約': '命名、エラー処理、ログ、テストの基本方針を掲載しています。新規実装では近隣の既存コードと合わせ、変更理由をレビューで説明できるようにします。',
  '/TechKnowhow/Azure/データ基盤設計': 'データ取り込みから集計・公開までの構成を解説しています。各レイヤーの役割、アクセス権限、日次更新時の監視項目を整理しました。',
  '/TechKnowhow/CSharp/性能改善': '遅い処理の計測から改善効果の検証までをまとめた調査ノートです。プロファイラー、データベース実行計画、メモリー割り当ての確認例を掲載しています。',
  '/TechKnowhow/障害対応/調査手順': '障害発生時の初動チェックリストです。影響範囲、直近の変更、ログとメトリクスを確認し、対応履歴を残してください。',
};

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  if (url.origin !== window.location.origin || !['/_api/v3/pages/list', '/_api/v3/page-listing/info'].includes(url.pathname)) return originalFetch(input, init);
  if (init?.signal?.aborted) throw new DOMException('中断されました', 'AbortError');
  const jsonResponse = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname.endsWith('/page-listing/info')) {
    const ids = [...url.searchParams].filter(([key]) => /^pageIds\[\d+\]$/.test(key)).map(([, value]) => value);
    const requested = MOCK_DB.filter((page) => ids.includes(page._id));
    if (requested.some((page) => page.path.startsWith('/MetaError/'))) return jsonResponse({ errors: [{ message: '検証用のメタ取得失敗' }] }, 503);
    const items = requested.filter((page) => !page.path.endsWith('MetadataUnavailable') && page.path !== '/AccessCheck/Hidden' && !page.path.startsWith('/DeniedOnly/'));
    return jsonResponse(Object.fromEntries(items.map((page) => [page._id, {
      isEmpty: false,
      sumOfSeenUsers: page.seenUsers?.length ?? 0,
      ...(url.searchParams.get('attachShortBody') === 'true' ? { revisionShortBody: MOCK_BODIES[page.path] ?? '' } : {}),
    }])));
  }
  const path = normalizeGrowiPath(url.searchParams.get('path') ?? '/');
  if (path === '/Sandbox/ListError') return jsonResponse({ errors: [{ message: '検証用の取得失敗' }] }, 503);
  const matched = MOCK_DB.filter((page) => page.path === path || page.path.startsWith(path === '/' ? '/' : `${path}/`));
  const limit = Math.max(1, Number(url.searchParams.get('limit')) || 100);
  const offset = (Math.max(1, Number(url.searchParams.get('page')) || 1) - 1) * limit;
  return jsonResponse({ pages: matched.slice(offset, offset + limit), totalCount: matched.length, offset, limit });
};

const Grid = createPortalCardsGrid(React);
// カスタムタグの型はreact-markdown標準のHTMLタグ一覧を拡張して渡します。
const components = { 'growi-portal-cards': Grid } as Components;
const INITIAL_MARKDOWN = `# 社内ノウハウポータル

\`\`\`portal(cols=3, limit=12, sort=popular, excerpt=true, excerptLength=120, excerptLines=3)
# パス | タイトル | 説明 | 個別オプション
/BackOffice | 総務・経費・勤怠 | 各種申請、年末調整、備品購入の手続き | icon=💼, pins=/BackOffice/年末調整
/Engineering/Onboarding | 開発標準・環境構築 | PC初期設定、Git運用ルール、開発規約 | icon=💻
/TechKnowhow | 技術調査・ノウハウ | 調査レポート、性能改善、トラブルシューティング | icon=🔎, label=relative
\`\`\`
`;

function SandboxApp(): React.ReactElement {
  const [markdown, setMarkdown] = React.useState(INITIAL_MARKDOWN);
  const [preset, setPreset] = React.useState('standard');
  const applyPreset = (value: string) => {
    setPreset(value);
    const settings = value === 'off' ? 'excerpt=false, excerptLength=120, excerptLines=3'
      : value === 'compact' ? 'excerpt=true, excerptLength=60, excerptLines=1'
      : value === 'expanded' ? 'excerpt=true, excerptLength=240, excerptLines=5'
      : 'excerpt=true, excerptLength=120, excerptLines=3';
    // UI操作もDSLへ反映し、プレビューだけを別設定で動かさないようにします。
    setMarkdown((current) => current.replace(/(```portal(?:-cards)?\()([^\n]*)(\))/, (_match, start: string, options: string, end: string) => {
      const kept = options.split(',').map((part) => part.trim()).filter((part) => !/^excerpt(?:length|lines)?\s*=/i.test(part));
      return `${start}${[...kept, settings].join(', ')}${end}`;
    }));
  };
  return (
    <main className="sandbox container-fluid px-3 px-md-4 py-4">
      <header className="d-flex flex-wrap align-items-baseline justify-content-between gap-2 mb-4">
        <h1 className="sandbox-title m-0">growi-plugin-portal-cards</h1>
        <span className="text-muted small">LOCAL SANDBOX</span>
      </header>
      <section className="editor-section mb-4" aria-labelledby="editor-title">
        <div className="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-2">
          <label id="editor-title" htmlFor="markdown-source" className="form-label fw-bold small mb-0">Markdown</label>
          <label className="d-flex align-items-center gap-2 small">抜粋
            <select className="form-select form-select-sm" aria-label="抜粋表示" value={preset} onChange={(event) => applyPreset(event.target.value)} style={{ width: 160 }}>
              <option value="off">なし</option><option value="compact">60文字・1行</option><option value="standard">120文字・3行</option><option value="expanded">240文字・5行</option>
              {preset === 'custom' && <option value="custom" disabled>カスタム</option>}
            </select>
          </label>
        </div>
        <textarea id="markdown-source" className="form-control font-monospace" rows={9} value={markdown} onChange={(event) => { setMarkdown(event.target.value); setPreset('custom'); }} spellCheck={false} />
      </section>
      <section className="preview-section pt-4" aria-label="プレビュー">
        <Markdown remarkPlugins={[remarkPortalCardsPlugin]} components={components}>{markdown}</Markdown>
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<SandboxApp />);