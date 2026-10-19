# GROWI ポータルカードプラグイン (growi-plugin-portal-cards) 仕様書

## 1. Markdown コードブロック記法（DSL）仕様

コードブロックの言語名に `portal`（または `portal-cards`）を指定して記述する。
`#` から始まる行および空行はコメントとして無視する。

```portal(cols=3, shortcuts=3, sort=popular)
# パス                  | タイトル               | 説明文                                     | 行オプション（任意）
/BackOffice             | 💼 総務・経費・勤怠    | 各種申請ルール、年末調整、備品購入の手続き | color=primary, pins=/BackOffice/Expense;/BackOffice/Leave
/Engineering/Onboarding | 💻 開発標準・環境構築  | PC初期設定、Git運用ルール、開発規約        | color=success
/TechKnowhow            | 🚀 技術調査・ノウハウ  | トラブルシューティング、検証レポート、Tips | color=info, sort=updatedAt, label=relative
```

## 2. オプション仕様

### 2.1 コードブロック全体オプション（1行目の `portal(...)` に指定、省略可）
| オプション | 指定可能な値 | デフォルト値 | 説明 |
| :--- | :--- | :--- | :--- |
| **`cols`** | `1` / `2` / `3` / `4` | `3` | PC表示時のグリッド列数（スマホ1列、タブレット2列へ自動レスポンシブ対応）。 |
| **`shortcuts`** | `0` 以上の整数 | `3` | カード内に表示する直通ミニリンクの最大件数（`0` でミニリンク非表示）。 |
| **`sort`** | `popular` / `updatedAt` / `views` / `likes` | `popular` | ミニリンク自動抽出時の並び順。デフォルトは定番ページが浮き上がる `popular`（いいね数×2＋閲覧者数）。 |
| **`recursive`** | `true` / `false` | `true` | `true`: サブフォルダ以下全階層から抽出 / `false`: 直下1階層のみ。 |
| **`count`** | `true` / `false` | `true` | カード右上に配下ページ総数バッジ（自ページ除外）を表示するか。 |
| **`label`** | `title` / `relative` | `title` | ミニリンクの表示名。`title` は末尾のページ名のみ、`relative` はカテゴリからの相対パス。 |

### 2.2 行ごとの個別オプション（第4カラムにカンマ区切りで指定、省略可）
全体オプション（`shortcuts`, `sort`, `recursive`, `count`, `label`）を上書きできるほか、以下の行専用オプションを指定可能。
- **`color`**: `primary` | `success` | `info` | `warning` | `danger` | `secondary`（未指定時は行番号に応じてパレットを自動ローテーション）。
- **`pins`**: セミコロン（`;`）区切りで固定表示したいページのパスを指定（例: `pins=/BackOffice/Expense;/BackOffice/Leave`）。指定されたページを最優先でミニリンク上部に固定表示し、`shortcuts` 件数に満たない残り枠を自動抽出（人気順等）で埋める。
- **`icon`**: タイトル先頭に絵文字を書く以外に、`icon=💼` のように明示指定も可能。
