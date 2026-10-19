import type React from 'react';
import { normalizeGrowiPath, type PortalBlockPayload, type PortalCardConfig, type PortalLabelMode } from '../remark-portal-cards';

export { normalizeGrowiPath } from '../remark-portal-cards';

// GROWIのバージョンや権限によって、閲覧者・いいね情報が欠落する場合も扱います。
export interface GrowiPageItem {
  _id: string;
  path: string;
  updatedAt?: string;
  seenUsers?: string[];
  liker?: string[];
}
export interface PortalCardsGridProps { configjson?: string }
const views = (page: GrowiPageItem): number => Array.isArray(page.seenUsers) ? page.seenUsers.length : 0;
const likes = (page: GrowiPageItem): number => Array.isArray(page.liker) ? page.liker.length : 0;
const updated = (page: GrowiPageItem): number => Date.parse(page.updatedAt ?? '') || 0;
const pageHref = (path: string): string => normalizeGrowiPath(path).split('/').map(encodeURIComponent).join('/');

/** 階層を表示する場合でも、カテゴリ境界を越えたパスは末尾名へフォールバックします。 */
export const formatShortcutLabel = (pagePath: string, basePath: string, mode: PortalLabelMode): string => {
  const page = normalizeGrowiPath(pagePath);
  const base = normalizeGrowiPath(basePath);
  const prefix = base === '/' ? '/' : `${base}/`;
  return mode === 'relative' && page.startsWith(prefix) ? page.slice(prefix.length) : page.split('/').pop() || page;
};

/** 起点自身・類似接頭辞を除外し、ピン留めと自動抽出をパス単位で重複なく統合します。 */
export const selectShortcutPages = (rawPages: GrowiPageItem[], card: PortalCardConfig): { totalSubordinatedCount: number; shortcuts: GrowiPageItem[] } => {
  const base = normalizeGrowiPath(card.path);
  const prefix = base === '/' ? '/' : `${base}/`;
  const unique = new Map<string, GrowiPageItem>();
  for (const page of rawPages) {
    const path = normalizeGrowiPath(page.path);
    if (path === base || !path.startsWith(prefix)) continue;
    if (!card.recursive && path.slice(prefix.length).includes('/')) continue;
    unique.set(path, page);
  }
  const score = (page: GrowiPageItem): number => card.sort === 'popular' ? likes(page) * 2 + views(page)
    : card.sort === 'views' ? views(page) : card.sort === 'likes' ? likes(page) : updated(page);
  const sorted = [...unique.values()].sort((left, right) => score(right) - score(left) || updated(right) - updated(left) || left.path.localeCompare(right.path));
  const selected = new Map<string, GrowiPageItem>();
  for (const pin of card.pins) {
    const path = normalizeGrowiPath(pin);
    if (path !== base && !selected.has(path) && selected.size < card.shortcuts) {
      selected.set(path, unique.get(path) ?? { _id: `pin-${path}`, path });
    }
  }
  for (const page of sorted) {
    if (selected.size >= card.shortcuts) break;
    const path = normalizeGrowiPath(page.path);
    if (!selected.has(path)) selected.set(path, page);
  }
  return { totalSubordinatedCount: unique.size, shortcuts: [...selected.values()] };
};

/** 全ページを集めてから選択し、先頭100件だけによる人気順位と件数の欠落を防ぎます。 */
export const fetchSubordinatedPages = async (path: string, signal: AbortSignal): Promise<GrowiPageItem[]> => {
  const pages: GrowiPageItem[] = [];
  const fetchedPaths = new Set<string>();
  for (let page = 1; ; page += 1) {
    const params = new URLSearchParams({ path: normalizeGrowiPath(path), limit: '100', page: String(page) });
    const response = await fetch(`/_api/v3/pages/list?${params}`, { credentials: 'same-origin', signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (data == null || typeof data !== 'object' || !('pages' in data) || !Array.isArray(data.pages)) throw new Error('ページ一覧の形式が不正です');
    const batch = data.pages as GrowiPageItem[];
    if (batch.some((item) => !item || typeof item.path !== 'string' || typeof item._id !== 'string')) throw new Error('ページ情報の形式が不正です');
    if (batch.length === 0) return pages;
    const previousSize = fetchedPaths.size;
    batch.forEach((item) => fetchedPaths.add(normalizeGrowiPath(item.path)));
    if (previousSize === fetchedPaths.size) throw new Error('ページ一覧の取得が進みません');
    pages.push(...batch);
    const total = 'totalCount' in data && typeof data.totalCount === 'number' ? data.totalCount : undefined;
    if (total !== undefined ? pages.length >= total : batch.length < 100) return pages;
  }
};

/** JSXとHooksの両方でホストのReactを使用し、二重インスタンスを避けます。 */
export const createPortalCardsGrid = (React: typeof import('react')) => {
  function SinglePortalCard({ card }: { card: PortalCardConfig }): React.ReactElement {
    const [state, setState] = React.useState<{ loading: boolean; count: number; shortcuts: GrowiPageItem[]; error: boolean }>({ loading: card.count || card.shortcuts > 0, count: 0, shortcuts: [], error: false });
    const cardKey = JSON.stringify(card);
    React.useEffect(() => {
      if (!card.count && card.shortcuts <= 0) {
        setState({ loading: false, count: 0, shortcuts: [], error: false });
        return;
      }
      const controller = new AbortController();
      setState({ loading: true, count: 0, shortcuts: [], error: false });
      void fetchSubordinatedPages(card.path, controller.signal).then((pages) => {
        if (controller.signal.aborted) return;
        const selected = selectShortcutPages(pages, card);
        setState({ loading: false, count: selected.totalSubordinatedCount, shortcuts: selected.shortcuts, error: false });
      }).catch(() => {
        if (!controller.signal.aborted) setState({ loading: false, count: 0, shortcuts: [], error: true });
      });
      // プレビュー更新時は旧リクエストを中断し、古い結果で上書きしないようにします。
      return () => controller.abort();
    }, [cardKey]);
    const pins = new Set(card.pins.map(normalizeGrowiPath));
    return (
      <div className={`card h-100 shadow-sm border-${card.color}`} data-testid="portal-card-item">
        <div className={`card-header border-${card.color} d-flex justify-content-between align-items-start gap-2`}>
          <a href={pageHref(card.path)} className={`fw-bold text-${card.color} text-decoration-none`} style={{ minWidth: 0, overflowWrap: 'anywhere' }} title={card.path}>
            {card.icon && <span aria-hidden="true">{card.icon} </span>}{card.title}
          </a>
          {card.count && <span className={`badge bg-${card.color} flex-shrink-0`} data-testid="portal-card-count" aria-live="polite">{state.loading ? '...' : state.error ? '取得失敗' : `${state.count}件`}</span>}
        </div>
        <div className="card-body d-flex flex-column">
          {card.description && <p className="small text-muted" style={{ overflowWrap: 'anywhere' }}>{card.description}</p>}
          {state.error ? <p className="small text-danger" role="status">ページ情報を取得できませんでした。</p> : card.shortcuts > 0 && (
            state.loading ? <p className="small text-muted" role="status">ショートカット読込中...</p> : state.shortcuts.length ? (
              <ul className="list-unstyled small border-top pt-2" data-testid="portal-card-shortcuts">
                {state.shortcuts.map((page) => (
                  <li key={normalizeGrowiPath(page.path)} className="py-1">
                    <a href={pageHref(page.path)} className="text-decoration-none" title={page.path} style={{ overflowWrap: 'anywhere' }}>
                      {pins.has(normalizeGrowiPath(page.path)) && <span role="img" aria-label="ピン留め">📌 </span>}
                      {formatShortcutLabel(page.path, card.path, card.label)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : <p className="small text-muted">配下のページはまだありません</p>
          )}
          <a href={pageHref(card.path)} className={`btn btn-sm btn-outline-${card.color} mt-auto`}>一覧を見る <span aria-hidden="true">→</span></a>
        </div>
      </div>
    );
  }

  return function PortalCardsGrid({ configjson }: PortalCardsGridProps): React.ReactElement {
    let payload: PortalBlockPayload;
    try {
      payload = configjson ? JSON.parse(configjson) as PortalBlockPayload : { cols: 3, cards: [] };
      if (!payload || !Array.isArray(payload.cards) || !payload.cards.every((card) => card && typeof card.path === 'string' && Array.isArray(card.pins))) throw new Error('設定形式が不正です');
    } catch {
      return <div className="alert alert-warning" role="alert">ポータルカード設定の読み込みに失敗しました。</div>;
    }
    if (!payload.cards.length) return <div className="text-muted" data-testid="portal-cards-empty">ポータルカードが定義されていません。</div>;
    const columns = payload.cols === 1 ? '' : ` row-cols-md-2${payload.cols === 4 ? ' row-cols-lg-4' : payload.cols === 2 ? '' : ' row-cols-lg-3'}`;
    return <div className={`row row-cols-1${columns} g-3 my-2`} data-testid="portal-cards-grid">
      {payload.cards.map((card, index) => <div className="col" key={`${card.path}-${index}`}><SinglePortalCard card={card} /></div>)}
    </div>;
  };
};