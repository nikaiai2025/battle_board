# タスク指示書: TASK-SMOKE-117

## メタ情報

| 項目 | 値 |
|---|---|
| タスクID | TASK-SMOKE-117 |
| タイプ | smoke-test |
| スプリント | Sprint-117 |
| 担当エージェント | bdd-smoke |
| ステータス | done |

## 目的

Sprint-117 デプロイ後の本番スモークテスト実施。

変更内容:
1. admin-service.ts: getUserList に通貨残高追加、getUserDetail/getUserPosts にスレッド名追加
2. admin.steps.ts: テスト検証コード修正
3. admin.feature: BANコメント追記
4. admin-service.test.ts: 新規27テスト

## 作業ログ

### デプロイ確認

| 項目 | 内容 |
|---|---|
| 確認日時 | 2026-03-25 |
| 確認コマンド | `wrangler deployments list --name battle-board` |
| 最新デプロイ日時 | 2026-03-24T22:19:02Z |
| 最新バージョンID | d86966a6-0673-47a3-ba06-c6c739aa9e38 |
| Sprint-117 最終コミット日時 | 2026-03-24T22:16:54Z (JST: 2026-03-25 07:16) |
| 確認結果 | 最新デプロイ(22:19Z)がSprint-117最終コミット(22:16Z)より後のため、デプロイ完了確認OK |

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 29/34 |
| スキップ | 5（設計上のスキップ: ローカル限定テスト） |
| 所要時間 | 44.9s |
| 失敗テスト | なし |
| 前回比（Sprint-115） | 29/34 PASS → 29/34 PASS（変化なし） |
