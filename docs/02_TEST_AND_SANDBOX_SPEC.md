# テストおよびローカル動作確認（Sandbox）仕様書

## 1. Vitest による自動テスト（`npm test`）
`test/plugin.spec.ts` で以下の7項目を検証すること。
1. **`package.json` 検証**: `name` が `"growi-plugin-portal-cards"` かつ `growiPlugin.schemaVersion` が `"4"` であること。
2. **DSLパーサー＆AST変換検証**: ```` ```portal(cols=2, shortcuts=4) ```` 内のパイプ区切り行・コメント行・個別オプション（`color`, `pins` 等）が正しくパースされ、`<growi-portal-cards>` の属性に変換されること。
3. **自ページ除外と件数カウント検証**: `/_api/v3/pages/list` の結果からカテゴリ起点ページ自身が除外され、正確な配下ページ件数バッジが表示されること。
4. **人気順（`sort=popular`）ミニリンク抽出検証**: 配下ページが人気スコア（いいね×2＋閲覧数）の降順で上位N件ミニリンク表示されること。
5. **ピン留め（`pins`）優先マージ検証**: `pins` で指定したパスがミニリンクの先頭に固定表示され、残りの枠が人気順ページで重複なく補充されること。
6. **ミニリンク表示形式（`label=title` / `relative`）検証**: デフォルトで末尾のページ名のみが表示され、`label=relative` 指定時は相対パスが表示されること。
7. **アクティベート検証**: `window.pluginActivators['growi-plugin-portal-cards'].activate()` により View / Preview の両方に登録されること。

## 2. ローカルSandbox（`npm run dev`）
- `dev/sandbox.tsx` を用意し、`http://localhost:5173` で3列グリッドカード、テーマカラー自動ローテーション、件数バッジ、ピン留め＋人気順ミニリンクをライブプレビューできるようにする。
