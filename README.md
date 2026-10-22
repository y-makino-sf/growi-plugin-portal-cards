# growi-plugin-portal-cards

![GROWI Target](https://img.shields.io/badge/GROWI-7.1.9_target-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

GROWIの標準ページリストに近い情報を、通常のページ本文に埋め込むスクリプトプラグインです。指定パス配下の**子ページ1件につき1枚**のカードを表示します。親ページ自体は作成されていなくても構いません。

- カードにはフルパス、ページ名、最終更新者画像、足跡（閲覧者数）、記事抜粋を表示します。
- ピン留めを指定順で優先し、残りを人気順・最新順などで補充します。
- 現在の閲覧者が参照できると確認したページだけを表示します。権限を確認できないピンも除外します。
- 抜粋はオン・オフ、最大文字数、最大行数を調整できます。
- 対象はGROWI **7.1.9**のAPI契約です。実機インストール・権限別表示は未検証であり、v6/v8での互換性も保証していません。

## 使い方

Markdown本文に以下を記述します。`portal-cards`も使用できます。各行は「列挙元パス | セクション名 | セクション説明 | 個別オプション」です。空行と`#`から始まる行は無視します。

````markdown
```portal(cols=3, limit=12, sort=popular, excerpt=true, excerptLength=120, excerptLines=3)
/BackOffice | 総務・経費・勤怠 | 各種申請と手続き | color=primary, pins=/BackOffice/Expense
/Engineering/Onboarding | 開発環境 | セットアップと運用ルール | color=success, excerptLength=60, excerptLines=1
/TechKnowhow | 技術ノウハウ | 調査・障害対応 | color=info, label=relative, excerpt=false
```
````

フェンスを`portal`だけにし、本文の先頭へ`portal(...)`を置く書き方も受け入れます。ページ名はパス末尾、画像はGROWI標準同様に最終更新者のものです。行の説明・`icon`はセクション用で、記事の抜粋や更新者画像は上書きしません。

### 全体・行オプション

`cols`以外は全体設定を行ごとに上書きできます。数値は整数で指定してください。

| オプション | 指定可能な値 | デフォルト値 | 説明 |
| --- | --- | --- | --- |
| `cols` | `1` / `2` / `3` / `4` | `3` | PC列数。スマホ1列、タブレット最大2列。 |
| `limit` | `0`以上の安全な整数 | `12` | 各列挙元の最大表示件数。上位のみでページ切替なし。`0`はカード非表示。 |
| `excerpt` | `true` / `false` | `true` | 抜粋表示。オフでは抜粋取得・抜粋用の余白も省略。 |
| `excerptLength` | `1`〜`300` | `120` | 省略記号を含む最大文字数。絵文字の途中では切らない。 |
| `excerptLines` | `1`〜`10` | `3` | 抜粋の最大行数。文字数と行数の先に達した上限で省略。 |
| `sort` | `popular` / `updatedAt` / `views` / `likes` | `popular` | 人気順＝いいね数×2＋閲覧者数。同点は最新更新順、次にパス順。 |
| `recursive` | `true` / `false` | `true` | 全階層 / 直下のみ。起点自身は除外。 |
| `count` | `true` / `false` | `true` | セクションに実際のカード数を「表示N件」と表示。配下総数ではありません。 |
| `label` | `title` / `relative` | `title` | タイトルを末尾名 / 列挙元からの相対パスにする。フルパスは常時表示。 |
| `shortcuts` | `0`以上の安全な整数 | 未指定 | 非推奨の`limit`別名。旧ミニリンクUIは残さない。 |

行専用の`color`は`primary` / `success` / `info` / `warning` / `danger` / `secondary`。未指定時は行ごとにローテーションします。`pins`は`;`区切りのパスで、指定順を優先して残り枠をソート順で埋めます。**一覧の対象外・存在不明のピンからカードは作りません。** `icon`はセクション見出しの絵文字です。

件数の優先順位は、有効な「行`limit` → 行`shortcuts` → 全体`limit` → 全体`shortcuts` → 12」です。抜粋設定の無効値・範囲外指定は有効な全体設定、なければ既定値へ戻ります。非表示には長さ`0`ではなく`excerpt=false`を使います。

### 抜粋量の例

| 表示 | 指定 |
| --- | --- |
| なし | `excerpt=false` |
| コンパクト | `excerpt=true, excerptLength=60, excerptLines=1` |
| 標準 | `excerpt=true, excerptLength=120, excerptLines=3` |
| 多め | `excerpt=true, excerptLength=240, excerptLines=5` |

GROWIが返す`revisionShortBody`の長さが上限です。長く指定しても記事全文の追加取得はしません。抜粋はHTML/Markdownとして実行しない安全なテキスト表示です。表示量だけの変更では再通信しません。

## 取得・権限・件数

- `/_api/v3/pages/list`を100件ずつ取得し、配下候補全体から順位を決めます。上位12件でも一覧の通信が1回とは限りません。
- 表示候補のIDを`/_api/v3/page-listing/info`へ送り、参照可能なページだけを採用します。`attachShortBody=true`で抜粋も一括取得します。20IDずつ、最大2バッチ同時実行です。
- 抜粋オフでも足跡・権限確認用のメタ取得は行います。足跡は累計PVではなく閲覧したユーザー数です。
- 件数は「表示N件」で、参照を確認した実際のカード数です。権限のないページ数や配下総数は表示しません。`limit=0`は`count`設定にかかわらずAPI通信を省き、表示0件になります。
- 正常なメタ応答にIDがないページは、パス・タイトルも表示せず次候補で補充します。欠落理由を権限不足と断定せず、参照可能と確認できないための除外として扱います。候補を調べ終えるか`limit`に達したら終了します。参照不可が多い場合は、上限より多くの候補を権限確認します。
- 一括取得失敗は個別ページの権限不足とは区別し、補充を中止します。以前の成功分で確認済みのカードだけを残し、取得失敗を案内します。全件未確認なら「取得失敗」とし、参照可能なページが0件だとは断定しません。
- 空本文の正規ページは表示します。正常に確認を終えて表示対象がない場合は「表示できるページがありません」と案内します。抜粋をオフにしても参照確認は必ず行います。
- 一覧の途中失敗では、部分的な結果を正確な順位や総数として表示しません。権限を迂回する全文取得はしません。
- キャッシュは各グリッドのマウント期間限定です。ブラウザー永続ストレージには保存しません。同じ表示中に変更された権限を再確認するにはページを再読込してください。大量ページ時の時間と権限別の挙動は実機で確認してください。
- この機能は画面上のカードを除外するもので、サーバーの認可やネットワーク応答を変更しません。存在自体を一覧APIから秘匿するには、GROWI側の一覧公開ポリシーも設定してください。

## 旧表示からの移行

これは表示上の破壊的変更です。「カテゴリ1枚＋ミニリンク」から「セクション＋子ページごとのカード」に変わります。`shortcuts=3`を明示していた場合はカードも3件のため、12件にするには`limit=12`へ置き換えてください。既存の行タイトル・説明はセクションに残ります。存在しないピンの合成表示は廃止しました。

## GROWIへの導入

管理画面のプラグインから、ビルド済み`dist/`を含めて公開したリポジトリURLを指定します。以下のURLは自分の公開先へ置き換えてください。GROWI 7.1.9への実機導入検証は別途必要です。

```text
https://github.com/<あなたのGitHubアカウント名>/growi-plugin-portal-cards
```

## ローカル検証（Windows PowerShell）

```powershell
npm install
npm run dev
npm test
npm run build
npm run verify:build
```

サンドボックスは通常`http://127.0.0.1:5173/`です。ポート使用中はViteが表示するURLを使います。抜粋の選択欄とMarkdown編集で設定を確認できます。画像はGROWI標準の匿名画像をローカル配信し、本文・足跡はモックです。`/Engineering/Onboarding`は親ページのない例です。

列挙元を`/Sandbox`へ変更すると空本文・壊れた画像を表示し、メタ情報が返らないページはスキップして表示2件になります。`/Sandbox/ListError`は一覧取得失敗、`/MetaError`はメタ取得失敗、`/DeniedOnly`は全候補非表示を確認できます。サンドボックスのリンク先に実際の記事はありません。

参照不可のピンを飛ばして次候補で補充する例です。ReadableAとReadableBだけが表示され、バッジは表示2件になります。

````markdown
```portal(limit=2)
/AccessCheck | 権限確認 | | pins=/AccessCheck/Hidden
```
````

`dist/`はGROWI配信用のためGit除外しません。共有React、View/Preview二重フック、ルートエントリとv4マニフェストの制約を維持しています。匿名画像の元データは[GROWI 7.1.9](https://github.com/growilabs/growi/blob/v7.1.9/apps/app/public/images/icons/user.svg)で、ローカル検証専用です。

## ライセンス

[MIT License](LICENSE)
