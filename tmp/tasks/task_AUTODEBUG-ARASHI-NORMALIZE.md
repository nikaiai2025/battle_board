---
task_id: AUTODEBUG-ARASHI-NORMALIZE
status: completed
artifacts_dir: tmp/workers/coding_AUTODEBUG-ARASHI-NORMALIZE
locked_files:
  - src/lib/infrastructure/repositories/bot-repository.ts
  - src/lib/services/bot-service.ts
  - src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts
  - src/__tests__/lib/services/bot-service.test.ts
  - supabase/migrations/00049_normalize_arashi_active_count.sql
---

# タスク指示書

## 目的

本番で `bot_profile_key='荒らし役'` の active 件数が 25 体に増えている不具合を修正する。
仕様上、荒らし役は日次更新直後に常に 10 体でなければならない。

## 背景

- 仕様の正本:
  - `features/bot_system.feature` では荒らし役は 10 体並行稼働
  - `docs/specs/bot_state_transitions.yaml` でも `count: 10`
- 現状実装:
  - `bulkReviveEliminated()` が `revived_at IS NULL` の eliminated BOT を全件新規 INSERT する
  - これは「各撃破済み個体を復活」させる実装であり、「荒らし役 active 件数を 10 に保つ」制御になっていない
- 本番 read-only 調査結果:
  - `bot_profile_key='荒らし役'` が `active=25 / inactive=112`
  - 補正 migration `00048_correct_bot_proliferation_sprint154.sql` の期待状態は `active=10 / inactive=112`
  - したがって補正後にさらに 15 体が転生経路で増えた可能性が高い

## 期待する振る舞い

### 受け入れ条件

1. 日次更新直後、荒らし役 active 件数は常に 10 体である
2. 前日に荒らし役が何体撃破されたかに応じて、不足分だけ新世代を補充する
3. 前日に撃破が 0 体なら、新たな荒らし役は生成しない
4. 既に active が 10 体を超えている異常状態でも、補正 migration により 10 体へ正規化できる
5. 過去レスと旧 botId の履歴保持は維持する
6. tutorial / aori / hiroyuki の「使い切りBOT」仕様は壊さない
7. 既存のインカーネーションモデル自体は維持してよいが、「全件復活」ではなく「不足分だけ補充」に変更すること

## 実装指針

- `bulkReviveEliminated()` の責務を見直し、少なくとも荒らし役については profile 単位の目標 active 件数を満たす分だけ生成すること
- 最小限の実装でよいが、ロジックが profile 単位の不変条件を表現できる形にすること
- 本番データ補正のため migration を追加すること
- migration は冪等であること
- feature ファイルの変更は禁止

## 必読ファイル

- `features/bot_system.feature`
- `docs/specs/bot_state_transitions.yaml`
- `docs/architecture/components/bot.md`
- `supabase/migrations/00047_add_revived_at_for_idempotency.sql`
- `supabase/migrations/00048_correct_bot_proliferation_sprint154.sql`

## テスト方針

- 変更したロジックに対する unit test を追加・更新すること
- 少なくとも以下を検証すること
  - active=10 / eliminatedあり → 追加生成 0
  - active=7 / eliminated未復活が複数 → 3 体だけ生成
  - active=0 / eliminated多数 → 10 体だけ生成
  - tutorial / aori / hiroyuki は対象外
  - migration の意図に対応する repository / service レベルの期待値

## 作業ログ

- 2026-04-19: 着手。`bdd-coding` として必読ファイル・`locked_files` を確認し、`bulkReviveEliminated()` が profile 単位の目標件数ではなく eliminated 全件を復活させる実装であることを確認。
- 2026-04-19: 方針。repository で荒らし役の active 件数を数え、不足分だけ未復活 eliminated から新世代を生成する。service 契約は維持し、unit test と補正 migration を追加する。
- 2026-04-19: 実装。`src/lib/infrastructure/repositories/bot-repository.ts` に荒らし役 `active=10` の deficit 制御を追加し、`tutorial/aori/hiroyuki` の使い切り除外定数を共通化。`src/lib/services/bot-service.ts` の repository 契約コメントも更新。
- 2026-04-19: テスト。`src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts` に `active=10/7/0` の正規化ケース、count 取得失敗ケースを追加。`src/__tests__/lib/services/bot-service.test.ts` に daily reset 後の `next_post_at` が復活BOT数だけ更新されることを追加。
- 2026-04-19: migration。`supabase/migrations/00049_normalize_arashi_active_count.sql` を追加し、荒らし役 active の最新10体だけを残して余剰を凍結する冪等補正を実装。
- 2026-04-19: テスト結果サマリー。`npx vitest run src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts src/__tests__/lib/services/bot-service.test.ts` は 121 tests passed。`npx cucumber-js --name ...` / `npx cucumber-js features/bot_system.feature --name ...` は既存 `cucumber.js` の `paths` マージ仕様により全 feature が対象化され、既知の pending シナリオ群で exit 1 となるため今回変更の受け入れ確認には使用不可だった。
