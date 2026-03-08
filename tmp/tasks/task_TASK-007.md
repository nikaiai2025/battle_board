---
task_id: TASK-007
sprint_id: Sprint-4
status: completed
assigned_to: bdd-coding
depends_on: [TASK-002]
created_at: 2026-03-08T22:00:00+09:00
updated_at: 2026-03-08T22:00:00+09:00
locked_files:
  - "[NEW] supabase/migrations/00004_create_rpc_functions.sql"
---

## タスク概要
Sprint-3（TASK-004）で判明した追加マイグレーション — リポジトリ層が前提とするPostgreSQL RPC関数を定義する。
currency-repository.ts と thread-repository.ts が呼び出す3つのRPC関数をマイグレーションSQLとして作成する。

## 対象BDDシナリオ
- なし（DB定義は基盤作業）

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/infrastructure/repositories/currency-repository.ts` — credit/deduct のRPC呼び出しコメントにDDL例あり
2. [必須] `src/lib/infrastructure/repositories/thread-repository.ts` — incrementPostCount のRPC呼び出しコメントにDDL例あり
3. [参考] `docs/architecture/architecture.md` — §7.2 同時実行制御

## 入力（前工程の成果物）
- `supabase/migrations/00001_create_tables.sql` — 既存テーブル定義（TASK-002）
- `src/lib/infrastructure/repositories/currency-repository.ts` — RPC関数の呼び出し仕様（TASK-004）
- `src/lib/infrastructure/repositories/thread-repository.ts` — RPC関数の呼び出し仕様（TASK-004）

## 出力（生成すべきファイル）
- `supabase/migrations/00004_create_rpc_functions.sql`

### 定義すべきRPC関数

1. **`increment_thread_post_count(p_thread_id UUID)`**
   - threads テーブルの post_count を +1 する
   - `UPDATE threads SET post_count = post_count + 1 WHERE id = p_thread_id`

2. **`credit_currency(p_user_id UUID, p_amount INTEGER)`**
   - currencies テーブルの balance に加算する
   - `UPDATE currencies SET balance = balance + p_amount, updated_at = now() WHERE user_id = p_user_id`

3. **`deduct_currency(p_user_id UUID, p_amount INTEGER)`**
   - 楽観ロック付きで残高を減算する
   - 戻り値: `TABLE(affected_rows INTEGER, new_balance INTEGER)`
   - 成功時: affected_rows = 1, new_balance = 減算後の残高
   - 失敗時（残高不足）: affected_rows = 0, new_balance = -1（またはNULL）
   - SQL:
     ```sql
     WITH updated AS (
       UPDATE currencies
       SET balance = balance - p_amount, updated_at = now()
       WHERE user_id = p_user_id AND balance >= p_amount
       RETURNING balance
     )
     SELECT
       COUNT(*)::INTEGER AS affected_rows,
       COALESCE((SELECT balance FROM updated), -1) AS new_balance
     FROM updated;
     ```

## 完了条件
- [ ] `supabase/migrations/00004_create_rpc_functions.sql` が作成されている
- [ ] 3つのRPC関数が `CREATE OR REPLACE FUNCTION` で定義されている
- [ ] deduct_currency が楽観ロック（WHERE balance >= p_amount）を含んでいる
- [ ] currency-repository.ts のRPC呼び出しと引数名が一致している（p_user_id, p_amount）
- [ ] thread-repository.ts のRPC呼び出しと引数名が一致している（p_thread_id）
- [ ] テストコマンド: `npx vitest run` で既存テストが壊れていないこと

## スコープ外
- `supabase db push` の実行
- 既存マイグレーションファイルの変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [2026-03-08] タスク指示書読み込み完了
- [2026-03-08] currency-repository.ts の RPC 呼び出し仕様確認: credit_currency(p_user_id, p_amount), deduct_currency(p_user_id, p_amount)
- [2026-03-08] thread-repository.ts の RPC 呼び出し仕様確認: increment_thread_post_count(p_thread_id)
- [2026-03-08] 既存マイグレーション確認: 00001, 00002, 00003 が存在、00004 は未作成
- [2026-03-08] アーキテクチャ設計書 §7.2 TDR-003 確認: 楽観的ロックの採用方針を確認
- [2026-03-08] supabase/migrations/00004_create_rpc_functions.sql 作成完了
  - increment_thread_post_count(p_thread_id UUID) RETURNS void
  - credit_currency(p_user_id UUID, p_amount INTEGER) RETURNS void
  - deduct_currency(p_user_id UUID, p_amount INTEGER) RETURNS TABLE(affected_rows INTEGER, new_balance INTEGER)
  - deduct_currency に楽観的ロック（WHERE balance >= p_amount）を実装
- [2026-03-08] npx vitest run 実行: 全テスト PASS

### テスト結果サマリー
- 実行コマンド: `npx vitest run`
- テストファイル: 4 passed (4)
- テストケース: 164 passed (164)
- 失敗: 0
- 対象ファイル: daily-id.test.ts, anchor-parser.test.ts, validation.test.ts, incentive-rules.test.ts
- 既存テストへの影響: なし（SQLファイルの追加のみのため）
