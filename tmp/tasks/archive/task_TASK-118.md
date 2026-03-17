---
task_id: TASK-118
sprint_id: Sprint-40
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T12:00:00+09:00
updated_at: 2026-03-17T12:00:00+09:00
locked_files:
  - src/lib/infrastructure/repositories/currency-repository.ts
  - src/lib/infrastructure/repositories/post-repository.ts
  - src/lib/infrastructure/repositories/thread-repository.ts
  - src/lib/services/admin-service.ts
  - src/lib/services/__tests__/admin-service.test.ts
  - src/__tests__/lib/services/admin-dashboard.test.ts
---

## タスク概要

Phase 5 コードレビュー（Sprint-38）で検出されたリポジトリ層の性能問題3件を修正する。
いずれもDB側で集計・バッチ処理すべき箇所をJS側で全行フェッチ+ループ処理しているパターン。

### 修正対象

1. **MEDIUM-001: sumAllBalances** — `currency-repository.ts`
   - 現状: 全ユーザーのbalanceを全行取得 → JS reduce で合計
   - 修正: Supabase の `.select('balance.sum()')` または RPC で DB側 SUM 集計

2. **MEDIUM-002: countActiveThreadsByDate** — `post-repository.ts`
   - 現状: 対象日の全postのthread_idを取得 → JS Set で重複除去 → size
   - 修正: DB側で COUNT DISTINCT thread_id（RPCまたは適切なクエリ）

3. **MEDIUM-005: スレッド削除 N+1** — `admin-service.ts` + `post-repository.ts`
   - 現状: `posts = findByThreadId(threadId)` → `Promise.all(posts.map(softDelete))` （N回UPDATE）
   - 修正: `post-repository.ts` に `softDeleteByThreadId(threadId)` バッチ関数を追加し、1回のUPDATEで完了

## 対象BDDシナリオ

- `features/admin.feature` @管理者がダッシュボードで統計情報を確認できる（MEDIUM-001/002 関連）
- `features/admin.feature` @管理者が指定したスレッドを削除する（MEDIUM-005 関連）
- ※ 振る舞いの変更なし。内部実装の最適化のみ

## 必読ドキュメント（優先度順）

1. [必須] `src/lib/infrastructure/repositories/currency-repository.ts` — sumAllBalances（L214-229）
2. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — countActiveThreadsByDate（L251-268）
3. [必須] `src/lib/services/admin-service.ts` — deleteThread（L168-194）
4. [参考] `src/__tests__/lib/services/admin-dashboard.test.ts` — ダッシュボードテスト
5. [参考] `src/lib/services/__tests__/admin-service.test.ts` — deleteThreadテスト

## 入力（前工程の成果物）

- なし

## 出力（生成すべきファイル）

- `src/lib/infrastructure/repositories/currency-repository.ts` — sumAllBalances をDB集計化
- `src/lib/infrastructure/repositories/post-repository.ts` — countActiveThreadsByDate をDB集計化 + softDeleteByThreadId 追加
- `src/lib/services/admin-service.ts` — deleteThread を softDeleteByThreadId 使用に変更
- 必要に応じてテストファイルの更新

## 完了条件

- [ ] sumAllBalances が DB側 SUM で集計されること
- [ ] countActiveThreadsByDate が DB側で集計されること（全行フェッチしないこと）
- [ ] deleteThread が1回のUPDATE文でスレッド内全レスを論理削除すること
- [ ] `npx vitest run` 全件PASS
- [ ] `npx cucumber-js` 219 passed（既存のpending 9件を除く）
- [ ] テストコマンド: `npx vitest run && npx cucumber-js`

## スコープ外

- admin API ルートハンドラ（route.ts）の変更
- OpenAPI 仕様の変更
- BDDシナリオの変更
- aggregate-daily-stats.ts のDB集計化（スクリプトは独立稼働するため別管理）

## 補足・制約

- Supabase JS クライアントでの集計方法の選択: `.select('balance.sum()')` パターンまたは RPC（Postgres関数）のいずれかを使用。既存パターンに合わせ、シンプルな方を選択すること
- softDeleteByThreadId は新規関数。既存の softDelete（単一レス用）は残すこと（他で使用されている）
- admin-service.ts の deleteThread は L185-186 の Promise.all パターンを softDeleteByThreadId の単一呼び出しに置換する
- バッチ削除時もスレッド内の全レスが論理削除されることを確認するテストが必要

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全3件の性能問題修正、テスト更新、全テストPASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] ファイル確認完了。既存テスト 1047件 PASS を確認
- [MEDIUM-001完了] currency-repository.ts: sumAllBalances を PostgREST 集計構文 `balance.sum()` に変更
- [MEDIUM-002完了] post-repository.ts: countActiveThreadsByDate を threads INNER JOIN クエリ + `{count: "exact", head: true}` に変更（全行フェッチ回避）
- [MEDIUM-005完了] post-repository.ts: softDeleteByThreadId 追加（バッチ論理削除）
- [MEDIUM-005完了] admin-service.ts: deleteThread を softDeleteByThreadId 使用に変更（N+1解消）
- [テスト更新] admin-service.test.ts: deleteThread テストを softDeleteByThreadId ベースに更新
- [テスト更新] admin-dashboard.test.ts: モックに softDeleteByThreadId を追加
- [BDD対応] features/support/in-memory/post-repository.ts: softDeleteByThreadId インメモリ実装を追加
- [確認] vitest 1047件 PASS、BDD 219 passed / 9 pending（変更前後同一）

### テスト結果サマリー
- vitest: 39 test files, 1047 tests — 全件PASS
- cucumber-js: 228 scenarios (219 passed, 9 pending) — 完了条件を満たす
- 失敗件数: 0件
