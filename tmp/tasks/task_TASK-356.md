---
task_id: TASK-356
sprint_id: Sprint-138
status: completed
assigned_to: bdd-coding
depends_on: [TASK-355]
created_at: 2026-03-29T17:00:00+09:00
updated_at: 2026-03-29T17:00:00+09:00
locked_files:
  - "[NEW] supabase/migrations/00035_bulk_daily_reset_functions.sql"
---

## タスク概要

TASK-355 で実装した `performDailyReset` バッチ化が本番で動作するために必要な PostgreSQL RPC 関数のマイグレーションを作成する。

## 出力（生成すべきファイル）

- `supabase/migrations/00035_bulk_daily_reset_functions.sql` — 2つのRPC関数を定義

## 必要なRPC関数

### 1. `bulk_update_daily_ids(p_bot_ids uuid[], p_daily_ids text[], p_daily_id_date text)`

呼び出し元: `bot-repository.ts` の `bulkUpdateDailyIds()`

```sql
CREATE OR REPLACE FUNCTION bulk_update_daily_ids(
  p_bot_ids uuid[],
  p_daily_ids text[],
  p_daily_id_date text
) RETURNS void AS $$
BEGIN
  UPDATE bots AS b
  SET daily_id = v.daily_id,
      daily_id_date = p_daily_id_date
  FROM unnest(p_bot_ids, p_daily_ids) AS v(id, daily_id)
  WHERE b.id = v.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 2. `bulk_increment_survival_days()`

呼び出し元: `bot-repository.ts` の `bulkIncrementSurvivalDays()`

```sql
CREATE OR REPLACE FUNCTION bulk_increment_survival_days()
RETURNS void AS $$
BEGIN
  UPDATE bots
  SET survival_days = survival_days + 1
  WHERE is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 完了条件

- [x] `supabase/migrations/00035_bulk_daily_reset_functions.sql` を作成
- [x] ローカル Supabase に適用して構文エラーがないことを確認: `npx supabase migration up`
- [x] テストコマンド: `npx vitest run` && `npx cucumber-js` で回帰なし

## スコープ外

- TypeScriptコードの変更（TASK-355で完了済み）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: マイグレーションファイル作成、ローカルSupabaseへの適用確認、vitest/cucumber-js 回帰なし確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
1. タスク指示書・既存マイグレーションファイル・bot-repository.ts の確認完了
2. `supabase/migrations/00035_bulk_daily_reset_functions.sql` 作成
   - `bulk_update_daily_ids(uuid[], text[], text)` RPC 関数定義（SECURITY DEFINER）
   - `bulk_increment_survival_days()` RPC 関数定義（SECURITY DEFINER）
3. `npx supabase migration up` で構文エラーなしを確認
4. `npx vitest run` 実行 — 失敗13件はすべて既存の Discord OAuth 回帰（マイグレーション適用前から同一）、今回タスクによる新規失敗なし
5. `npx cucumber-js` 実行 — 373 passed（回帰なし）

### テスト結果サマリー
- vitest: 2087 passed / 13 failed（13件は既存回帰。今回タスクによる新規失敗なし）
- cucumber-js: 373 passed / 0 failed（394 scenarios: 3 undefined, 18 pending は既存）
- マイグレーション適用: `Applying migration 00035_bulk_daily_reset_functions.sql...` 成功（構文エラーなし）
