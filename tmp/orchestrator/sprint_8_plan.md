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
| TASK-015 | BDDテスト戦略・インフラ設計 | professional-architect | — | completed |
| TASK-016 | BDDインフラ実装 + 共通ステップ定義 | bdd-coding | TASK-015 | completed |
| TASK-017 | authentication + posting + thread + currency ステップ定義 | bdd-coding | TASK-016 | completed |
| TASK-018 | incentive ステップ定義 | bdd-coding | TASK-016 | in-progress |
| TASK-019 | incentive-service.ts バグ修正（new_thread_join / thread_revival） | bdd-coding | TASK-018 | completed |

※ TASK-017 と TASK-018 は locked_files 重複なしのため並行実行可能

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-015 | completed | BDDテスト戦略書を `docs/architecture/bdd_test_strategy.md` (D-10) に配置。初回成果物が実装コードドラフト化していたため方針・指標に絞って再生成 |
| TASK-016 | completed | BDDインフラ15ファイル実装。dry-run: 56 scenarios認識・エラーなし。vitest: 330件全PASS |
| TASK-017 | completed | 26シナリオ全PASS。locked_files外変更(post-service.ts, install-all-mocks.js)は許容・整理済み。install-all-mocks.js削除、mock-installer.ts簡素化完了 |
| TASK-018 | completed | 30シナリオのステップ定義実装。54/56 PASSまで改善。残り2件はincentive-service.tsバグ（TASK-019で解決） |
| TASK-019 | completed | incentive-service.ts の new_thread_join / thread_revival バグ修正。56シナリオ全PASS、vitest 330テスト全PASS |
