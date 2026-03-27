# Sprint-130 計画書

## 目的

`!hiroyuki` コマンド実装 — ひろゆき風AI BOTを召喚するコマンド。
Gemini APIでひろゆき風テキストを生成し、使い切りBOTが「名無しさん」として投稿する。

## 背景

- feature承認済み: `features/command_hiroyuki.feature` (8シナリオ)
- 設計メモ: `tmp/orchestrator/memo_hiroyuki_command.md`
- 準備済み: `config/commands.yaml` 更新済み、`config/hiroyuki-prompt.ts` 作成済み

## アーキテクチャ決定

**AI API呼び出しはGH Actions内で実行する**（`.claude/rules/async-processing.md` 準拠）。
newspaperコマンドと同一のGH Actions Worker + pending/complete API方式を採用。

```
Vercel: !hiroyuki 受理 → pending INSERT → workflow_dispatch で GH Actions 起動
GH Actions: pending取得 → スレッド全レス取得 → Gemini generate() → /complete に結果送信
Vercel: /complete で BOT生成 + BOT投稿（or エラー時: 通貨返却 + システム通知）
```

※メモではbot-service.ts内Cron処理を想定しているが、AI APIタイムアウト制約によりnewspaper方式に変更。

## タスク

| TASK_ID | 内容 | 担当 | モデル | 依存 | 状態 |
|---|---|---|---|---|---|
| TASK-334 | 基盤実装（Adapter + Handler + Config + Profile） | bdd-coding | sonnet | なし | **completed** (1983テスト全PASS) |
| TASK-335 | AI連携 + Complete + GHA Worker + BDD/E2Eテスト | bdd-coding | opus | TASK-334 | **completed** (2002テスト全PASS, BDD 8/8 PASS) |

### locked_files

**TASK-334:**
- `src/lib/infrastructure/adapters/google-ai-adapter.ts`
- `[NEW] src/lib/services/handlers/hiroyuki-handler.ts`
- `src/lib/services/command-service.ts`
- `config/bot_profiles.yaml`
- `[NEW] src/__tests__/lib/services/handlers/hiroyuki-handler.test.ts`
- `[NEW] src/__tests__/lib/infrastructure/adapters/google-ai-adapter-generate.test.ts`

**TASK-335:**
- `[NEW] src/lib/services/hiroyuki-service.ts`
- `[NEW] src/app/api/internal/hiroyuki/pending/route.ts`
- `[NEW] src/app/api/internal/hiroyuki/complete/route.ts`
- `[NEW] scripts/hiroyuki-worker.ts`
- `[NEW] .github/workflows/hiroyuki-scheduler.yml`
- `.github/workflows/ci-failure-notifier.yml`
- `[NEW] features/step_definitions/command_hiroyuki.steps.ts`
- `e2e/flows/basic-flow.spec.ts`
- `[NEW] src/__tests__/lib/services/hiroyuki-service.test.ts`

## 結果

### TASK-334: 基盤実装（完了）
- google-ai-adapter.ts: `generate()` メソッド + `_callGeminiApiWithoutSearch()` 追加
- hiroyuki-handler.ts: ターゲットあり/なし両対応、削除済み/システムメッセージバリデーション
- command-service.ts: ハンドラ登録 + workflow_dispatch トリガー追加
- bot_profiles.yaml: hiroyuki エントリ（HP:10, reward:10）
- 新規テスト37件（handler 25 + adapter 12）、全1983テストPASS

### TASK-335: AI連携 + GHA + テスト（完了）
- hiroyuki-service.ts: completeHiroyukiCommand（成功パス: BOT生成+投稿、失敗パス: 通貨返却+通知）
- API routes: /api/internal/hiroyuki/pending + /complete
- scripts/hiroyuki-worker.ts: GH Actions Worker（pending取得→AI生成→complete送信）
- hiroyuki-scheduler.yml + ci-failure-notifier.yml 更新
- BDDステップ定義: 全8シナリオPASS
- E2E: basic-flow.spec.ts に hiroyuki テスト追加
- 単体テスト19件追加、全2002テストPASS

### エスカレーション ESC-TASK-335-1（解決済み）
- カテゴリA: TASK-334の未完成成果物3件（InMemoryAdapter, cucumber.js, commands.ts）→ 補完承認
- カテゴリB: aori/newspaperステップの汎化修正 → 選択肢1採用（自律判断）

### テスト最終結果
- vitest: 2002テスト 全PASS
- cucumber-js hiroyuki: 8/8 PASS
- cucumber-js全体: 342 passed, 16 pending（hiroyuki起因の回帰なし）
- pre-existing: copipe 8 failed, thread 5 undefined（本スプリント起因ではない）
