---
task_id: TASK-329
sprint_id: Sprint-126
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T12:00:00+09:00
updated_at: 2026-03-26T12:00:00+09:00
locked_files:
  - "[NEW] scripts/seed-copipe.ts"
  - "[NEW] .github/workflows/seed-copipe.yml"
  - ".github/workflows/ci-failure-notifier.yml"
---

## タスク概要

`!copipe` コマンドのインフラ整備。copipe_entries テーブルへの seed データ投入スクリプトと、mainブランチ push 時に自動実行する GHA ワークフロー、および ci-failure-notifier への通知追加を行う。

## 必読ドキュメント（優先度順）

1. [必須] `tmp/orchestrator/memo_copipe_command.md` — 設計決定事項（seed フォーマット・GHAパターン）
2. [必須] `scripts/upsert-pinned-thread.ts` — seed スクリプトの参考パターン
3. [必須] `.github/workflows/seed-pinned-thread.yml` — GHA ワークフローの参考パターン
4. [必須] `.github/workflows/ci-failure-notifier.yml` — 通知設定の追記先
5. [必須] `config/copipe-seed.txt` — seed データファイル（入力ソース）
6. [参考] `scripts/validate-copipe-seed.mjs` — 既存のバリデーションスクリプト（パースロジック参考）

## 出力（生成すべきファイル）

1. `scripts/seed-copipe.ts` — copipe-seed.txt をパースし copipe_entries テーブルに UPSERT するスクリプト
2. `.github/workflows/seed-copipe.yml` — main push 時に seed-copipe.ts を実行する GHA ワークフロー

## 変更すべき既存ファイル

1. `.github/workflows/ci-failure-notifier.yml` — `"Seed Copipe Entries"` をジョブ名リストに追加

## 完了条件

- [ ] `scripts/seed-copipe.ts` が `config/copipe-seed.txt` を正しくパースし、copipe_entries に UPSERT できること
- [ ] `.github/workflows/seed-copipe.yml` が `seed-pinned-thread.yml` と同等の構造であること
- [ ] `.github/workflows/ci-failure-notifier.yml` に copipe seed ジョブの通知が追加されていること
- [ ] TypeScript の型チェックが通ること（`npx tsc --noEmit` で確認）

## DB スキーマ（参照情報）

```sql
CREATE TABLE copipe_entries (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## seed スクリプト仕様

- 入力: `config/copipe-seed.txt`（`====COPIPE:タイトル====` 区切りフォーマット）
- 処理: パースして `name` + `content` のペアを抽出
- DB操作: `INSERT ... ON CONFLICT (name) DO NOTHING`（冪等。既存 name はスキップ、新規のみ INSERT）
- 本文の前後空行はトリム、本文中の空行は保持
- エスケープは一切不要（parameterized query で安全に投入）
- 環境変数: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`（既存ワークフローと同じ GitHub Secrets を使用）

## GHA ワークフロー仕様

- トリガー: `push` to `main` で `config/copipe-seed.txt` が変更された時 + `workflow_dispatch`
- 処理: `npx tsx scripts/seed-copipe.ts`
- ジョブ名: `Seed Copipe Entries`
- `seed-pinned-thread.yml` と同一パターン。追加の GitHub Secrets は不要

## スコープ外

- copipe_entries テーブルの migration → TASK-328
- コマンドハンドラ・テスト → TASK-328
- `config/copipe-seed.txt` の編集（人間が並行編集中）
- `scripts/validate-copipe-seed.mjs` の変更（既存のまま使用）

## 補足・制約

- seed スクリプトはローカルでの動作確認不要（本番DBへの接続が必要なため）。コードの正しさは参考パターンとの整合性、および TypeScript 型チェックで担保する
- `validate-copipe-seed.mjs` のパースロジックを参考にすること（同一フォーマットを扱う）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全3ファイルの実装・変更完了
- 未解決の問題: なし

### 進捗ログ

- `scripts/seed-copipe.ts`: 新規作成。`validate-copipe-seed.mjs`のパースロジックをTypeScript化、`upsert-pinned-thread.ts`のSupabaseクライアントパターンを踏襲
- `.github/workflows/seed-copipe.yml`: 新規作成。`seed-pinned-thread.yml`と同等構造。トリガーは `config/copipe-seed.txt` と `scripts/seed-copipe.ts` の変更時 + `workflow_dispatch`
- `.github/workflows/ci-failure-notifier.yml`: `"Seed Copipe Entries"` をワークフロー監視リストに追加

### テスト結果サマリー

- `npx tsc --noEmit`: PASS（エラーなし）
- ユニットテスト/BDDテスト: 本タスクは「インフラ整備」スコープのためテストコードなし（コマンドハンドラ・テストはTASK-328）
- ローカル動作確認: 本番DB接続が必要なため不要（タスク指示書補足参照）
