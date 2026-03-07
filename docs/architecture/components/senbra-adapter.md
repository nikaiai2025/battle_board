# D-08 コンポーネント設計書: 専ブラ互換 Adapter

> 作成日: 2026-03-07
> 対象: Phase 1 + Phase 2 (MVP)

## 1. 概要

5ch専用ブラウザ（ChMate, Siki等）からのリクエストを受け付け、5chプロトコル準拠のレスポンスを返すアダプタ層。内部では Web API と同一の Application Layer サービスを利用する。

## 2. 責務

- Shift_JIS ↔ UTF-8 エンコーディング変換
- 5chプロトコル準拠のリクエスト解析・レスポンス生成
- DAT形式・subject.txt・bbs.cgi・SETTING.TXT・bbsmenu.html の提供
- Range ヘッダによる差分同期
- If-Modified-Since による 304 応答
- コマンド文字列のゲームコマンドとしての中継

## 3. 依存関係

```
専ブラ互換 Adapter
  ├── ShiftJisEncoder       (iconv-lite ラッパー)
  ├── DatFormatter          (DAT形式変換)
  ├── SubjectFormatter      (subject.txt変換)
  ├── BbsCgiParser          (bbs.cgiリクエスト解析)
  ├── BbsCgiResponseBuilder (bbs.cgiレスポンス生成)
  ├── PostService            (書き込み処理)
  ├── ThreadRepository       (スレッド一覧取得)
  └── PostRepository         (レス一覧取得)
```

## 4. エンドポイント一覧

| エンドポイント | メソッド | 機能 | Next.js ルート |
|---|---|---|---|
| `/bbsmenu.html` | GET | 板一覧メニュー | `app/(senbra)/bbsmenu.html/route.ts` |
| `/{boardId}/subject.txt` | GET | スレッド一覧 | `app/(senbra)/[boardId]/subject.txt/route.ts` |
| `/{boardId}/SETTING.TXT` | GET | 板設定 | `app/(senbra)/[boardId]/SETTING.TXT/route.ts` |
| `/{boardId}/dat/{key}.dat` | GET | スレッドデータ | `app/(senbra)/[boardId]/dat/[threadKey].dat/route.ts` |
| `/test/bbs.cgi` | POST | 書き込み/スレ立て | `app/(senbra)/test/bbs.cgi/route.ts` |

> `app/(senbra)/` はルートグループであり、URLパスに影響しない。`app/api/` に配置すると `/api/` プレフィックスが付き5chプロトコルと一致しないため、ルートグループを使用する。

## 5. サブコンポーネント詳細

### 5.1 ShiftJisEncoder

```typescript
interface ShiftJisEncoder {
  encode(utf8: string): Buffer;      // UTF-8 → Shift_JIS
  decode(sjis: Buffer): string;      // Shift_JIS → UTF-8
}
```

実装: `iconv-lite` の `encode('Shift_JIS')` / `decode('Shift_JIS')` をラップ。

### 5.2 DatFormatter

```typescript
interface DatFormatter {
  formatThread(posts: Post[], threadTitle: string): string;
  formatSinglePost(post: Post, isFirst: boolean, threadTitle: string): string;
}
```

**DATフォーマット仕様:**
```
名前<>メール<>日付とID<>本文<>スレッドタイトル
```

- 1行 = 1レス（改行は `<br>` に変換）
- 1行目のみ末尾にスレッドタイトル。2行目以降は空
- HTML特殊文字はエスケープ（`<` → `&lt;` 等）
- 日付フォーマット: `YYYY/MM/DD(曜日) HH:MM:SS.ff ID:xxxxxxxx`
- BOTマーク付きレス: 名前フィールドに `🤖` を付加（Shift_JIS変換時の注意が必要）
- システムメッセージ: 名前フィールドに `[システム]`、メール欄空、ID は `SYSTEM`

**BOTマーク・絵文字のShift_JIS対応:**
- `🤖` 等の絵文字は Shift_JIS に変換できないため、テキスト代替 `[BOT]` に置換
- DAT出力時のみ。Web UI では絵文字をそのまま表示

### 5.3 SubjectFormatter

```typescript
interface SubjectFormatter {
  format(threads: Thread[]): string;
}
```

**フォーマット:**
```
{threadKey}.dat<>{title} ({postCount})\n
```

- 1行1スレッド
- bump順（last_post_at DESC）
- レス数は実際の件数と必ず一致させる（不一致は専ブラのクラッシュ原因）

### 5.4 BbsCgiParser

```typescript
interface BbsCgiInput {
  bbs: string;           // 板ID
  key?: string;          // スレッドキー（新規作成時は undefined）
  from: string;          // FROM（名前）
  mail: string;          // メール欄
  message: string;       // 本文（UTF-8変換済み）
  subject?: string;      // スレッドタイトル（新規作成時のみ）
}

interface BbsCgiParser {
  parse(formData: Buffer): BbsCgiInput;
}
```

処理:
1. Shift_JIS でエンコードされた `application/x-www-form-urlencoded` をデコード
2. 各パラメータを抽出
3. `subject` の有無で新規作成/返信を判別

### 5.5 BbsCgiResponseBuilder

```typescript
interface BbsCgiResponseBuilder {
  success(): string;           // <title>書きこみました</title> ...
  error(reason: string): string;  // <title>ＥＲＲＯＲ</title> ...
  authRequired(message: string): string;  // 認証案内
}
```

専ブラは `<title>` タグの内容で成否を判定するため、正確な文字列が重要。

## 6. 差分同期の実装

### Range ヘッダ対応

```
GET /{boardId}/dat/{threadKey}.dat
Range: bytes=15024-
```

処理フロー:
1. `threads` テーブルから `dat_byte_size`（キャッシュ済みのShift_JISバイト数）を取得
2. Range の開始バイト位置と比較
3. 開始位置 >= dat_byte_size → 更新なし、304 を返す
4. 開始位置 < dat_byte_size → 差分レスを特定
   - `posts` テーブルから、累積バイトオフセットが Range 開始位置以降のレスをクエリ
   - DatFormatter で DAT テキストに変換
   - ShiftJisEncoder で Shift_JIS に変換
   - `206 Partial Content` で返す

### dat_byte_size の管理

- 書き込み時に、追加レスの Shift_JIS バイト数を計算して `threads.dat_byte_size` に加算
- `Last-Modified` ヘッダには `threads.last_post_at` を使用

### If-Modified-Since 対応

```
GET /{boardId}/dat/{threadKey}.dat
If-Modified-Since: Sat, 07 Mar 2026 12:00:00 GMT
```

- `threads.last_post_at` と比較
- 更新なし → `304 Not Modified`（ボディなし）

## 7. 認証連携

専ブラからの書き込み（bbs.cgi POST）時:
1. リクエストの Cookie から `edge-token` を抽出
2. AuthService.validateToken() で検証
3. 未認証/無効 → BbsCgiResponseBuilder で認証案内HTML を返す
4. 有効 → PostService.createPost() に委譲

## 8. インフラ制約への対応

| 制約 | 対応 |
|---|---|
| HTTPS リダイレクト時のPOST消失 | Vercel は標準で HTTPS。HTTPアクセスがあれば 307 リダイレクト |
| WAF による Monazilla UA ブロック | Vercel のデフォルト WAF は Monazilla を弾かない。将来 Cloudflare 導入時にホワイトリスト化 |
| ChMate の板ID導出ロジック | `[boardId]` 動的パラメータで任意の板IDを受け付ける |

## 9. テスト戦略

- `features/constraints/specialist_browser_compat.feature` の全シナリオを BDD テストでカバー
- エンコーディング変換の単体テスト（日本語、特殊文字、絵文字のShift_JIS変換）
- DAT フォーマットの単体テスト（フィールド区切り、改行変換、タイトル位置）
- Range 差分応答の統合テスト（バイトオフセット計算の正確性）
