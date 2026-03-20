---
task_id: TASK-138
sprint_id: Sprint-48
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T23:50:00+09:00
updated_at: 2026-03-17T23:50:00+09:00
locked_files:
  - "[NEW] .github/workflows/seed-pinned-thread.yml"
---

## タスク概要

GitHub Actionsワークフローを新規作成し、固定スレッド（案内板）のupsertを自動化する。`config/commands.yaml` またはスクリプト本体の変更時に自動実行し、初回投入用に `workflow_dispatch` トリガーも設ける。

## 背景

- `scripts/upsert-pinned-thread.ts` は完成済みだが、本番DBに一度も実行されていない
- DBマイグレーション未適用と同じ構造的問題（スクリプトは存在するが実行する仕組みがない）
- Sprint-47で `.github/workflows/migrate.yml` を作成したのと同じパターンで解決する

## 実装要件

### ワークフローファイル

`.github/workflows/seed-pinned-thread.yml` を新規作成する。

### 動作仕様

- **トリガー（3種類）**:
  1. `push` to main + `paths`: `config/commands.yaml`, `scripts/upsert-pinned-thread.ts`
  2. `workflow_dispatch`（GitHub UI から手動実行可能 — 初回投入用）
- **処理内容**: `npx tsx scripts/upsert-pinned-thread.ts` を実行する
- **冪等性**: upsertのため何度実行しても安全

### 環境変数マッピング

スクリプトは `NEXT_PUBLIC_SUPABASE_URL` を参照するが、GitHub Secretsは `SUPABASE_URL` で登録されている。ワークフロー内でマッピングする:

```yaml
env:
  NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

### 参考: migrate.yml の構成

`.github/workflows/migrate.yml` を参考にすること（コメントスタイル・構成を揃える）。

### ワークフロー構成（参考）

```yaml
name: Seed Pinned Thread

on:
  push:
    branches: [main]
    paths:
      - 'config/commands.yaml'
      - 'scripts/upsert-pinned-thread.ts'
  workflow_dispatch:

jobs:
  seed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Upsert pinned thread
        run: npx tsx scripts/upsert-pinned-thread.ts
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

上記は参考構成。migrate.yml のコメントスタイルに合わせて調整してよい。

## 完了条件

- [ ] `.github/workflows/seed-pinned-thread.yml` が作成されている
- [ ] push トリガーが `config/commands.yaml` と `scripts/upsert-pinned-thread.ts` に限定されている
- [ ] `workflow_dispatch` トリガーが設定されている
- [ ] 環境変数マッピング（`SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`）が正しい
- [ ] ファイル冒頭コメントに必要なSecrets（`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`）が記載されている

## スコープ外

- GitHub Secretsの設定（設定済み）
- `aggregate-daily-stats.ts` のcron化（人間タスク決定待ち）
- 固定スレッドスクリプト本体の変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: `.github/workflows/seed-pinned-thread.yml` の新規作成
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- migrate.yml のコメントスタイル・構成を参照
- upsert-pinned-thread.ts の環境変数参照（`NEXT_PUBLIC_SUPABASE_URL`）を確認
- `.github/workflows/seed-pinned-thread.yml` を新規作成

### テスト結果サマリー

本タスクはYAMLファイルの新規作成のみであり、ユニットテスト・BDDテストの対象外。
完了条件チェックリストを全項目確認済み:

- [x] `.github/workflows/seed-pinned-thread.yml` が作成されている
- [x] push トリガーが `config/commands.yaml` と `scripts/upsert-pinned-thread.ts` に限定されている
- [x] `workflow_dispatch` トリガーが設定されている
- [x] 環境変数マッピング（`SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`）が正しい
- [x] ファイル冒頭コメントに必要なSecrets（`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`）が記載されている
