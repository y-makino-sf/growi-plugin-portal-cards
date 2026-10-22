import type { Code, Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

// 設定を純粋なデータにして、Markdown変換とReact描画の責務を分離します。
export type PortalSortMode = 'popular' | 'updatedAt' | 'views' | 'likes';
export type PortalLabelMode = 'title' | 'relative';
export type PortalColorTheme = 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'secondary';
export interface PortalCardConfig {
  path: string;
  title: string;
  description: string;
  color: PortalColorTheme;
  icon: string;
  pins: string[];
  limit: number;
  shortcuts: number;
  excerpt: boolean;
  excerptLength: number;
  excerptLines: number;
  sort: PortalSortMode;
  recursive: boolean;
  count: boolean;
  label: PortalLabelMode;
}
export interface PortalBlockPayload { cols: number; cards: PortalCardConfig[] }

const palette: PortalColorTheme[] = ['primary', 'success', 'info', 'warning', 'danger', 'secondary'];
const sorts: PortalSortMode[] = ['popular', 'updatedAt', 'views', 'likes'];

/** フェンス言語とmetaに分割された括弧も取り除き、値中の「=」は保存します。 */
export const parseKeyValueOptions = (raw?: string | null): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const part of (raw ?? '').replace(/[()]/g, '').split(',')) {
    const separator = part.indexOf('=');
    const key = (separator < 0 ? part : part.slice(0, separator)).trim().toLowerCase();
    if (key && !['__proto__', 'constructor', 'prototype'].includes(key)) {
      result[key] = separator < 0 ? 'true' : part.slice(separator + 1).trim();
    }
  }
  return result;
};

const integerOption = (value: string | undefined, fallback: number): number =>
  value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
const booleanOption = (value: string | undefined, fallback: boolean): boolean =>
  value?.toLowerCase() === 'true' ? true : value?.toLowerCase() === 'false' ? false : fallback;

/** 行の無効値は全体設定へ戻し、表示量を安全な範囲に限定します。 */
const boundedOption = (value: string | undefined, fallback: number, maximum: number): number => {
  const parsed = integerOption(value, fallback);
  return parsed >= 1 && parsed <= maximum ? parsed : fallback;
};

/** 先頭スラッシュと末尾を統一し、カテゴリ境界の比較を安定させます。 */
export const normalizeGrowiPath = (raw: string): string => {
  const path = `/${raw.trim().replace(/^\/+/, '')}`;
  return path.replace(/\/+$/, '') || '/';
};

export const parsePortalCodeBlock = (lang: string, meta: string | null | undefined, codeValue: string): PortalBlockPayload => {
  const inline = lang.includes('(') ? lang.slice(lang.indexOf('(')) : '';
  let block = parseKeyValueOptions([inline, meta].filter(Boolean).join(' '));
  const lines = codeValue.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  // READMEのように本文先頭へportal(...)を記載する形式も受け入れます。
  if (/^portal(?:-cards)?\s*\(.*\)$/.test(lines[0] ?? '')) {
    block = { ...block, ...parseKeyValueOptions(lines.shift()!.replace(/^portal(?:-cards)?/, '')) };
  }
  const cols = integerOption(block.cols, 3);
  const cards = lines.flatMap((line, index): PortalCardConfig[] => {
    const [rawPath, title, description = '', rawOptions] = line.split('|').map((part) => part.trim());
    if (!rawPath) return [];
    const row = parseKeyValueOptions(rawOptions);
    const options = { ...block, ...row };
    const path = normalizeGrowiPath(rawPath);
    const limit = integerOption(row.limit, integerOption(row.shortcuts,
      integerOption(block.limit, integerOption(block.shortcuts, 12))));
    return [{
      path, title: title || path, description,
      color: palette.includes(row.color as PortalColorTheme) ? row.color as PortalColorTheme : palette[index % palette.length],
      icon: row.icon ?? '',
      pins: [...new Set((row.pins ?? '').split(';').filter((pin) => pin.trim()).map(normalizeGrowiPath))],
      limit,
      // 旧shortcutsは入力互換の別名とし、新しい表示件数と必ず一致させます。
      shortcuts: limit,
      excerpt: booleanOption(row.excerpt, booleanOption(block.excerpt, true)),
      excerptLength: boundedOption(row.excerptlength, boundedOption(block.excerptlength, 120, 300), 300),
      excerptLines: boundedOption(row.excerptlines, boundedOption(block.excerptlines, 3, 10), 10),
      sort: sorts.includes(options.sort as PortalSortMode) ? options.sort as PortalSortMode : 'popular',
      recursive: booleanOption(row.recursive, booleanOption(block.recursive, true)),
      count: booleanOption(row.count, booleanOption(block.count, true)),
      label: options.label === 'relative' ? 'relative' : 'title',
    }];
  });
  return { cols: [1, 2, 3, 4].includes(cols) ? cols : 3, cards };
};

/** HTML文字列を生成せず、hPropertiesへJSONを渡すことで本文のHTML注入を避けます。 */
export const remarkPortalCardsPlugin: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'code', (node: Code, index, parent) => {
    if (!/^portal(?:-cards)?(?:\(|$)/i.test(node.lang ?? '')) return;
    if (parent == null || index === undefined) return;
    // codeのままではrehypeがpreで包むため、空の段落をカスタム要素として置換します。
    parent.children[index] = {
      type: 'paragraph',
      children: [],
      data: {
        hName: 'growi-portal-cards',
        hProperties: { configjson: JSON.stringify(parsePortalCodeBlock(node.lang!, node.meta, node.value)) },
      },
    };
  });
};