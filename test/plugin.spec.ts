import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import packageJson from '../package.json';
import { parsePortalCodeBlock, remarkPortalCardsPlugin } from '../src/remark-portal-cards';
import { createPortalCardsGrid } from '../src/components/PortalCardsGrid';
import { activate, deactivate, PLUGIN_NAME, type OptionsGenerators, type RendererOptions } from '../client-entry';
import { createGrowiPagesClient, fetchSubordinatedPages, formatExcerpt, formatPageLabel, orderPageCandidates, userPictureUrl, type GrowiPageItem } from '../src/growi-pages';

const Grid = createPortalCardsGrid(React);
const card = (options = '') => parsePortalCodeBlock('portal', '', `/A | カテゴリ | 説明 | ${options}`).cards[0];
const pages: GrowiPageItem[] = [
  { _id: 'self', path: '/A/', updatedAt: '2026-10-19' },
  { _id: 'new', path: '/A/New', updatedAt: '2026-10-19', seenUsers: ['1'] },
  { _id: 'liked', path: '/A/Sub/Liked', updatedAt: '2026-10-01', seenUsers: ['1'], liker: ['1', '2', '3'] },
  { _id: 'viewed', path: '/A/Viewed', updatedAt: '2026-10-02', seenUsers: ['1', '2', '3', '4'] },
  { _id: 'other', path: '/AB/Other', updatedAt: '2026-10-19' },
].map((page) => ({ seenUsers: [], liker: [], ...page }));
const mockApi = (items = pages) => vi.stubGlobal('fetch', vi.fn().mockImplementation(async (raw: string) => {
  const url = new URL(raw, 'https://growi.example');
  const offset = (Number(url.searchParams.get('page') ?? 1) - 1) * 100;
  const data = url.pathname.endsWith('/pages/list') ? { pages: items.slice(offset, offset + 100), totalCount: items.length, offset, limit: 100 }
    : Object.fromEntries(items.map((page) => [page._id, { isEmpty: false, sumOfSeenUsers: page.seenUsers?.length ?? 0, revisionShortBody: `本文の抜粋 ${page._id}` }]));
  return { ok: true, json: async () => data };
}));
const renderCard = (options = '') => render(React.createElement(Grid, { configjson: JSON.stringify({ cols: 3, cards: [card(options)] }) }));

// 公式7.1.9と同じ「直接JSON」「添字付きID配列」「ID→メタマップ」を使います。
describe('GROWI 7.1.9 API契約', () => {
  const fullPages = pages.map((page) => ({ seenUsers: [], liker: [], isEmpty: false, ...page }));
  const response = (data: unknown) => ({ ok: true, json: async () => data });
  it('表示対象だけの短文・足跡をIDで結合する', async () => {
    const fetchMock = vi.fn().mockImplementation(async (raw: string) => {
      const url = new URL(raw, 'https://growi.example');
      if (url.pathname.endsWith('/pages/list')) return response({ pages: fullPages, totalCount: fullPages.length, offset: 0, limit: 100 });
      expect(url.searchParams.get('pageIds[0]')).toBe('liked');
      expect(url.searchParams.get('attachShortBody')).toBe('true');
      return response({ liked: { isEmpty: false, sumOfSeenUsers: 8, revisionShortBody: '手順の抜粋です。' }, unrelated: { isEmpty: false, revisionShortBody: '表示しない' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await createGrowiPagesClient().load(card('limit=1'), new AbortController().signal);
    expect(result.pages.map((item) => [item.page._id, item.meta?.revisionShortBody])).toEqual([['liked', '手順の抜粋です。']]);
    expect(result.displayedCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('抜粋オフでは短文取得を省き、オン切替時は別途取得する', async () => {
    const fetchMock = vi.fn().mockImplementation(async (raw: string) => raw.includes('/pages/list?')
      ? response({ pages: fullPages, totalCount: fullPages.length }) : response({ liked: { isEmpty: false, sumOfSeenUsers: 1, revisionShortBody: '本文' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createGrowiPagesClient();
    const signal = new AbortController().signal;
    await client.load(card('limit=1, excerpt=false'), signal);
    expect(fetchMock.mock.calls[1][0]).not.toContain('attachShortBody');
    await client.load(card('limit=1, excerpt=true'), signal);
    expect(fetchMock.mock.calls[2][0]).toContain('attachShortBody=true');
    await client.load(card('limit=1, excerptLength=60, excerptLines=1'), signal);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    client.dispose();
  });
  it('バッチ403は未確認カードの表示や次候補の連続取得を起こさない', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ pages: fullPages, totalCount: fullPages.length })).mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal('fetch', fetchMock);
    const result = await createGrowiPagesClient().load(card('limit=1'), new AbortController().signal);
    expect(result.pages).toHaveLength(0);
    expect(result.displayedCount).toBe(0);
    expect(result.metaFailed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('未完了一覧を正確な順位として返さない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response({ pages: fullPages, totalCount: 100 })).mockResolvedValue(response({ pages: [], totalCount: 100 })));
    await expect(fetchSubordinatedPages('/A', new AbortController().signal)).rejects.toThrow('完了');
  });
  it('存在不明のピンを合成せず、人気順配列の欠落も検出する', () => {
    expect(orderPageCandidates(fullPages, card('pins=/A/Missing;/A/New')).map((page) => page._id)).toEqual(['new', 'liked', 'viewed']);
    expect(() => orderPageCandidates([{ _id: 'id', path: '/A/Unknown' }], card())).toThrow('並び順');
  });
  it('文字数上限に省略記号を含め、結合絵文字を壊さない', () => {
    expect(formatExcerpt('家族👨‍👩‍👧‍👦と休暇申請', 5)).toBe('家族👨‍👩‍👧‍👦と…');
    expect(formatExcerpt('  手順\n\t本文 ', 120)).toBe('手順 本文');
  });
  it('GROWI標準の画像選択と安全なURLへのフォールバックを行う', () => {
    expect(userPictureUrl({ username: 'user', imageUrlCached: '/attachment/id' })).toBe('/attachment/id');
    expect(userPictureUrl({ username: 'user', imageUrlCached: 'javascript:alert(1)' })).toBe('/images/icons/user.svg');
    expect(userPictureUrl('user-id')).toBe('/images/icons/user.svg');
  });
});

afterEach(() => {
  cleanup();
  deactivate();
  Reflect.deleteProperty(window, 'growiFacade');
  vi.unstubAllGlobals();
});

// GROWIはパッケージ情報とルートエントリで認識するため、名称の変更も検出します。
describe('package.json', () => {
  it('GROWIスクリプトプラグインv4として定義する', () => {
    expect(packageJson.name).toBe('growi-plugin-portal-cards');
    expect(packageJson.growiPlugin).toEqual({ schemaVersion: '4', types: ['script'] });
  });
});

describe('DSLパーサーとAST変換', () => {
  // 見た目だけでなく全体/行の継承規則も固定し、プレビューと閲覧の差を防ぎます。
  it('抜粋とページ件数の既定値を持つ', () => {
    expect(card()).toMatchObject({ limit: 12, excerpt: true, excerptLength: 120, excerptLines: 3 });
  });
  it('抜粋設定の全体値を行で上書きし、不正値は継承する', () => {
    const parsed = parsePortalCodeBlock('portal', '(excerpt=false, excerptLength=240, excerptLines=5)',
      '/A | A | | excerpt=true, excerptLength=60, excerptLines=1\n/B | B | | excerpt=invalid, excerptLength=0, excerptLines=11');
    expect(parsed.cards[0]).toMatchObject({ excerpt: true, excerptLength: 60, excerptLines: 1 });
    expect(parsed.cards[1]).toMatchObject({ excerpt: false, excerptLength: 240, excerptLines: 5 });
  });
  it.each([
    ['limit=8, shortcuts=7', 'limit=2, shortcuts=1', 2],
    ['limit=8', 'shortcuts=1', 1],
    ['limit=8, shortcuts=7', 'limit=-1, shortcuts=oops', 8],
    ['shortcuts=7', '', 7],
    ['', 'limit=0', 0],
  ])('新旧件数設定を行優先で解決する: %s / %s', (global, row, expected) => {
    expect(parsePortalCodeBlock('portal', global, `/A | A | | ${row}`).cards[0].limit).toBe(expected);
  });
  it.each(['portal', 'portal-cards'])('空白を含む%sフェンスをカスタム要素へ変換する', async (language) => {
    const processor = unified().use(remarkParse).use(remarkPortalCardsPlugin).use(remarkRehype);
    const tree = await processor.run(processor.parse(`\`\`\`${language}(cols=2, shortcuts=4)\n# コメント\n\nBackOffice | 総務 | 説明 | color=warning, pins=/BackOffice/A;/BackOffice/B\n\`\`\``));
    const element = tree.children[0];
    expect(element.type).toBe('element');
    if (element.type !== 'element') throw new Error('要素への変換が必要です');
    expect(element.tagName).toBe('growi-portal-cards');
    expect(JSON.parse(String(element.properties.configjson))).toMatchObject({
      cols: 2, cards: [{ path: '/BackOffice', shortcuts: 4, color: 'warning', pins: ['/BackOffice/A', '/BackOffice/B'] }],
    });
  });

  it('全体オプションを継承し、行オプションで上書きする', () => {
    const parsed = parsePortalCodeBlock('portal', '(recursive=false, count=false, label=relative, sort=likes)', '/A | A\n/B | B | 説明 | recursive=true, count=true, shortcuts=0, sort=updatedAt, label=title, icon=本');
    expect(parsed.cards[0]).toMatchObject({ recursive: false, count: false, label: 'relative', sort: 'likes', color: 'primary' });
    expect(parsed.cards[1]).toMatchObject({ recursive: true, count: true, label: 'title', shortcuts: 0, sort: 'updatedAt', icon: '本', color: 'success' });
  });

  it('本文のヘッダーと不正な数値を扱い、無関係なコードは変換しない', async () => {
    expect(parsePortalCodeBlock('portal', '', 'portal(cols=4, shortcuts=2)\n/A | A').cols).toBe(4);
    expect(parsePortalCodeBlock('portal(cols=99, shortcuts=oops)', '', '/A | A').cards[0].limit).toBe(12);
    const processor = unified().use(remarkParse).use(remarkPortalCardsPlugin);
    const tree = await processor.run(processor.parse('```typescript\nconst value = 1;\n```'));
    expect(tree.children[0].data).toBeUndefined();
  });
});

// 実際の非同期描画も確認し、純粋関数だけのテストでAPI連携漏れを見逃さないようにします。
describe('自ページ除外と件数カウント', () => {
  it('自ページ・類似カテゴリ・重複を除外してバッジを表示する', async () => {
    mockApi([...pages, pages[1]]);
    renderCard();
    expect(await screen.findByText('表示3件')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/_api/v3/pages/list?path=%2FA'), expect.objectContaining({ credentials: 'same-origin', signal: expect.any(AbortSignal) }));
  });
  it('recursive=falseでは直下だけを数える', () => {
    expect(orderPageCandidates(pages, card('recursive=false'))).toHaveLength(2);
  });
  it('100件以降も取得して人気順と件数に含める', async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({ _id: String(index), path: `/A/Page${index}`, seenUsers: [], liker: [] }));
    const last = { _id: 'last', path: '/A/MostPopular', liker: ['1', '2'], seenUsers: [] };
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ pages: first, totalCount: 101 }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ pages: [last], totalCount: 101 }) })
      .mockResolvedValue({ ok: true, json: async () => ({ last: { isEmpty: false } }) });
    vi.stubGlobal('fetch', fetchMock);
    renderCard('shortcuts=1');
    expect(await screen.findByText('表示1件')).toBeInTheDocument();
    expect(screen.queryByText('101件')).not.toBeInTheDocument();
    expect(screen.getByText('MostPopular')).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toContain('page=2');
  });
  it('count=falseとshortcuts=0ならAPIを呼ばない', () => {
    mockApi();
    renderCard('count=false, shortcuts=0');
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('portal-card-count')).not.toBeInTheDocument();
  });
  it('取得失敗を0件と区別する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    renderCard();
    expect(await screen.findByText('取得失敗')).toBeInTheDocument();
    expect(screen.queryByText('0件')).not.toBeInTheDocument();
  });
});

describe('人気順ページカード抽出', () => {
  it('いいね×2＋閲覧者数の順で上位N件を描画する', async () => {
    mockApi();
    renderCard('shortcuts=2');
    const list = await screen.findByTestId('portal-cards-grid');
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['Liked', 'Viewed']);
  });
  it.each([
    ['views', 'viewed'], ['likes', 'liked'], ['updatedAt', 'new'],
  ])('%sも指定できる', (sort, first) => {
    expect(orderPageCandidates(pages, card(`sort=${sort}, limit=1`))[0]._id).toBe(first);
  });
});

describe('ピン留め優先マージ', () => {
  it('指定順・重複排除・人気順補完を維持する', async () => {
    mockApi();
    renderCard('pins=/A/New;/A/New/;/A/Missing');
    const list = await screen.findByTestId('portal-cards-grid');
    expect(within(list).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/A/New', '/A/Sub/Liked', '/A/Viewed']);
    expect(within(list).getAllByRole('img', { name: 'ピン留め' })).toHaveLength(1);
  });
  it('自ページはpinsにあっても除外し、上限と非表示設定を守る', () => {
    const config = card('pins=/A;/A/New;/A/Viewed, limit=1');
    expect(orderPageCandidates(pages, config).slice(0, config.limit).map((page) => page._id)).toEqual(['new']);
    expect(card('pins=/A/New, limit=0').limit).toBe(0);
  });
});

describe('ページカード表示形式', () => {
  it.each([['title', 'Liked'], ['relative', 'Sub/Liked']])('%sで表示する', async (mode, label) => {
    mockApi();
    renderCard(`shortcuts=1, label=${mode}`);
    expect(await screen.findByRole('link', { name: label })).toHaveAttribute('href', '/A/Sub/Liked');
  });
  it('ルートカテゴリと末尾スラッシュも正規化する', () => {
    expect(formatPageLabel('/A/Sub/Page/', '/', 'relative')).toBe('A/Sub/Page');
    expect(formatPageLabel('/Else/Page', '/A', 'relative')).toBe('Page');
  });
});

describe('アクティベートの二重フック', () => {
  it('View/Previewの既存設定を維持し、重複登録せず解除できる', () => {
    const existing: RendererOptions = { remarkPlugins: ['existing'], components: { a: 'a' }, retained: true };
    const view = vi.fn(() => existing);
    const preview = vi.fn(() => existing);
    const generators: OptionsGenerators = { customGenerateViewOptions: view, generatePreviewOptions: preview };
    window.growiFacade = { react: React, markdownRenderer: { optionsGenerators: generators } };
    window.pluginActivators![PLUGIN_NAME].activate();
    const wrapped = generators.customGenerateViewOptions;
    activate();
    expect(generators.customGenerateViewOptions).toBe(wrapped);
    for (const generator of [generators.customGenerateViewOptions!, generators.customGeneratePreviewOptions!]) {
      const options = generator('argument');
      expect(options.remarkPlugins).toEqual(['existing', remarkPortalCardsPlugin]);
      expect(options.components).toMatchObject({ a: 'a', 'growi-portal-cards': expect.any(Function) });
      expect(options.retained).toBe(true);
    }
    expect(existing.remarkPlugins).toEqual(['existing']);
    deactivate();
    expect(generators.customGenerateViewOptions).toBe(view);
    expect(generators.customGeneratePreviewOptions).toBeUndefined();
  });
  it('未初期化のGROWIでも安全に呼べる', () => {
    expect(() => activate()).not.toThrow();
  });
});

describe('設定エラーとキャンセル', () => {
  it('不正JSONと未定義カードを表示する', () => {
    const { rerender } = render(React.createElement(Grid, { configjson: '{broken' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(React.createElement(Grid, {}));
    expect(screen.getByTestId('portal-cards-empty')).toBeInTheDocument();
  });
  it('アンマウント時にAPIリクエストを中断する', async () => {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderCard();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});

// API契約テストに加えて、画面での表示・非表示・設定変更まで通して検証します。
describe('ページ本文・足跡・画像の描画', () => {
  it('子ページのパス・タイトル・足跡・本文を1枚のカードに表示する', async () => {
    mockApi();
    renderCard('limit=1');
    const item = await screen.findByTestId('portal-card-item');
    expect(within(item).getByTestId('portal-card-path')).toHaveTextContent('/A/Sub/Liked');
    expect(within(item).getByRole('link', { name: 'Liked' })).toHaveAttribute('href', '/A/Sub/Liked');
    expect(within(item).getByLabelText('閲覧者数 1人')).toBeInTheDocument();
    expect(within(item).getByTestId('portal-card-excerpt')).toHaveTextContent('本文の抜粋 liked');
    expect(within(item).queryByText('説明')).not.toBeInTheDocument();
  });
  it('抜粋オフでも足跡は残り、抜粋要素と抜粋用の固定高はない', async () => {
    mockApi();
    renderCard('limit=1, excerpt=false');
    const item = await screen.findByTestId('portal-card-item');
    expect(within(item).queryByTestId('portal-card-excerpt')).not.toBeInTheDocument();
    expect(within(item).getByTestId('portal-card-views')).toBeInTheDocument();
    expect(item.querySelector('.card-body')).not.toHaveStyle('min-height: 250px');
    const calls = vi.mocked(fetch).mock.calls.filter(([raw]) => String(raw).includes('/page-listing/info?'));
    expect(calls).toHaveLength(1);
    expect(String(calls[0][0])).not.toContain('attachShortBody');
  });
  it('文字数・行数だけの変更は表示へ即反映し、再通信しない', async () => {
    mockApi();
    const { rerender } = renderCard('limit=1');
    await screen.findByTestId('portal-card-excerpt');
    const before = vi.mocked(fetch).mock.calls.length;
    rerender(React.createElement(Grid, { configjson: JSON.stringify({ cols: 3, cards: [card('limit=1, excerptLength=5, excerptLines=1')] }) }));
    const excerpt = screen.getByTestId('portal-card-excerpt');
    expect(excerpt).toHaveTextContent('本文の抜…');
    expect(excerpt.style.getPropertyValue('-webkit-line-clamp')).toBe('1');
    expect(fetch).toHaveBeenCalledTimes(before);
  });
  it('オフからオンへの変更で新たに抜粋を取得して表示する', async () => {
    mockApi();
    const { rerender } = renderCard('limit=1, excerpt=false');
    await screen.findByTestId('portal-card-item');
    rerender(React.createElement(Grid, { configjson: JSON.stringify({ cols: 3, cards: [card('limit=1, excerpt=true')] }) }));
    expect(await screen.findByTestId('portal-card-excerpt')).toHaveTextContent('本文の抜粋 liked');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('スクリプトやHTML文字列を実行せずテキストとして扱う', async () => {
    const body = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (raw: string) => ({ ok: true, json: async () => raw.includes('/pages/list?')
      ? { pages, totalCount: pages.length }
      : { liked: { isEmpty: false, revisionShortBody: body, sumOfSeenUsers: 0 } } })));
    renderCard('limit=1');
    const excerpt = await screen.findByTestId('portal-card-excerpt');
    expect(excerpt).toHaveTextContent(body);
    expect(excerpt.querySelector('img,script')).toBeNull();
    expect(screen.getByLabelText('閲覧者数 0人')).toBeInTheDocument();
  });
  it('正常なメタ情報欠落は全候補を調べて非表示にし、取得失敗と混同しない', async () => {
    const fetchMock = vi.fn().mockImplementation(async (raw: string) => ({ ok: true, json: async () => raw.includes('/pages/list?') ? { pages, totalCount: pages.length } : {} }));
    vi.stubGlobal('fetch', fetchMock);
    renderCard('limit=1');
    expect(await screen.findByText('表示できるページがありません')).toBeInTheDocument();
    expect(screen.getByTestId('portal-card-count')).toHaveTextContent('表示0件');
    expect(screen.queryByText('/A/Sub/Liked')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Liked' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-card-excerpt')).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-card-views')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('空本文をセクション説明で置き換えない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (raw: string) => ({ ok: true, json: async () => raw.includes('/pages/list?')
      ? { pages, totalCount: pages.length } : { liked: { isEmpty: false, revisionShortBody: '' } } })));
    renderCard('limit=1');
    await screen.findByTestId('portal-card-item');
    expect(screen.queryByTestId('portal-card-excerpt')).not.toBeInTheDocument();
    expect(screen.getAllByText('説明')).toHaveLength(1);
  });
  it('更新者画像の失敗時は標準匿名画像へ戻す', async () => {
    mockApi(pages.map((page) => ({ ...page, lastUpdateUser: { username: 'alice', imageUrlCached: '/attachment/avatar' } })));
    renderCard('limit=1');
    const image = await screen.findByRole('img', { name: '最終更新者: alice' });
    expect(image).toHaveAttribute('src', '/attachment/avatar');
    fireEvent.error(image);
    expect(image).toHaveAttribute('src', '/images/icons/user.svg');
    fireEvent.error(image);
    expect(screen.getByRole('img', { name: '匿名ユーザー' })).toBeInTheDocument();
  });
  it('不正な設定構造をHooksへ渡す前に拒否する', () => {
    render(React.createElement(Grid, { configjson: JSON.stringify({ cols: 3, cards: [{ ...card(), excerptLines: 999 }] }) }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('取得件数とリクエスト寿命', () => {
  it('親ページが存在しなくても100件超から上位12件を選ぶ', async () => {
    const many = Array.from({ length: 121 }, (_, index) => ({ _id: String(index), path: `/A/Page${index}`, seenUsers: Array.from({ length: index }, () => 'user'), liker: [] }));
    mockApi(many);
    renderCard();
    await screen.findByText('表示12件');
    expect(screen.queryByText('121件')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('portal-card-item')).toHaveLength(12);
    const list = screen.getByTestId('portal-cards-grid');
    expect(within(list).getAllByRole('link')[0]).toHaveTextContent('Page120');
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.filter(([raw]) => String(raw).includes('/pages/list?'))).toHaveLength(2);
    const metadataUrl = new URL(String(calls.find(([raw]) => String(raw).includes('/page-listing/info?'))![0]), 'https://growi.example');
    expect([...metadataUrl.searchParams.keys()].filter((key) => key.startsWith('pageIds['))).toHaveLength(12);
  });
  it('同じ列挙元の複数セクションは通信を共有する', async () => {
    mockApi();
    render(React.createElement(Grid, { configjson: JSON.stringify({ cols: 3, cards: [card('limit=1'), card('limit=1')] }) }));
    expect(await screen.findAllByText('本文の抜粋 liked')).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('limit=0では件数表示があってもAPIを呼ばない', async () => {
    mockApi();
    renderCard('limit=0');
    expect(await screen.findByText('表示0件')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('portal-card-item')).not.toBeInTheDocument();
  });
  it('明示的な空ページを除き残り候補で補充する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (raw: string) => ({ ok: true, json: async () => raw.includes('/pages/list?')
      ? { pages, totalCount: pages.length } : { liked: { isEmpty: true }, viewed: { isEmpty: false, revisionShortBody: '次の候補' } } })));
    renderCard('limit=1');
    expect(await screen.findByRole('link', { name: 'Viewed' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Liked' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('大量の表示指定でもメタAPIは20IDずつに分割する', async () => {
    mockApi(Array.from({ length: 45 }, (_, index) => ({ _id: String(index), path: `/A/Page${index}`, seenUsers: [], liker: [] })));
    const client = createGrowiPagesClient();
    const result = await client.load(card('limit=45'), new AbortController().signal);
    expect(result.pages).toHaveLength(45);
    const batches = vi.mocked(fetch).mock.calls.filter(([raw]) => String(raw).includes('/page-listing/info?')).map(([raw]) => {
      const url = new URL(String(raw), 'https://growi.example');
      return [...url.searchParams.keys()].filter((key) => key.startsWith('pageIds[')).length;
    });
    expect(batches.sort((left, right) => right - left)).toEqual([20, 20, 5]);
    client.dispose();
  });
});

// パスとタイトルも表示しないことまで確認し、ピン留めで権限判定を迂回させません。
describe('参照可能なページだけ表示', () => {
  it.each(['excerpt=true', 'excerpt=false'])('未確認の最上位ピンを除外して次候補で補充する: %s', async (excerpt) => {
    const fetchMock = vi.fn().mockImplementation(async (raw: string) => ({ ok: true, json: async () => raw.includes('/pages/list?')
      ? { pages, totalCount: pages.length }
      : { viewed: { isEmpty: false, revisionShortBody: '参照可能' }, new: { isEmpty: false, revisionShortBody: '次のページ' } } }));
    vi.stubGlobal('fetch', fetchMock);
    renderCard(`limit=2, pins=/A/Sub/Liked, ${excerpt}`);
    const list = await screen.findByTestId('portal-cards-grid');
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['Viewed', 'New']);
    expect(screen.queryByText('/A/Sub/Liked')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Liked' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'ピン留め' })).not.toBeInTheDocument();
    expect(screen.getByTestId('portal-card-count')).toHaveTextContent('表示2件');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('正常応答が全件欠落でも各候補を一度だけ調べて終了する', async () => {
    const items = Array.from({ length: 25 }, (_, index) => ({ _id: String(index), path: `/A/Hidden${index}`, seenUsers: [], liker: [] }));
    const fetchMock = vi.fn().mockImplementation(async (raw: string) => ({ ok: true, json: async () => raw.includes('/pages/list?') ? { pages: items, totalCount: items.length } : {} }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await createGrowiPagesClient().load(card('limit=12'), new AbortController().signal);
    expect(result).toEqual({ displayedCount: 0, pages: [], metaFailed: false });
    const ids = fetchMock.mock.calls.filter(([raw]) => String(raw).includes('/page-listing/info?')).flatMap(([raw]) =>
      [...new URL(raw, 'https://growi.example').searchParams].filter(([key]) => key.startsWith('pageIds[')).map(([, value]) => value));
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('補充中のバッチ失敗でも確認済みカードだけを残す', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ pages, totalCount: pages.length }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ viewed: { isEmpty: false, revisionShortBody: '参照可能' } }) })
      .mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    renderCard('limit=2');
    expect(await screen.findByRole('link', { name: 'Viewed' })).toBeInTheDocument();
    expect(screen.getByTestId('portal-card-count')).toHaveTextContent('表示1件');
    expect(screen.getByRole('status')).toHaveTextContent('取得できません');
    expect(screen.queryByRole('link', { name: 'Liked' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it.each([401, 403, 404, 500])('メタAPI全体のHTTP%sを表示0件と断定しない', async (status) => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ pages, totalCount: pages.length }) }).mockResolvedValue({ ok: false, status });
    vi.stubGlobal('fetch', fetchMock);
    renderCard('limit=1');
    expect(await screen.findByText('取得失敗')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-card-item')).not.toBeInTheDocument();
    expect(screen.queryByText('表示0件')).not.toBeInTheDocument();
    expect(screen.queryByText('表示できるページがありません')).not.toBeInTheDocument();
    expect(screen.queryByText('/A/Sub/Liked')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('count=falseでも参照判定と補充は実行する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (raw: string) => ({ ok: true, json: async () => raw.includes('/pages/list?')
      ? { pages, totalCount: pages.length } : { viewed: { isEmpty: false } } })));
    renderCard('limit=1, count=false');
    expect(await screen.findByRole('link', { name: 'Viewed' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Liked' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('portal-card-count')).not.toBeInTheDocument();
  });
  it.each(['network', 'invalid'])('メタ取得の%sでも未確認ページを表示しない', async (failure) => {
    const fetchMock = vi.fn().mockImplementation(async (raw: string) => {
      if (raw.includes('/pages/list?')) return { ok: true, json: async () => ({ pages, totalCount: pages.length }) };
      if (failure === 'network') throw new Error('通信失敗');
      return { ok: true, json: async () => ({ liked: { isEmpty: false, sumOfSeenUsers: -1 } }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    renderCard('limit=1');
    expect(await screen.findByText('取得失敗')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-card-item')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});