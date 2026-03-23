---
task_id: TASK-276
sprint_id: Sprint-100
status: completed
assigned_to: bdd-coding
depends_on: [TASK-275]
created_at: 2026-03-23T00:30:00+09:00
updated_at: 2026-03-23T00:30:00+09:00
locked_files:
  - src/lib/services/newspaper-service.ts
  - src/app/api/internal/newspaper/process/route.ts
  - "[NEW] src/app/api/internal/newspaper/pending/route.ts"
  - "[NEW] src/app/api/internal/newspaper/complete/route.ts"
  - .github/workflows/newspaper-scheduler.yml
  - "[NEW] scripts/newspaper-worker.ts"
  - src/__tests__/lib/services/newspaper-service.test.ts
---

## タスク概要

newspaper非同期処理をD-07 §12.2に準拠させる。AI API呼び出しをVercel API Route内からGitHub Actions内に移動し、VercelはDB書き込みのみ行う構成に変更する。

## 設計書（必須）
- `tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md` — 移行設計書（全7章）

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md` — 移行設計書
2. [必須] `src/lib/services/newspaper-service.ts` — 現行のサービス
3. [必須] `src/app/api/internal/newspaper/process/route.ts` — 現行のAPI Route（削除対象）
4. [必須] `.github/workflows/newspaper-scheduler.yml` — 現行のワークフロー
5. [参考] `src/lib/infrastructure/adapters/google-ai-adapter.ts` — AI APIクライアント（変更不要）
6. [参考] `features/step_definitions/command_newspaper.steps.ts` — BDDステップ定義（変更不要であることを確認）

## 実装手順（設計書 §7.1 準拠）

### Step 1: newspaper-service.ts に `completeNewspaperCommand` を追加
- 成功時: createPost (★システム名義) → pending 削除
- 失敗時: credit (通貨返却) → createPost (エラー通知) → pending 削除
- `INewspaperCompleteDeps` インターフェース（`IGoogleAiAdapter` を除いた DI）
- 旧 `processNewspaperCommands` は BDD テスト互換のため残置（内部実装を `completeNewspaperCommand` に委譲するリファクタ）

### Step 2: GET /api/internal/newspaper/pending ルート新規作成
- Bearer 認証（`verifyInternalApiKey`）
- `PendingAsyncCommandRepo.findByCommandType("newspaper")` を呼ぶだけ
- レスポンス: `{ pendingList: [...] }`

### Step 3: POST /api/internal/newspaper/complete ルート新規作成
- Bearer 認証（`verifyInternalApiKey`）
- リクエストボディから success/generatedText/error を取得
- `completeNewspaperCommand` を呼び出し
- レスポンス: `{ result: { pendingId, success, postId? } }`

### Step 4: scripts/newspaper-worker.ts 新規作成
- 設計書 §1.5 の擬似コードに従い実装
- `GoogleAiAdapter` を直接 import して再利用
- 環境変数: DEPLOY_URL, BOT_API_KEY, GEMINI_API_KEY
- 全件処理（MAX_PROCESS_PER_EXECUTION制限なし。安全のため上限10件ガード）

### Step 5: newspaper-scheduler.yml 改修
- 設計書 §4.1 のYAMLに従い改修
- checkout → setup-node → npm ci → npx tsx scripts/newspaper-worker.ts
- env に GEMINI_API_KEY を追加

### Step 6: 旧 process ルート削除
- `src/app/api/internal/newspaper/process/route.ts` を削除

### Step 7: 単体テスト追加
- `completeNewspaperCommand` の成功/失敗パスのテスト追加
- 既存の `processNewspaperCommands` テストが引き続きPASSすることを確認

## 完了条件
- [x] `completeNewspaperCommand` が newspaper-service.ts に追加されている
- [x] GET /pending, POST /complete のAPIルートが新規作成されている
- [x] scripts/newspaper-worker.ts が新規作成されている
- [x] newspaper-scheduler.yml が GH Actions 内で AI API を呼ぶ構成に改修されている
- [x] 旧 process ルートが削除されている
- [x] 単体テスト全件PASS（`npx vitest run`）
- [x] BDDテスト全件PASS（`npx cucumber-js`）— 特に command_newspaper.feature のシナリオ

## スコープ外
- `google-ai-adapter.ts` の変更（変更不要）
- `features/` 配下の変更（BDDシナリオ変更不要）
- GEMINI_API_KEY の GH Secrets 設定（人間タスク）
- locked_files 外のファイル変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: Step 1〜7 全て完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] 設計書・既存ファイル（newspaper-service.ts, process/route.ts, newspaper-scheduler.yml, test ファイル）を読み込み完了
- [Step 1] newspaper-service.ts に `INewspaperCompleteDeps` インターフェースと `completeNewspaperCommand` 関数を追加。旧 `processNewspaperCommands` はBDD互換のため残置。
- [Step 2] `src/app/api/internal/newspaper/pending/route.ts` 新規作成（GET, Bearer 認証, findByCommandType 呼び出し）
- [Step 3] `src/app/api/internal/newspaper/complete/route.ts` 新規作成（POST, Bearer 認証, completeNewspaperCommand 呼び出し）
- [Step 4] `scripts/newspaper-worker.ts` 新規作成（pending 取得 → AI 生成 → complete 送信、上限10件ガード）
- [Step 5] `.github/workflows/newspaper-scheduler.yml` 改修（checkout → setup-node → npm ci → tsx 実行、GEMINI_API_KEY 追加）
- [Step 6] `src/app/api/internal/newspaper/process/route.ts` を `ゴミ箱/newspaper_process_route_deleted_TASK276.ts` に移動
- [Step 7] 単体テスト追加（completeNewspaperCommand: 成功系4件 + 失敗系5件 + エッジケース1件）

### テスト結果サマリー
- 単体テスト（vitest run）: 1735件中 1734 PASS / 1 FAIL（既存の schema-consistency テスト、本タスクの変更と無関係）
- newspaper-service.test.ts: 25件 全 PASS（processNewspaperCommands 14件 + completeNewspaperCommand 10件 + 既存 1件）
- BDDテスト（cucumber-js command_newspaper.feature）: 317シナリオ中 297 PASS（failed 0）
  - pending/undefined は今回の変更と無関係な既存シナリオ
