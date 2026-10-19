# GROWI ポータルカードプラグイン開発ルール（Copilot Agent 指示書）

## 1. プロジェクト概要と命名規則
- パッケージ名・リポジトリ名・プラグイン識別子はすべて **`growi-plugin-portal-cards`** に統一する。
- 本プロジェクトは、GROWI（v6 / v7 / v8系対応）において、社内ノウハウDBのトップページやカテゴリ入り口を華やかに飾る「ライブ情報＆直通ショートカット付きポータルカード」を ```` ```portal ```` コードブロック記法で描画するスクリプトプラグインである。
- 開発環境は **Windows（シェルは PowerShell）** を前提とする。

## 2. コーディング規約
- 言語は **TypeScript + React 18**、ビルドは **Vite**、テストは **Vitest** を使用する。
- 古い記述は避け、モダンなES Modulesおよび関数コンポーネント・React Hooksで記述すること。
- **すべてのソースコードおよびテストコードには、処理の意図やGROWI仕様上の理由を説明する丁寧な日本語コメントを記載すること。**

## 3. GROWI プラグイン固有の厳格な技術制約（サイレント失敗防止）
1. **`package.json` の必須定義**: `"name": "growi-plugin-portal-cards"` とし、`"growiPlugin": { "schemaVersion": "4", "types": ["script"] }` を必ず定義すること。
2. **エントリーポイントの固定**: プロジェクトルート直下の **`client-entry.tsx` 固定** とする。
3. **Vite マニフェストの出力**: `vite.config.ts` の `build.manifest` を `true` に設定し、`dist/.vite/manifest.json` に `"client-entry.tsx"` が出力されることを保証すること。
4. **ビルド成果物のGit管理**: **`.gitignore` に `dist` を含めてはならない**。
5. **React インスタンスの共有**: `@growi/pluginkit/dist/v4/client` の `growiReact(React)` を利用するファクトリ構造にすること。
6. **閲覧画面とプレビューの二重フック**: `window.growiFacade.markdownRenderer.optionsGenerators` において、`customGenerateViewOptions` と `customGeneratePreviewOptions` の **両方** を差し替えること。

