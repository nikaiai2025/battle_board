# Sprint-43 計画書

> 作成日: 2026-03-17
> ステータス: completed

## スプリント目標

BOT Strategy移行 Step 1・2を実施し、荒らし役の固定実装をStrategyパターンにリファクタリングする。
外部振る舞いの変更はなく、既存テスト全PASSが検証基準。

## 背景

Sprint-42でbot.md v6にStrategy パターン設計が確定した（TDR-008）。
現在の`executeBotPost`/`selectTargetThread`/`getNextPostDelay`は荒らし役専用のハードコードだが、
Phase 3以降のBOT種別（ネタ師等）に対応するため、Strategy インターフェースを導入し既存ロジックを切り出す。

4ステップ移行計画のうちStep 1・2を本スプリントで実施する:
- Step 1: Strategy インターフェース定義 + 荒らし役の3 Strategy切り出し（新規ファイル作成のみ）
- Step 2: BotService.executeBotPost を Strategy 委譲にリファクタ（bot-service.ts改修）

Step 3（スキーマ拡張）・Step 4（ネタ師実装）はBOT詳細定義後に着手。

## タスク一覧

| TASK_ID | 内容 | 担当 | 依存 | locked_files | 状態 |
|---|---|---|---|---|---|
| TASK-126 | Strategy インターフェース定義 + 荒らし役3 Strategy切り出し + 単体テスト | bdd-coding | - | [NEW] src/lib/services/bot-strategies/*, [NEW] src/__tests__/lib/services/bot-strategies/* | **completed** |
| TASK-127 | BotService を Strategy 委譲にリファクタ + テスト更新 | bdd-coding | TASK-126 | src/lib/services/bot-service.ts, src/__tests__/lib/services/bot-service.test.ts, features/step_definitions/bot_system.steps.ts | **completed** |

## 結果

| TASK_ID | 結果 | 備考 |
|---|---|---|
| TASK-126 | completed | vitest 1094 PASS（+33新規）, cucumber 221 passed / 7 pending。新規ファイル9件作成 |
| TASK-127 | completed | vitest 1094 PASS, cucumber 221 passed / 7 pending。executeBotPost/selectTargetThread/getNextPostDelay を Strategy 委譲に書き換え。getFixedMessages削除 |
