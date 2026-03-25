---
task_id: TASK-317
sprint_id: Sprint-120
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-26T06:30:00+09:00
updated_at: 2026-03-26T06:30:00+09:00
locked_files:
  - src/lib/infrastructure/adapters/github-workflow-trigger.ts
  - src/__tests__/lib/infrastructure/adapters/github-workflow-trigger.test.ts
---

## タスク概要

`!newspaper` コマンド実行後、GitHub Actions workflow_dispatch が HTTP 403 で失敗する。
Cloudflare Workers の fetch が `User-Agent` ヘッダを自動付与しないため、GitHub API の必須要件（User-Agent ヘッダ）を満たせていない。

## 本番エラーログ

```
[github-workflow-trigger] Failed to trigger workflow (fire-and-forget): Error:
[github-workflow-trigger] workflow_dispatch failed: HTTP 403 —
Request forbidden by administrative rules. Please make sure your request has a User-Agent header
```

## 対象BDDシナリオ

- `features/command_newspaper.feature`

## 必読ドキュメント

1. [必須] `src/lib/infrastructure/adapters/github-workflow-trigger.ts` — 修正対象
2. [参考] GitHub REST API ドキュメント: User-Agent ヘッダ必須

## 出力（生成すべきファイル）

- `src/lib/infrastructure/adapters/github-workflow-trigger.ts` — User-Agent ヘッダ追加

## 完了条件

- [ ] `triggerWorkflow` の fetch ヘッダに `User-Agent` を追加
- [ ] 既存テストがあれば全PASS
- [ ] `npx vitest run` 全PASS

## スコープ外

- newspaper の非同期処理ロジック変更
- GitHub Actions ワークフロー自体の変更

## 補足・制約

- GitHub API は `User-Agent` ヘッダを必須とする。値はリポジトリ名やアプリ名で良い（例: `"BattleBoard-Worker"`）
- Cloudflare Workers の fetch は User-Agent を自動付与しない場合がある
- fire-and-forget パターンのため、修正後もエラーは握りつぶされるが、ログ出力は残る

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: User-Agent ヘッダ追加（実装・テスト）
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `github-workflow-trigger.ts` 読み込み・問題箇所（fetchヘッダ）を確認
2. 既存テストファイル読み込み・`User-Agent` 検証が存在しないことを確認
3. テストに `User-Agent` ヘッダ検証を追加 → RED 確認
4. 実装に `"User-Agent": "BattleBoard-Worker"` を追加 → GREEN 確認
5. `npx vitest run` 全体実行 → 全 PASS 確認

### テスト結果サマリー

- 対象テストファイル: `src/__tests__/lib/infrastructure/adapters/github-workflow-trigger.test.ts`
- テスト件数: 11 件（追加1件含む）→ 全PASS
- `npx vitest run` 全体: 97 ファイル / 1877 テスト → 全PASS
