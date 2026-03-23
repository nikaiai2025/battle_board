---
task_id: TASK-252
sprint_id: Sprint-85
status: done
assigned_to: bdd-gate
created_at: 2026-03-21T23:10:00+09:00
updated_at: 2026-03-21T23:14:00+09:00
locked_files: []
---

## タスク概要

Sprint-85のPhase 5検証。ローカル環境で全テストスイートを実行し、合否判定する。

## 対象スプリント
- Sprint-85計画: `tmp/orchestrator/sprint_85_plan.md`

## 変更ファイル一覧（Sprint-85で変更された主要ファイル）
- src/lib/services/bot-service.ts（processPendingTutorials + tutorial BOT name）
- src/app/api/internal/bot/execute/route.ts（tutorials フィールド）
- src/app/(web)/mypage/page.tsx（PostHistorySection統合）
- src/app/(web)/mypage/_components/PostHistorySection.tsx（新規）
- features/step_definitions/welcome.steps.ts（新規）
- features/step_definitions/mypage.steps.ts（ページネーション/検索ステップ追加）
- features/step_definitions/common.steps.ts（seedDummyPost）
- features/support/mock-installer.ts + register-mocks.js（InMemoryPendingTutorialRepo登録）
- features/support/in-memory/bot-repository.ts（bulkReviveEliminated修正）
- features/support/in-memory/post-repository.ts（countByAuthorId追加）
- features/support/in-memory/pending-tutorial-repository.ts（新規）
- docs/architecture/components/bot.md, posting.md, currency.md（D-08更新）
- src/__tests__/lib/services/bot-service.test.ts, bot-execute.test.ts（単体テスト追加）
- cucumber.js（welcome.feature登録）

## 完了条件
- [x] 全テストスイート実行結果のレポート

## 作業ログ

### チェックポイント
- 状態: 完了

### テスト結果サマリー

| テスト種別 | 結果 | PASS/TOTAL | 所要時間 |
|---|---|---|---|
| 単体テスト (Vitest) | PASS | 1635/1635 (78ファイル) | 9.15s |
| BDD (Cucumber.js) | PASS | 274/290シナリオ (16 pending) | 1.3s |
| TypeScript (tsc --noEmit) | PASS | エラー 0件 | - |

**総合判定: PASS**

### 備考

BDD の 16 pending シナリオはすべて Sprint-85 以前から存在する既知の未実装ステップであり、今回の変更に起因する新規失敗はない。pending の内訳:

- UI ブラウザ操作系 (アンカーポップアップ・フォーム挿入・ポーリング): 8件 (thread.feature)
- インフラ系 (HTTP:80 直接応答・WAF): 3件 (specialist_browser_compat.feature)
- Discord OAuth 系: 2件 (user_registration.feature)
- 撃破済みBOT表示 UI 系: 2件 (bot_system.feature)
- 過去ページポーリング: 1件 (thread.feature)
