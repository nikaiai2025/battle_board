# Sprint-48 計画書: 固定スレッド自動デプロイ + 日次集計cron準備

> 作成日: 2026-03-17
> ステータス: completed

## 背景

`scripts/` ディレクトリに完成済みスクリプトが本番で一度も実行されていない構造的問題への対処。
マイグレーション自動適用（Sprint-47）と同じパターンで、GitHub Actions による自動化を行う。

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | ステータス |
|---|---|---|---|---|
| TASK-138 | bdd-coding | 固定スレッド自動デプロイ（GitHub Actions + workflow_dispatch） | なし | assigned |

## 備考: 日次集計cron（aggregate-daily-stats.ts）

同様の構造的問題を抱えているが、以下の人間タスクが未決定のため Sprint-48 スコープ外:
- HUMAN-001: cron実行間隔の決定
- HUMAN-004/MEDIUM-003: タイムゾーン（UTC vs JST）の決定

上記決定後、GitHub Actions cron ワークフロー（`.github/workflows/daily-stats.yml`）を作成するスプリントを起動する。

## 結果

### TASK-138 (bdd-coding) — completed

- `.github/workflows/seed-pinned-thread.yml` 新規作成
- トリガー: push to main（`config/commands.yaml` / `scripts/upsert-pinned-thread.ts`）+ `workflow_dispatch`
- 環境変数マッピング: `SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL`
- migrate.yml と同スタイルのコメント・Secret設定手順を記載

## 判定

全タスク completed。push後、GitHub UI から `workflow_dispatch` で初回実行すること。
