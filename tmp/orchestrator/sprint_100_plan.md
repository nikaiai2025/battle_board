# Sprint-100 計画書

> 開始: 2026-03-23

## 目標

newspaper非同期処理のアーキテクチャ修正: AI API呼び出しをVercel API Route内からGitHub Actions内に移動する。

## 背景

`.claude/rules/async-processing.md` および D-07 §12.2「非同期処理の実行トポロジ」の原則:
> AI API 呼び出し（Gemini等）を伴う非同期処理は、Vercel/CF Workers 内で実行しない。
> GitHub Actions ワークフロー内で AI API を直接呼び出し、生成済みの結果のみを Vercel API Route に送信すること。

現状のnewspaper実装は Vercel API Route 内で `GoogleAiAdapter` を生成し Gemini API を呼び出しているため、この原則に違反している。

## 現状のフロー（違反）

```
GH Actions (curl) → Vercel API Route → [GoogleAiAdapter → Gemini API] → DB書き込み
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                        ここがVercel内で実行されている（違反）
```

## あるべきフロー

```
GH Actions → [Node.js script → GoogleAiAdapter → Gemini API] → curl → Vercel API Route → DB書き込みのみ
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
             AI APIはGH Actions内で完結
```

## 設計方針

1. GitHub Actions内でNode.jsスクリプトを実行し、Gemini APIを呼び出す
2. 生成済みテキストをVercel API Route `/api/internal/newspaper/process` にPOSTする
3. Vercel API Routeは受け取ったテキストをDB書き込み（投稿作成 + pending削除）するのみ
4. GEMINI_API_KEYはGitHub Secrets に配置（Vercel環境変数からは不要に）
5. エラー時の通貨返却・エラー通知もGH Actions→Vercel APIの流れで処理

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-275 | bdd-architect | newspaper非同期処理のGH Actions移行設計 | なし | completed |
| TASK-276 | bdd-coding | 設計に基づく実装 | TASK-275 | completed |

### 競合管理

TASK-275/276は直列実行（設計→実装の依存関係）。

#### TASK-275 locked_files
- (設計タスクのためロック不要。出力先: `tmp/workers/bdd-architect_275/`)

#### TASK-276 locked_files（暫定。設計完了後に確定）
- `.github/workflows/newspaper-scheduler.yml`
- `src/app/api/internal/newspaper/process/route.ts`
- `src/lib/services/newspaper-service.ts`
- "[NEW] scripts/newspaper-process.ts" (仮)

## 結果

### TASK-275: 移行設計（bdd-architect）
- 設計書出力: `tmp/workers/bdd-architect_275/newspaper_gh_actions_migration.md`（全7章）
- GH Actions Node.js (tsx)方式、GET /pending + POST /complete 分離、completeNewspaperCommand 新設

### TASK-276: 実装（bdd-coding）
- newspaper-service.ts: `completeNewspaperCommand` 追加、`INewspaperCompleteDeps` 新設
- GET /api/internal/newspaper/pending: 新規作成
- POST /api/internal/newspaper/complete: 新規作成
- scripts/newspaper-worker.ts: 新規作成（GH Actions内でAI API呼び出し）
- newspaper-scheduler.yml: checkout → setup-node → npm ci → tsx 実行に改修
- 旧 process/route.ts: ゴミ箱に移動
- 単体テスト: completeNewspaperCommand 10件追加、全25件PASS
- テスト: vitest 1734 passed / BDD 297 passed — 回帰なし
- 人間タスク: GEMINI_API_KEY を GH Secrets に設定（Vercel環境変数からGH Secretsに移動）
