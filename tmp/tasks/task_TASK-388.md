---
task_id: TASK-388
sprint_id: Sprint-154
status: completed
assigned_to: bdd-coding
depends_on: [TASK-387]
created_at: 2026-04-17
updated_at: 2026-04-17
locked_files:
  - "[NEW] supabase/migrations/00048_correct_bot_proliferation_sprint154.sql"
---

## タスク概要

Sprint-154 フェーズ2 として、本番 `bots` テーブルの異常累積データを訂正する migration を作成する。TASK-387 で実装したロジック修正は本番反映済みだが、Sprint-152 の17日障害解消以降に累積した以下の異常データは明示的な訂正が必要（ロジック側では自己収束しない過去世代）:

| profile_key | 現状 active | 要件 active | 訂正方針 |
|---|---:|---:|---|
| 荒らし役 | 107 | 10 | 最新 created_at 10 体を残し、他 97 体を `is_active=false` で凍結（`revived_at=NOW()` で今後の復活対象から永久除外） |
| hiroyuki | 26 | 使い切り | 7日経過の未撃破を物理削除、撃破済みを物理削除 |
| aori | 0 active / 3 eliminated | 使い切り | 撃破済みを物理削除（7日経過未撃破も対象） |
| tutorial | 0 active | 使い切り | 撃破済み・7日経過未撃破を物理削除 |

本タスクは**本番データ操作 migration の作成のみ**。人間承認は取得済み（2026-04-17）。

## 対象BDDシナリオ

- `features/bot_system.feature` L116-118「荒らし役ボットは10体が並行して活動する」— migration 適用後に成立

**新規 BDD シナリオは追加しない**。

## 必読ドキュメント（優先度順）

1. [必須] `tmp/workers/bdd-architect_TASK-386/design.md` §2.1, §2.2（Q1/Q2 の方針確定根拠）
2. [必須] `supabase/migrations/00047_add_revived_at_for_idempotency.sql`（TASK-387 で追加、前提）
3. [必須] `docs/architecture/components/bot.md` §2.10 / §6.11 / §5.1（TASK-387 で更新済み）
4. [必須] `src/lib/infrastructure/repositories/bot-repository.ts`（`deleteEliminatedSingleUseBots` 実装）
5. [参考] `supabase/migrations/00043_fix_bulk_update_daily_ids_cast.sql` / `00044_bot_posts_fk_cascade.sql` / `00045_bots_fk_cascade_remaining.sql`（Sprint-152 のデータ訂正系 migration 例）

## 入力（前工程の成果物）

- TASK-387 で実装された `revived_at` カラム・`deleteEliminatedSingleUseBots` ロジック（migration 00047）
- TASK-386 design.md §2.1, §2.2 の方針（Q1: 最新 10 体残しソフト削除 / Q2: aori・hiroyuki クリーンアップ拡張）

## 出力（生成すべきファイル）

### `supabase/migrations/00048_correct_bot_proliferation_sprint154.sql`（NEW）

```sql
-- =============================================================================
-- 00048_correct_bot_proliferation_sprint154.sql
-- Sprint-154 フェーズ2: 本番 bots テーブルの異常累積データを訂正
--
-- 対象:
--   1. 荒らし役 active 107 → 10 体（最新 created_at 10 体残し、他を凍結）
--   2. hiroyuki 撃破済み・7日経過未撃破を物理削除
--   3. aori 撃破済み・7日経過未撃破を物理削除
--   4. tutorial 撃破済み・7日経過未撃破を物理削除
--
-- 冪等性: ローカル環境等で該当データがない場合は 0 rows affected でスキップ。
--         2回目以降の適用も idempotent（荒らし役が既に 10 体以下なら UPDATE 対象なし）。
--
-- 前提: migration 00047 で `bots.revived_at` カラムが追加済みであること。
--
-- See: tmp/workers/bdd-architect_TASK-386/design.md §2.1, §2.2
-- =============================================================================

BEGIN;

-- =============================================================================
-- Step 1: 荒らし役 active 上位 10 体（最新 created_at）を残し、他を凍結
-- =============================================================================
-- ソフト削除の理由:
--   - 過去の投稿・撃破履歴のFK参照を保持するため物理削除しない
--   - `revived_at = NOW()` で bulkReviveEliminated の SELECT 対象から永久除外
--   - `eliminated_at = NOW()` で撃破済み相当として履歴に記録
WITH ranked_arashi AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC, id DESC) AS rn
  FROM bots
  WHERE bot_profile_key = '荒らし役' AND is_active = true
)
UPDATE bots
SET
  is_active = false,
  eliminated_at = COALESCE(eliminated_at, NOW()),
  revived_at = COALESCE(revived_at, NOW()),
  updated_at = NOW()
WHERE id IN (SELECT id FROM ranked_arashi WHERE rn > 10);

-- =============================================================================
-- Step 2: 使い切りBOT（tutorial/aori/hiroyuki）の 7日経過未撃破を物理削除
-- =============================================================================
-- deleteEliminatedSingleUseBots() と同等の条件。migration 適用前の古い未撃破データを
-- 明示的にクリーンアップすることで、現状のオペレーションと日次リセットの挙動を一致させる。
DELETE FROM bots
WHERE bot_profile_key IN ('tutorial','aori','hiroyuki')
  AND created_at < NOW() - INTERVAL '7 days';

-- =============================================================================
-- Step 3: 使い切りBOT（tutorial/aori/hiroyuki）の撃破済みを物理削除
-- =============================================================================
DELETE FROM bots
WHERE bot_profile_key IN ('tutorial','aori','hiroyuki')
  AND is_active = false;

COMMIT;

-- =============================================================================
-- 適用後の期待状態（本番）:
--   - 荒らし役 active: 10 体
--   - 荒らし役 eliminated: 97 + 15 = 112 体（履歴保持）
--   - hiroyuki active: 召喚直後かつ 7 日以内の未撃破のみ
--   - aori active: 0 体
--   - tutorial active: ウェルカム進行中のユーザー用のみ（7日以内）
-- =============================================================================
```

## 完了条件

- [ ] migration 00048 がローカル Supabase に適用成功（`npx supabase migration up`）
- [ ] ローカル適用時に 0 rows affected で安全にスキップされることを確認（該当データがないため）
- [ ] migration ファイル構文確認（BEGIN/COMMIT で明示的トランザクション、WHERE 条件の正確性）
- [ ] 既存単体テスト全件 PASS 維持（2306）
- [ ] BDD テスト全件 PASS 維持（411）
- [ ] docs は更新不要（TASK-387 で完了済み。本 migration は一時的なデータ訂正のため）

## スコープ外

- アプリケーションコードの変更（本 migration は DB データ訂正のみ）
- docs 更新（TASK-387 で完了済み）
- 本番 DB への直接クエリ実行（GitHub Actions 自動反映フローに任せる）
- 監査ログの手動記録（git commit メッセージに件数・条件を明記することで代替）

## 補足・制約

- **本番データ反映は GitHub Actions の自動フローに任せる**。push 後に自動実行されるため、手動 CLI 適用は不要
- migration は `BEGIN; ... COMMIT;` で明示的トランザクションに包むこと（Step 1〜3 がアトミックに適用される）
- 荒らし役 10 体残しの選定基準は `created_at DESC, id DESC` でタイブレーク（ONE ROW per rn 保証）
- `updated_at = NOW()` の更新も忘れないこと（`bots` テーブルの一般的な規約）
- ローカル検証時は事前に `npx supabase db reset` 等で初期状態から migration を一気に流すことで 0 rows affected を確認する

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: design.md §2.1/§2.2 確認済み・migration 00048 作成・ローカル適用成功・テスト維持確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] design.md §2.1/§2.2、migration 00047 を確認
- [修正] タスク指示書テンプレートに `updated_at = NOW()` が含まれていたが、bots テーブルに `updated_at` カラムが存在しないため除去（スキーマ検証済み: `00001_create_tables.sql`）
- [完了] migration 00048 作成・ローカル適用成功（0 rows affected でスキップ確認）
- [完了] 既存テスト維持確認（vitest 2306 PASS / cucumber-js 411 passed）

### テスト結果サマリー

| テスト種別 | 結果 | 件数 |
|---|---|---|
| 単体テスト (vitest run) | PASS | 2306 |
| BDD テスト (cucumber-js) | passed | 411 / 0 failed |

migration 適用: ローカル Supabase に適用成功（該当データなし・0 rows affected でスキップ）
