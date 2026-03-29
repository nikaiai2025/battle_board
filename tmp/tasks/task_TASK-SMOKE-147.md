---
task_id: TASK-SMOKE-147
sprint_id: Sprint-147
status: done
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-29T00:00:00+09:00
updated_at: 2026-03-29T00:00:00+09:00
locked_files: []
---

## タスク概要

Sprint-147（管理画面BOT一覧にnextPostAt表示追加）のデプロイ後、本番スモークテストを実行する。

## 完了条件

- [x] 本番スモークテスト実行完了
- [x] 結果レポート

## 作業ログ

### チェックポイント
- 状態: 完了

### 進捗ログ

- デプロイ確認: 最新デプロイ 2026-03-29T00:31:30.003Z（Sprint-147デプロイ済みを確認）
- テスト実行: `npx playwright test --config=playwright.prod.config.ts`

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 30/35（5 skipped はローカル限定テストのため除外） |
| 所要時間 | 52.5s |
| 失敗テスト | なし |
