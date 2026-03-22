---
task_id: TASK-271
sprint_id: Sprint-97
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_271
depends_on: []
created_at: 2026-03-22T19:00:00+09:00
updated_at: 2026-03-22T19:00:00+09:00
locked_files:
  - "[NEW] tmp/workers/bdd-architect_271/newspaper_design.md"
---

## タスク概要

!newspaper コマンド（最新ニュース取得）の実装に必要な設計詳細化を行う。AI APIクライアント（Gemini + Google Search Grounding）、GitHub Actions Cron、NewspaperHandler の実装仕様を `newspaper_design.md` に出力する。

## 対象BDDシナリオ
- `features/command_newspaper.feature` @全5シナリオ

## 必読ドキュメント（優先度順）
1. [必須] `features/command_newspaper.feature` — 対象シナリオ（5件）
2. [必須] `docs/architecture/components/command.md` §5 — 非同期副作用のキューイングパターン
3. [必須] `tmp/orchestrator/practice_commands_implementation_guide.md` §3 — !newspaper実装スコープ
4. [必須] `docs/architecture/architecture.md` — TDR-013（Cron配置）、TDR-015（Gemini採用）
5. [参考] `src/lib/services/handlers/aori-handler.ts` — 非同期キュー使用ハンドラの実装パターン
6. [参考] `src/lib/infrastructure/repositories/pending-async-command-repository.ts` — pending_async_commands Repository（再利用）
7. [参考] `src/lib/services/bot-service.ts` の processAoriCommands() — Cron処理パターン
8. [参考] `tmp/workers/bdd-architect_269/aori_design.md` — !aori設計書（参考）
9. [参考] `.github/workflows/` — 既存のGitHub Actionsワークフロー

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_271/newspaper_design.md` — 設計書

## 設計で確定すべき事項

### 1. AI APIクライアント設計
- ファイル配置: `src/lib/infrastructure/adapters/google-ai-adapter.ts`（TDR-015準拠）
- Gemini 3 Flash Preview の API呼び出し仕様
- Google Search Grounding の使用方法（Web検索結果をコンテキストとして注入）
- システムプロンプト設計（新聞配達員の人格 + カテゴリ指示 + フォーマット指示）
- リトライ戦略（失敗時の再試行回数・バックオフ）
- エラーハンドリング: 全試行失敗 → 通貨返却 + ★システムエラー通知

### 2. NewspaperHandler の実装仕様
- 同期処理部分: pending_async_commands にINSERT（!aoriと同パターン）
- commands.yaml エントリ（stealth: false。コマンド文字列は本文に残る）
- カテゴリランダム選択のタイミング: ハンドラ内（pending INSERT時）or Cron処理時
- payload の構造: `{"category": "IT", "model_id": "gemini-3-flash-preview"}` 等

### 3. Cron処理設計（GitHub Actions）
- TDR-013準拠: AI API使用 → GitHub Actions（CF Cronではない）
- 新規ワークフロー? or 既存のbot-schedulerに統合?
- 処理エンドポイント: `/api/internal/newspaper/process` (新規?) or 既存ルート拡張?
- 処理フロー: pending読取 → AI API呼出 → ★システムレス投稿 → pending削除
- 通貨返却処理（API失敗時）

### 4. 環境変数
- `GEMINI_API_KEY` の配置先（GitHub Actions secrets? Vercel env? CF Workers env?）
- API呼び出しはどこで実行されるか（Vercelサーバー? GitHub Actions内?）

### 5. InMemoryテスト対応
- AI APIのモック戦略（BDDテストではAI APIを呼ばない）
- カテゴリランダム選択の決定論的テスト方法
- pending_async_commands は既存InMemory Repositoryを再利用

### 6. BOTではないことの明確化
- 結果は★システム名義の独立レスで表示
- BOTエンティティは生成しない
- ステルスではない（コマンド文字列は本文に残る）

## スコープ外
- !hiroyuki の設計（将来フェーズ）
- GEMINI_API_KEY の実際のGCP設定（人間タスク）

## 完了条件
- [x] `newspaper_design.md` が上記6項目を網羅している
- [x] コーディングタスク（TASK-272）が着手可能な粒度になっている

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全6項目の設計確定、実装チェックリスト作成
- 次にすべきこと: なし（TASK-272 コーディングタスクへ引き継ぎ）
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-22 設計完了

**読み込んだドキュメント:**
- features/command_newspaper.feature（5シナリオ）
- docs/architecture/components/command.md（SS5 非同期キューイングパターン）
- tmp/orchestrator/practice_commands_implementation_guide.md（SS3 !newspaper スコープ）
- docs/architecture/architecture.md TDR-013（Cron配置）、TDR-015（Gemini採用）
- src/lib/services/handlers/aori-handler.ts（参考実装パターン）
- src/lib/infrastructure/repositories/pending-async-command-repository.ts
- src/lib/services/bot-service.ts processAoriCommands()（Cron処理パターン）
- tmp/workers/bdd-architect_269/aori_design.md（!aori設計書）
- .github/workflows/bot-scheduler.yml（既存ワークフロー）
- config/commands.yaml（既存コマンド定義）
- features/support/mock-installer.ts（InMemoryモック構成）
- features/support/in-memory/pending-async-command-repository.ts
- Gemini API公式ドキュメント（Google Search Grounding仕様）

**設計成果物:** `tmp/workers/bdd-architect_271/newspaper_design.md`（全7章）

**主な設計判断:**
1. AI APIクライアント: `@google/genai` の `GoogleGenAI` + `googleSearch` ツール。リトライ3回（指数バックオフ）
2. NewspaperHandler: pending INSERT時にカテゴリ選択。CategorySelector DI可能。stealth: false
3. Cron処理: 新規エンドポイント `/api/internal/newspaper/process` + `newspaper-scheduler.yml`。BotServiceから分離
4. エラーハンドリング: 全試行失敗 -> CurrencyService.credit で通貨返却 -> ★システムエラー通知 -> pending削除
5. InMemoryテスト: InMemoryGoogleAiAdapter（DI注入）。mock-installer不要
6. 環境変数: GEMINI_API_KEY は Vercel 環境変数のみ。GitHub Actions は curl トリガーのため不要
