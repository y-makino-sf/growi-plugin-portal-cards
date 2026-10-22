import type React from 'react';
import { normalizeGrowiPath, type PortalBlockPayload, type PortalCardConfig } from '../remark-portal-cards';
import { createGrowiPagesClient, formatExcerpt, formatPageLabel, userPictureUrl, type GrowiPageItem, type PageCardData, type PageSectionData } from '../growi-pages';

export interface PortalCardsGridProps { configjson?: string }
const pathHref = (path: string): string => normalizeGrowiPath(path).split('/').map(encodeURIComponent).join('/');
const isIntegerBetween = (value: number, minimum: number, maximum: number): boolean => Number.isSafeInteger(value) && value >= minimum && value <= maximum;

/** JSONは外部入力なので、Hooksを動かす前にDSLと同じ値域を確認します。 */
const validPayload = (value: PortalBlockPayload): boolean => Boolean(value && [1, 2, 3, 4].includes(value.cols) && Array.isArray(value.cards) && value.cards.every((card) =>
  card && typeof card.path === 'string' && card.path.startsWith('/') &&
  ['title', 'description', 'icon'].every((key) => typeof card[key as 'title' | 'description' | 'icon'] === 'string') &&
  Array.isArray(card.pins) && card.pins.every((pin) => typeof pin === 'string') &&
  ['primary', 'success', 'info', 'warning', 'danger', 'secondary'].includes(card.color) &&
  ['popular', 'updatedAt', 'views', 'likes'].includes(card.sort) && ['title', 'relative'].includes(card.label) &&
  typeof card.recursive === 'boolean' && typeof card.count === 'boolean' && typeof card.excerpt === 'boolean' &&
  isIntegerBetween(card.limit, 0, Number.MAX_SAFE_INTEGER) && isIntegerBetween(card.excerptLength, 1, 300) && isIntegerBetween(card.excerptLines, 1, 10)));

/** JSXのcreateElementもHooksも、GROWIから渡された同じReactを使用します。 */
export const createPortalCardsGrid = (React: typeof import('react')) => {
  function UserAvatar({ user }: { user: GrowiPageItem['lastUpdateUser'] }): React.ReactElement {
    const [failures, setFailures] = React.useState(0);
    const source = failures ? '/images/icons/user.svg' : userPictureUrl(user);
    const username = typeof user === 'object' && user?.username ? user.username : '匿名ユーザー';
    // 標準画像も取得できない環境では、壊れた画像の代わりに匿名表示へ切り替えます。
    return failures >= 2 ? <span role="img" aria-label="匿名ユーザー" style={{ width: 32, height: 32, flexShrink: 0 }}><span aria-hidden="true">👤</span></span>
      : <img src={source} alt={`最終更新者: ${username}`} width={32} height={32} className="rounded-circle flex-shrink-0" style={{ objectFit: 'cover' }} onError={() => setFailures((previous) => previous + 1)} />;
  }

  function PageCard({ item, card }: { item: PageCardData; card: PortalCardConfig }): React.ReactElement | null {
    const { page, meta } = item;
    const available = meta?.isEmpty === false;
    // 取得側の判定に加え、描画側でも未確認のパス・タイトルを表示しません。
    if (!available) return null;
    const seenCount = available ? meta.sumOfSeenUsers ?? (Array.isArray(page.seenUsers) ? page.seenUsers.length : undefined) : undefined;
    const excerpt = card.excerpt && available && typeof meta.revisionShortBody === 'string' ? formatExcerpt(meta.revisionShortBody, card.excerptLength) : '';
    const pinned = card.pins.some((pin) => normalizeGrowiPath(pin) === normalizeGrowiPath(page.path));
    return <article className={`card h-100 border-${card.color}`} data-testid="portal-card-item">
      <div className="card-body p-3" style={{ minWidth: 0 }}>
        <div className="small text-muted mb-2" data-testid="portal-card-path" style={{ overflowWrap: 'anywhere' }}>{page.path}</div>
        <div className="d-flex align-items-start gap-2">
          <UserAvatar key={`${page._id}:${available ? userPictureUrl(page.lastUpdateUser) : ''}`} user={available ? page.lastUpdateUser : undefined} />
          <h3 className="m-0 flex-grow-1" style={{ fontSize: '1rem', lineHeight: 1.5, minWidth: 0, overflowWrap: 'anywhere' }}>
            <a href={pathHref(page.path)} className={`text-${card.color} text-decoration-none`} title={page.path}>{formatPageLabel(page.path, card.path, card.label)}</a>
          </h3>
          {pinned && <span role="img" aria-label="ピン留め" className="flex-shrink-0">📌</span>}
        </div>
        {seenCount !== undefined && <div className="small text-muted mt-2" data-testid="portal-card-views" aria-label={`閲覧者数 ${seenCount}人`} title="足跡（閲覧したユーザー数）"><span aria-hidden="true">👣 </span>{seenCount}</div>}
        {excerpt && <p className="small text-body-secondary mt-2 mb-0" data-testid="portal-card-excerpt" style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: card.excerptLines, overflow: 'hidden', overflowWrap: 'anywhere', lineHeight: 1.6 }}>{excerpt}</p>}
      </div>
    </article>;
  }

  function PageSection({ card, cols, client }: { card: PortalCardConfig; cols: number; client: ReturnType<typeof createGrowiPagesClient> }): React.ReactElement {
    const key = JSON.stringify([card.path, card.limit, card.sort, card.recursive, card.pins, card.count, card.excerpt]);
    const [state, setState] = React.useState<{ key: string; data?: PageSectionData; loading: boolean; error: boolean }>({ key, loading: true, error: false });
    React.useEffect(() => {
      const controller = new AbortController();
      setState({ key, loading: true, error: false });
      void client.load(card, controller.signal).then((data) => {
        if (!controller.signal.aborted) setState({ key, data, loading: false, error: false });
      }).catch(() => {
        if (!controller.signal.aborted) setState({ key, loading: false, error: true });
      });
      return () => controller.abort();
    }, [key, client]);
    // 設定変更直後も前のパスの結果を一瞬表示しないようにします。
    const loading = state.key !== key || state.loading;
    const data = state.key === key ? state.data : undefined;
    const error = state.key === key && state.error;
    const columns = cols === 1 ? '' : ` row-cols-md-2${cols === 4 ? ' row-cols-lg-4' : cols === 2 ? '' : ' row-cols-lg-3'}`;
    return <section className="my-4" aria-label={card.title}>
      <div className="d-flex align-items-start gap-2 mb-2">
        <h2 className="m-0" style={{ fontSize: '1.125rem', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          <a href={pathHref(card.path)} className="text-body text-decoration-none">{card.icon && <span aria-hidden="true">{card.icon} </span>}{card.title}</a>
        </h2>
        {card.count && <span className={`badge bg-${card.color} flex-shrink-0`} data-testid="portal-card-count" title="参照を確認でき、実際に表示するページ数" aria-live="polite">{loading ? '...' : error || (data?.metaFailed && !data.pages.length) ? '取得失敗' : `表示${data?.displayedCount ?? 0}件`}</span>}
      </div>
      {card.description && <p className="small text-muted mb-2" style={{ overflowWrap: 'anywhere' }}>{card.description}</p>}
      {loading ? <p className="small text-muted" role="status">ページ情報を読込中...</p> : error ? <p className="small text-danger" role="status">一覧を取得できませんでした。件数と順位は未確定です。</p> : <>
        {data?.metaFailed && <p className="small text-muted" role="status">一部のページ情報を取得できませんでした。</p>}
        {data?.pages.length ? <div className={`row row-cols-1${columns} g-3`} data-testid="portal-cards-grid">
          {data.pages.map((item) => <div className="col" key={item.page._id}><PageCard item={item} card={card} /></div>)}
        </div> : card.limit > 0 && !data?.metaFailed && <p className="small text-muted">表示できるページがありません</p>}
      </>}
    </section>;
  }

  return function PortalCardsGrid({ configjson }: PortalCardsGridProps): React.ReactElement {
    const [client] = React.useState(createGrowiPagesClient);
    React.useEffect(() => () => client.dispose(), [client]);
    let payload: PortalBlockPayload;
    try {
      payload = configjson ? JSON.parse(configjson) as PortalBlockPayload : { cols: 3, cards: [] };
      if (!validPayload(payload)) throw new Error('設定形式が不正です');
    } catch {
      return <div className="alert alert-warning" role="alert">ポータルカード設定の読み込みに失敗しました。</div>;
    }
    if (!payload.cards.length) return <div className="text-muted" data-testid="portal-cards-empty">ポータルカードが定義されていません。</div>;
    return <div data-testid="portal-card-sections">{payload.cards.map((card, index) => <PageSection key={`${card.path}-${index}`} card={card} cols={payload.cols} client={client} />)}</div>;
  };
};