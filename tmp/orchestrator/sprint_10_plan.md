# Sprint-10 計画: Step 10 (マイページ + 仕上げ) + 時刻制御リファクタ

## 概要

Phase 1最終スプリント。Step 10（マイページ機能）を実装し、Sprint-8で除外していたcurrency.featureマイページシナリオ1件を含め、mypage.feature全8シナリオのBDDステップ定義を作成する。あわせて、D-10 §5.2で定めた時刻制御ベストプラクティスに既存テストコードを準拠させるリファクタリングを行う。

## 対象featureファイルとスコープ

| feature | シナリオ数 | 備考 |
|---|---|---|
| mypage.feature | 8 | 全シナリオ |
| currency.feature (マイページ残高確認) | 1 | Sprint-8で除外していたシナリオ |
| **合計** | **9** | |

### 追加: 時刻制御リファクタ

- incentive.steps.tsの`Date.now() - offset`パターンを時計凍結パターンに書き換え
- flakyテスト（「最終レスが24時間以内のスレッドでは低活性判定にならない」）の根本対応

## タスク分解

| TASK_ID | 内容 | 担当 | depends_on | ステータス | locked_files |
|---|---|---|---|---|---|
| TASK-025 | MypageService + マイページAPI + UI実装 | bdd-coding | — | completed | `src/lib/services/mypage-service.ts` [NEW], `src/app/api/mypage/**` [NEW], `src/app/(web)/mypage/**` [NEW], `src/lib/infrastructure/repositories/user-repository.ts` |
| TASK-026 | mypage.feature + currency.featureマイページ BDDステップ定義 | bdd-coding | TASK-025 | assigned | `features/step_definitions/mypage.steps.ts` [NEW], `features/step_definitions/currency.steps.ts`, `cucumber.js`, `features/support/world.ts`, `features/support/hooks.ts`, `features/support/mock-installer.ts`, `features/support/register-mocks.js` |
| TASK-027 | 時刻制御リファクタ（incentive.steps.ts） | bdd-coding | — | completed | `features/step_definitions/incentive.steps.ts` |

### 並行可否分析

```
TASK-025 → TASK-026  (マイページ実装 → BDDステップ定義)
TASK-027             (独立、並行可能)

locked_files重複: なし

並行スケジュール:
  Wave 1: TASK-025 (マイページ実装) || TASK-027 (時刻リファクタ)
  Wave 2: TASK-026 (マイページBDD)
```

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-025 | completed | MypageService + API4本 + UI。vitest 468件PASS |
| TASK-026 | completed | mypage BDD 9シナリオ追加。BDD 87シナリオPASS、vitest 468件PASS |
| TASK-027 | completed | 時刻凍結パターン適用。BDD 78シナリオ3回連続PASS、flakyテスト解消 |
