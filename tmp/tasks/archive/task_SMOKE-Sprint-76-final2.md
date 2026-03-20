---
task_id: SMOKE-Sprint-76-final2
sprint_id: Sprint-76
status: done
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-20T11:16:00+09:00
updated_at: 2026-03-20T11:16:00+09:00
locked_files: []
---

## タスク概要

Sprint-76 `fix: スモークテスト inlineSystemInfo アサーション修正`（816b45a）デプロイ後の本番スモークテストを実行する。

## 完了条件

- [x] デプロイ完了確認
- [x] `npx playwright test --config=playwright.prod.config.ts` を実行
- [x] 結果をレポートする

## 補足

- `.env.prod.smoke` 設定済み（PROD_SMOKE_EDGE_TOKEN, PROD_ADMIN_EMAIL, PROD_ADMIN_PASSWORD）
- PROD_SMOKE_USER_ID は廃止済み（fd5db38 で除去）
- テスト対象: https://battle-board.shika.workers.dev
- 前回（Sprint-76-final）: 22/24 PASS、1件FAIL（inlineSystemInfo 自己草禁止制約との競合）
- 今回の期待値: 全テストPASS（アサーション修正済み）

## 作業ログ

### デプロイ確認

- 最新デプロイ: `2026-03-20T02:16:14.660Z`（JST 11:16）
- バージョン: `f9591b71-8ac4-4f03-b3a4-1a59c5d4b170`
- 最新コミット: `816b45a fix: スモークテスト inlineSystemInfo アサーション修正`（JST 10:57以降）
- 判定: デプロイ完了確認済み

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 23/23（スキップ1件: 認証UI連結フロー ローカル限定） |
| 所要時間 | 42.6s |
| 失敗テスト | なし |

#### Sprint-76 推移

| 実行回 | PASS/TOTAL | 状態 |
|---|---|---|
| Sprint-75 | 18/24 | FAIL（5件） |
| Sprint-76-retry | 10/23 | FAIL（13件: PROD_SMOKE_USER_ID 未設定） |
| Sprint-76-final | 22/23 | FAIL（1件: inlineSystemInfo 自己草禁止制約との競合） |
| Sprint-76-final2（今回） | 23/23 | PASS（全件解消） |
