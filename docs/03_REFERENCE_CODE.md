# リファレンス実装コード集（growi-plugin-portal-cards）

## 1. `package.json`
```json
{
  "name": "growi-plugin-portal-cards",
  "version": "1.0.0",
  "description": "社内ノウハウポータル向け：配下ページ数バッジと人気・ピン留め直通ショートカットを備えたカテゴリカードを描画するGROWIスクリプトプラグイン",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify:build": "node scripts/verify-build.mjs"
  },
  "growiPlugin": {
    "schemaVersion": "4",
    "types": [
      "script"
    ]
  },
  "dependencies": {
    "@growi/pluginkit": "^1.2.8",
    "unist-util-visit": "^5.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@types/mdast": "^4.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.1",
    "remark-parse": "^11.0.0",
    "remark-rehype": "^11.1.0",
    "typescript": "^5.5.0",
    "unified": "^11.0.5",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

## 2. `tsconfig.json` ＆ `vite.config.ts`

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["client-entry.tsx", "src", "dev", "test"]
}
```

### `vite.config.ts`
```typescript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    rollupOptions:
      command === 'build'
        ? {
            input: 'client-entry.tsx',
          }
        : undefined,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
}));
```

## 3. `src/remark-portal-cards.ts`（コードブロックDSL解析プラグイン）
```typescript
import type { Code, Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

export type PortalSortMode = 'popular' | 'updatedAt' | 'views' | 'likes';
export type PortalLabelMode = 'title' | 'relative';
export type PortalColorTheme =
  | 'primary'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'
  | 'secondary';

/**
 * パースされた1枚分のカード設定データ型
 */
export interface PortalCardConfig {
  path: string;
  title: string;
  description: string;
  color: PortalColorTheme;
  icon: string;
  pins: string[];
  shortcuts: number;
  sort: PortalSortMode;
  recursive: boolean;
  count: boolean;
  label: PortalLabelMode;
}

/**
 * コードブロック全体のオプションとカード配列を保持する構造体
 */
export interface PortalBlockPayload {
  cols: number;
  cards: PortalCardConfig[];
}

const DEFAULT_COLOR_PALETTE: PortalColorTheme[] = [
  'primary',
  'success',
  'info',
  'warning',
  'danger',
  'secondary',
];

/**
 * "key1=val1, key2=val2" 形式のオプション文字列を連想配列に変換するヘルパー
 */
export const parseKeyValueOptions = (
  raw: string | null | undefined
): Record<string, string> => {
  if (!raw) return {};
  const cleaned = raw.trim().replace(/^\(|\)$/g, '');
  const result: Record<string, string> = {};

  for (const part of cleaned.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      result[trimmed.toLowerCase()] = 'true';
    } else {
      const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
      const val = trimmed.slice(eqIdx + 1).trim();
      result[key] = val;
    }
  }
  return result;
};

/**
 * コードブロックの lang / meta と value（本文）から PortalBlockPayload を生成する純粋関数
 */
export const parsePortalCodeBlock = (
  lang: string,
  meta: string | null | undefined,
  codeValue: string
): PortalBlockPayload => {
  // ```portal(cols=3) のように lang 側に括弧が含まれるケースと meta に分かれるケースの両方に対応
  const parenIdx = lang.indexOf('(');
  const inlineMeta = parenIdx !== -1 ? lang.slice(parenIdx) : '';
  const combinedMeta = [inlineMeta, meta ?? ''].filter(Boolean).join(',');
  const blockOpts = parseKeyValueOptions(combinedMeta);

  const rawCols = Number.parseInt(blockOpts.cols ?? '3', 10);
  const cols = [1, 2, 3, 4].includes(rawCols) ? rawCols : 3;

  const defaultShortcuts = Math.max(
    0,
    Number.parseInt(blockOpts.shortcuts ?? '3', 10) || 0
  );
  const defaultSort: PortalSortMode = ['popular', 'updatedAt', 'views', 'likes'].includes(
    blockOpts.sort ?? ''
  )
    ? (blockOpts.sort as PortalSortMode)
    : 'popular';
  const defaultRecursive = (blockOpts.recursive ?? 'true').toLowerCase() !== 'false';
  const defaultCount = (blockOpts.count ?? 'true').toLowerCase() !== 'false';
  const defaultLabel: PortalLabelMode =
    (blockOpts.label ?? 'title').toLowerCase() === 'relative'
      ? 'relative'
      : 'title';

  const cards: PortalCardConfig[] = [];
  const lines = codeValue.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();
    // 空行および # から始まるコメント行はスキップ
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const columns = trimmedLine.split('|').map((c) => c.trim());
    const rawPath = columns[0] ?? '';
    if (!rawPath) continue;

    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const title = columns[1] || path;
    const description = columns[2] ?? '';
    const rowOpts = parseKeyValueOptions(columns[3] ?? '');

    const paletteColor =
      DEFAULT_COLOR_PALETTE[cards.length % DEFAULT_COLOR_PALETTE.length];
    const color: PortalColorTheme = DEFAULT_COLOR_PALETTE.includes(
      rowOpts.color as PortalColorTheme
    )
      ? (rowOpts.color as PortalColorTheme)
      : paletteColor;

    const shortcuts =
      rowOpts.shortcuts !== undefined
        ? Math.max(0, Number.parseInt(rowOpts.shortcuts, 10) || 0)
        : defaultShortcuts;

    const sort: PortalSortMode = ['popular', 'updatedAt', 'views', 'likes'].includes(
      rowOpts.sort ?? ''
    )
      ? (rowOpts.sort as PortalSortMode)
      : defaultSort;

    const recursive =
      rowOpts.recursive !== undefined
        ? rowOpts.recursive.toLowerCase() !== 'false'
        : defaultRecursive;

    const count =
      rowOpts.count !== undefined
        ? rowOpts.count.toLowerCase() !== 'false'
        : defaultCount;

    const label: PortalLabelMode =
      rowOpts.label !== undefined
        ? rowOpts.label.toLowerCase() === 'relative'
          ? 'relative'
          : 'title'
        : defaultLabel;

    const pins = rowOpts.pins
      ? rowOpts.pins
          .split(';')
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => (p.startsWith('/') ? p : `/${p}`))
      : [];

    cards.push({
      path,
      title,
      description,
      color,
      icon: rowOpts.icon ?? '',
      pins,
      shortcuts,
      sort,
      recursive,
      count,
      label,
    });
  }

  return { cols, cards };
};

/**
 * ```portal または ```portal-cards コードブロックを検出し、
 * <growi-portal-cards> カスタム要素へ変換するRemarkプラグイン
 */
export const remarkPortalCardsPlugin: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'code', (node: Code) => {
      if (!node.lang) return;
      const baseLang = node.lang.split('(')[0].trim().toLowerCase();
      if (baseLang !== 'portal' && baseLang !== 'portal-cards') {
        return;
      }

      const payload = parsePortalCodeBlock(node.lang, node.meta, node.value);
      const data = node.data ?? (node.data = {});

      data.hName = 'growi-portal-cards';
      data.hProperties = {
        configjson: JSON.stringify(payload),
      };
    });
  };
};
```

## 4. `src/components/PortalCardsGrid.tsx`（カードグリッド＆直通ミニリンク描画コンポーネント）
```tsx
import type React from 'react';
import type {
  PortalBlockPayload,
  PortalCardConfig,
  PortalLabelMode,
  PortalSortMode,
} from '../remark-portal-cards';

export interface GrowiPageItem {
  _id: string;
  path: string;
  updatedAt: string;
  seenUsers?: string[];
  liker?: string[];
}

export interface PortalCardsGridProps {
  configjson?: string;
}

/**
 * パス末尾のスラッシュを正規化する
 */
export const normalizeGrowiPath = (rawPath: string): string => {
  const trimmed = rawPath.trim();
  if (!trimmed || trimmed === '/') return '/';
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, '');
};

/**
 * ミニリンク用の表示ラベルを生成する（title: 末尾ページ名のみ / relative: 相対パス）
 */
export const formatShortcutLabel = (
  pagePath: string,
  basePath: string,
  mode: PortalLabelMode
): string => {
  const normPage = normalizeGrowiPath(pagePath);
  const normBase = normalizeGrowiPath(basePath);

  if (mode === 'relative') {
    const prefix = normBase === '/' ? '/' : `${normBase}/`;
    if (normPage.startsWith(prefix)) {
      return normPage.slice(prefix.length);
    }
  }

  const segments = normPage.split('/');
  return segments[segments.length - 1] || normPage;
};

const getViews = (p: GrowiPageItem): number =>
  Array.isArray(p.seenUsers) ? p.seenUsers.length : 0;
const getLikes = (p: GrowiPageItem): number =>
  Array.isArray(p.liker) ? p.liker.length : 0;
const getPopularScore = (p: GrowiPageItem): number =>
  getLikes(p) * 2 + getViews(p);

/**
 * 起点ページ自身を除外し、pins（固定ピン留め）を最優先で先頭に配置した上で、
 * 残りの枠を sort 指定順に自動補充して shortcuts 件数分返す純粋関数
 */
export const selectShortcutPages = (
  rawPages: GrowiPageItem[],
  cardConfig: PortalCardConfig
): { totalSubordinatedCount: number; shortcuts: GrowiPageItem[] } => {
  const normBase = normalizeGrowiPath(cardConfig.path);
  const prefix = normBase === '/' ? '/' : `${normBase}/`;

  // 1. 起点ページ自身を除外し、recursive設定に従ってフィルタ
  const subordinated = rawPages.filter((p) => {
    const norm = normalizeGrowiPath(p.path);
    if (norm === normBase) return false;
    if (!norm.startsWith(prefix)) return false;
    if (cardConfig.recursive) return true;
    const rel = norm.slice(prefix.length);
    return !rel.includes('/');
  });

  const totalSubordinatedCount = subordinated.length;
  if (cardConfig.shortcuts <= 0) {
    return { totalSubordinatedCount, shortcuts: [] };
  }

  // 2. ソート処理
  const sorted = [...subordinated].sort((a, b) => {
    const mode: PortalSortMode = cardConfig.sort;
    if (mode === 'popular') {
      const diff = getPopularScore(b) - getPopularScore(a);
      if (diff !== 0) return diff;
    } else if (mode === 'views') {
      const diff = getViews(b) - getViews(a);
      if (diff !== 0) return diff;
    } else if (mode === 'likes') {
      const diff = getLikes(b) - getLikes(a);
      if (diff !== 0) return diff;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  // 3. pins（ピン留め）が指定されている場合は最優先で先頭に配置（API結果に無い場合は合成アイテムを作成）
  const selected: GrowiPageItem[] = [];
  const usedPaths = new Set<string>();

  for (const pinRaw of cardConfig.pins) {
    if (selected.length >= cardConfig.shortcuts) break;
    const normPin = normalizeGrowiPath(pinRaw);
    if (usedPaths.has(normPin)) continue;

    const found = subordinated.find(
      (p) => normalizeGrowiPath(p.path) === normPin
    );
    selected.push(
      found ?? {
        _id: `pin-${normPin}`,
        path: normPin,
        updatedAt: new Date().toISOString(),
      }
    );
    usedPaths.add(normPin);
  }

  // 4. 残り枠をソート済みページで埋める
  for (const page of sorted) {
    if (selected.length >= cardConfig.shortcuts) break;
    const norm = normalizeGrowiPath(page.path);
    if (usedPaths.has(norm)) continue;
    selected.push(page);
    usedPaths.add(norm);
  }

  return { totalSubordinatedCount, shortcuts: selected };
};

/**
 * GROWI本体のReactインスタンスを受け取ってポータルカード群を描画するファクトリ関数
 */
export const createPortalCardsGrid = (ReactInstance: typeof React) => {
  const { useState, useEffect } = ReactInstance;

  // 個別カードコンポーネント（カードごとに非同期で配下ページ情報を取得）
  function SinglePortalCard({
    card,
  }: {
    card: PortalCardConfig;
  }): React.ReactElement {
    const [totalCount, setTotalCount] = useState<number | null>(null);
    const [shortcutPages, setShortcutPages] = useState<GrowiPageItem[]>([]);
    const [loading, setLoading] = useState<boolean>(
      card.count || card.shortcuts > 0
    );

    useEffect(() => {
      if (!card.count && card.shortcuts <= 0) {
        setLoading(false);
        return;
      }

      let isMounted = true;
      const fetchCardData = async () => {
        setLoading(true);
        try {
          const normBase = normalizeGrowiPath(card.path);
          const params = new URLSearchParams({
            path: normBase,
            limit: '100',
            page: '1',
          });
          const res = await fetch(`/_api/v3/pages/list?${params.toString()}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (!isMounted) return;

          const rawPages: GrowiPageItem[] = Array.isArray(data.pages)
            ? data.pages
            : [];
          const { totalSubordinatedCount, shortcuts } = selectShortcutPages(
            rawPages,
            card
          );

          // recursive=true の場合はサーバー返却の totalCount（自ページ分を補正）も考慮
          const selfExists = rawPages.some(
            (p) => normalizeGrowiPath(p.path) === normBase
          );
          const apiTotal =
            typeof data.totalCount === 'number'
              ? Math.max(0, data.totalCount - (selfExists ? 1 : 0))
              : totalSubordinatedCount;

          setTotalCount(card.recursive ? apiTotal : totalSubordinatedCount);
          setShortcutPages(shortcuts);
        } catch {
          if (isMounted) {
            setTotalCount(0);
            setShortcutPages([]);
          }
        } finally {
          if (isMounted) setLoading(false);
        }
      };

      void fetchCardData();
      return () => {
        isMounted = false;
      };
    }, [card]);

    const pinnedSet = new Set(card.pins.map((p) => normalizeGrowiPath(p)));

    return (
      <div
        className={`card h-100 shadow-sm border-${card.color}-subtle`}
        data-testid="portal-card-item"
      >
        <div
          className={`card-header bg-${card.color}-subtle border-${card.color}-subtle d-flex justify-content-between align-items-center py-2 px-3`}
        >
          <a
            href={card.path}
            className="fw-bold text-dark text-decoration-none text-truncate"
            title={card.path}
          >
            {card.icon ? `${card.icon} ` : ''}
            {card.title}
          </a>
          {card.count && (
            <span
              className={`badge rounded-pill bg-${card.color} ms-2 flex-shrink-0`}
              data-testid="portal-card-count"
            >
              {loading ? '...' : `${totalCount ?? 0}件`}
            </span>
          )}
        </div>

        <div className="card-body d-flex flex-column justify-content-between py-2 px-3">
          <div>
            {card.description && (
              <p className="card-text small text-muted mb-2">
                {card.description}
              </p>
            )}

            {card.shortcuts > 0 && (
              <div className="mt-1 mb-2">
                {loading ? (
                  <div className="small text-muted">ショートカット読込中...</div>
                ) : shortcutPages.length > 0 ? (
                  <ul
                    className="list-unstyled mb-0 small border-top pt-2"
                    data-testid="portal-card-shortcuts"
                  >
                    {shortcutPages.map((sp) => {
                      const isPinned = pinnedSet.has(
                        normalizeGrowiPath(sp.path)
                      );
                      const labelText = formatShortcutLabel(
                        sp.path,
                        card.path,
                        card.label
                      );
                      return (
                        <li
                          key={sp._id}
                          className="text-truncate py-1 d-flex align-items-center justify-content-between"
                        >
                          <a
                            href={sp.path}
                            className="text-decoration-none text-truncate"
                            title={sp.path}
                          >
                            <span className="me-1">
                              {isPinned ? '📌' : '📄'}
                            </span>
                            {labelText}
                          </a>
                          {!isPinned && getViews(sp) > 0 && (
                            <span
                              className="text-muted ms-2 flex-shrink-0"
                              style={{ fontSize: '0.75rem' }}
                            >
                              👀 {getViews(sp)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="small text-muted border-top pt-2">
                    配下のページはまだありません
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-2 pt-1 text-end">
            <a
              href={card.path}
              className={`btn btn-sm btn-outline-${card.color} w-100`}
            >
              一覧を見る →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return function PortalCardsGrid({
    configjson,
  }: PortalCardsGridProps): React.ReactElement {
    let payload: PortalBlockPayload = { cols: 3, cards: [] };
    try {
      if (configjson) {
        payload = JSON.parse(configjson) as PortalBlockPayload;
      }
    } catch {
      return (
        <div className="alert alert-warning my-2">
          ポータルカード設定の読み込みに失敗しました。
        </div>
      );
    }

    if (!payload.cards || payload.cards.length === 0) {
      return (
        <div className="text-muted my-2" data-testid="portal-cards-empty">
          ポータルカードが定義されていません。
        </div>
      );
    }

    const colClass =
      payload.cols === 1
        ? 'row-cols-1'
        : payload.cols === 2
          ? 'row-cols-1 row-cols-md-2'
          : payload.cols === 4
            ? 'row-cols-1 row-cols-md-2 row-cols-lg-4'
            : 'row-cols-1 row-cols-md-2 row-cols-lg-3';

    return (
      <div
        className={`row ${colClass} g-3 my-2`}
        data-testid="portal-cards-grid"
      >
        {payload.cards.map((card, idx) => (
          <div className="col" key={`${card.path}-${idx}`}>
            <SinglePortalCard card={card} />
          </div>
        ))}
      </div>
    );
  };
};
```

## 5. `client-entry.tsx`
```tsx
import { growiReact } from '@growi/pluginkit/dist/v4/client';
import React from 'react';
import { createPortalCardsGrid } from './src/components/PortalCardsGrid';
import { remarkPortalCardsPlugin } from './src/remark-portal-cards';

export const PLUGIN_NAME = 'growi-plugin-portal-cards';

declare global {
  interface Window {
    growiFacade?: {
      react?: typeof React;
      markdownRenderer?: {
        optionsGenerators?: {
          customGenerateViewOptions?: (...args: any[]) => any;
          generateViewOptions?: (...args: any[]) => any;
          customGeneratePreviewOptions?: (...args: any[]) => any;
          generatePreviewOptions?: (...args: any[]) => any;
        };
      };
    };
    pluginActivators?: Record<
      string,
      {
        activate: () => void;
        deactivate: () => void;
      }
    >;
  }
}

export const activate = (): void => {
  if (
    typeof window === 'undefined' ||
    window.growiFacade == null ||
    window.growiFacade.markdownRenderer == null
  ) {
    return;
  }

  const { optionsGenerators } = window.growiFacade.markdownRenderer;
  if (optionsGenerators == null) {
    return;
  }

  let ReactInstance = React;
  try {
    ReactInstance = growiReact(React) ?? React;
  } catch {
    ReactInstance = window.growiFacade.react ?? React;
  }

  const PortalCardsGrid = createPortalCardsGrid(ReactInstance);

  const wrapOptionsGenerator = (
    originalGenerator: (...args: any[]) => any
  ) => {
    return (...args: any[]) => {
      const options = originalGenerator(...args);
      options.remarkPlugins = options.remarkPlugins ?? [];
      options.remarkPlugins.push(remarkPortalCardsPlugin);

      options.components = {
        ...options.components,
        'growi-portal-cards': PortalCardsGrid,
      };

      return options;
    };
  };

  const originalView =
    optionsGenerators.customGenerateViewOptions ??
    optionsGenerators.generateViewOptions;
  if (originalView != null) {
    optionsGenerators.customGenerateViewOptions =
      wrapOptionsGenerator(originalView);
  }

  const originalPreview =
    optionsGenerators.customGeneratePreviewOptions ??
    optionsGenerators.generatePreviewOptions;
  if (originalPreview != null) {
    optionsGenerators.customGeneratePreviewOptions =
      wrapOptionsGenerator(originalPreview);
  }
};

export const deactivate = (): void => {};

if (typeof window !== 'undefined') {
  window.pluginActivators = window.pluginActivators ?? {};
  window.pluginActivators[PLUGIN_NAME] = {
    activate,
    deactivate,
  };
}
```

## 6. `index.html` ＆ `dev/sandbox.tsx`

### `index.html`
```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>growi-plugin-portal-cards Local Sandbox</title>
    <link
      href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
      rel="stylesheet"
    />
  </head>
  <body class="bg-light">
    <div id="root"></div>
    <script type="module" src="/dev/sandbox.tsx"></script>
  </body>
</html>
```

### `dev/sandbox.tsx`
```tsx
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Markdown from 'react-markdown';
import {
  createPortalCardsGrid,
  type GrowiPageItem,
} from '../src/components/PortalCardsGrid';
import { remarkPortalCardsPlugin } from '../src/remark-portal-cards';

const MOCK_DB: GrowiPageItem[] = [
  // 総務カテゴリ
  { _id: 'b0', path: '/BackOffice', updatedAt: '2026-10-01T00:00:00Z' },
  {
    _id: 'b1',
    path: '/BackOffice/Expense_Guide',
    updatedAt: '2026-10-10T00:00:00Z',
    seenUsers: ['u1', 'u2', 'u3', 'u4', 'u5'],
    liker: ['u1', 'u2'],
  },
  {
    _id: 'b2',
    path: '/BackOffice/Paid_Leave_Request',
    updatedAt: '2026-10-12T00:00:00Z',
    seenUsers: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'],
    liker: ['u1', 'u2', 'u3'],
  },
  {
    _id: 'b3',
    path: '/BackOffice/Year_End_Tax_Adjustment',
    updatedAt: '2026-10-15T00:00:00Z',
    seenUsers: ['u1', 'u2', 'u3'],
    liker: ['u1'],
  },
  {
    _id: 'b4',
    path: '/BackOffice/Minor_Notice',
    updatedAt: '2026-10-16T00:00:00Z',
    seenUsers: ['u1'],
    liker: [],
  },
  // 開発標準カテゴリ
  {
    _id: 'e1',
    path: '/Engineering/Onboarding/PC_Initial_Setup',
    updatedAt: '2026-10-11T00:00:00Z',
    seenUsers: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'],
    liker: ['u1', 'u2', 'u3', 'u4'],
  },
  {
    _id: 'e2',
    path: '/Engineering/Onboarding/GitHub_Flow_Rules',
    updatedAt: '2026-10-14T00:00:00Z',
    seenUsers: ['u1', 'u2', 'u3', 'u4', 'u5'],
    liker: ['u1', 'u2'],
  },
  // 技術ノウハウカテゴリ
  {
    _id: 't1',
    path: '/TechKnowhow/Azure/Fabric_Medallion_Architecture',
    updatedAt: '2026-10-16T10:00:00Z',
    seenUsers: ['u1', 'u2', 'u3', 'u4'],
    liker: ['u1', 'u2', 'u3'],
  },
  {
    _id: 't2',
    path: '/TechKnowhow/CSharp/ASPNET_Core_Performance',
    updatedAt: '2026-10-15T09:00:00Z',
    seenUsers: ['u1', 'u2', 'u3'],
    liker: ['u1', 'u2'],
  },
];

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = typeof input === 'string' ? input : input.toString();
  if (urlStr.startsWith('/_api/v3/pages/list')) {
    const url = new URL(urlStr, window.location.origin);
    const targetPath = url.searchParams.get('path') ?? '/';
    const matched = MOCK_DB.filter(
      (p) => p.path === targetPath || p.path.startsWith(`${targetPath}/`)
    );
    return new Response(
      JSON.stringify({
        pages: matched,
        totalCount: matched.length,
        limit: 100,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return originalFetch(input, init);
};

const PortalCardsGrid = createPortalCardsGrid(React);

const INITIAL_MARKDOWN = `# 🏢 社内ノウハウ・ナレッジポータル

\`\`\`portal(cols=3, shortcuts=3, sort=popular)
# パス                  | タイトル               | 説明文                                     | 個別オプション
/BackOffice             | 💼 総務・経費・勤怠    | 各種申請ルール、年末調整、備品購入の手続き | color=primary, pins=/BackOffice/Year_End_Tax_Adjustment
/Engineering/Onboarding | 💻 開発標準・環境構築  | PC初期設定、Git運用ルール、開発規約        | color=success
/TechKnowhow            | 🚀 技術調査・ノウハウ  | トラブルシューティング、検証レポート、Tips | color=info, label=relative
\`\`\`
`;

const markdownComponents: Record<string, React.ComponentType<any>> = {
  'growi-portal-cards': PortalCardsGrid,
};

const SandboxApp: React.FC = () => {
  const [markdown, setMarkdown] = useState<string>(INITIAL_MARKDOWN);
  return (
    <div className="container py-4">
      <h2 className="mb-3">growi-plugin-portal-cards Sandbox</h2>
      <textarea
        className="form-control font-monospace mb-3"
        rows={10}
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
      />
      <div className="card p-4 bg-white shadow-sm">
        <Markdown
          remarkPlugins={[remarkPortalCardsPlugin]}
          components={markdownComponents}
        >
          {markdown}
        </Markdown>
      </div>
    </div>
  );
};

const root = document.getElementById('root');
if (root) createRoot(root).render(<SandboxApp />);
```

## 7. `scripts/verify-build.mjs`
```javascript
import fs from 'node:fs';
import path from 'node:path';

const manifestCandidates = [
  path.resolve('dist/.vite/manifest.json'),
  path.resolve('dist/manifest.json'),
];
const manifestPath = manifestCandidates.find((p) => fs.existsSync(p));
if (!manifestPath) {
  console.error('❌ manifest.json が見つかりません');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
if (!manifest['client-entry.tsx']) {
  console.error('❌ client-entry.tsx キーがありません');
  process.exit(1);
}
console.log('✅ ビルド成果物検証OK:', manifest['client-entry.tsx'].file);
```
