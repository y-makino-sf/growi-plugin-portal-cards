import React from 'react';
import { createRoot } from 'react-dom/client';
import Markdown, { type Components } from 'react-markdown';
import 'bootstrap/dist/css/bootstrap.min.css';
import './sandbox.css';
import { createPortalCardsGrid, type GrowiPageItem } from '../src/components/PortalCardsGrid';
import { normalizeGrowiPath, remarkPortalCardsPlugin } from '../src/remark-portal-cards';

// 本物のAPIと同じページング形式を返し、通信先を持たない環境でも検証できます。
const MOCK_DB: GrowiPageItem[] = [
  { _id: 'b0', path: '/BackOffice' },
  { _id: 'b1', path: '/BackOffice/経費精算', updatedAt: '2026-10-10', seenUsers: ['1', '2', '3', '4', '5'], liker: ['1', '2'] },
  { _id: 'b2', path: '/BackOffice/休暇申請', updatedAt: '2026-10-12', seenUsers: ['1', '2', '3', '4', '5', '6'], liker: ['1', '2', '3'] },
  { _id: 'b3', path: '/BackOffice/年末調整', updatedAt: '2026-10-15', seenUsers: ['1', '2'], liker: ['1'] },
  { _id: 'b4', path: '/BackOffice/備品購入', updatedAt: '2026-10-16', seenUsers: ['1'] },
  { _id: 'e0', path: '/Engineering/Onboarding' },
  { _id: 'e1', path: '/Engineering/Onboarding/PC初期設定', updatedAt: '2026-10-11', seenUsers: ['1', '2', '3', '4'], liker: ['1', '2', '3'] },
  { _id: 'e2', path: '/Engineering/Onboarding/Git運用ルール', updatedAt: '2026-10-14', seenUsers: ['1', '2', '3'], liker: ['1', '2'] },
  { _id: 'e3', path: '/Engineering/Onboarding/開発規約', updatedAt: '2026-10-09', seenUsers: ['1', '2'] },
  { _id: 't0', path: '/TechKnowhow' },
  { _id: 't1', path: '/TechKnowhow/Azure/データ基盤設計', updatedAt: '2026-10-16', seenUsers: ['1', '2', '3', '4'], liker: ['1', '2', '3'] },
  { _id: 't2', path: '/TechKnowhow/CSharp/性能改善', updatedAt: '2026-10-15', seenUsers: ['1', '2', '3'], liker: ['1', '2'] },
  { _id: 't3', path: '/TechKnowhow/障害対応/調査手順', updatedAt: '2026-10-13', seenUsers: ['1', '2'] },
];

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  if (url.origin !== window.location.origin || url.pathname !== '/_api/v3/pages/list') return originalFetch(input, init);
  const path = normalizeGrowiPath(url.searchParams.get('path') ?? '/');
  const matched = MOCK_DB.filter((page) => page.path === path || page.path.startsWith(path === '/' ? '/' : `${path}/`));
  const limit = Math.max(1, Number(url.searchParams.get('limit')) || 100);
  const offset = (Math.max(1, Number(url.searchParams.get('page')) || 1) - 1) * limit;
  return new Response(JSON.stringify({ pages: matched.slice(offset, offset + limit), totalCount: matched.length, limit }), { headers: { 'Content-Type': 'application/json' } });
};

const Grid = createPortalCardsGrid(React);
// カスタムタグの型はreact-markdown標準のHTMLタグ一覧を拡張して渡します。
const components = { 'growi-portal-cards': Grid } as Components;
const INITIAL_MARKDOWN = `# 社内ノウハウポータル

\`\`\`portal(cols=3, shortcuts=3, sort=popular)
# パス | タイトル | 説明 | 個別オプション
/BackOffice | 総務・経費・勤怠 | 各種申請、年末調整、備品購入の手続き | icon=💼, pins=/BackOffice/年末調整
/Engineering/Onboarding | 開発標準・環境構築 | PC初期設定、Git運用ルール、開発規約 | icon=💻
/TechKnowhow | 技術調査・ノウハウ | 調査レポート、性能改善、トラブルシューティング | icon=🔎, label=relative
\`\`\`
`;

function SandboxApp(): React.ReactElement {
  const [markdown, setMarkdown] = React.useState(INITIAL_MARKDOWN);
  return (
    <main className="sandbox container-fluid px-3 px-md-4 py-4">
      <header className="d-flex flex-wrap align-items-baseline justify-content-between gap-2 mb-4">
        <h1 className="sandbox-title m-0">growi-plugin-portal-cards</h1>
        <span className="text-muted small">LOCAL SANDBOX</span>
      </header>
      <section className="editor-section mb-4" aria-labelledby="editor-title">
        <label id="editor-title" htmlFor="markdown-source" className="form-label fw-bold small">Markdown</label>
        <textarea id="markdown-source" className="form-control font-monospace" rows={9} value={markdown} onChange={(event) => setMarkdown(event.target.value)} spellCheck={false} />
      </section>
      <section className="preview-section pt-4" aria-label="プレビュー">
        <Markdown remarkPlugins={[remarkPortalCardsPlugin]} components={components}>{markdown}</Markdown>
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<SandboxApp />);