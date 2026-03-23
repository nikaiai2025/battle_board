---
task_id: SMOKE-079
sprint_id: Sprint-79
status: completed
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-21T23:15:00+09:00
updated_at: 2026-03-21T23:30:00+09:00
locked_files: []
---

## タスク概要
Sprint-79（撃破済みBOT表示機能）デプロイ後の本番スモークテストを実行する。

## 完了条件
- [x] 本番スモークテスト全件PASS（bot-displayはローカル限定のためskip想定）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: スモークテスト実行・結果記録
- 次にすべきこと: なし
- 未解決の問題: なし

### デプロイ確認
最新デプロイ: 2026-03-21T01:39:51.974Z（Sprint-79コミット `2f69639 feat: 撃破済みBOT表示機能` 以降）— デプロイ完了確認済み。

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 30/35（5件はローカル限定のためskip） |
| 所要時間 | 約1分24秒 |
| 失敗テスト | なし |

スキップされた5件の内訳（全件 `isProduction=true` 環境では `test.skip` が期待される）:
- `auth-flow.spec.ts` — 認証UIフロー（ローカル限定）: 1件
- `bot-display.spec.ts` — 撃破済みBOT表示（ローカル限定）: 2件
- `polling.spec.ts` — ポーリング検証（ローカル限定）: 2件
