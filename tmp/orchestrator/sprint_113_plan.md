# Sprint-113 計画書

> 作成: 2026-03-24

## 目的

BOT情報漏洩修正（LEAK-1/2/3）。設計書 `tmp/design_bot_leak_fix.md` に基づき、BOTが無コスト〜低コストで識別されてしまうバグ3件を修正する。

## スコープ

| ID | 問題 | 修正方針 |
|---|---|---|
| LEAK-1 | `!w` でBOTの草カウントが常に「計0本」 | BOTにも草カウントを保持・加算 |
| LEAK-2 | `!hissi` でBOT書き込みに「対象にできません」 | dailyIdベースで書き込み履歴を返す |
| LEAK-3 | `!kinou` でBOT書き込みに「対象にできません」 | dailyIdベースで昨日のID情報を返す |

追加: 専ブラ向けedgeTokenボディフォールバック（人間実装済み、コミットのみ）

## BDDシナリオ（人間承認済み v4/v2）

- `features/reactions.feature` — 「ボットへの草でも正しい草カウントが表示される」
- `features/investigation.feature` — 「ボットの書き込みに !hissi を実行すると書き込み履歴が表示される」
- `features/investigation.feature` — 「ボットの書き込みに !kinou を実行すると昨日のID情報が表示される」

## タスク分解

| TASK_ID | 内容 | 担当 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-307 | LEAK-1: BOT草カウント修正（migration + handler + repo + tests） | bdd-coding | なし | completed |
| TASK-308 | LEAK-2/3: 調査コマンドBOT対応（migration + handler×2 + repo + DI + tests） | bdd-coding | なし | completed |

※ locked_files重複なし → 並行実行

## 結果

### TASK-307 (LEAK-1)
- migration 00029 + Bot model + GrassRepository + GrassHandler 修正
- 単体テスト: grass-handler 28/28 PASS（BOTパス7件追加）
- BDD「ボットへの草でも正しい草カウントが表示される」PASS

### TASK-308 (LEAK-2/3)
- migration 00030 + PostRepository.findByDailyId + HissiHandler/KinouHandler BOT対応 + command-service DI
- 単体テスト: hissi-handler 19/19 PASS, kinou-handler 17/17 PASS
- BDD「ボットの書き込みに !hissi」PASS, 「ボットの書き込みに !kinou」PASS
- BDDステップ定義重複排除（reactions.steps.ts → investigation.steps.ts に共有ステップ移管）

### テスト結果（Sprint-113完了時点）
- Vitest: 1782/1786 PASS（4件はregistration-service loginWithEmail環境依存、Sprint-113以前から存在）
- Cucumber: 322/344 passed, 6 failed, 16 pending
  - 6 failed はSpring-113以前の既存問題（user_registration ×4 + theme ×2）、本スプリント未変更ファイル

### 追加コミット対象
- 専ブラ向けedgeTokenボディフォールバック（auth/verify route.ts + テスト）— 人間実装済み
