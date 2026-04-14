---
task_id: TASK-382
sprint_id: Sprint-152
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-04-15
updated_at: 2026-04-15
locked_files:
  - "[NEW] supabase/migrations/00043_fix_bulk_update_daily_ids_cast.sql"
---

## タスク概要

Daily Maintenance ワークフロー（`POST /api/internal/daily-reset`）が17日連続 HTTP 500 となっている障害を修正する。
根本原因は RPC 関数 `bulk_update_daily_ids` が `p_daily_id_date text` を `bots.daily_id_date (DATE)` 列にキャストなしで代入し、PostgreSQL の暗黙キャスト禁止により型エラーを throw することである。
新規マイグレーション `00043_fix_bulk_update_daily_ids_cast.sql` で RPC を `CREATE OR REPLACE` し、`p_daily_id_date::date` による明示キャストを追加する。

## 対象BDDシナリオ

該当なし（本修正は DB 層のバグ修正で、BDD シナリオの振る舞い変更は伴わない）。

## 必読ドキュメント（優先度順）

1. [必須] `tmp/reports/daily_maintenance_500_investigation.md` — 調査レポート（根本原因・修正方針・エラーログ）
2. [必須] `supabase/migrations/00037_fix_function_search_path.sql` L120-137 — 現在の `bulk_update_daily_ids` 定義（バグあり）
3. [必須] `supabase/migrations/00035_bulk_daily_reset_functions.sql` — RPC の初出定義
4. [必須] `supabase/migrations/00001_create_tables.sql` L105 — `bots.daily_id_date DATE NOT NULL` 定義
5. [参考] `src/lib/infrastructure/repositories/bot-repository.ts` L366-389 — 呼び出し元 `bulkUpdateDailyIds()`（修正不要）
6. [参考] `src/lib/services/bot-service.ts` L957- — `performDailyReset()`（修正不要）

## 入力（前工程の成果物）

- `tmp/reports/daily_maintenance_500_investigation.md` — 調査レポート §4.1 を採用

## 出力（生成すべきファイル）

- `supabase/migrations/00043_fix_bulk_update_daily_ids_cast.sql` — RPC 関数 `bulk_update_daily_ids` を `CREATE OR REPLACE` で再定義

### SQL 実装内容

```sql
-- =============================================================================
-- 00043_fix_bulk_update_daily_ids_cast.sql
-- bulk_update_daily_ids RPC の text → date 暗黙キャストエラー修正
--
-- 症状: Daily Maintenance ワークフロー（POST /api/internal/daily-reset）が
--       17日連続 HTTP 500（2026-03-27 〜 2026-04-14）
-- 根本原因: p_daily_id_date (text) を bots.daily_id_date (DATE) 列にキャスト
--           なしで代入し、PostgreSQL の暗黙キャスト禁止により型エラー
-- 修正: daily_id_date = p_daily_id_date::date で明示キャスト
--
-- See: tmp/reports/daily_maintenance_500_investigation.md §4.1
-- =============================================================================

CREATE OR REPLACE FUNCTION bulk_update_daily_ids(
  p_bot_ids uuid[],
  p_daily_ids text[],
  p_daily_id_date text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE bots AS b
  SET daily_id = v.daily_id,
      daily_id_date = p_daily_id_date::date  -- 明示キャスト（text → date）
  FROM unnest(p_bot_ids, p_daily_ids) AS v(id, daily_id)
  WHERE b.id = v.id;
END;
$$;
```

## 完了条件

- [ ] `supabase/migrations/00043_fix_bulk_update_daily_ids_cast.sql` を作成（上記 SQL 通り）
- [ ] 既存単体テスト全件 PASS（`npx vitest run`）
- [ ] 既存BDDテスト全件 PASS（`npx cucumber-js`）
- [ ] ローカル Supabase へ migration 適用成功を確認（`npx supabase db reset` または `npx supabase migration up`）
  - **注:** ローカル適用は Docker / Supabase が起動している場合のみ。起動していない場合はスキップし、作業ログに記載

## スコープ外

- 呼び出し元 `src/lib/infrastructure/repositories/bot-repository.ts` の変更（修正不要）
- 過去17日分の daily-stats 欠損の遡及集計（人間判断で不要と確定）
- 過去17日分の BOT 状態復旧（survival_days, revealed 解除等、人間判断で不要と確定）
- `InMemoryBotRepository` を使う単体テストの拡充（integration test の追加は別スプリント）
- 本番 DB への migration 適用（`Apply DB Migrations` workflow による自動適用）
- 本番手動検証（`gh workflow run daily-maintenance.yml`）は オーケストレーター / smoke 側で実施

## 補足・制約

- migration 番号 `00043` は既存最大 `00042_seed_curation_wikipedia_bot.sql` の次
- `CREATE OR REPLACE FUNCTION` で既存関数を上書きするため、`DROP FUNCTION` は不要
- `SECURITY DEFINER` / `search_path = 'public'` は既存 00037 の仕様を踏襲
- 呼び出し元（TypeScript）は既に ISO 形式文字列 (`YYYY-MM-DD`) を渡しており、`::date` キャストで正常動作する

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全項目
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `supabase/migrations/00043_fix_bulk_update_daily_ids_cast.sql` 作成完了
  - `daily_id_date = p_daily_id_date::date` の明示キャストを追加
  - `SECURITY DEFINER` / `SET search_path = 'public'` を 00037 仕様に準拠して踏襲
- ローカル Supabase への migration 適用成功（`npx supabase migration up`）
- DBクエリで関数本体の `::date` キャストを直接確認済み

### テスト結果サマリー

**単体テスト（npx vitest run）:**
- Test Files: 1 failed (pre-existing) / 119 passed / 120 total
- Tests: 1 failed (pre-existing) / 2295 passed / 2296 total
- 失敗: `schema-consistency.test.ts` の `edge_tokens.channel` — 本タスク変更前から存在する既存問題（Sprint-150 `00041_edge_tokens_add_channel.sql`）であることを `git stash` にて実証確認済み。本タスクとは無関係

**BDDテスト（npx cucumber-js）:**
- 433 scenarios: 411 passed / 18 pending / 4 undefined / 0 failed
- 失敗: 0件
