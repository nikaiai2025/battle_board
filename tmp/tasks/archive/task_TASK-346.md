---
task_id: TASK-346
sprint_id: Sprint-135
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-28T10:00:00+09:00
updated_at: 2026-03-28T10:00:00+09:00
locked_files:
  - src/lib/services/handlers/weed-handler.ts
  - features/step_definitions/reactions.steps.ts
  - features/support/in-memory/incentive-log-repository.ts
---

## タスク概要

`!w`（草）コマンドの「同一日・同一付与先ユーザーに1回」制限を撤廃する。
`features/reactions.feature` の仕様変更（v4→v5）に合わせ、重複チェックロジックを削除し、
BDD テストが新仕様でパスするよう実装を修正する。

## 対象BDDシナリオ

- `features/reactions.feature` — 全シナリオ（特に新規追加の「同日中に同一ユーザーのレスに何度でも草を生やせる」）

## 必読ドキュメント（優先度順）

1. [必須] `features/reactions.feature` — 変更後の最新仕様（v5）
2. [必須] 草コマンドの実装ファイル（grep で特定すること）
3. [参考] `features/step_definitions/reactions.steps.ts` — ステップ定義（存在する場合）

## 作業内容

### 1. 草コマンドハンドラの重複チェック削除

`!w` コマンドを処理するハンドラ（`weed-handler.ts` またはそれに相当するファイル）から、
以下のロジックを削除する：

- 同日・同一付与先ユーザーへの重複チェック（IncentiveLog や専用テーブルを使っている場合）
- エラーメッセージ `"今日は既にこのユーザーに草を生やしています"` を返す分岐

削除後、重複していても草カウントを +1 して正常終了すること。

### 2. ステップ定義の修正（必要な場合）

`features/step_definitions/reactions.steps.ts` に以下のステップが存在する場合は削除する：
- `今日ユーザー {string} が {string} のレスに草を生やし済みである`
- `今日ユーザー {string} がレス {string} 経由で {string} に草を生やし済みである`
- `昨日ユーザー {string} が {string} のレスに草を生やし済みである`
- `日付が変更された後にユーザー {string} が {string} を実行する`

これらは削除されたシナリオでのみ使用されているため不要になる。
（使用箇所が他にないことを確認してから削除すること）

## 完了条件

- [ ] `npx cucumber-js --tags "@同日中に同一ユーザーのレスに何度でも草を生やせる"` がPASS
- [ ] `npx cucumber-js` 全体で新たなfailedが増えていない
- [ ] `npx vitest run` で全テストPASS（既存の失敗を増やさない）

## スコープ外

- 自分のレスへの草禁止ロジックは変更しない
- 存在しないレス・システムメッセージ・削除済みレスへのエラーは変更しない
- ボットへの草ロジックは変更しない

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- grass-handler.ts: ステップ6（重複チェック）を削除。毎回 create を呼ぶよう変更
- grass-handler.test.ts: 「同日重複」テストブロックを v5 仕様に更新、「重複チェック引数検証」テストを削除
- reactions.steps.ts: 「今日ユーザー×2」「昨日ユーザー」Given ステップ削除、「日付変更後に」When ステップ削除
- reactions.steps.ts: InMemoryGrassRepo.create の二重防御（重複チェック）ロジック削除
- reactions.steps.ts: AfterStep の isGrassError から「今日は既に...」メッセージ削除

### テスト結果サマリー

**BDD テスト（`npx cucumber-js`）:**
- 382 scenarios: 352 passed / 16 pending / 14 undefined / 0 failed
- reactions.feature 全シナリオ PASS（新規「同日中に同一ユーザーのレスに何度でも草を生やせる」を含む）

**単体テスト（`npx vitest run`）:**
- 103 test files: 99 passed / 4 failed（全て Discord 認証関連の既存失敗）
- 2030 tests: 2017 passed / 13 failed（全て既存失敗。今回の変更による新規失敗は 0）
- grass-handler.test.ts: 35 tests PASS
