---
task_id: TASK-383
sprint_id: Sprint-152
status: completed
assigned_to: bdd-coding
depends_on: [TASK-382]
created_at: 2026-04-15
updated_at: 2026-04-15
locked_files:
  - "[NEW] supabase/migrations/00044_bot_posts_cascade_on_bot_delete.sql"
---

## タスク概要

Daily Maintenance ワークフロー Step 6 (`deleteEliminatedTutorialBots`) で `bot_posts_bot_id_fkey` 制約違反により 500 エラーが発生している。
`bot_posts.bot_id` の FK 制約を `ON DELETE CASCADE` に変更し、撃破済みチュートリアルBOT削除時に関連 `bot_posts` レコードが自動削除されるようにする。

## 対象BDDシナリオ

該当なし（本修正は schema 整合性修正で BDD 振る舞い変更は伴わない）。
ただし `features/welcome.feature` 〜 撃破済みチュートリアルBOTクリーンアップ系シナリオ の**意図通りに動作させるための schema 修正**。

## 必読ドキュメント（優先度順）

1. [必須] `supabase/migrations/00001_create_tables.sql` L118-127 — `bot_posts` 現在定義（`bot_id UUID NOT NULL REFERENCES bots(id)`）
2. [必須] `docs/architecture/components/bot.md` §2.10 Step 6 / §6.10 / §6.11 — 設計意図（チュートリアルBOTのみ物理削除、運営BOTは凍結保持）
3. [参考] `src/lib/infrastructure/repositories/bot-repository.ts` L855-904 — `deleteEliminatedTutorialBots()` 実装
4. [参考] `tmp/reports/daily_maintenance_500_investigation.md` — Sprint-152 調査レポート

## 背景（調査済み）

- **症状:** 手動 `gh workflow run daily-maintenance.yml` 実行時に HTTP 500
- **エラー:** `BotRepository.deleteEliminatedTutorialBots (eliminated) failed: update or delete on table "bots" violates foreign key constraint "bot_posts_bot_id_fkey" on table "bot_posts"`
- **根本原因:** `bot_posts.bot_id` の FK に `ON DELETE` 指定なし → デフォルトで `NO ACTION`（参照あると削除失敗）
- **物理削除対象の調査結果:** `src/lib/` 全体で `bots` の DELETE は `deleteEliminatedTutorialBots()` の1関数のみ。対象は `bot_profile_key = 'tutorial'` 限定
- **副作用:** なし（運営BOTはインカーネーションモデルで INSERT、UI にも削除機能なし）

## 出力（生成すべきファイル）

- `supabase/migrations/00044_bot_posts_cascade_on_bot_delete.sql` — FK を DROP + 再作成で `ON DELETE CASCADE` を付与

### SQL 実装方針

PostgreSQL では FK 制約を直接変更できないため、DROP → ADD で付け替える。既存制約名 `bot_posts_bot_id_fkey` は `00001_create_tables.sql` の `REFERENCES bots(id)` インライン記法により PostgreSQL が自動命名したもの。

```sql
-- =============================================================================
-- 00044_bot_posts_cascade_on_bot_delete.sql
-- bot_posts.bot_id FK に ON DELETE CASCADE を付与する
--
-- 症状: daily-maintenance Step 6（deleteEliminatedTutorialBots）で FK 違反により HTTP 500
-- 根本原因: bot_posts.bot_id の FK が NO ACTION（デフォルト）で、bot_posts 参照がある
--           限り bots からの DELETE が失敗する
-- 修正: FK を CASCADE に変更し、撃破済みチュートリアルBOT削除時に関連 bot_posts が
--       自動削除されるようにする
--
-- 物理削除対象の範囲:
--   src/lib/ 全体で bots の DELETE は deleteEliminatedTutorialBots() のみ。
--   対象は bot_profile_key = 'tutorial' 限定（撃破済み + 7日経過未撃破）。
--   運営BOTはインカーネーションモデル（§6.11）で INSERT のため DELETE されない。
--   → CASCADE 発動対象はチュートリアルBOTに限定され、他BOT種別への副作用なし。
--
-- See: docs/architecture/components/bot.md §2.10 Step 6 / §6.10 / §6.11
-- See: tmp/reports/daily_maintenance_500_investigation.md
-- =============================================================================

ALTER TABLE bot_posts
  DROP CONSTRAINT bot_posts_bot_id_fkey;

ALTER TABLE bot_posts
  ADD CONSTRAINT bot_posts_bot_id_fkey
  FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE;
```

## 完了条件

- [ ] `supabase/migrations/00044_bot_posts_cascade_on_bot_delete.sql` 作成
- [ ] 既存単体テスト全件 PASS（`npx vitest run`）
- [ ] 既存BDDテスト全件 PASS（`npx cucumber-js`）
- [ ] ローカル Supabase へ migration 適用成功を確認（`npx supabase migration up`）
  - **注:** 00041/00042/00043 も同期適用されること
- [ ] 適用後、`\d bot_posts` 等で `ON DELETE CASCADE` が反映されていることを確認（任意）

## スコープ外

- `deleteEliminatedTutorialBots()` のコード変更（不要。schema 側で解決）
- 本番 DB への migration 適用（自動）
- 本番手動検証（オーケストレーター側で実施）
- 他の FK 制約の見直し（本スプリント外）

## 補足・制約

- migration 番号 `00044` は既存最大 `00043_fix_bulk_update_daily_ids_cast.sql` の次
- FK 制約名 `bot_posts_bot_id_fkey` は PostgreSQL の自動命名規則により `{table}_{column}_fkey`
- 再作成後も同名にすることで既存参照を維持

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全完了条件を充足
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `supabase/migrations/00044_bot_posts_cascade_on_bot_delete.sql` 作成
  - タスク指示書記載のSQLを採用（DROP + ADD で `ON DELETE CASCADE` 付与）
- `npx supabase migration list` で 00044 がローカルに認識されることを確認
- `npx supabase migration up` でローカルDBへの適用成功
- `pg_constraint` クエリで `confdeltype = 99`（= ASCII 'c' = CASCADE）を確認

### テスト結果サマリー

#### 単体テスト（`npx vitest run`）
- 結果: 120 ファイル・2296 テスト全件 PASS
- FAIL: 0

#### BDD テスト（`npx cucumber-js`）
- 結果: 433 シナリオ / 2347 ステップ
  - PASS: 411 シナリオ / 2276 ステップ
  - Pending（既存・未実装）: 18 シナリオ
  - Undefined（既存）: 4 シナリオ
  - FAIL: 0
- 新規 FAIL なし。既存テスト全件 PASS を確認
