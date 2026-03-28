---
task_id: TASK-SMOKE-125
sprint_id: Sprint-125
status: passed
assigned_to: bdd-smoke
created_at: 2026-03-26T12:30:00+09:00
---

## 目的

Sprint-125 デプロイ後の本番スモークテスト実施。

変更内容:
- findByThreadId の is_deleted フィルタ除去（削除済みレスが「このレスは削除されました」表示に復帰）
- admin.feature シナリオ修正（設計意図と整合）

## 作業ログ

### デプロイ確認

| 項目 | 内容 |
|---|---|
| 確認日時 | 2026-03-26 |
| 確認コマンド | `wrangler deployments list --name battle-board` |
| Sprint-125コミット日時 | 2026-03-26T02:33:42Z |
| 最新デプロイ日時 | 2026-03-26T02:35:57Z |
| 最新バージョンID | 8e099760-fa83-4a2a-9be8-6b122bf5f140 |
| 確認結果 | Sprint-125コミット後にデプロイ済み。デプロイ完了確認OK |

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 29/29 |
| スキップ | 5（設計上のスキップ: ローカル限定テスト） |
| 所要時間 | 49.7s |
| 失敗テスト | なし |
