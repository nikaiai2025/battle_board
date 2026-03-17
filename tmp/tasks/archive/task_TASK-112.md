---
task_id: TASK-112
sprint_id: Sprint-39
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T16:40:00+09:00
updated_at: 2026-03-17T16:40:00+09:00
locked_files:
  - src/app/api/admin/dashboard/route.ts
  - src/app/api/admin/dashboard/history/route.ts
  - src/app/api/admin/users/route.ts
  - src/app/api/admin/users/[userId]/route.ts
  - src/app/api/admin/users/[userId]/posts/route.ts
  - src/app/api/admin/users/[userId]/ban/route.ts
  - src/app/api/admin/users/[userId]/currency/route.ts
  - src/app/api/admin/ip-bans/route.ts
  - src/app/api/admin/ip-bans/[banId]/route.ts
  - src/app/api/threads/route.ts
  - src/app/api/threads/[threadId]/posts/route.ts
  - src/lib/services/admin-service.ts
  - src/lib/services/handlers/grass-handler.ts
  - src/lib/infrastructure/repositories/post-repository.ts
  - src/lib/infrastructure/repositories/ip-ban-repository.ts
  - features/step_definitions/reactions.steps.ts
  - features/step_definitions/bot_system.steps.ts
  - "[NEW] supabase/migrations/00012_fix_ip_bans_unique.sql"
---

## タスク概要
Phase 5コードレビュー（TASK-110）で検出されたHIGH問題4件とLOW問題1件を修正する。
全て内部品質改善であり、BDDシナリオやAPI仕様の変更は伴わない。

## 修正項目

### HIGH-001: 管理API群にtry-catch追加
対象: 管理APIルート全8ファイル（dashboard, users, ip-bans系）
修正: 各ハンドラの外側にtry-catchを追加し、500レスポンスを明示的に返す。
パターン: `src/app/api/threads/route.ts` の既存実装に合わせる。

```typescript
try {
  // 既存ロジック
} catch (err) {
  console.error("[GET /api/admin/xxx] Unhandled error:", err);
  return NextResponse.json(
    { error: "INTERNAL_ERROR", message: "サーバー内部エラーが発生しました" },
    { status: 500 },
  );
}
```

### HIGH-002: err.messageのクライアント漏洩防止
対象: `src/app/api/threads/[threadId]/posts/route.ts`, `src/app/api/threads/route.ts`
修正: catchブロックで `err.message` を直接返すのをやめ、固定文字列「サーバー内部エラーが発生しました」のみを返す。
注意: サービス層の既知エラー（IP_BANNED等）は PostResult の code で判別済みのため、catch内では固定メッセージで問題ない。

### HIGH-003: getUserPostsのoffset修正
対象: `src/lib/services/admin-service.ts`, `src/lib/infrastructure/repositories/post-repository.ts`
修正:
1. `PostRepository.findByAuthorId` に `offset` パラメータを追加（Supabaseの `.range()` を使用）
2. `AdminService.getUserPosts` から `offset` をリポジトリに伝播

### HIGH-004: ip_bans UNIQUE制約の修正
対象: 新規マイグレーション `supabase/migrations/00012_fix_ip_bans_unique.sql`
修正: `UNIQUE(ip_hash)` を `UNIQUE(ip_hash) WHERE (is_active = true)` の部分一意インデックスに変更する。
注意: 既存の制約をDROPし、新しい部分一意インデックスを作成する。

### LOW-002: inline_system_info のINSERT追加
対象: `src/lib/infrastructure/repositories/post-repository.ts`
修正: `create` メソッドの insert オブジェクトに `inline_system_info: post.inlineSystemInfo` を追加。

### 追加: grass-handler.ts の new Date() 修正（TASK-114漏れ分）
対象: `src/lib/services/handlers/grass-handler.ts` L209
修正: `new Date().toISOString().split("T")[0]` → `new Date(Date.now()).toISOString().split("T")[0]`

### 追加: ワークアラウンドコメント更新
TASK-114でステップ定義のコードは `new Date(Date.now())` に修正済みだが、コメントが「GrassHandler が new Date() を使うため」等の古い記述のまま。
grass-handler.ts を修正した後、以下のコメントを更新する:
- `features/step_definitions/reactions.steps.ts` L966-968, L1008, L1047-1048, L1272-1273
- `features/step_definitions/bot_system.steps.ts` L2004-2006

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-code-reviewer_TASK-110/code_review_report.md` — レビュー指摘の詳細
2. [必須] `tmp/audit_report_20260317_date_mock_residual.md` — Dateモック残存箇所のアーキテクトレポート
3. [参考] `src/app/api/threads/route.ts` — try-catchの既存パターン

## 出力（生成すべきファイル）
- 上記locked_filesの修正
- `supabase/migrations/00012_fix_ip_bans_unique.sql` — 新規マイグレーション

## 完了条件
- [ ] `npx vitest run` 全テストPASS
- [ ] `npx cucumber-js` 全シナリオPASS（219 passed, 9 pending, 0 failed）
- [ ] 管理APIルート全ファイルにtry-catch追加済み
- [ ] threads APIのerr.message漏洩修正済み
- [ ] getUserPostsのoffsetがリポジトリまで伝播済み
- [ ] ip_bansの部分一意インデックス作成済み
- [ ] inline_system_infoがINSERTに含まれている
- [ ] grass-handler.ts の `new Date()` が `new Date(Date.now())` に修正済み
- [ ] reactions.steps.ts, bot_system.steps.ts のワークアラウンドコメント更新済み

## スコープ外
- ドキュメント更新（別タスク TASK-113 で対応）
- MEDIUM指摘（DB側集計、タイムゾーン、N+1 等）は本スプリントでは対応しない

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全修正項目（HIGH-001〜004, LOW-002, grass-handler修正, コメント更新）
- 未解決の問題: なし

### 進捗ログ
- HIGH-001: 管理API全8ファイルにtry-catch追加完了（dashboard, dashboard/history, users, users/[userId], users/[userId]/posts, users/[userId]/ban, users/[userId]/currency, ip-bans, ip-bans/[banId]）
- HIGH-002: threads/route.ts, threads/[threadId]/posts/route.ts の catch ブロックから err.message 参照を除去し固定メッセージに置換
- HIGH-003: PostRepository.findByAuthorId に offset パラメータ追加（Supabase .range() 使用）、AdminService.getUserPosts から offset を伝播
- HIGH-004: supabase/migrations/00012_fix_ip_bans_unique.sql を新規作成（UNIQUE(ip_hash) → 部分一意インデックス WHERE is_active=true）
- LOW-002: PostRepository.create の insert オブジェクトに inline_system_info: post.inlineSystemInfo を追加
- grass-handler.ts L209: new Date() → new Date(Date.now()) に修正
- reactions.steps.ts: L966-968, L1008, L1047-1048, L1272-1273 のワークアラウンドコメントを更新
- bot_system.steps.ts: L2004-2006 のワークアラウンドコメントを更新

### テスト結果サマリー
- **vitest**: 39 test files, 1047 tests passed, 0 failed
- **cucumber-js**: 228 scenarios (219 passed, 9 pending, 0 failed), 1226 steps (1197 passed, 9 pending, 20 skipped, 0 failed)
