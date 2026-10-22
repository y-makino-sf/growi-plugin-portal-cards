# GROWI ページカード仕様（7.1.9対象）

## 1. Markdown コードブロック記法（DSL）仕様

コードブロックの言語名に `portal`（または `portal-cards`）を指定して記述する。
`#` から始まる行および空行はコメントとして無視する。

```portal(cols=3, limit=12, sort=popular, excerpt=true, excerptLength=120, excerptLines=3)
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
| **`limit`** | `0` 以上の安全な整数 | `12` | 各列挙元の最大ページカード数。`0`で非表示。ページ切替なし。 |
| **`shortcuts`** | `0` 以上の安全な整数 | 未指定 | `limit`の非推奨別名。旧ミニリンク表示には戻さない。 |
| **`excerpt`** | `true` / `false` | `true` | 抜粋の表示と取得。オフ時は抜粋用の余白も削除する。 |
| **`excerptLength`** | `1`〜`300` | `120` | Unicode書記素単位の最大文字数。省略記号を含む。 |
| **`excerptLines`** | `1`〜`10` | `3` | CSSで制限する最大行数。 |
| **`sort`** | `popular` / `updatedAt` / `views` / `likes` | `popular` | ページカードの並び順。人気スコアはいいね数×2＋閲覧者数。 |
| **`recursive`** | `true` / `false` | `true` | `true`: サブフォルダ以下全階層から抽出 / `false`: 直下1階層のみ。 |
| **`count`** | `true` / `false` | `true` | セクションへ実際のカード数を「表示N件」と表示するか。配下総数は表示しない。 |
| **`label`** | `title` / `relative` | `title` | タイトルの表示名。フルパスは別欄に常時表示。 |

### 2.2 行ごとの個別オプション（第4カラムにカンマ区切りで指定、省略可）
`cols`以外の全体オプションを上書きできるほか、以下の行専用オプションを指定可能。
- **`color`**: `primary` | `success` | `info` | `warning` | `danger` | `secondary`（未指定時は行番号に応じてパレットを自動ローテーション）。
- **`pins`**: セミコロン区切りのパス。取得候補にあるページのみ指定順で優先し、残りをソート順で補充する。存在不明・対象外のピンからカードを合成しない。
- **`icon`**: セクション見出しの絵文字。記事カードは最終更新者画像を使う。

## 3. ページ単位の表示と移行

各行は列挙元セクションであり、子ページ1件につき1枚のカードへ展開する。表示項目はフルパス、末尾名または相対パスのタイトル、最終更新者画像、足跡（閲覧者数）、本文抜粋。セクションの説明文を記事本文として代用しない。

旧「カテゴリカード＋ミニリンク」UIは廃止。`shortcuts=3`を残すと3枚のカードになる。件数の優先順位は行`limit`、行`shortcuts`、全体`limit`、全体`shortcuts`、12。不正な数値は次候補へ戻す。抜粋設定も無効な行値は有効な全体値、なければ既定値を使う。

抜粋なしは`excerpt=false`、小さくするには`excerptLength=60, excerptLines=1`、標準は120字3行、多めは240字5行。文字数・行数の先に達した上限で制限し、標準APIの短文以上は追加取得しない。

## 4. GROWI 7.1.9のAPI契約

1. `GET /_api/v3/pages/list?path=...&limit=100&page=1`は`{ pages, totalCount, offset, limit }`を直接返す。全ページを取得後、起点・重複・空ページ・削除済み・階層条件を適用する。閲覧者・いいね配列が欠ける場合、0と仮定して人気順を確定しない。
2. 表示候補だけを`GET /_api/v3/page-listing/info?pageIds[0]=...&attachShortBody=true`で一括取得する。応答はIDをキーとするメタマップ。`revisionShortBody`と`sumOfSeenUsers`を利用する。添字付き配列を20IDずつ、最大2バッチ同時に送る。
3. 抜粋オフでは`attachShortBody`を送信しないが、閲覧者数・権限確認用メタ取得は維持する。`limit=0`では`count`設定を問わず一覧・メタ取得を省略し、表示0件とする。
4. 標準画像は`lastUpdateUser.imageUrlCached`、なければ`/images/icons/user.svg`。安全なHTTP(S)・ローカル絶対パスだけを利用し、スクリプトURL等は除外する。
5. 一覧の公開ポリシーと本文閲覧権限は同義ではない。`page-listing/info`は閲覧者を条件にした検索結果なので、正常応答内の有効なメタが`isEmpty=false`のページだけ採用する。欠落ID・空ページはパスやタイトルも表示せず、残り候補から補充する。欠落理由は権限不足と断定しない。ピン留めでも例外にしない。空本文の実体ページは表示する。
6. 件数は表示中の確認済みカード数であり、候補総数は画面に出さない。補充は未試行候補だけを順に調べ、上限または候補末尾で終了する。正常に全件除外した場合は表示0件とする。
7. HTTPエラー・通信失敗・不正応答では補充を止め、成功済みラウンドの確認済みカードだけ残す。未確認のカードは作らない。確認済み0件なら取得失敗を表示し、正常0件と混同しない。一覧途中失敗も確定件数として見せない。
8. リクエスト共有・キャッシュはグリッドのマウント中だけ。中断と破棄に対応し、永続キャッシュや個別記事全文取得は行わない。権限変更後の再判定にはページ再読込が必要。
9. 画面非表示はサーバー側の存在秘匿を保証しない。ネットワーク応答からも隠す必要があればGROWIの一覧公開ポリシーで対応する。

## 5. 根拠と確認範囲

- [標準一覧の表示](https://github.com/growilabs/growi/blob/v7.1.9/apps/app/src/client/components/PageList/PageListItemL.tsx)
- [一覧API](https://github.com/growilabs/growi/blob/v7.1.9/apps/app/src/server/routes/apiv3/pages/index.js)
- [一括メタAPI](https://github.com/growilabs/growi/blob/v7.1.9/apps/app/src/server/routes/apiv3/page-listing.ts)
- [モデルとクエリ](https://github.com/growilabs/growi/blob/v7.1.9/apps/app/src/server/models/page.ts)
- [直接JSON応答](https://github.com/growilabs/growi/blob/v7.1.9/apps/app/src/server/routes/apiv3/response.js)
- [配列の符号化](https://github.com/growilabs/growi/blob/v7.1.9/apps/app/src/utils/axios.ts)
- [標準画像](https://github.com/growilabs/growi/blob/v7.1.9/packages/ui/src/components/UserPicture.tsx)

ソース上の契約確認とローカルのモック検証を対象とする。実機GROWI 7.1.9でのインストール、権限設定、標準一覧との比較、大量データ時の性能は別途検証が必要。v6/v8互換性は保証しない。
