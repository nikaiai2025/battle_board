# Sprint-93 計画書

> 開始: 2026-03-22

## 目標

1. cron 500エラー修正（BOT書き込み時のIncentiveService誤呼び出し）
2. !omikuji コマンド実装（ターゲット任意パターンの初実装）
3. !iamsystem ステルス基盤の設計詳細化

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-263 | bdd-coding | cron 500修正（post-service.ts + route.ts） | なし | completed |
| TASK-264 | bdd-coding | !omikuji 実装（ハンドラ + BDD + 単体テスト） | なし | completed |
| TASK-265 | bdd-architect | !iamsystem 設計詳細化（ステルス除去 + フィールド上書き） | なし | completed |

### 競合管理

| ファイル | TASK-263 | TASK-264 | TASK-265 |
|---|---|---|---|
| `src/lib/services/post-service.ts` | LOCK | - | - |
| `src/app/api/internal/bot/execute/route.ts` | LOCK | - | - |
| `config/commands.yaml` | - | LOCK | - |
| `src/lib/services/handlers/omikuji-handler.ts` [NEW] | - | LOCK | - |
| `features/step_definitions/command_omikuji.steps.ts` [NEW] | - | LOCK | - |
| `docs/architecture/components/command.md` | - | - | LOCK |

→ 競合なし。3タスク並行起動可能。

## 結果

### TASK-263: cron 500修正
- post-service.ts: `!input.isBotWrite` ガード追加（L533同期 + L683遅延）
- route.ts: `processPendingTutorials()` 個別try-catch
- テスト追加: post-service.test.ts + bot-execute.test.ts
- 全テスト: 1655 PASS

### TASK-264: !omikuji 実装
- 新規: omikuji-handler.ts（100件結果セット）、command_omikuji.steps.ts（5ステップ）、omikuji-handler.test.ts（13件）
- 変更: commands.yaml + commands.ts、command-service.ts（登録）、cucumber.js、command_system.steps.ts（バグ修正）、basic-flow.spec.ts（E2E追加）
- テスト: vitest 1668 PASS (81 files) / BDD 278 passed (全4シナリオPASS)

### TASK-265: !iamsystem 設計
- 出力: `tmp/workers/bdd-architect_265/iamsystem_design.md`
- D-08 command.md に「ステルスの実装メカニズム」追記
- 設計要点: CommandExecutionResult 3フィールド追加、PostService Step 5.5 新設、影響ファイル5件
