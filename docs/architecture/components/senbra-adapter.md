# D-08 コンポーネント境界設計書: 専ブラ互換Adapter

> ステータス: 運用中
> 関連D-07: § 6 専ブラ互換APIアーキテクチャ

---

## 1. 分割方針

5ch専用ブラウザが要求するプロトコル（Shift_JIS・DAT形式・subject.txt・bbs.cgi等）の変換処理を、Application Layer から切り離してPresentation Layerの一部として扱う。Application Layer（サービス群）はUTF-8のドメインオブジェクトのみを扱い、エンコーディングや形式変換を一切知らない。

専ブラ互換Adapterは**変換と中継のみ**を行い、ビジネスロジックを持たない。

---

## 2. 内部コンポーネント構成

> **設計判断: クラスベースの採用について**
>
> 各コンポーネントはステートレスな変換処理であるが、`DatFormatter` が `ShiftJisEncoder` を内部依存として保持する必要があるため、依存オブジェクトをコンストラクタで組み立てるクラス形式を採用した。他コンポーネント（`SubjectFormatter`、`BbsCgiParser`、`BbsCgiResponseBuilder`）も構成の一貫性のためクラスとして実装している。Route Handler は各クラスを `new` してメソッドを呼び出す。

```
専ブラ互換Adapter
  ├── ShiftJisEncoder        エンコーディング変換（UTF-8 ↔ Shift_JIS）
  ├── DatFormatter           DAT形式テキストの構築
  ├── SubjectFormatter       subject.txt の構築
  ├── BbsCgiParser           bbs.cgi POSTリクエストのパース → PostInput変換
  └── BbsCgiResponseBuilder  bbs.cgi レスポンスHTML生成
```

各コンポーネントはそれぞれ単体でテスト可能な純粋変換処理として実装する（HTTPコンテキストに依存しない）。Route Handler がこれらを組み合わせて使う。

---

## 3. 公開インターフェース（Route Handlerに対して）

### DatFormatter

```typescript
class DatFormatter {
  constructor()  // ShiftJisEncoder を内部で保持
  buildDat(posts: Post[], threadTitle: string): string
  calcShiftJisLineBytes(line: string): number
}
```

`buildDat` の入力は UTF-8の `Post[]`。出力は Shift_JIS エンコード前の DAT テキスト（1レス=1行、`<br>` 改行）。ShiftJisEncoderへの変換は呼び出し元（Route Handler）が行う。

`calcShiftJisLineBytes` はレス書き込み時に `threads.dat_byte_size` を更新するためのユーティリティ。末尾の改行 (`\n`) を含む DAT 1行を渡す。

**DATフォーマット:**
```
名前<>メール<>YYYY/MM/DD(曜) HH:mm:ss.SS ID:dailyId<>本文（<br>区切り）<>スレッドタイトル（第1レスのみ）\n
```

BOTマーク絵文字（🤖等）の Shift_JIS 変換不可問題：DAT出力時は `[BOT]` テキストに置換する。この置換はDatFormatter内で行う。

### SubjectFormatter

```typescript
class SubjectFormatter {
  constructor()
  buildSubjectTxt(threads: Thread[]): string
}
```

出力: `{threadKey}.dat<>{title} ({postCount})\n` の繰り返し。Shift_JIS変換前のUTF-8文字列を返す。`isDeleted=true` のスレッドは出力から除外する。スレッドの並び順（bump順）は呼び出し元が渡すリストの順序に従う（本クラスはソートしない）。

### BbsCgiParser

```typescript
class BbsCgiParser {
  constructor()
  parseRequest(body: URLSearchParams, cookieHeader: string): BbsCgiParsedRequest
}
```

```typescript
interface BbsCgiParsedRequest {
  threadKey:  string        // keyパラメータ
  boardId:    string        // bbsパラメータ
  message:    string        // MESSAGEパラメータ（デコード済み）
  name:       string        // FROMパラメータ（デコード済み）
  mail:       string        // mailパラメータ
  edgeToken:  string | null // cookie の edge-token から取得。未設定時は null
}
```

Shift_JISデコードは呼び出し元（Route Handler）が担う。本クラスはデコード済みの `URLSearchParams` を受け取る。パラメータが省略された場合は空文字列で補填し、バリデーションはアプリケーション層に委ねる。

### BbsCgiResponseBuilder

```typescript
class BbsCgiResponseBuilder {
  constructor()
  buildSuccess(threadKey: string, boardId: string): string   // 書き込み成功HTML
  buildError(message: string): string                        // エラーHTML
  buildAuthRequired(code: string, edgeToken: string): string // 認証案内HTML
}
```

出力はUTF-8文字列。Shift_JISへの変換は呼び出し元（Route Handler）が担う。専ブラはtitleタグの文字列でレスポンスの種類を判別する（成功: "書きこみました" / エラー: "ＥＲＲＯＲ"（全角））。

### ShiftJisEncoder

```typescript
class ShiftJisEncoder {
  encode(text: string): Buffer   // UTF-8 → Shift_JIS
  decode(buffer: Buffer): string // Shift_JIS → UTF-8
}
```

---

## 4. Range差分応答の実装方針

`Range: bytes=N-` ヘッダを受け取った場合、Route HandlerはThreadRepositoryから `dat_byte_size` を取得し、N以降の差分レスのみをクエリする。

```
差分レス取得の流れ:
1. threads.dat_byte_size を取得
2. リクエストのRangeヘッダを解析（N バイト目から）
3. 全DATを構築せずに差分レスのみを構築（コスト削減）
4. 206 Partial Content + Content-Range ヘッダを付けて返す
5. 書き込みが発生するたびにthreads.dat_byte_sizeを更新（Shift_JIS換算）
```

`dat_byte_size` の更新責任：書き込み時（PostService経由）に、新規レスのShift_JIS換算バイト数を加算する。この計算はDatFormatterが提供するユーティリティ関数で行う。

---

## 5. 依存関係

### 5.1 依存先（Route Handler経由で間接的に依存）

| コンポーネント | 用途 |
|---|---|
| PostService | 書き込み（bbs.cgi POST）・レス取得（.dat GET） |
| ThreadRepository | スレッド一覧取得（subject.txt: is_dormant=false のみ。LIMIT不使用）、dat_byte_size参照 |
| PostRepository | レス取得（.dat Range差分） |

### 5.2 被依存

```
(senbra)/[boardId]/dat/[threadKey].dat/route.ts  →  DatFormatter, ShiftJisEncoder, PostService
(senbra)/[boardId]/subject.txt/route.ts          →  SubjectFormatter, ShiftJisEncoder, ThreadRepository
(senbra)/test/bbs.cgi/route.ts                   →  BbsCgiParser, BbsCgiResponseBuilder, PostService
(senbra)/bbsmenu.html/route.ts                   →  ShiftJisEncoder（HTML固定テキストのみ）
(senbra)/[boardId]/SETTING.TXT/route.ts          →  ShiftJisEncoder（固定テキストのみ）
```

---

## 6. 設計上の判断

### エンコーディング変換の境界

- **Inbound（bbs.cgi POST）**: BbsCgiParser内でデコードし、以降はすべてUTF-8で流れる
- **Outbound（.dat / subject.txt）**: Route HandlerがDatFormatter/SubjectFormatterの結果（UTF-8文字列）を受け取り、ShiftJisEncoderでBufferに変換してレスポンスに書く

Application Layer（PostService等）にはUTF-8文字列のみが届く設計を守る。

### 304 Not Modified の判定

`If-Modified-Since` ヘッダを受け取った場合、`threads.last_post_at` と比較する。last_post_at の精度（秒単位か）と、HTTP Date形式のパースはRoute Handler側で処理する。

### subject.txt のスレッド一覧フィルタリング

subject.txt は `is_dormant = false` のアクティブスレッドのみを返す（D-05参照）。フィルタリングは ThreadRepository のクエリ条件（`WHERE is_deleted = false AND is_dormant = false`）で実行し、SubjectFormatter は渡された Thread[] をそのままフォーマットする。LIMIT は使用しない。これにより、専ブラのローカル履歴にスレッドが蓄積する問題を構造的に防ぐ。
