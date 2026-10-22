import { normalizeGrowiPath, type PortalCardConfig, type PortalLabelMode } from './remark-portal-cards';

/** GROWI 7.1.9のpages/listは本文なしのページと最終更新者を直接返します。 */
export interface GrowiPageItem {
  _id: string;
  path: string;
  updatedAt?: string;
  isEmpty?: boolean;
  status?: string;
  seenUsers?: string[];
  liker?: string[];
  lastUpdateUser?: { username?: string; imageUrlCached?: string | null } | string | null;
}
export interface GrowiPageMeta {
  isEmpty: boolean;
  sumOfSeenUsers?: number;
  revisionShortBody?: string;
}
export interface PageCardData {
  page: GrowiPageItem;
  meta: GrowiPageMeta;
}
export interface PageSectionData { displayedCount: number; pages: PageCardData[]; metaFailed: boolean }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const aborted = (): DOMException => new DOMException('中断されました', 'AbortError');

/** タイトルとフルパスを別表示し、relativeはカテゴリ境界の内側だけ切り出します。 */
export const formatPageLabel = (pagePath: string, basePath: string, mode: PortalLabelMode): string => {
  const page = normalizeGrowiPath(pagePath);
  const base = normalizeGrowiPath(basePath);
  const prefix = base === '/' ? '/' : `${base}/`;
  return mode === 'relative' && page.startsWith(prefix) ? page.slice(prefix.length) : page.split('/').pop() || page;
};

/** 外部画像もGROWI標準同様に許可しますが、スクリプトURLや認証情報付きURLは除外します。 */
export const userPictureUrl = (user: GrowiPageItem['lastUpdateUser']): string => {
  const fallback = '/images/icons/user.svg';
  if (!isRecord(user) || typeof user.username !== 'string' || typeof user.imageUrlCached !== 'string') return fallback;
  const raw = user.imageUrlCached.trim();
  if (!raw || /[\u0000-\u0020\\]/.test(raw)) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : fallback;
  } catch {
    return fallback;
  }
};

/** APIの短文をテキストとして整形し、結合文字や絵文字を途中で分断しません。 */
export const formatExcerpt = (body: string, maximum: number): string => {
  const text = body.replace(/\s+/gu, ' ').trim();
  const segments = [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text)].map((part) => part.segment);
  return segments.length > maximum ? `${segments.slice(0, Math.max(0, maximum - 1)).join('')}…` : text;
};

/** 起点・空ページ・削除済み・類似パスを除外してから、固定順と自動順を統合します。 */
export const orderPageCandidates = (pages: GrowiPageItem[], card: PortalCardConfig): GrowiPageItem[] => {
  const base = normalizeGrowiPath(card.path);
  const prefix = base === '/' ? '/' : `${base}/`;
  const unique = new Map<string, GrowiPageItem>();
  const ids = new Set<string>();
  for (const page of pages) {
    const path = normalizeGrowiPath(page.path);
    if (path === base || !path.startsWith(prefix) || page.isEmpty || page.status === 'deleted') continue;
    if (!card.recursive && path.slice(prefix.length).includes('/')) continue;
    if (unique.has(path) || ids.has(page._id)) continue;
    unique.set(path, page);
    ids.add(page._id);
  }
  const candidates = [...unique.values()];
  if (card.limit === 0) return candidates;
  // 未提供を0とみなすと誤った人気順位になるため、必要な配列がない場合は明示的に失敗します。
  if (candidates.some((page) =>
    (['popular', 'views'].includes(card.sort) && !Array.isArray(page.seenUsers)) ||
    (['popular', 'likes'].includes(card.sort) && !Array.isArray(page.liker)))) {
    throw new Error('並び順の計算に必要なページ情報がありません。');
  }
  const updated = (page: GrowiPageItem): number => Date.parse(page.updatedAt ?? '') || 0;
  const score = (page: GrowiPageItem): number => card.sort === 'popular' ? (page.liker?.length ?? 0) * 2 + (page.seenUsers?.length ?? 0)
    : card.sort === 'views' ? page.seenUsers!.length : card.sort === 'likes' ? page.liker!.length : updated(page);
  candidates.sort((left, right) => score(right) - score(left) || updated(right) - updated(left) || left.path.localeCompare(right.path, 'ja'));
  const selected = new Map<string, GrowiPageItem>();
  for (const pin of card.pins) {
    const path = normalizeGrowiPath(pin);
    const found = unique.get(path);
    if (found) selected.set(path, found);
  }
  for (const page of candidates) {
    const path = normalizeGrowiPath(page.path);
    if (!selected.has(path)) selected.set(path, page);
  }
  return [...selected.values()];
};

const getJson = async (url: string, signal: AbortSignal): Promise<Record<string, unknown>> => {
  const response = await fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' }, signal });
  if (!response.ok) throw new Error('ページ情報の取得に失敗しました。');
  const data: unknown = await response.json();
  if (!isRecord(data) || Object.hasOwn(data, 'errors')) throw new Error('ページ情報の形式が不正です。');
  return data;
};

/** 全候補を取得できなければ、部分的な結果で総件数や人気順位を確定しません。 */
export const fetchSubordinatedPages = async (path: string, signal: AbortSignal): Promise<GrowiPageItem[]> => {
  const pages: GrowiPageItem[] = [];
  const ids = new Set<string>();
  for (let page = 1; ; page += 1) {
    const params = new URLSearchParams({ path: normalizeGrowiPath(path), limit: '100', page: String(page) });
    const data = await getJson(`/_api/v3/pages/list?${params}`, signal);
    if (!Array.isArray(data.pages) || !nonnegativeInteger(data.totalCount)) throw new Error('ページ一覧の形式が不正です。');
    const batch = data.pages;
    if (batch.some((item) => !isRecord(item) || typeof item.path !== 'string' || !item.path.startsWith('/') || typeof item._id !== 'string' || !item._id)) throw new Error('ページ情報の形式が不正です。');
    if (!batch.length) {
      if (pages.length < data.totalCount) throw new Error('ページ一覧の取得が完了していません。');
      return pages;
    }
    const previousSize = ids.size;
    for (const item of batch as GrowiPageItem[]) ids.add(item._id);
    if (previousSize === ids.size) throw new Error('ページ一覧の取得が進みません。');
    pages.push(...batch as GrowiPageItem[]);
    if (pages.length >= data.totalCount) return pages;
  }
};

interface SharedRequest {
  controller: AbortController;
  promise: Promise<unknown>;
  users: number;
  settled: boolean;
}

/** キャッシュと実行中リクエストはグリッドの生存期間に閉じ、別ユーザーへ永続化しません。 */
export const createGrowiPagesClient = () => {
  const requests = new Map<string, SharedRequest>();
  const metadata = new Map<string, GrowiPageMeta | undefined>();
  const shared = <Result,>(key: string, loader: (signal: AbortSignal) => Promise<Result>, signal: AbortSignal): Promise<Result> => {
    if (signal.aborted) return Promise.reject(aborted());
    let request = requests.get(key);
    if (!request) {
      const controller = new AbortController();
      const created: SharedRequest = { controller, users: 0, settled: false, promise: Promise.resolve() };
      created.promise = loader(controller.signal).then((result) => {
        created.settled = true;
        return result;
      }, (error: unknown) => {
        if (requests.get(key) === created) requests.delete(key);
        created.settled = true;
        throw error;
      });
      requests.set(key, created);
      request = created;
    }
    const current = request;
    current.users += 1;
    return new Promise<Result>((resolve, reject) => {
      let finished = false;
      const finish = (callback: () => void) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', cancel);
        current.users -= 1;
        if (!current.users && !current.settled) {
          current.controller.abort();
          if (requests.get(key) === current) requests.delete(key);
        }
        callback();
      };
      const cancel = () => finish(() => reject(aborted()));
      signal.addEventListener('abort', cancel, { once: true });
      current.promise.then((result) => finish(() => resolve(result as Result)), (error: unknown) => finish(() => reject(error)));
    });
  };
  const metaKey = (page: GrowiPageItem, excerpt: boolean): string => JSON.stringify([page._id, page.updatedAt, excerpt]);
  const getMetadata = async (pages: GrowiPageItem[], excerpt: boolean, signal: AbortSignal): Promise<Map<string, GrowiPageMeta | undefined>> => {
    const missing = pages.filter((page) => !metadata.has(metaKey(page, excerpt)));
    const chunks: GrowiPageItem[][] = [];
    // qsの既定arrayLimitでも配列として解釈できるよう、添字は0〜19に収めます。
    for (let offset = 0; offset < missing.length; offset += 20) chunks.push(missing.slice(offset, offset + 20));
    // 同時通信を2バッチまでにし、limitを大きくしてもサーバーへ集中させません。
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(2, chunks.length) }, async () => {
      while (next < chunks.length) {
        const batch = chunks[next++].slice().sort((left, right) => left._id.localeCompare(right._id));
        const key = `meta:${batch.map((page) => metaKey(page, excerpt)).join('|')}`;
        const result = await shared(key, async (requestSignal) => {
          const params = new URLSearchParams();
          // 公式qs.stringifyと同じ添字付き配列で、1件でも配列として送信します。
          batch.forEach((page, index) => params.append(`pageIds[${index}]`, page._id));
          if (excerpt) params.set('attachShortBody', 'true');
          return getJson(`/_api/v3/page-listing/info?${params}`, requestSignal);
        }, signal);
        for (const page of batch) {
          const value = Object.hasOwn(result, page._id) ? result[page._id] : undefined;
          if (value !== undefined && (!isRecord(value) || typeof value.isEmpty !== 'boolean' ||
            (value.sumOfSeenUsers !== undefined && !nonnegativeInteger(value.sumOfSeenUsers)) ||
            (value.revisionShortBody !== undefined && typeof value.revisionShortBody !== 'string'))) throw new Error('ページメタ情報の形式が不正です。');
          metadata.set(metaKey(page, excerpt), value as GrowiPageMeta | undefined);
        }
      }
    }));
    return new Map(pages.map((page) => [page._id, metadata.get(metaKey(page, excerpt))]));
  };
  return {
    async load(card: PortalCardConfig, signal: AbortSignal): Promise<PageSectionData> {
      if (card.limit === 0) return { displayedCount: 0, pages: [], metaFailed: false };
      const pages = await shared(`list:${normalizeGrowiPath(card.path)}`, (requestSignal) => fetchSubordinatedPages(card.path, requestSignal), signal);
      const ordered = orderPageCandidates(pages, card);
      const selected: PageCardData[] = [];
      let offset = 0;
      let metaFailed = false;
      while (selected.length < card.limit && offset < ordered.length) {
        const batch = ordered.slice(offset, offset + card.limit - selected.length);
        offset += batch.length;
        try {
          const meta = await getMetadata(batch, card.excerpt, signal);
          for (const page of batch) {
            const info = meta.get(page._id);
            // 正常応答でもIDが欠ける場合は参照を確認できないため、次の候補へ進みます。
            if (info?.isEmpty !== false) continue;
            selected.push({ page, meta: info });
          }
        } catch {
          if (signal.aborted) throw aborted();
          metaFailed = true;
          // バッチ失敗を権限不足と断定せず、確認済みカードだけ残して補充を止めます。
          break;
        }
      }
      return { displayedCount: selected.length, pages: selected, metaFailed };
    },
    dispose() {
      requests.forEach((request) => request.controller.abort());
      requests.clear();
      metadata.clear();
    },
  };
};