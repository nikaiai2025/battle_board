---
task_id: TASK-384
sprint_id: Sprint-152
status: completed
assigned_to: bdd-coding
depends_on: [TASK-383]
created_at: 2026-04-15
updated_at: 2026-04-15
locked_files:
  - "[NEW] supabase/migrations/00045_bots_child_tables_cascade_on_delete.sql"
---

## タスク概要

Daily Maintenance Step 6 (`deleteEliminatedTutorialBots`) で `bots` 削除時の FK 制約違反が発生している。
TASK-383 で `bot_posts` のみ `ON DELETE CASCADE` 化したが、`bots` を参照する残り3テーブル（`attacks` / `grass_reactions` / `collected_topics`）も同様に CASCADE 化する必要がある。
本タスクでこれら3テーブルの FK 制約を一括で `ON DELETE CASCADE` に変更する。

## 対象BDDシナリオ

該当なし（schema 整合性修正で BDD 振る舞い変更は伴わない）。
ただし撃破済みチュートリアルBOTクリーンアップ系シナリオ（Daily Maintenance Step 6）の**意図通りに動作させるための schema 修正**。

## 必読ドキュメント（優先度順）

1. [必須] `supabase/migrations/00007_bot_v5_attack_system.sql` L44 — `attacks.bot_id` 現在定義
2. [必須] `supabase/migrations/00008_grass_system.sql` L34 — `grass_reactions.receiver_bot_id` 現在定義
3. [必須] `supabase/migrations/00034_curation_bot.sql` L12 — `collected_topics.source_bot_id` 現在定義
4. [必須] `docs/architecture/components/bot.md` §2.10 Step 6 / §6.10 / §6.11 — 設計意図
5. [必須] `docs/architecture/lessons_learned.md` LL-017 — FK `ON DELETE` 明示義務化の教訓
6. [参考] `supabase/migrations/00044_bot_posts_cascade_on_bot_delete.sql` — TASK-383 で作成した同様 migration のパターン
7. [参考] `docs/operations/incidents/2026-04-15_daily_maintenance_500_17day_outage.md` — 本件インシデント報告

## 背景（調査済み）

- **症状:** TASK-383 デプロイ後、手動 `gh workflow run daily-maintenance.yml` で Step 6 が再度 500
- **エラー:** `violates foreign key constraint "grass_reactions_receiver_bot_id_fkey" on table "grass_reactions"`
- **根本原因:** `bots` を参照する FK は計4テーブルあり、TASK-383 では `bot_posts` しか対処していなかった（認識不足）
- **対象3テーブル:** `src/lib/` 全体の grep 結果、`bots` DELETE は `deleteEliminatedTutorialBots()` のみで `bot_profile_key = 'tutorial'` 限定。よって CASCADE 発動対象はチュートリアルBOTに限られ、他BOT種別への副作用なし（TASK-383 と同様の安全性分析）

### 対象FK制約一覧

PostgreSQL 自動命名規則 `{table}_{column}_fkey` に従う：

| テーブル | カラム | 制約名 | 現在 | 変更後 |
|---|---|---|---|---|
| `attacks` | `bot_id` | `attacks_bot_id_fkey` | NO ACTION（暗黙） | ON DELETE CASCADE |
| `grass_reactions` | `receiver_bot_id` | `grass_reactions_receiver_bot_id_fkey` | NO ACTION（暗黙） | ON DELETE CASCADE |
| `collected_topics` | `source_bot_id` | `collected_topics_source_bot_id_fkey` | NO ACTION（暗黙） | ON DELETE CASCADE |

## 出力（生成すべきファイル）

- `supabase/migrations/00045_bots_child_tables_cascade_on_delete.sql` — 3 FK を DROP + 再作成で `ON DELETE CASCADE` を付与

### SQL 実装方針

TASK-383 (00044) と同じパターン。DROP → ADD で付け替える。

```sql
-- =============================================================================
-- 00045_bots_child_tables_cascade_on_delete.sql
-- bots を参照する残り3テーブルの FK に ON DELETE CASCADE を付与する
--
-- 症状: daily-maintenance Step 6（deleteEliminatedTutorialBots）で FK 違反により HTTP 500
-- 根本原因: 00044 で bot_posts のみ対処したが、bots 参照 FK は計4テーブル存在。残り3テーブル
--           （attacks / grass_reactions / collected_topics）も NO ACTION（デフォルト）のため
--           同様の FK 違反が発生する。
-- 修正: 3 FK をいずれも CASCADE に変更し、撃破済みチュートリアルBOT削除時に関連レコードが
--       自動削除されるようにする
--
-- 物理削除対象の範囲:
--   src/lib/ 全体で bots の DELETE は deleteEliminatedTutorialBots() のみ。
--   対象は bot_profile_key = 'tutorial' 限定（撃破済み + 7日経過未撃破）。
--   運営BOTはインカーネーションモデル（§6.11）で INSERT のため DELETE されない。
--   → CASCADE 発動対象はチュートリアルBOTに限定され、他BOT種別への副作用なし。
--
-- See: docs/architecture/components/bot.md §2.10 Step 6 / §6.10 / §6.11
-- See: docs/architecture/lessons_learned.md LL-017
-- See: docs/operations/incidents/2026-04-15_daily_maintenance_500_17day_outage.md
-- =============================================================================

-- attacks.bot_id
ALTER TABLE attacks
  DROP CONSTRAINT attacks_bot_id_fkey;

ALTER TABLE attacks
  ADD CONSTRAINT attacks_bot_id_fkey
  FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE;

-- grass_reactions.receiver_bot_id
ALTER TABLE grass_reactions
  DROP CONSTRAINT grass_reactions_receiver_bot_id_fkey;

ALTER TABLE grass_reactions
  ADD CONSTRAINT grass_reactions_receiver_bot_id_fkey
  FOREIGN KEY (receiver_bot_id) REFERENCES bots(id) ON DELETE CASCADE;

-- collected_topics.source_bot_id
ALTER TABLE collected_topics
  DROP CONSTRAINT collected_topics_source_bot_id_fkey;

ALTER TABLE collected_topics
  ADD CONSTRAINT collected_topics_source_bot_id_fkey
  FOREIGN KEY (source_bot_id) REFERENCES bots(id) ON DELETE CASCADE;
```

## 完了条件

- [x] `supabase/migrations/00045_bots_child_tables_cascade_on_delete.sql` 作成
- [x] 既存単体テスト全件 PASS（`npx vitest run`）— 2296/2296
- [x] 既存BDDテスト全件 PASS（`npx cucumber-js`）— 411/411
- [x] ローカル Supabase へ migration 適用成功を確認（`npx supabase migration up`）
- [x] 適用後、3 FK すべてが `ON DELETE CASCADE` になっていることを確認（`pg_constraint` クエリで `confdeltype = 'c'`）

## スコープ外

- `deleteEliminatedTutorialBots()` のコード変更（不要。schema 側で解決）
- 本番 DB への migration 適用（自動）
- 本番手動検証（オーケストレーター側で実施）
- `bots` 以外のテーブルを参照する FK の見直し（本スプリント外）
- 既存の `00001` 〜 `00044` の修正（新規 migration で対応）

## 補足・制約

- migration 番号 `00045` は既存最大 `00044_bot_posts_cascade_on_bot_delete.sql` の次
- FK 制約名は PostgreSQL 自動命名規則 `{table}_{column}_fkey`
- 再作成後も同名にすることで既存参照を維持
- `grass_reactions.receiver_bot_id` は NOT NULL 制約なし（NULL 許容の排他OR構造）だが、FK 動作には影響しない

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: migration 00045 作成・適用、単体テスト/BDDテスト/FK検証 すべて PASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 必読ドキュメント（00007, 00008, 00034, 00044）を確認し FK 制約名を検証
- `supabase/migrations/00045_bots_child_tables_cascade_on_delete.sql` を作成（タスク指示書の SQL テンプレートをそのまま採用）
- `npx vitest run` → 2296 テスト全件 PASS
- `npx cucumber-js` → 411 シナリオ全件 PASS（4 undefined / 18 pending は既存スケルトン）
- `npx supabase migration up` → 00045 適用成功
- FK 検証クエリ実行 → 3 FK すべて `confdeltype = 99 ('c')` = ON DELETE CASCADE を確認

### テスト結果サマリー
- 単体テスト: 2296 PASS / 0 FAIL（120 ファイル）
- BDDシナリオ: 411 PASS / 0 FAIL（4 undefined / 18 pending は既存スケルトン）
- migration 適用: 成功
- FK CASCADE 確認:
  - `attacks_bot_id_fkey`: confdeltype = 'c' (CASCADE)
  - `collected_topics_source_bot_id_fkey`: confdeltype = 'c' (CASCADE)
  - `grass_reactions_receiver_bot_id_fkey`: confdeltype = 'c' (CASCADE)
