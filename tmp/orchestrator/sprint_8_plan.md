# Sprint-8 計画: Step 7.5 — BDD負債返済

## 概要

Step 1〜7で単体テスト（vitest）のみで品質を担保してきたが、BDDステップ定義（Cucumber.js）は未実装。
本スプリントでStep 1〜7に対応する全BDDシナリオのステップ定義を実装し、`npx cucumber-js` でGREENにする。

## 対象featureファイルとスコープ

| feature | シナリオ数 | 対象範囲 | 備考 |
|---|---|---|---|
| authentication.feature | 8/10 | Step 4対応分 | 管理者シナリオ2件はStep 8スコープのため除外 |
| posting.feature | 4/4 | 全シナリオ | Step 5対応 |
| thread.feature | 11/11 | 全シナリオ | Step 5/7対応 |
| currency.feature | 3/4 | Step 5対応分 | 「マイページで残高確認」はStep 10スコープのため除外 |
| incentive.feature | 30/30 | 全シナリオ | Step 6対応 |
| **合計** | **56/59** | | |

除外（他Stepスコープ）:
- admin.feature → Step 8
- mypage.feature → Step 10
- authentication.feature 管理者シナリオ2件 → Step 8
- currency.feature マイページシナリオ1件 → Step 10

## タスク分解

| TASK_ID | 内容 | 担当 | depends_on | ステータス |
|---|---|---|---|---|
| TASK-015 | BDDテスト戦略・インフラ設計 | bdd-architect | — | assigned |
| TASK-016 | BDDインフラ実装 + 共通ステップ定義 | bdd-coding | TASK-015 | pending |
| TASK-017 | authentication + posting + thread + currency ステップ定義 | bdd-coding | TASK-016 | pending |
| TASK-018 | incentive ステップ定義 | bdd-coding | TASK-016 | pending |

※ TASK-017 と TASK-018 は locked_files 重複なしのため並行実行可能

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-015 | | |
| TASK-016 | | |
| TASK-017 | | |
| TASK-018 | | |
