---
sprint_id: Sprint-152
status: in_progress
created_at: 2026-04-15
---

# Sprint-152 計画書 — Daily Maintenance 500 障害修正（bulk_update_daily_ids 型キャスト）

## スプリントゴール

Daily Maintenance ワークフローの 500 障害を修正し、`performDailyReset` が再び成功するようにする。

**スコープ外（人間判断で確定）:**
- 過去17日分の daily-stats 欠損の遡及集計 → 不要
- 過去17日分の BOT 状態復旧（survival_days, revealed 解除等） → 不要
- 他の改善項目（integration test 追加等） → 本スプリント外

## 背景（調査済み）

- **症状:** `POST /api/internal/daily-reset`（Vercel）が17日連続 HTTP 500
- **連続失敗:** 2026-03-27 → 2026-04-14（17日、GitHub Issue #2 起票済み）
- **根本原因:** `bulk_update_daily_ids` RPC が `p_daily_id_date text` を `bots.daily_id_date (DATE)` 列にキャストなしで代入 → PostgreSQL の暗黙キャスト禁止で throw
- **混入コミット:** `bfae891`（2026-03-29「performDailyReset バッチ化」時に RPC 追加）
- **調査レポート:** `tmp/reports/daily_maintenance_500_investigation.md`

## 修正方針

レポート §4.1 採用: 新規 migration で `p_daily_id_date::date` 明示キャスト。

```sql
-- supabase/migrations/00043_fix_bulk_update_daily_ids_cast.sql
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
      daily_id_date = p_daily_id_date::date  -- 明示キャスト
  FROM unnest(p_bot_ids, p_daily_ids) AS v(id, daily_id)
  WHERE b.id = v.id;
END;
$$;
```

呼び出し元（`bot-repository.ts`）の変更不要。

## タスク分解

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-382 | bdd-coding | migration 00043 作成（RPC 再定義）+ 既存テスト整合性確認 | - | completed |
| TASK-383 | bdd-coding | migration 00044 作成（`bot_posts.bot_id` に `ON DELETE CASCADE` 追加）+ 既存テスト整合性確認 | TASK-382 | assigned |

### スコープ拡張の経緯（2026-04-15）

TASK-382 デプロイ後の手動 `gh workflow run daily-maintenance.yml` 検証で、Step 6 (`deleteEliminatedTutorialBots`) が `bot_posts_bot_id_fkey` FK 制約違反で 500。
Sprint-84 以来の潜在バグ（`bulk_update_daily_ids` 型エラーで Step 6 が17日間未実行だったため表面化せず）。

人間承認 (2026-04-15): 案A採用（schema レベル FK CASCADE）。
- **物理削除対象はチュートリアルBOTのみ**（`bot_profile_key = 'tutorial'`）。他BOTはインカーネーションモデル (§6.11) で削除されない
- CASCADE 発動対象がチュートリアル限定のため、他BOT種別への副作用なし

## locked_files 管理

| TASK_ID | locked_files |
|---|---|
| TASK-382 | `[NEW] supabase/migrations/00043_fix_bulk_update_daily_ids_cast.sql` |
| TASK-383 | `[NEW] supabase/migrations/00044_bot_posts_cascade_on_bot_delete.sql` |

## 完了条件

- [ ] `supabase/migrations/00043_fix_bulk_update_daily_ids_cast.sql` 作成
- [ ] 既存テスト全件 PASS 維持（vitest 2296 / cucumber 411）
- [ ] 本番 DB に migration 自動適用成功（`Apply DB Migrations` workflow）
- [ ] 本番 Vercel デプロイ完了後、`gh workflow run daily-maintenance.yml` 手動トリガで **daily-reset ジョブ PASS**
- [ ] bdd-smoke 31/36 維持
- [ ] GitHub Issue #2 をクローズ

## 検証観点（特記事項）

本障害は **InMemoryBotRepository を使う BDD/単体テストでは検知できない**（PostgreSQL 型エラーは実 DB 依存）。
本修正後も「テストは通るが本番で落ちる」という既存リスクは残存する。
integration test の拡充は本スプリント外として、次回 BOT 関連スプリントで検討課題とする。

## 結果

| TASK_ID | 状態 | 備考 |
|---|---|---|
| TASK-382 | completed | migration 00043 作成完了。vitest 2295 PASS / BDD 411 PASS。ローカル migration 適用成功。`edge_tokens.channel` schema-consistency 失敗は Sprint-150 `00041` 由来の pre-existing（本タスク無関係を git stash で実証） |
| TASK-GATE-152 | — | bdd-gate 起動予定 |
| TASK-SMOKE-152 | — | デプロイ後に起動 |
| 手動 workflow_dispatch 検証 | — | デプロイ後に実施 |

### 既知の pre-existing 問題（Sprint-152 スコープ外）

- **`src/__tests__/integration/schema-consistency.test.ts` の `edge_tokens.channel` 不整合**
  - 原因仮説: ローカル Supabase に migration 00041 (`edge_tokens ADD COLUMN channel`) が適用されていない
  - 本番DBには自動適用済み（Sprint-150 commit `8eead6f` マージ時に `Apply DB Migrations` workflow 適用）
  - 本番スモーク・Vercel/CF デプロイには影響なし
  - 次回 BOT/Edge-Token 関連スプリントで local sync 問題として扱う
