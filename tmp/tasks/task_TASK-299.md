---
task_id: TASK-299
sprint_id: Sprint-111
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T23:30:00+09:00
updated_at: 2026-03-24T23:30:00+09:00
locked_files:
  - "[NEW] src/lib/infrastructure/adapters/github-workflow-trigger.ts"
  - src/lib/services/command-service.ts
  - .github/workflows/newspaper-scheduler.yml
  - .github/workflows/ci-failure-notifier.yml
  - "[NEW] src/__tests__/lib/infrastructure/adapters/github-workflow-trigger.test.ts"
---

## タスク概要

非同期コマンド（`!newspaper` 等）の pending INSERT 直後に GitHub Actions を即時起動する仕組みを導入する。
現状は cron（30分間隔）でのポーリングのため、ユーザーがコマンドを実行してから最大30分の遅延が発生している。
本タスクでは pending リポジトリのデコレータパターンにより、対象 commandType の INSERT 時に `workflow_dispatch` を fire-and-forget で発火する。

併せて CI Failure Notifier の既知バグ（権限不足で Issue 起票が失敗する）も修正する。

## 対象BDDシナリオ

既存シナリオの変更なし。BDD では「非同期処理が実行される」としか規定しておらず、タイミングは未指定。

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/architecture.md` — TDR-017（本タスクの設計根拠）、§12.2（定期ジョブ一覧・非同期処理トポロジ）
2. [必須] `src/lib/services/command-service.ts` — NewspaperHandler / AoriHandler の pendingRepo 解決箇所（L539-570）
3. [必須] `src/lib/services/handlers/newspaper-handler.ts` — 現在の pending INSERT フロー
4. [参考] `.github/workflows/newspaper-scheduler.yml` — 変更対象のワークフロー
5. [参考] `.github/workflows/ci-failure-notifier.yml` — 権限修正対象

## 入力（前工程の成果物）

- TDR-017（D-07 architecture.md に記載済み）

## 実装仕様

### 1. GitHub Workflow Trigger アダプタ（新規）

**ファイル**: `src/lib/infrastructure/adapters/github-workflow-trigger.ts`

#### 1.1 `triggerWorkflow(workflowFile: string): Promise<void>`

GitHub REST API で workflow_dispatch を発火する。

```
POST https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflowFile}/dispatches
Authorization: Bearer {GITHUB_PAT}
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Body: { "ref": "main" }
```

- 環境変数 `GITHUB_PAT` が未設定の場合は `console.warn` を出力してスキップ（return、例外を投げない）
- リポジトリ情報は `GITHUB_REPOSITORY` 環境変数から取得（未設定時はハードコード `nikaiai2025/battle_board` にフォールバック）
- GitHub API がエラーを返した場合は `Error` を throw する（呼び出し元で catch される前提）

#### 1.2 `withWorkflowTrigger<T>(repo, triggerableTypes, triggerFn): T`

pending リポジトリのデコレータ。

- `repo`: `{ create(params: { commandType: string; ... }): Promise<void> }` を満たすオブジェクト
- `triggerableTypes`: `Set<string>` — トリガー対象の commandType 集合
- `triggerFn`: `() => Promise<void>` — 発火する関数（テスト時はモック注入可能）
- 戻り値: `repo` と同じ型。`create()` が元の `repo.create()` を呼んだ後、commandType が対象セットに含まれていれば `triggerFn()` を fire-and-forget（`.catch()` でエラーをログ出力）で呼ぶ
- `create` 以外のプロパティ（`findByCommandType`, `deletePendingAsyncCommand` 等）はそのまま委譲する

### 2. command-service.ts の変更

pendingRepo 解決箇所（L548-561 付近）の直後で、デコレータを適用する。

```typescript
// 非同期コマンドの即時トリガー（TDR-017）
// 対象 commandType の pending INSERT 時に GH Actions を workflow_dispatch で即時起動する。
// GITHUB_PAT 未設定時（開発・テスト環境）は triggerWorkflow 内でスキップされるため安全。
if (resolvedPendingRepo) {
  const { withWorkflowTrigger, triggerWorkflow } = require(
    "../infrastructure/adapters/github-workflow-trigger"
  );
  resolvedPendingRepo = withWorkflowTrigger(
    resolvedPendingRepo,
    new Set(["newspaper"]),
    () => triggerWorkflow("newspaper-scheduler.yml"),
  );
}
```

注意:
- `require()` による遅延読み込みパターンは既存の handler 解決と同じスタイル（L534-536 等参照）
- AoriHandler / NewspaperHandler の両方がラップ済み repo を受け取るが、aori の commandType は `"aori"` なのでトリガーされない
- 将来の非同期AIコマンド追加時は `new Set(["newspaper", "future_cmd"])` とするだけ

### 3. newspaper-scheduler.yml の変更

cron をフォールバック用に縮小する。

```yaml
on:
  schedule:
    - cron: '5 */4 * * *'  # 4時間ごと（フォールバック。通常は workflow_dispatch で即時起動）
  workflow_dispatch: {}      # Vercel からの即時トリガー + 手動実行
```

`workflow_dispatch: {}` は既に存在するため、cron の値のみ変更。

### 4. ci-failure-notifier.yml の修正（2点）

#### 4.1 権限修正

```yaml
permissions:
  issues: write
  contents: read  # gh issue create が repository.defaultBranchRef を読むため必要
```

#### 4.2 監視対象追加

```yaml
workflows:
  - "Bot Scheduler"
  - "Daily Maintenance"
  - "Apply DB Migrations"
  - "Seed Pinned Thread"
  - "Newspaper Scheduler"  # 追加
```

### 5. テスト

**ファイル**: `src/__tests__/lib/infrastructure/adapters/github-workflow-trigger.test.ts`

#### 5.1 triggerWorkflow

- `GITHUB_PAT` 未設定時にスキップ（warn ログ出力、例外なし）
- `GITHUB_PAT` 設定時に正しい URL・ヘッダで fetch が呼ばれること
- GitHub API がエラーを返した場合に Error が throw されること

#### 5.2 withWorkflowTrigger

- 対象 commandType の create 時に triggerFn が呼ばれること
- 対象外 commandType の create 時に triggerFn が呼ばれないこと
- triggerFn が失敗しても create 自体は成功すること（fire-and-forget）
- create 以外のメソッド（findByCommandType 等）がそのまま委譲されること

## 環境変数の設定（手動作業）

**設定済み。** コード実装のみ実施すればよい。

- GitHub Fine-Grained PAT: 作成済み（Actions: Read and Write、このリポジトリ限定）
- Vercel 環境変数 `GITHUB_PAT`: 登録済み

## 完了条件

- [ ] `npx vitest run` 全パス（新規テスト含む）
- [ ] `npx cucumber-js` 既存シナリオが壊れていないこと
- [ ] `GITHUB_PAT` 未設定でもアプリが正常動作すること（トリガーがスキップされるだけ）

## 作業ログ

### チェックポイント（最終）

全作業完了。

### 進捗ログ

1. タスク指示書・必読ドキュメント読み込み完了
2. `src/lib/infrastructure/adapters/github-workflow-trigger.ts` 新規作成
   - `triggerWorkflow()`: GitHub workflow_dispatch API 呼び出し
   - `withWorkflowTrigger()`: pending リポジトリのデコレータ（Proxy パターン）
3. `src/__tests__/lib/infrastructure/adapters/github-workflow-trigger.test.ts` 新規作成（11テスト）
4. `src/lib/services/command-service.ts` 修正: L563 前にデコレータ適用ブロック挿入
5. `.github/workflows/newspaper-scheduler.yml` 修正: cron を `5 */4 * * *` に変更
6. `.github/workflows/ci-failure-notifier.yml` 修正: 権限追加 + Newspaper Scheduler 追加

### テスト結果サマリー

- **単体テスト (Vitest)**: 1758 passed / 1 failed
  - 失敗は `schema-consistency.test.ts` のみ（git stash で確認済みの pre-existing 失敗。本タスクとは無関係）
  - 新規テスト 11件: 全 PASS
- **BDDテスト (cucumber-js)**: 323 passed, 16 pending（pending は UI 未実装の pre-existing）
