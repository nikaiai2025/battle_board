# TASK-115 検証レポート: Sprint-39 コード修正の整合性検証

- **日付:** 2026-03-17
- **タスク:** TASK-115 (BDDゲート再検証)
- **対象:** TASK-112 + TASK-114 の修正内容
- **判定:** PASS (条件付き)

---

## 1. テスト全件実行

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| 単体テスト (Vitest) | PASS | 1047/1047 | 2.77s |
| BDD (Cucumber.js) | PASS | 219/219 (+9 pending) | 1.28s |

- Vitest: 39テストファイル、全1047テストPASS
- Cucumber.js: 228シナリオ中219 passed, 9 pending（UI表示系の未実装ステップ。既知のpendingであり今回のスコープ外）
- FAILテスト: 0件

---

## 2. HIGH修正の整合性確認

### HIGH-001: 管理API try-catch -- PASS

タスク指示書に記載の9ファイル全てに `try { ... }` が存在することを確認:

| # | ファイル | try-catch |
|---|---|---|
| 1 | `src/app/api/admin/dashboard/route.ts` | あり |
| 2 | `src/app/api/admin/dashboard/history/route.ts` | あり |
| 3 | `src/app/api/admin/users/route.ts` | あり |
| 4 | `src/app/api/admin/users/[userId]/route.ts` | あり |
| 5 | `src/app/api/admin/users/[userId]/posts/route.ts` | あり |
| 6 | `src/app/api/admin/users/[userId]/ban/route.ts` | あり |
| 7 | `src/app/api/admin/users/[userId]/currency/route.ts` | あり |
| 8 | `src/app/api/admin/ip-bans/route.ts` | あり |
| 9 | `src/app/api/admin/ip-bans/[banId]/route.ts` | あり |

追加確認: `src/app/api/admin/login/route.ts` にもtry-catchあり（指示書対象外だがカバー済み）。

### HIGH-002: err.message漏洩防止 -- PASS

以下3つのcatchブロック全てで、クライアントレスポンスに固定メッセージのみ返している:

- `src/app/api/threads/route.ts` L65-75 (GET): `{ error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" }`
- `src/app/api/threads/route.ts` L195-205 (POST): 同上
- `src/app/api/threads/[threadId]/posts/route.ts` L179-189 (POST): 同上

`err.message` はコメント中にのみ存在し、レスポンスボディには含まれていない。`console.error` でサーバーログにのみ出力。

### HIGH-003: getUserPosts offset伝播 -- PASS

- `src/lib/services/admin-service.ts` L510-518: `getUserPosts` が `options.offset` を受け取り、`PostRepository.findByAuthorId` に伝播
- `src/lib/infrastructure/repositories/post-repository.ts` L132-151: `findByAuthorId` が `offset` パラメータを受け取り、`.range(offset, offset + limit - 1)` でSupabaseクエリに反映

### HIGH-004: ip_bans UNIQUE制約 -- PASS

- `supabase/migrations/00012_fix_ip_bans_unique.sql` が存在
- 既存の `UNIQUE(ip_hash)` 制約を `DROP CONSTRAINT IF EXISTS` で削除
- `CREATE UNIQUE INDEX ip_bans_ip_hash_active_unique ON ip_bans (ip_hash) WHERE (is_active = true)` で部分一意インデックスを作成

### LOW-002: inline_system_info -- PASS

- `src/lib/infrastructure/repositories/post-repository.ts` の `create` メソッド（L201-204）で INSERT オブジェクトに `inline_system_info: post.inlineSystemInfo` を含んでいる

---

## 3. Dateモック統一の確認

### 3.1 features/ 配下 -- PASS

`features/` 配下の `.ts` ファイルに `new Date()` 単独使用（引数なし）は残存していない。
検出された5件は全てコメント内であり、コードとしての使用ではない。

### 3.2 src/lib/services/ 配下 -- FAIL (2箇所残存)

以下の非テストファイルに `new Date()` 単独使用が残存:

| # | ファイル | 行 | コード | 備考 |
|---|---|---|---|---|
| 1 | `src/lib/services/auth-service.ts` | 325 | `authCode.expiresAt < new Date()` | 認証コードの有効期限判定 |
| 2 | `src/lib/services/auth-service.ts` | 406 | `authCode.writeTokenExpiresAt < new Date()` | write_tokenの有効期限判定 |

**リスク評価:** 中。auth-service.ts の有効期限判定はBDDテストで時刻モック下で実行されるため、テストの信頼性に影響しうる。ただし現時点のBDDシナリオでは有効期限判定のシナリオが時計凍結パターンで書かれているため、即座にテスト失敗にはつながらない。

注: `src/lib/services/__tests__/` 配下の Vitest テストファイル内の `new Date()` は、vi.mock/vi.useFakeTimers で別途制御されるため問題なし。

### 3.3 src/lib/infrastructure/repositories/ 配下 -- FAIL (1箇所残存)

| # | ファイル | 行 | コード | 備考 |
|---|---|---|---|---|
| 1 | `src/lib/infrastructure/repositories/auth-code-repository.ts` | 232 | `.lt('expires_at', new Date().toISOString())` | 期限切れ認証コードのクリーンアップクエリ |

**リスク評価:** 低。クリーンアップは運用目的であり、BDDシナリオで直接テストされない。

### 3.4 grass-handler.ts の修正確認 -- PASS

`src/lib/services/handlers/grass-handler.ts` L209: `new Date(Date.now()).toISOString().split("T")[0]` を使用。修正済み。

---

## 4. アーキテクトレポート (audit_report_20260317_date_mock_residual.md) との整合性

| # | 対象 | 報告時の問題コード | 現在の状態 | 判定 |
|---|---|---|---|---|
| 1 | `post-service.ts` L483 | `new Date()` | `new Date(Date.now())` に修正済み | PASS |
| 2 | `post-service.ts` L633 | `new Date()` | `new Date(Date.now())` に修正済み | PASS |
| 3 | `bot-service.ts` L620 getTodayJst | `new Date()` | `new Date(Date.now())` に修正済み | PASS |
| 4 | `grass-handler.ts` L209 | `new Date()` | `new Date(Date.now())` に修正済み | PASS |
| 5 | `admin-service.ts` L590 | `new Date()` | `new Date(Date.now())` に修正済み (L595) | PASS |
| 6 | `features/support/in-memory/auth-code-repository.ts` L92 | `new Date()` | `new Date()` の残存なし（修正済み） | PASS |

**高リスク6件は全て修正済み。**

---

## 5. 総合判定

| 検証項目 | 結果 |
|---|---|
| テスト全件PASS | PASS (1047 vitest + 219 BDD, 0 fail) |
| HIGH修正4件 + LOW修正1件の整合性確認 | PASS |
| Dateモック残存チェック | WARN (監査レポート高リスク6件は修正済み。中リスク: auth-service.ts 2箇所 + auth-code-repository.ts 1箇所が残存) |
| アーキテクトレポート整合性確認 | PASS |
| 検証レポート作成 | 本ファイル |

### 最終判定: PASS (条件付き)

Sprint-39の修正対象（HIGH-001〜HIGH-004, LOW-002, 高リスクDate 6件）は全て正しく修正されている。テストは全件PASS。

残存する `new Date()` 3箇所（auth-service.ts 2箇所、auth-code-repository.ts 1箇所）は監査レポートの高リスク6件には含まれておらず、現時点でテスト失敗を引き起こさないが、中期的な改善対象として記録する。

---

## 付録: 残存 new Date() 一覧（非テストコード、将来修正推奨）

| ファイル | 行 | リスク |
|---|---|---|
| `src/lib/services/auth-service.ts` | 325 | 中 |
| `src/lib/services/auth-service.ts` | 406 | 中 |
| `src/lib/infrastructure/repositories/auth-code-repository.ts` | 232 | 低 |
