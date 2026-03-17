# コードレビューレポート: Sprint-34〜37

**レビュー日**: 2026-03-17
**レビュー対象**: Sprint-34〜37 で変更・追加されたソースコード
**レビュアー**: bdd-code-reviewer (TASK-110)

---

## 指摘事項

### [HIGH-001] 管理API群にtry-catchが欠落しており、未処理例外で500クラッシュする

ファイル:
- `src/app/api/admin/dashboard/route.ts`
- `src/app/api/admin/dashboard/history/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/app/api/admin/users/[userId]/route.ts`
- `src/app/api/admin/users/[userId]/posts/route.ts`
- `src/app/api/admin/users/[userId]/ban/route.ts`
- `src/app/api/admin/users/[userId]/currency/route.ts`（req.json以外の部分）
- `src/app/api/admin/ip-bans/route.ts`（GET関数）

問題点: `src/app/api/threads/route.ts` や `src/app/api/threads/[threadId]/posts/route.ts` は外側に `try-catch` を設けて未処理例外を500レスポンスに変換しているが、管理API群の大半はそれが欠落している。リポジトリ層やサービス層が `throw new Error(...)` する設計のため、DB接続エラー等の想定外例外が発生すると Next.js のデフォルト500エラーが返り、内部スタックトレースがクライアントに漏洩する可能性がある。

修正案: 全管理APIルートハンドラの外側に try-catch を追加し、500レスポンスを明示的に返す。`src/app/api/threads/route.ts` の既存パターンに合わせればよい。

---

### [HIGH-002] 内部エラーメッセージがクライアントに漏洩する

ファイル:
- `src/app/api/threads/[threadId]/posts/route.ts:184-188`
- `src/app/api/threads/route.ts:70-74, 200-206`

問題点: catchブロックで `err.message` をそのままクライアントへ返している。`IP_BANNED: このIPアドレスからの新規登録はできません` のようなサービス層の内部エラーメッセージ、あるいはDB接続文字列を含むSupabaseエラーメッセージがクライアントに露出する可能性がある。

修正案: 500エラー時は固定文字列のみを返す。サービス層で定義された既知のエラー（IP_BANNED等）は PostResult の code で判別し、未知のエラーはログのみに留める。

---

### [HIGH-003] AdminService.getUserPostsがoffsetパラメータを無視する

ファイル: `src/app/api/admin/users/[userId]/posts/route.ts:56`, `src/lib/services/admin-service.ts:514`

問題点: APIルート側で `offset` をクエリパラメータから取得してサービスに渡しているが、`AdminService.getUserPosts` は受け取った `offset` を `PostRepository.findByAuthorId` に転送していない。さらに `PostRepository.findByAuthorId` 自体が `offset` パラメータを受け付けない。結果として、ページネーションが機能せず、常に先頭 N 件のみが返される。

修正案: `PostRepository.findByAuthorId` に `offset` パラメータ（Supabaseの `.range()` に対応）を追加し、`AdminService.getUserPosts` から伝播する。

---

### [HIGH-004] ip_bans テーブルの UNIQUE(ip_hash) 制約が同一IPの再BANを妨げる

ファイル: `supabase/migrations/00010_ban_system.sql:35`

問題点: `ip_bans_ip_hash_unique UNIQUE (ip_hash)` 制約が設定されている。しかし、BAN解除（`deactivate`）は `is_active = false` への論理更新であり、レコードは残る。同一IPを再度BANしようとすると UNIQUE 制約違反でエラーになる。

修正案: 以下のいずれかを選択する。
- A: UNIQUE制約を `UNIQUE (ip_hash) WHERE (is_active = true)` の部分一意インデックスに変更する
- B: 再BAN時は既存の `is_active = false` レコードを `is_active = true` に UPDATE する方式に変更する

---

### [MEDIUM-001] CurrencyRepository.sumAllBalances が全レコードをフェッチして集計している

ファイル: `src/lib/infrastructure/repositories/currency-repository.ts:214-229`

問題点: `.select("balance")` で全レコードをアプリケーション層に読み込み、JavaScript の `reduce` で合計している。ユーザー数が増加すると通信量・メモリ使用量が線形に増加する。

修正案: PostgreSQL RPC（`SELECT SUM(balance) FROM currencies`）を使用してDB側で集計する。

---

### [MEDIUM-002] PostRepository.countActiveThreadsByDate が全レコードをフェッチして集計している

ファイル: `src/lib/infrastructure/repositories/post-repository.ts:242-259`

問題点: MEDIUM-001 と同様。指定日の全 `thread_id` をアプリ層に読み込み、`Set` でユニーク化してカウントしている。

修正案: DB側で `COUNT(DISTINCT thread_id)` を実行するRPCを用意する。

---

### [MEDIUM-003] aggregate-daily-stats.ts の日付範囲クエリがUTC基準でJSTと不整合

ファイル: `scripts/aggregate-daily-stats.ts:98-99, 109-111, 119-125`

問題点: 日付範囲を UTC 基準で指定しているが、ユビキタス言語辞書の「日次リセットID」は JST 0:00 リセットが基準。UTC 基準の集計では JST 0:00〜8:59 の書き込みが前日として集計される。

修正案: JST基準のタイムゾーンオフセットを適用する。

---

### [MEDIUM-004] 管理APIルートの認証失敗ステータスコードが不統一（401と403が混在）

ファイル: 管理API群全般

問題点: Cookie未提供/セッション無効時のHTTPステータスが 401 と 403 で不統一。

修正案: 未認証は 401 で統一する。

---

### [MEDIUM-005] スレッド削除で全レスを個別にソフトデリートしている（N+1 UPDATE）

ファイル: `src/lib/services/admin-service.ts:185-186`

問題点: `Promise.all` で1件ずつ `softDelete` を呼んでいる。

修正案: バルク更新メソッド `softDeleteByThreadId(threadId)` を追加する。

---

### [LOW-001] ユビキタス言語辞書との用語不一致（「投稿」→「書き込み」）

ファイル: 複数のJSDocコメント

---

### [LOW-002] PostRepository.create で inlineSystemInfo カラムが INSERT されない

ファイル: `src/lib/infrastructure/repositories/post-repository.ts:184-206`

問題点: insert オブジェクトに `inline_system_info` が含まれていないため、コマンド結果やインセンティブ情報がDBに保存されない可能性がある。

修正案: `inline_system_info: post.inlineSystemInfo` を追加する。

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 4     | warn      |
| MEDIUM   | 5     | info      |
| LOW      | 2     | note      |

**判定: WARNING** — マージ前に4件のHIGHな問題の解決を推奨する。
