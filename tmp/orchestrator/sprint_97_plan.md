# Sprint-97 計画書

> 開始: 2026-03-22

## 目標

!newspaper コマンド実装（AI API統合 + Google Search Grounding + 非同期キュー）
練習コマンドシリーズの最終実装。

## 背景

練習コマンド④。③!aori で構築した pending_async_commands 基盤を再利用。
AI API (Gemini) との統合、Google Search Grounding によるWeb検索、GitHub Actions Cron による非同期処理を初実装する。

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-271 | bdd-architect | !newspaper設計詳細化（AI APIクライアント + Cron + NewspaperHandler設計） | なし | completed |
| TASK-272 | bdd-coding | !newspaper実装（ハンドラ + AI APIアダプタ + Cron + BDD 5シナリオ + 単体テスト） | TASK-271 | completed |

### 競合管理

直列実行（TASK-272はTASK-271の設計出力に依存）。

## 結果

### TASK-271: !newspaper設計詳細化
- 出力: `tmp/workers/bdd-architect_271/newspaper_design.md`（全7章）
- AI APIクライアント（@google/genai + Google Search Grounding）、NewspaperHandler、NewspaperService、Cron（GitHub Actions）、エラーハンドリング、InMemoryテスト、環境変数

### TASK-272: !newspaper実装
- 新規9ファイル: google-ai-adapter, newspaper-prompt, newspaper-categories, newspaper-handler, newspaper-service, APIルート, GitHub Actions, InMemoryモック, BDDステップ定義
- 変更4ファイル: commands.yaml/ts, command-service.ts, cucumber.js
- 単体テスト2ファイル: newspaper-handler.test.ts, newspaper-service.test.ts
- npm: @google/genai 追加
- テスト: BDD 313シナリオ(297 passed, 16 pending) / vitest 1724 passed
- エスカレーション1件（ESC-TASK-272-1: e2eテスト追加 → Phase 5で対応として解決）

### 人間タスク
- GEMINI_API_KEY の Vercel 環境変数設定が必要（!newspaper の非同期処理を本番で動作させるため）
