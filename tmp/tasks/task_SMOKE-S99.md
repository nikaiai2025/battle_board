---
task_id: SMOKE-S99
sprint_id: Sprint-99
status: done
assigned_to: bdd-smoke
created_at: 2026-03-22T23:15:00+09:00
updated_at: 2026-03-22T23:35:00+09:00
locked_files: []
---

## タスク概要

Sprint-99（ステルスコマンド本文除去バグ修正）デプロイ後の本番スモークテスト実行。

## 対象環境
- Vercel: Ready（コミット 37fe1f3）
- Cloudflare: デプロイ済み

## テスト実行
`npx playwright test e2e/smoke/` を実行し、結果を報告する。

## 完了条件
- [x] スモークテスト実行完了
- [x] 結果サマリーを作業ログに記載

## 作業ログ

### チェックポイント
- 状態: 完了
- デプロイ確認: 最新デプロイ 2026-03-22T02:59:37Z（Sprint-99 コミット 37fe1f3 以降）を確認

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 30/35（5 skipped） |
| 所要時間 | 54.8s |
| 失敗テスト | なし |

**スキップされたテスト（ローカル限定のため本番では test.skip）:**
- `auth-flow.spec.ts`: 未認証→AuthModal認証→作成成功フロー（1件）
- `bot-display.spec.ts`: 撃破済みBOT表示系（2件）
- `polling.spec.ts`: ポーリング検証系（2件）

以上5件はすべて設計上の本番スキップ対象であり、テスト失敗ではない。
