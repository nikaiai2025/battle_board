# 再レビューレポート: Sprint-39 (TASK-112 + TASK-114)

**レビュー日**: 2026-03-17
**レビュー対象**: TASK-112（HIGH修正4件 + LOW修正2件）、TASK-114（Date修正統一）
**前回レビュー**: `tmp/workers/bdd-code-reviewer_TASK-110/code_review_report.md`
**監査レポート**: `tmp/audit_report_20260317_date_mock_residual.md`
**レビュアー**: bdd-code-reviewer (TASK-116)

---

## 1. 前回指摘事項の修正確認

### [HIGH-001] 管理API群のtry-catch欠落 -- **修正済み (PASS)**

以下の全管理APIルートハンドラに try-catch が追加され、500レスポンスが明示的に返されることを確認した。

- `src/app/api/admin/dashboard/route.ts` -- GET
- `src/app/api/admin/dashboard/history/route.ts` -- GET
- `src/app/api/admin/users/route.ts` -- GET
- `src/app/api/admin/users/[userId]/route.ts` -- GET
- `src/app/api/admin/users/[userId]/posts/route.ts` -- GET
- `src/app/api/admin/users/[userId]/ban/route.ts` -- POST, DELETE
- `src/app/api/admin/users/[userId]/currency/route.ts` -- POST
- `src/app/api/admin/ip-bans/route.ts` -- POST, GET
- `src/app/api/admin/ip-bans/[banId]/route.ts` -- DELETE

全てのcatchブロックで以下の統一パターンを採用している:
- `console.error` でエンドポイント名付きのサーバーサイドログ出力
- 固定メッセージ `{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" }` を返却
- コメントで `// HIGH-001` のトレーサビリティ記録

修正パターンは一貫しており、問題なし。

---

### [HIGH-002] err.messageのクライアント漏洩 -- **修正済み (PASS)**

- `src/app/api/threads/route.ts` (GET:L66-74, POST:L196-204)
- `src/app/api/threads/[threadId]/posts/route.ts` (POST:L180-188)

全ての catchブロックで `err.message` をクライアントに渡す処理が削除され、固定文字列のみ返却されている。コメントで `// HIGH-002` が記録されている。

---

### [HIGH-003] AdminService.getUserPostsのoffset無視 -- **修正済み (PASS)**

- `src/lib/services/admin-service.ts:514-518` -- `offset` を `PostRepository.findByAuthorId` に伝播するよう修正済み
- `src/lib/infrastructure/repositories/post-repository.ts:132-151` -- `findByAuthorId` が `options: { limit?: number; offset?: number }` を受け取り、`.range(offset, offset + limit - 1)` で Supabase のページネーションを使用

ページネーションが正しく機能するようになった。

---

### [HIGH-004] ip_bans UNIQUE制約が再BANを妨げる -- **修正済み (PASS)**

- `supabase/migrations/00012_fix_ip_bans_unique.sql` -- 既存の `UNIQUE(ip_hash)` 制約を `DROP` し、`WHERE (is_active = true)` 付きの部分一意インデックスを作成

前回レビューで提示した修正案Aがそのまま採用されている。非アクティブなBAN解除レコードは重複を許容し、アクティブなBAN同士のみ一意性を保証する。

---

### [LOW-002] PostRepository.createでinlineSystemInfoが未保存 -- **修正済み (PASS)**

- `src/lib/infrastructure/repositories/post-repository.ts:204` -- `.insert()` オブジェクトに `inline_system_info: post.inlineSystemInfo` が追加されている

---

### [LOW-001] ユビキタス言語辞書との用語不一致 -- **未確認（レビュー対象外）**

TASK-112/TASK-114 のスコープには含まれていない。コメント内の用語修正は今回のタスクの対象外。

---

## 2. Date修正（TASK-114）の確認

### 高リスク6件の修正状況

| # | ファイル | 状態 | 確認結果 |
|---|---|---|---|
| 1 | `src/lib/services/post-service.ts:483` | **修正済み** | `new Date(Date.now())` に統一 |
| 2 | `src/lib/services/post-service.ts:633` | **修正済み** | `new Date(Date.now())` に統一 |
| 3 | `src/lib/services/bot-service.ts:620` (getTodayJst) | **修正済み** | `new Date(Date.now())` に統一 |
| 4 | `src/lib/services/handlers/grass-handler.ts:209` | **修正済み** | `new Date(Date.now())` に統一 |
| 5 | `src/lib/services/admin-service.ts:590/564` | **修正済み** | 両箇所とも `new Date(Date.now())` に統一 |
| 6 | `features/support/in-memory/auth-code-repository.ts` | **修正済み** | L48, L92 の両箇所で `new Date(Date.now())` |

### 中リスク（インメモリリポジトリ）18件の修正状況

全12ファイルの `new Date(Date.now())` への統一を確認した。元の `new Date()` は残存しておらず、全て修正済み。

### ワークアラウンドの更新状況

- `features/step_definitions/reactions.steps.ts` -- L966-970, L1008-1010 のコメントとコードが `new Date(Date.now())` に更新済み
- `features/step_definitions/bot_system.steps.ts` -- L2004-2016 のワークアラウンドコメントは残存しているが、`getTodayJst()` の修正により実害はない。コメントの文面が「まだ未修正のため」と記述されており、実態（修正済み）と乖離している
- `features/step_definitions/incentive.steps.ts` -- L77-83 のコメントが「post-service.ts が new Date() を使用している」と旧状態を記述しているが、L88-92 の実装自体は `new Date(Date.now())` に正しく更新済み

---

## 3. 新たに検出した問題

### [LOW-003] ワークアラウンドコメントが修正後の実態と乖離している

ファイル:
- `features/step_definitions/bot_system.steps.ts:2004-2012`
- `features/step_definitions/incentive.steps.ts:77-83`

問題点: bot-service.ts の `getTodayJst()` および post-service.ts の `new Date()` は既に `new Date(Date.now())` に修正済みだが、ステップ定義内のコメントが「まだ未修正のため」「post-service.ts が new Date() を使用しているため」と旧状態を説明している。コードの正当性には影響しないが、将来のメンテナンスで混乱を招く。

修正案: コメントを実態に合わせて更新する。例: 「bot-service.ts の getTodayJst() は new Date(Date.now()) に修正済み」

---

### [MEDIUM-006] 管理APIの認証ステータスコード不統一が未解決

ファイル:
- `src/app/api/admin/dashboard/route.ts:36,41` -- 401
- `src/app/api/admin/users/route.ts:34,39` -- 401
- `src/app/api/admin/users/[userId]/route.ts:32,37` -- 401
- `src/app/api/admin/users/[userId]/posts/route.ts:36,41` -- 401
- `src/app/api/admin/users/[userId]/ban/route.ts:49,56` -- 403
- `src/app/api/admin/users/[userId]/currency/route.ts:50,57` -- 403
- `src/app/api/admin/ip-bans/route.ts:52,59` -- 403
- `src/app/api/admin/ip-bans/[banId]/route.ts:45,52` -- 403

問題点: 前回 MEDIUM-004 で指摘した認証失敗ステータスコード不統一が未解消。Sprint-36 で実装されたルート（ban, currency, ip-bans）は 403、Sprint-37 で実装されたルート（dashboard, users, users/[userId], users/[userId]/posts）は 401 を返す。同一の認証失敗条件に対して異なるステータスコードを返している。

備考: 今回のタスクスコープ（HIGH 4件 + LOW 2件の修正確認）の範囲外であるため、情報として再記載する。

---

### [MEDIUM-007] auth-service.ts の有効期限チェックで `new Date()` が残存

ファイル:
- `src/lib/services/auth-service.ts:325` -- `if (authCode.expiresAt < new Date())`
- `src/lib/services/auth-service.ts:406` -- `if (authCode.writeTokenExpiresAt < new Date())`

問題点: 認証コードの有効期限チェックで `new Date()` が使われている。BDDテストで `Date.now` をスタブ化しても、これらの比較は実時刻で行われる。現時点では認証コードの有効期限が十分に長い（テスト実行時間内に切れない）ため顕在化していないが、Date修正の一貫性の観点では `new Date(Date.now())` に統一すべきである。

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 0     | pass      |
| MEDIUM   | 2     | info      |
| LOW      | 1     | note      |

**判定: APPROVE** -- 前回指摘のHIGH 4件 + LOW 1件は全て適切に修正されている。Date修正（TASK-114）も高リスク6件・中リスク18件が全て統一済み。新たなCRITICAL/HIGH問題は検出されなかった。

### 前回指摘の修正ステータス

| 前回ID | 重要度 | 概要 | 修正状態 |
|---|---|---|---|
| HIGH-001 | HIGH | 管理API群のtry-catch欠落 | **修正済み** |
| HIGH-002 | HIGH | err.messageのクライアント漏洩 | **修正済み** |
| HIGH-003 | HIGH | getUserPostsのoffset無視 | **修正済み** |
| HIGH-004 | HIGH | ip_bans UNIQUE制約が再BANを妨げる | **修正済み** |
| LOW-002 | LOW | inlineSystemInfoの未保存 | **修正済み** |
| Date高リスク6件 | HIGH (監査) | new Date() のモック不整合 | **全件修正済み** |
| Date中リスク18件 | MEDIUM (監査) | インメモリリポジトリのnew Date() | **全件修正済み** |

### 残存する既知の問題（前回からの繰越、今回スコープ外）

| ID | 重要度 | 概要 |
|---|---|---|
| MEDIUM-001 | MEDIUM | CurrencyRepository.sumAllBalances の全レコードフェッチ |
| MEDIUM-002 | MEDIUM | PostRepository.countActiveThreadsByDate の全レコードフェッチ |
| MEDIUM-003 | MEDIUM | aggregate-daily-stats.ts のタイムゾーン境界値問題 |
| MEDIUM-004 | MEDIUM | 管理APIの認証ステータスコード不統一（MEDIUM-006 として再記載） |
| MEDIUM-005 | MEDIUM | スレッド削除のN+1 UPDATE |
| LOW-001 | LOW | ユビキタス言語辞書との用語不一致 |
