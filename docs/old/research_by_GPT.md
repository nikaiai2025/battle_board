
# 5ch互換掲示板の読み書きインターフェース仕様レポート  
（ChMate / Siki 等専用ブラウザ対応）

---

# 1. 全体概要

ChMate・Siki などの「5ch専用ブラウザ」は、いわゆる **2ch/5ch互換仕様** に従った掲示板構造を前提に動作します。

互換性を持たせるために最低限必要なのは：

- `subject.txt`（スレッド一覧）
- `.dat` ファイル（スレッド本文）
- `/test/read.cgi/` 形式のURL
- `/test/bbs.cgi` へのPOST書き込みAPI
- `SETTING.TXT`（板設定）

専ブラからの読み込み・書き込みができればOKとのことなので、HTML表示は不要で、DAT互換APIを正しく実装すれば十分です。

---

# 2. 必須ファイル／エンドポイント仕様

## 2.1 スレッド一覧：subject.txt

### URL例

```

[https://example.com/board/subject.txt](https://example.com/board/subject.txt)

```

### フォーマット

```

スレッドキー.dat<>スレッドタイトル (レス数)

```

### 例

```

1234567890.dat<>サンプルスレッド (25)
1234567891.dat<>次スレ (8)

```

### 仕様ポイント

- 1行 = 1スレッド
- 改行必須（LF）
- 文字コード：**Shift_JIS**
- Content-Type:  
  `text/plain; charset=Shift_JIS`

専ブラはこれを取得して板一覧を構築します。

---

## 2.2 スレッド本文：.datファイル

### URL例

```

[https://example.com/board/dat/1234567890.dat](https://example.com/board/dat/1234567890.dat)

```

または

```

[https://example.com/test/read.cgi/board/1234567890/](https://example.com/test/read.cgi/board/1234567890/)

```

### DAT形式

1レス＝1行  
区切りは `<>`

```

名前<>メール<>日時 ID<>本文<>スレッドタイトル

```

### 例（1行目のみタイトル付き）

```

名無しさん<>sage<>2026/03/01(日) 12:34:56 ID:abcd1234<>こんにちは<>サンプルスレッド
名無しさん<>sage<>2026/03/01(日) 12:40:10 ID:efgh5678<>2ゲット<>

```

### 重要仕様

- 文字コード：**Shift_JIS**
- 改行：`\n`
- 1行目のみ末尾にスレタイを入れる
- 本文中の改行はそのまま改行
- `< > "` はHTMLエスケープ推奨
  - `<` → `&lt;`
  - `>` → `&gt;`
  - `"` → `&quot;`

---

# 3. 書き込みAPI仕様

## 3.1 エンドポイント

```

POST /test/bbs.cgi

```

## 3.2 送信パラメータ

| パラメータ | 内容 |
|------------|------|
| bbs | 板名 |
| key | スレッドキー |
| time | UNIXタイム |
| FROM | 名前 |
| mail | メール欄 |
| MESSAGE | 本文 |
| submit | 「書き込む」 |

## 3.3 成功レスポンス

HTMLで返す必要があります。

成功時、レスポンス内に必ず：

```

書きこみました。

```

という文言を含める。

専ブラはこの文字列で成功判定を行います。

---

# 4. SETTING.TXT仕様

### URL

```

[https://example.com/board/SETTING.TXT](https://example.com/board/SETTING.TXT)

```

### 例

```

BBS_TITLE=サンプル板
BBS_NONAME_NAME=名無しさん
BBS_FORCE_ID=checked
BBS_MESSAGE_COUNT=1000

```

### 主要項目

| キー | 説明 |
|------|------|
| BBS_TITLE | 板名 |
| BBS_NONAME_NAME | デフォルト名無し |
| BBS_FORCE_ID | ID強制表示 |
| BBS_NO_ID | ID非表示 |
| BBS_MESSAGE_COUNT | 最大レス数 |

専ブラはここを読んで板情報を表示します。

---

# 5. 専ブラ依存挙動

## 5.1 スレ落ち判定

- subject.txt から消えたスレ = dat落ち
- 通常1000レス到達でsubjectから除外

## 5.2 ID表示

DATの日時欄に

```

2026/03/01(日) 12:34:56 ID:abcd1234

```

と含める

## 5.3 キャッシュ対応

推奨HTTPヘッダ：

```

Last-Modified
ETag

```

専ブラは差分取得を行う

---

# 6. Next.js + Supabase 実装上の注意

---

## 6.1 最大の問題：Shift_JIS

Node.jsはUTF-8前提。

DAT出力時に：

```

iconv-lite

````

等でShift_JIS変換必須。

例：

```js
import iconv from "iconv-lite"

const sjisBuffer = iconv.encode(datString, "Shift_JIS")
res.setHeader("Content-Type", "text/plain; charset=Shift_JIS")
res.send(sjisBuffer)
````

---

## 6.2 静的生成は不可

掲示板は常時更新されるため：

* SSG（静的生成） ❌
* SSR / API Route ✅

動的APIでDATを生成する設計にする

---

## 6.3 Supabase設計注意点

### ❌ StorageでDAT管理

* 追記更新が面倒
* 毎回ファイル再アップロードが必要

### ✅ Database管理

* postsテーブルでレス保存
* APIでDAT文字列を動的生成

---

## 6.4 RLS（Row Level Security）

匿名閲覧・投稿させるなら：

* RLSポリシー調整が必要
* またはサーバー経由でDB操作

---

## 6.5 レスポンス速度

Vercel環境だと：

* Serverless cold start
* 1000レス組み立ての負荷

対策：

* キャッシュ層導入
* CDN活用
* ISR併用

---

# 7. 最低実装まとめ

専ブラ対応に必要な最低構成：

```
/board/subject.txt
/board/SETTING.TXT
/board/dat/{key}.dat
/test/read.cgi/{board}/{key}/
/test/bbs.cgi
```

実体は：

* Supabase DB
* Next.js APIでDAT生成
* Shift_JIS出力

---

# 8. 実装難易度評価

| 項目        | 難易度 |
| --------- | --- |
| DAT出力     | 中   |
| SJIS変換    | 中   |
| 書き込みAPI   | 低   |
| subject管理 | 低   |
| スレ落ち処理    | 低   |
| キャッシュ最適化  | 中   |

---

# 9. 結論

Next.js + Supabase でも
**5ch専ブラ互換掲示板は実装可能**

ただし：

* Shift_JIS対応が最大の壁
* 静的生成ではなく動的API設計必須
* subject.txt と DAT を正確に再現することが最重要

---
