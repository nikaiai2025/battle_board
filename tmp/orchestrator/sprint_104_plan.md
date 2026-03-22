# Sprint-104 計画書

> 開始: 2026-03-23

## 目標

!livingbot v2: スレッド内カウント拡張。設計書 §6 に基づく実装。

## 背景

featureがv2に更新され、!livingbotの出力に「このスレッド: N体」が追加された。
設計書 `tmp/workers/bdd-architect_277/livingbot_design.md` §6 で設計済み。

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-281 | bdd-coding | !livingbot v2 スレッド内カウント実装 | なし | assigned |

### TASK-281 locked_files
- src/lib/infrastructure/repositories/bot-repository.ts
- src/lib/services/handlers/livingbot-handler.ts
- features/support/in-memory/bot-repository.ts
- features/step_definitions/command_livingbot.steps.ts
- src/__tests__/lib/services/handlers/livingbot-handler.test.ts

## 結果

（実行後に記載）
