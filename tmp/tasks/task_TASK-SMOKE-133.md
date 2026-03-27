---
task_id: TASK-SMOKE-133
sprint_id: Sprint-133
status: completed
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-27T20:40:00+09:00
updated_at: 2026-03-27T20:40:00+09:00
---

## タスク概要

Sprint-133（コピペボット + 運営BOTコマンドコスト免除）のデプロイ後スモークテストを実行する。

## デプロイ済みコミット

- `5e3f57f` feat: コピペボット（HP:100）+ 運営BOTコマンドコスト免除を実装

## テスト実行コマンド

```bash
npx playwright test e2e/smoke/
```

## 完了条件

- [ ] スモークテスト実行完了
- [ ] PASS/FAIL/SKIP の件数を報告

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: スモークテスト実行
- 次にすべきこと: なし
- 未解決の問題: なし

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 30/35 |
| SKIP | 5（ローカル限定テスト: auth-flow, bot-display x2, polling x2） |
| FAIL | 0 |
| 所要時間 | 約1分0秒 |

デプロイ確認: 最新デプロイ `2026-03-27T10:12:05.740Z`（JST 19:12）を確認済み。
