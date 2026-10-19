# growi-plugin-portal-cards

![GROWI Compatibility](https://img.shields.io/badge/GROWI-v6%20%7C%20v7%20%7C%20v8-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

GROWIで構築した社内ノウハウDBやナレッジポータルのトップページに、**「配下ページ数バッジ」と「よく使われる定番ページへの直通ミニリンク（ショートカット）」を備えたカテゴリ案内カード**を簡単なコードブロック記法（```` ```portal ````）で配置できるスクリプトプラグインです。

---

## 💡 開発の背景と解決したい課題（Why this plugin?）

社内ポータルのトップページを作る際、以下のような課題を解決するために開発されました。

1. **生HTML（`<div class="card">...`）を排除し、誰でも簡単にメンテナンスできるようにしたい**
   - パイプ（`|`）区切りで1行1カテゴリを書くだけで、レスポンシブなBootstrapグリッドカードを自動生成します。HTMLタグが禁止（サニタイズ有効）されているGROWI環境でも安全に動作します。
2. **カテゴリページを経由せず、よく使う手続きページへ「1クリック」で直行したい**
   - 各カテゴリ配下のページから**人気順（閲覧数・いいね数）またはピン留め指定（`pins`）で上位3件をカード内にミニリンク表示**するため、利用者は迷わず目的のページへ辿り着けます。
3. **各カテゴリに今どれだけノウハウが蓄積されているか可視化したい**
   - カード右上に配下の総ページ数バッジ（例：`24件`）を自動取得して表示します。

---

## 🚀 使い方（Usage）

Markdown本文内に ```` ```portal ```` コードブロックを記述します（`#` で始まる行はコメントとして無視されます）。

```
portal(cols=3, shortcuts=3, sort=popular)
# パス                  | タイトル               | 説明文                                     | 個別オプション（任意）
/BackOffice             | 💼 総務・経費・勤怠    | 各種申請ルール、年末調整、備品購入の手続き | color=primary, pins=/BackOffice/Expense
/Engineering/Onboarding | 💻 開発標準・環境構築  | PC初期設定、Git運用ルール、開発規約        | color=success
/TechKnowhow            | 🚀 技術調査・ノウハウ  | トラブルシューティング、検証レポート、Tips | color=info, label=relative
```


### オプション一覧

#### 1. コードブロック全体オプション（1行目の `portal(...)` に指定）

| オプション | 指定可能な値 | デフォルト値 | 説明 |
| --- | --- | --- | --- |
| **`cols`** | `1` / `2` / `3` / `4` | `3` | PC画面でのグリッド列数（タブレット・スマホでは自動折り返し）。 |
| **`shortcuts`** | `0` 以上の数値 | `3` | カード内に表示する直通ミニリンクの件数（`0` で非表示）。 |
| **`sort`** | `popular` / `updatedAt` / `views` / `likes` | `popular` | ミニリンク自動抽出時の並び順。デフォルトは定番記事が浮き上がる `popular`（人気順）。 |
| **`recursive`** | `true` / `false` | `true` | `true`: サブフォルダ以下すべてから抽出 / `false`: 直下1階層のみ。 |
| **`count`** | `true` / `false` | `true` | カード右上に配下ページ総数バッジを表示するか。 |
| **`label`** | `title` / `relative` | `title` | ミニリンクの表示名。`title` はページ名のみ、`relative` は相対パスを表示。 |

#### 2. 行ごとの個別オプション（第4カラムにカンマ区切りで指定）

上記の全体オプションを行単位で上書きできるほか、以下の専用オプションが使えます。

* **`color`**: `primary` | `success` | `info` | `warning` | `danger` | `secondary`（省略時は行ごとに自動で色分けされます）。
* **`pins`**: セミコロン（`;`）区切りで固定表示したいページのパスを指定（例: `pins=/BackOffice/Expense;/BackOffice/Leave`）。指定されたページを最優先で📌付きミニリンクとして上部に固定し、残り枠を自動抽出で埋めます。

---

## 📦 インストール方法（GROWIへの導入）

1. GROWIの **「管理画面」** ＞ **「プラグイン」** を開きます。
2. **「プラグインをインストール」** から以下のリポジトリURLを入力します。
```text
https://github.com/<あなたのGitHubアカウント名>/growi-plugin-portal-cards

```



---

## 🛠️ 開発・ローカル検証コマンド（Windows PowerShell対応）

```powershell
# 依存パッケージのインストール
npm install

# ローカルSandboxの起動（http://localhost:5173 でライブプレビュー検証）
npm run dev

# 単体テストの実行（Vitest）
npm test

# 本番ビルドとマニフェスト検証（※GitHubへPushする際は dist/ ごとコミットしてください）
npm run build
npm run verify:build

```

---

## 📄 ライセンス

[MIT License](https://www.google.com/search?q=./LICENSE)
