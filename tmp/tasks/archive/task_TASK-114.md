---
task_id: TASK-114
sprint_id: Sprint-39
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T17:00:00+09:00
updated_at: 2026-03-17T17:00:00+09:00
locked_files:
  - features/step_definitions/incentive.steps.ts
  - features/step_definitions/user_registration.steps.ts
  - features/step_definitions/common.steps.ts
  - features/step_definitions/thread.steps.ts
  - features/step_definitions/ai_accusation.steps.ts
  - features/step_definitions/command_system.steps.ts
  - features/step_definitions/bot_system.steps.ts
  - features/step_definitions/admin.steps.ts
  - features/step_definitions/reactions.steps.ts
  - features/step_definitions/authentication.steps.ts
  - features/support/hooks.ts
  - features/support/world.ts
  - features/support/in-memory/accusation-repository.ts
  - features/support/in-memory/attack-repository.ts
  - features/support/in-memory/auth-code-repository.ts
  - features/support/in-memory/daily-stats-repository.ts
  - features/support/in-memory/currency-repository.ts
  - features/support/in-memory/user-repository.ts
  - features/support/in-memory/bot-repository.ts
  - features/support/in-memory/incentive-log-repository.ts
  - features/support/in-memory/ip-ban-repository.ts
  - features/support/in-memory/edge-token-repository.ts
  - src/lib/services/post-service.ts
  - src/lib/services/bot-service.ts
  - src/lib/services/admin-service.ts
  - src/lib/infrastructure/repositories/edge-token-repository.ts
  - src/lib/infrastructure/repositories/user-repository.ts
  - src/lib/infrastructure/repositories/ip-ban-repository.ts
  - src/lib/infrastructure/repositories/bot-repository.ts
---

## タスク概要
`new Date()` を `new Date(Date.now())` に一括置換する。JavaScriptでは `Date.now()` をスタブ化しても `new Date()`（引数なし）には反映されないため、テストの時刻モックと整合しない問題がある。

## 背景
- `tmp/fix_report_20260317_date_mock.md` に記録された根本原因と同一の問題
- 先の修正では3箇所のみ修正したが、同様の `new Date()` が features/ 配下に約90箇所、src/lib/ 配下に約10箇所残存
- 現時点ではテストPASSしているが、時刻依存テストが実行日によって不安定になる潜在的リスク

## 修正方針

### 機械的置換ルール
- `new Date()` → `new Date(Date.now())`
- `new Date().getTime()` → `Date.now()`
- `new Date().toISOString()` → `new Date(Date.now()).toISOString()`

### 対象範囲
1. **features/step_definitions/*.steps.ts** — 全ステップ定義ファイル
2. **features/support/in-memory/*.ts** — 全InMemoryリポジトリ
3. **features/support/hooks.ts, world.ts** — フック・ワールド
4. **src/lib/services/*.ts** — サービス層（post-service.ts, bot-service.ts, admin-service.ts）
5. **src/lib/infrastructure/repositories/*.ts** — リポジトリ層（edge-token, user, ip-ban, bot）

### 例外（変更しない箇所）
- コメント内の `new Date()` の記述（説明目的）
- `new Date(someTimestamp)` のように引数ありの場合（既に特定の値を渡している）
- `new Date(Date.now())` に既に修正済みの箇所

## 必読ドキュメント（優先度順）
1. [必須] `tmp/fix_report_20260317_date_mock.md` — 根本原因と修正パターン
2. [参考] `features/support/mock-installer.ts` — Date.now()モックの実装

## 完了条件
- [x] features/ 配下の全 `new Date()` を `new Date(Date.now())` に置換
- [x] src/lib/ 配下の全 `new Date()` を `new Date(Date.now())` に置換
- [x] `npx vitest run` 全テストPASS
- [x] `npx cucumber-js` 全シナリオPASS（219 passed, 9 pending, 0 failed）

## スコープ外
- src/__tests__/ 配下のVitestテストコード（vi.mockで別途モック管理されており、Date.now()スタブとは無関係）
- ドキュメント更新

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全対象ファイルの置換およびテスト全件PASS確認

### 進捗ログ
- 対象ファイル全件確認完了（features/: 102箇所, src/lib/: 対象ファイルのみ）
- features/step_definitions/*.steps.ts, features/support/in-memory/*.ts, features/support/{hooks,world}.ts, src/lib/services/{post,bot,admin}-service.ts, src/lib/infrastructure/repositories/{edge-token,user,ip-ban,bot}-repository.ts の全対象を置換
- authentication.steps.ts の「翌日になると日次リセットIDがリセットされる」シナリオでリグレッション発生 → `const today = new Date(Date.now())` が昨日モック時刻を返す問題を修正（`this.currentTime` の翌日を算出する方式に変更）

### テスト結果サマリー
- Vitest: 39ファイル / 1047テスト 全件PASS
- Cucumber.js: 228シナリオ（219 passed, 9 pending, 0 failed）

### テスト結果サマリー
