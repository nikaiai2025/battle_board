---
task_id: TASK-275
sprint_id: Sprint-100
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_275
depends_on: []
created_at: 2026-03-23T00:00:00+09:00
updated_at: 2026-03-23T00:00:00+09:00
locked_files: []
---

## タスク概要

newspaper非同期処理をD-07 §12.2「非同期処理の実行トポロジ」に準拠させるための移行設計。
現在Vercel API Route内で実行されているAI API呼び出し（Gemini + Google Search Grounding）を、GitHub Actions内に移動する設計書を作成する。

## 設計要件

### 原則（`.claude/rules/async-processing.md`）
- AI API 呼び出しを伴う非同期処理は Vercel/CF Workers 内で実行しない
- GitHub Actions ワークフロー内で AI API を直接呼び出し、生成済みの結果のみを Vercel API Route に送信する

### D-07 §12.2 の定義（既存。実装がこれに追いついていない）

| 処理 | AI API | 実行場所 | API向き先 |
|---|---|---|---|
| 新聞配達 (!newspaper) | **あり** (Gemini) | **GH Actions 内** | DEPLOY_URL → Vercel (結果書込のみ) |

### 設計で決めるべきこと

1. **GH Actions スクリプトの実装方式**: Node.jsスクリプト? シェルスクリプト+curl?
   - `google-ai-adapter.ts` をGH Actionsで再利用する方法
   - 依存パッケージ（`@google/genai`）のインストール方法
2. **Vercel API Routeの改修**: 現在の「AI呼び出し+DB書き込み」→「DB書き込みのみ」
   - リクエストボディの設計（生成済みテキスト、pendingId、threadId等）
   - エラー時のフロー（通貨返却・エラー通知の呼び出し元をどこに置くか）
3. **newspaper-service.ts の改修方針**: GH Actions側/Vercel側それぞれの責務分離
4. **秘密情報の配置**: GEMINI_API_KEYをGH Secretsに配置。Vercel側からは不要になる
5. **pending取得の方法**: GH ActionsからどうやってpendingリストをVercelに問い合わせるか
   - 案A: GET /api/internal/newspaper/pending → pending取得、POST /api/internal/newspaper/complete → 結果書込
   - 案B: 既存のPOSTエンドポイントをリクエストボディで動作分岐
6. **既存のBDDテストへの影響**: `features/command_newspaper.feature` のステップ定義への影響確認

## 必読ドキュメント（優先度順）
1. [必須] `.claude/rules/async-processing.md` — 新規ルール（設計の根拠）
2. [必須] `docs/architecture/architecture.md` §12.2 — 非同期処理の実行トポロジ
3. [必須] `src/lib/services/newspaper-service.ts` — 現行の処理ロジック
4. [必須] `src/app/api/internal/newspaper/process/route.ts` — 現行のAPI Route
5. [必須] `.github/workflows/newspaper-scheduler.yml` — 現行のGH Actionsワークフロー
6. [必須] `src/lib/infrastructure/adapters/google-ai-adapter.ts` — AI APIクライアント
7. [参考] `config/newspaper-prompt.ts` — プロンプト定義
8. [参考] `config/newspaper-categories.ts` — カテゴリ定義
9. [参考] `features/command_newspaper.feature` — BDDシナリオ
10. [参考] `.github/workflows/bot-scheduler.yml` — 既存のbot-scheduler（参考パターン）
11. [参考] `tmp/workers/bdd-architect_271/newspaper_design.md` — 元の設計書

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md` — 移行設計書
  - §1: GH Actionsスクリプト設計（実装方式・ファイル配置・依存管理）
  - §2: Vercel API Route改修設計（エンドポイント設計・リクエスト/レスポンス仕様）
  - §3: newspaper-service.ts 改修方針
  - §4: ワークフロー改修設計（newspaper-scheduler.yml）
  - §5: 秘密情報の配置変更
  - §6: BDDテスト影響分析
  - §7: 実装タスクの分解と対象ファイル一覧（TASK-276用のlocked_files確定含む）

## 完了条件
- [ ] 移行設計書が `artifacts_dir` に出力されている
- [ ] TASK-276（実装タスク）に必要な情報が全て含まれている

## スコープ外
- 実装作業（TASK-276で実施）
- BDDシナリオ（`features/`）の変更（不要のはず。変更が必要な場合はエスカレーション）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 移行設計書の全7セクション作成完了
- 次にすべきこと: なし（TASK-276 実装タスクへ引き継ぎ）
- 未解決の問題: なし

### 進捗ログ

**2026-03-23 設計開始**

1. 必読ドキュメント10件を読了。現状把握:
   - `newspaper-service.ts`: AI呼び出し + createPost + pending削除を一貫実行する `processNewspaperCommands`
   - `process/route.ts`: GoogleAiAdapter を初期化し processNewspaperCommands に DI 注入
   - `newspaper-scheduler.yml`: curl で POST トリガーのみ（AI処理は Vercel 側）
   - `google-ai-adapter.ts`: Vercel/Next.js に依存しない純粋な API クライアント
   - `command_newspaper.steps.ts`: processNewspaperCommands を DI 付きで直接呼出（HTTP 層を経由しない）

2. 設計判断:
   - GH Actions スクリプト方式: **Node.js (tsx)** を採用。google-ai-adapter.ts を変更なしで再利用可能
   - エンドポイント設計: **案A（GET pending + POST complete の分離）** を採用。SRP 準拠
   - newspaper-service.ts: `completeNewspaperCommand` を新設。旧 `processNewspaperCommands` はBDDテスト互換のため残置
   - BDDシナリオ/ステップ定義: 変更不要（HTTP 層を経由しないテスト設計のため影響なし）

3. 成果物出力: `tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md`
