---
task_id: TASK-137
sprint_id: Sprint-47
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-18T00:10:00+09:00
updated_at: 2026-03-18T00:10:00+09:00
locked_files:
  - "[NEW] .github/workflows/migrate.yml"
---

## タスク概要

GitHub Actionsワークフローを新規作成し、mainブランチへのpush時にSupabase本番DBへマイグレーションを自動適用する。本番障害（マイグレーション適用漏れ）の再発防止策。

## 背景

- コードデプロイ（Cloudflare/Vercel）はpushで自動実行されるが、DBマイグレーションは手動の`supabase db push --linked`が必要
- この手動ステップが忘れられ、コードが存在しないテーブル/カラムを参照する状態が発生した
- 詳細: `docs/operations/incidents/2026-03-17_post_500_missing_migrations.md`

## 実装要件

### ワークフローファイル

`.github/workflows/migrate.yml` を新規作成する。

### 動作仕様

- **トリガー**: mainブランチへのpush（`supabase/migrations/`配下に変更があった場合のみ）
- **処理内容**: `supabase db push` のみ実行する（マイグレーション適用以外の処理は行わない）
- **冪等性**: `supabase db push` は適用済みマイグレーションをスキップするため、何度実行しても安全

### 必要なGitHub Secrets（人間が設定）

| Secret名 | 用途 |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI認証トークン |
| `SUPABASE_PROJECT_REF` | Supabase本番プロジェクトのリファレンスID |

### ワークフロー構成

```yaml
name: Apply DB Migrations

on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Link Supabase project
        run: supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

      - name: Apply migrations
        run: supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

上記は参考構成。Supabase公式のCI/CDドキュメントに従い、最適な方法に調整してよい。

## 完了条件

- [ ] `.github/workflows/migrate.yml` が作成されている
- [ ] トリガーが `push to main` + `paths: supabase/migrations/**` に限定されている
- [ ] マイグレーション適用以外の処理を含まない
- [ ] ワークフロー内のコメントで必要なSecretsの設定手順が記載されている

## スコープ外

- GitHub Secretsの設定（人間作業）
- 他のCI/CDワークフロー（テスト実行、デプロイ等）
- Cloudflare/Vercelのデプロイ設定変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: `.github/workflows/migrate.yml` 新規作成
- 次にすべきこと: なし（完了）
- 未解決の問題: なし

### 進捗ログ

- `.github/workflows/migrate.yml` を新規作成した
  - トリガー: `push to main` + `paths: supabase/migrations/**`
  - ステップ: `checkout` → `supabase/setup-cli@v1` → `supabase link` → `supabase db push`
  - ファイル冒頭コメントに `SUPABASE_ACCESS_TOKEN` / `SUPABASE_PROJECT_REF` の取得・登録手順を記載

### テスト結果サマリー

本タスクはYAMLファイルの新規作成のみであり、自動テスト対象外。
完了条件の手動確認結果:

| 条件 | 結果 |
|---|---|
| `.github/workflows/migrate.yml` が作成されている | PASS |
| トリガーが `push to main` + `paths: supabase/migrations/**` に限定されている | PASS |
| マイグレーション適用以外の処理を含まない | PASS |
| Secretsの設定手順がコメントで記載されている | PASS |
