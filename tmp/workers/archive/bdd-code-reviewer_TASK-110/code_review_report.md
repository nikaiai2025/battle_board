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

```typescript
// 適切な例（threads/route.ts で既に実装済み）
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ... 既存ロジック
  } catch (err) {
    console.error("[GET /api/admin/dashboard] Unhandled error:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" },
      { status: 500 },
    );
  }
}
```

---

### [HIGH-002] 内部エラーメッセージがクライアントに漏洩する

ファイル:
- `src/app/api/threads/[threadId]/posts/route.ts:184-188`
- `src/app/api/threads/route.ts:70-74, 200-206`

問題点: catchブロックで `err.message` をそのままクライアントへ返している。`IP_BANNED: このIPアドレスからの新規登録はできません` のようなサービス層の内部エラーメッセージ、あるいはDB接続文字列を含むSupabaseエラーメッセージがクライアントに露出する可能性がある。

```typescript
// 不適切: err.message を直接クライアントに送信
message: err instanceof Error ? err.message : "サーバー内部エラーが発生しました",
```

修正案: 500エラー時は固定文字列のみを返す。サービス層で定義された既知のエラー（IP_BANNED等）は PostResult の code で判別し、未知のエラーはログのみに留める。

```typescript
// 適切: 固定メッセージを返す
message: "サーバー内部エラーが発生しました",
```

---

### [HIGH-003] AdminService.getUserPostsがoffsetパラメータを無視する

ファイル: `src/app/api/admin/users/[userId]/posts/route.ts:56`, `src/lib/services/admin-service.ts:514`

問題点: APIルート側で `offset` をクエリパラメータから取得してサービスに渡しているが、`AdminService.getUserPosts` は受け取った `offset` を `PostRepository.findByAuthorId` に転送していない。さらに `PostRepository.findByAuthorId` 自体が `offset` パラメータを受け付けない。結果として、ページネーションが機能せず、常に先頭 N 件のみが返される。

```typescript
// admin-service.ts:514 — offset が無視されている
return PostRepository.findByAuthorId(userId, { limit: options.limit });
// options.offset は使われていない
```

修正案: `PostRepository.findByAuthorId` に `offset` パラメータ（Supabaseの `.range()` に対応）を追加し、`AdminService.getUserPosts` から伝播する。

---

### [HIGH-004] ip_bans テーブルの UNIQUE(ip_hash) 制約が同一IPの再BANを妨げる

ファイル: `supabase/migrations/00010_ban_system.sql:35`

問題点: `ip_bans_ip_hash_unique UNIQUE (ip_hash)` 制約が設定されている。しかし、BAN解除（`deactivate`）は `is_active = false` への論理更新であり、レコードは残る。同一IPを再度BANしようとすると UNIQUE 制約違反でエラーになる。

```sql
-- この制約により、deactivate後の再BANが不可能
CONSTRAINT ip_bans_ip_hash_unique UNIQUE (ip_hash)
```

修正案: 以下のいずれかを選択する。
- A: UNIQUE制約を `UNIQUE (ip_hash) WHERE (is_active = true)` の部分一意インデックスに変更する
- B: 再BAN時は既存の `is_active = false` レコードを `is_active = true` に UPDATE する方式に変更する

---

### [MEDIUM-001] CurrencyRepository.sumAllBalances が全レコードをフェッチして集計している

ファイル: `src/lib/infrastructure/repositories/currency-repository.ts:214-229`

問題点: `.select("balance")` で全レコードをアプリケーション層に読み込み、JavaScript の `reduce` で合計している。ユーザー数が増加すると通信量・メモリ使用量が線形に増加する。ダッシュボードの表示のたびに実行されるため、パフォーマンスへの影響が懸念される。

```typescript
// 不適切: 全レコードをフェッチしてJSで集計
const { data, error } = await supabaseAdmin.from("currencies").select("balance");
return data.reduce((sum, r) => sum + (r.balance ?? 0), 0);
```

修正案: PostgreSQL RPC（`SELECT SUM(balance) FROM currencies`）を使用してDB側で集計する。または Supabase の `.rpc()` で集計関数を呼び出す。

---

### [MEDIUM-002] PostRepository.countActiveThreadsByDate が全レコードをフェッチして集計している

ファイル: `src/lib/infrastructure/repositories/post-repository.ts:242-259`

問題点: MEDIUM-001 と同様の問題。指定日の全 `thread_id` をアプリ層に読み込み、`Set` でユニーク化してカウントしている。書き込み数が多い日は大量のデータ転送が発生する。

修正案: `SELECT COUNT(DISTINCT thread_id) FROM posts WHERE ...` に相当するRPCをDB側に用意する。

---

### [MEDIUM-003] aggregate-daily-stats.ts の日付範囲クエリがタイムゾーンの境界値問題を含む

ファイル: `scripts/aggregate-daily-stats.ts:98-99, 109-111, 119-125`

問題点: 日付範囲を `${date}T00:00:00Z` ~ `${date}T23:59:59.999Z` で指定しているが、これは UTC 基準である。ユビキタス言語辞書の「日次リセットID」の定義では JST 0:00 リセットが基準。UTC 基準の集計では JST 0:00〜8:59 の書き込みが前日として集計される。

修正案: JST基準で集計する場合は `${date}T15:00:00.000Z`（前日UTC15:00 = JST翌日0:00）〜 `${nextDate}T14:59:59.999Z` とするか、DB側でタイムゾーン変換を行う。

---

### [MEDIUM-004] 管理APIルートの認証失敗ステータスコードが不統一

ファイル:
- `src/app/api/admin/dashboard/route.ts:35,40` — 401
- `src/app/api/admin/ip-bans/route.ts:50,58` — 403
- `src/app/api/admin/users/[userId]/ban/route.ts:47,55` — 403
- `src/app/api/admin/users/route.ts:33,38` — 401

問題点: Cookie未提供/セッション無効時のHTTPステータスが、あるルートでは 401、別のルートでは 403 と不統一。同一の認証失敗条件に対して異なるステータスコードを返すのはAPIの一貫性を損なう。

修正案: 認証失敗（未認証）は 401 Unauthorized で統一し、認証済みだが権限不足の場合のみ 403 Forbidden とする。現在は管理者以外が管理APIにアクセスするケースは想定されていないため、全て 401 に統一するのが適切。

---

### [MEDIUM-005] スレッド削除で全レスを個別にソフトデリートしている（N+1 UPDATE）

ファイル: `src/lib/services/admin-service.ts:185-186`

問題点: スレッド内の全レスを取得し、`Promise.all` で1件ずつ `softDelete` を呼んでいる。レスが多いスレッドではN+1問題が発生する。

```typescript
const posts = await PostRepository.findByThreadId(threadId);
await Promise.all(posts.map((post) => PostRepository.softDelete(post.id)));
```

修正案: `PostRepository` にバルク更新メソッド `softDeleteByThreadId(threadId)` を追加する。単一の `UPDATE posts SET is_deleted = true WHERE thread_id = :threadId` で済む。

---

### [LOW-001] ユビキタス言語辞書との用語不一致

ファイル: 複数

問題点: ユビキタス言語辞書（D-02）で「投稿」は forbidden_alias（「書き込み」で統一）と定義されているが、以下で「投稿」が使われている。
- `src/app/api/threads/[threadId]/posts/route.ts:1` — `書き込み（レス投稿）`
- `PostForm.tsx` — コメント中に「レスを投稿する」

軽微な指摘であり、JSDocコメント内のみの問題。

---

### [LOW-002] PostRepository.create で inlineSystemInfo カラムが INSERT されない

ファイル: `src/lib/infrastructure/repositories/post-repository.ts:184-206`

問題点: `PostRepository.create` の insert オブジェクトに `inline_system_info` が含まれていない。`PostService.createPost` は `inlineSystemInfo` をセットしてレス作成しているが、リポジトリ層でこのフィールドが DB に書き込まれない。DB のデフォルト値（NULL）が使われるため、コマンド結果やインセンティブ情報がレスに反映されない可能性がある。

```typescript
// post-repository.ts — inline_system_info が INSERT に含まれていない
.insert({
  thread_id: post.threadId,
  post_number: post.postNumber,
  author_id: post.authorId,
  display_name: post.displayName,
  daily_id: post.dailyId,
  body: post.body,
  is_system_message: post.isSystemMessage,
  // inline_system_info が欠落
})
```

修正案: insert オブジェクトに `inline_system_info: post.inlineSystemInfo` を追加する。

**備考**: この問題は既存のBDDテストで検出されていない場合、インセンティブやコマンド結果の表示に影響する重要度の高い不具合である可能性がある。実際のBDDテスト結果を確認することを推奨する。

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 4     | warn      |
| MEDIUM   | 5     | info      |
| LOW      | 2     | note      |

**判定: WARNING** — マージ前に4件のHIGHな問題の解決を推奨する。

### HIGH の概要

| ID | 概要 | 影響 |
|---|---|---|
| HIGH-001 | 管理API群のtry-catch欠落 | 内部エラーがクライアントに漏洩。サーバーの500エラーが不親切 |
| HIGH-002 | err.messageのクライアント漏洩 | DB接続情報等の機密情報がエラーレスポンスに含まれうる |
| HIGH-003 | getUserPostsのoffset無視 | 書き込み履歴のページネーションが機能しない |
| HIGH-004 | ip_bansのUNIQUE制約が再BANを妨げる | 一度BAN解除したIPを再BANできない |

### 総評

Sprint-34〜37 で追加された管理機能（BAN、通貨付与、ダッシュボード、ユーザー管理）は、全体としてアーキテクチャ設計（レイヤー分離・リポジトリパターン）に準拠しており、BDDシナリオとの対応関係も丁寧にコメントで記録されている。セキュリティ面では、IPハッシュの非表示、RLS DENY ALL の適用、管理者セッション検証の一貫した実施など、適切な配慮がなされている。

主な懸念は、管理APIルートのエラーハンドリングの不足（HIGH-001, HIGH-002）と、データ整合性に影響する設計上の問題（HIGH-003, HIGH-004）である。また、LOW-002 の `inline_system_info` 未保存は、コマンドシステムやインセンティブの表示に影響する潜在的な不具合として注視すべきである。
