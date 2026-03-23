---
task_id: SMOKE-080
sprint_id: Sprint-80
status: done
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-22T01:15:00+09:00
updated_at: 2026-03-22T01:25:00+09:00
locked_files: []
---

## タスク概要
Sprint-80（フェーズ5検証指摘修正）のデプロイ後、本番環境でスモークテストを実行する。

## 対象コミット
- `288da80` — fix: フェーズ5検証指摘の修正（Sprint-80）

## 変更内容
- auth-cookie Max-Age テスト修正（30日→365日統一）
- senbra-compat cleanupDatabase強化（DB汚染対策）
- hissi-handler 冗長クエリ統合
- attack-handler CreditReason "compensation" 追加
- D-06 thread-view.yaml 3件修正

## 完了条件
- [x] `npx playwright test --config=playwright.prod.config.ts` 全テストPASS（skip除く）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 本番スモークテスト実行
- 次にすべきこと: なし
- 未解決の問題: なし

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 30/35（5件は `ローカル限定` skip） |
| 所要時間 | 約1分40秒 |
| 失敗テスト | なし |

**デプロイ確認:** 最新デプロイ `2026-03-21T02:08:30Z` がコミット `288da80`（`2026-03-21T02:06:29Z`）以降であることを確認済み。
