import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import packageJson from '../package.json';
import { parsePortalCodeBlock, remarkPortalCardsPlugin } from '../src/remark-portal-cards';
import { createPortalCardsGrid, formatShortcutLabel, selectShortcutPages, type GrowiPageItem } from '../src/components/PortalCardsGrid';
import { activate, deactivate, PLUGIN_NAME, type OptionsGenerators, type RendererOptions } from '../client-entry';

const Grid = createPortalCardsGrid(React);
const card = (options = '') => parsePortalCodeBlock('portal', '', `/A | カテゴリ | 説明 | ${options}`).cards[0];
const pages: GrowiPageItem[] = [
  { _id: 'self', path: '/A/', updatedAt: '2026-10-19' },
  { _id: 'new', path: '/A/New', updatedAt: '2026-10-19', seenUsers: ['1'] },
  { _id: 'liked', path: '/A/Sub/Liked', updatedAt: '2026-10-01', seenUsers: ['1'], liker: ['1', '2', '3'] },
  { _id: 'viewed', path: '/A/Viewed', updatedAt: '2026-10-02', seenUsers: ['1', '2', '3', '4'] },
  { _id: 'other', path: '/AB/Other', updatedAt: '2026-10-19' },
];
const mockApi = (items = pages) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ pages: items, totalCount: items.length }) }));
const renderCard = (options = '') => render(React.createElement(Grid, { configjson: JSON.stringify({ cols: 3, cards: [card(options)] }) }));

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
    expect(parsePortalCodeBlock('portal(cols=99, shortcuts=oops)', '', '/A | A').cards[0].shortcuts).toBe(3);
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
    expect(await screen.findByText('3件')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/_api/v3/pages/list?path=%2FA'), expect.objectContaining({ credentials: 'same-origin', signal: expect.any(AbortSignal) }));
  });
  it('recursive=falseでは直下だけを数える', () => {
    expect(selectShortcutPages(pages, card('recursive=false')).totalSubordinatedCount).toBe(2);
  });
  it('100件以降も取得して人気順と件数に含める', async () => {
    const first = Array.from({ length: 100 }, (_, index) => ({ _id: String(index), path: `/A/Page${index}` }));
    const last = { _id: 'last', path: '/A/MostPopular', liker: ['1', '2'] };
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ pages: first, totalCount: 101 }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ pages: [last], totalCount: 101 }) });
    vi.stubGlobal('fetch', fetchMock);
    renderCard('shortcuts=1');
    expect(await screen.findByText('101件')).toBeInTheDocument();
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

describe('人気順ミニリンク抽出', () => {
  it('いいね×2＋閲覧者数の順で上位N件を描画する', async () => {
    mockApi();
    renderCard('shortcuts=2');
    const list = await screen.findByTestId('portal-card-shortcuts');
    expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['Liked', 'Viewed']);
  });
  it.each([
    ['views', 'viewed'], ['likes', 'liked'], ['updatedAt', 'new'],
  ])('%sも指定できる', (sort, first) => {
    expect(selectShortcutPages(pages, card(`sort=${sort}, shortcuts=1`)).shortcuts[0]._id).toBe(first);
  });
});

describe('ピン留め優先マージ', () => {
  it('指定順・重複排除・人気順補完を維持する', async () => {
    mockApi();
    renderCard('pins=/A/New;/A/New/;/A/Missing');
    const list = await screen.findByTestId('portal-card-shortcuts');
    expect(within(list).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/A/New', '/A/Missing', '/A/Sub/Liked']);
    expect(within(list).getAllByRole('img', { name: 'ピン留め' })).toHaveLength(2);
  });
  it('自ページはpinsにあっても除外し、上限と非表示設定を守る', () => {
    expect(selectShortcutPages(pages, card('pins=/A;/A/New;/A/Viewed, shortcuts=1')).shortcuts.map((page) => page._id)).toEqual(['new']);
    expect(selectShortcutPages(pages, card('pins=/A/New, shortcuts=0')).shortcuts).toEqual([]);
  });
});

describe('ミニリンク表示形式', () => {
  it.each([['title', 'Liked'], ['relative', 'Sub/Liked']])('%sで表示する', async (mode, label) => {
    mockApi();
    renderCard(`shortcuts=1, label=${mode}`);
    expect(await screen.findByRole('link', { name: label })).toHaveAttribute('href', '/A/Sub/Liked');
  });
  it('ルートカテゴリと末尾スラッシュも正規化する', () => {
    expect(formatShortcutLabel('/A/Sub/Page/', '/', 'relative')).toBe('A/Sub/Page');
    expect(formatShortcutLabel('/Else/Page', '/A', 'relative')).toBe('Page');
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