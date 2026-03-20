---
task_id: TASK-153
sprint_id: Sprint-54
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-19T00:00:00+09:00
updated_at: 2026-03-19T00:00:00+09:00
locked_files:
  - "[NEW] .github/workflows/bot-scheduler.yml"
  - "[NEW] .github/workflows/daily-maintenance.yml"
---

## タスク概要

荒らし役BOT本番稼働のためのGitHub Actionsワークフローを3本作成する。全てInternal APIをBearer認証付きで呼び出すcronジョブ。

## 対象BDDシナリオ
- なし（インフラ設定ファイル）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/architecture.md` §13 TDR-010 — cron間隔・時刻の仕様
2. [必須] `docs/architecture/architecture.md` §11 — 定期ジョブ一覧（bot-scheduler / daily-maintenance / cleanup）
3. [参考] `.github/workflows/migrate.yml` — 既存ワークフローの書き方の参考
4. [参考] `.github/workflows/seed-pinned-thread.yml` — 既存ワークフローの書き方の参考

## 実装内容

### 1. bot-scheduler.yml — BOT投稿cron

```yaml
name: Bot Scheduler
on:
  schedule:
    - cron: '0,30 * * * *'   # 毎時 :00, :30
  workflow_dispatch: {}        # 手動実行可能

# API呼び出し:
# POST https://<DEPLOY_URL>/api/internal/bot/execute
# Authorization: Bearer ${{ secrets.BOT_API_KEY }}
```

- **DEPLOY_URL**: Cloudflare Workers のURL（環境変数 `DEPLOY_URL` としてGitHub Secretsに登録）
  - Vercelではなく Cloudflare 側を使用する理由: 専ブラ互換APIのメインホストがCloudflare
- curlでAPIを叩き、レスポンスをログ出力
- 失敗時はGitHub Actionsのログで確認可能（別途通知は不要）

### 2. daily-maintenance.yml — 日次メンテナンス

```yaml
name: Daily Maintenance
on:
  schedule:
    - cron: '0 15 * * *'      # 15:00 UTC = 00:00 JST
  workflow_dispatch: {}

jobs:
  daily-reset:
    # POST https://<DEPLOY_URL>/api/internal/daily-reset

  daily-stats:
    # POST https://<DEPLOY_URL>/api/internal/daily-stats
    needs: daily-reset         # リセット後に統計集計
```

- 日次リセットと日次統計集計を順次実行（リセット → 統計集計）
- 統計集計はリセット後の状態を集計するため、`needs` で依存関係を設定

### 3. 共通事項

- 全ワークフローに `workflow_dispatch` を追加（手動実行でデバッグ可能に）
- GitHub Secretsに必要な値:
  - `BOT_API_KEY`: Internal API認証トークン（既にVercel/Cloudflareの環境変数として設定済みのものと同じ値）
  - `DEPLOY_URL`: Cloudflare Workers のデプロイURL（例: `https://battle-board.xxx.workers.dev`）

## 完了条件
- [ ] `.github/workflows/bot-scheduler.yml` が作成されている
- [ ] `.github/workflows/daily-maintenance.yml` が作成されている
- [ ] 全ワークフローに `workflow_dispatch` トリガーがある
- [ ] YAML構文が正しい（`yamllint` 等で検証、またはGitHub Actions構文として妥当）
- [ ] 既存テスト全件PASS（`npx vitest run` — ワークフローファイル追加は影響しないはず）
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- APIルートの実装（TASK-152で対応）
- GitHub Secretsの実際の登録（人間作業）
- Vercel/Cloudflareの環境変数設定（人間作業）

## 補足・制約
- DEPLOY_URLはGitHub Secretsから読む。ハードコードしない
- curlの `-f` フラグを使い、HTTPエラー時にジョブを失敗させること
- レスポンスボディをログ出力すること（デバッグ用）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. 必読ドキュメント確認（architecture.md §12.2, TDR-010, migrate.yml, seed-pinned-thread.yml）
2. `.github/workflows/bot-scheduler.yml` 作成
   - cron: `0,30 * * * *`（毎時 :00, :30）
   - workflow_dispatch 追加
   - `curl -fsS` でHTTPエラー時にジョブ失敗、レスポンスボディをログ出力
   - Bearer認証: `${{ secrets.BOT_API_KEY }}`
   - エンドポイント: `${{ secrets.DEPLOY_URL }}/api/internal/bot/execute`
3. `.github/workflows/daily-maintenance.yml` 作成
   - cron: `0 15 * * *`（15:00 UTC = 00:00 JST）
   - workflow_dispatch 追加
   - daily-reset → daily-stats の2ジョブ直列（`needs: daily-reset`）
   - エンドポイント: `/api/internal/daily-reset`, `/api/internal/daily-stats`
4. YAML構文検証（js-yaml）: 両ファイルとも OK
5. 既存テスト実行: 全件PASS

### テスト結果サマリー

- 単体テスト: 48ファイル, 1201件 PASS（0件 FAIL）
- ワークフローファイル追加はテストコードに影響なし（想定通り）
