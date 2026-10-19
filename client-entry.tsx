import { growiReact } from '@growi/pluginkit/dist/v4/client';
import React from 'react';
import { createPortalCardsGrid, type PortalCardsGridProps } from './src/components/PortalCardsGrid';
import { remarkPortalCardsPlugin } from './src/remark-portal-cards';

export const PLUGIN_NAME = 'growi-plugin-portal-cards';
export interface RendererOptions {
  remarkPlugins?: unknown[];
  components?: Record<string, unknown>;
  [key: string]: unknown;
}
export type OptionsGenerator = (...args: unknown[]) => RendererOptions;
export interface OptionsGenerators {
  customGenerateViewOptions?: OptionsGenerator;
  generateViewOptions?: OptionsGenerator;
  customGeneratePreviewOptions?: OptionsGenerator;
  generatePreviewOptions?: OptionsGenerator;
}

// GROWIが起動時に参照するグローバル契約を、このエントリで宣言します。
declare global {
  interface Window {
    pluginActivators?: Record<string, { activate: () => void; deactivate: () => void }>;
  }
}

let cleanup: (() => void) | undefined;
export const activate = (): void => {
  // growiFacade自体の宣言はPluginkitに委ね、必要な契約だけローカルに型付けします。
  const facade = typeof window === 'undefined' ? undefined : window.growiFacade as {
    react?: typeof React;
    markdownRenderer?: { optionsGenerators?: OptionsGenerators };
  } | undefined;
  const generators = facade?.markdownRenderer?.optionsGenerators;
  if (!generators || cleanup) return;
  const SharedReact = growiReact(React) ?? facade?.react ?? React;
  const Grid = createPortalCardsGrid(SharedReact);
  const restore: (() => void)[] = [];
  for (const [customKey, defaultKey] of [
    ['customGenerateViewOptions', 'generateViewOptions'],
    ['customGeneratePreviewOptions', 'generatePreviewOptions'],
  ] as const) {
    const previous = generators[customKey];
    const original = previous ?? generators[defaultKey];
    const wrapped: OptionsGenerator = (...args) => {
      const options = original?.apply(generators, args) ?? {};
      // 既存配列を変更しないことで、共有設定への重複追加を防ぎます。
      return {
        ...options,
        remarkPlugins: [...(options.remarkPlugins ?? []).filter((plugin) => plugin !== remarkPortalCardsPlugin), remarkPortalCardsPlugin],
        components: { ...options.components, 'growi-portal-cards': Grid as React.ComponentType<PortalCardsGridProps> },
      };
    };
    generators[customKey] = wrapped;
    restore.push(() => {
      // 後から登録された別プラグインのフックは上書きしません。
      if (generators[customKey] !== wrapped) return;
      if (previous) generators[customKey] = previous;
      else delete generators[customKey];
    });
  }
  cleanup = () => restore.forEach((restoreGenerator) => restoreGenerator());
};

export const deactivate = (): void => {
  cleanup?.();
  cleanup = undefined;
};

// importされた時点で登録し、実際の有効化はGROWIのライフサイクルに委ねます。
if (typeof window !== 'undefined') {
  window.pluginActivators ??= {};
  window.pluginActivators[PLUGIN_NAME] = { activate, deactivate };
}