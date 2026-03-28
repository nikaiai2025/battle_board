---
task_id: TASK-SMOKE-138A
sprint_id: Sprint-138
status: done
assigned_to: bdd-smoke
created_at: 2026-03-29T17:50:00+09:00
updated_at: 2026-03-29T18:05:00+09:00
locked_files: []
---

## タスク概要

Sprint-138（performDailyResetバッチ化 + RPC関数マイグレーション）のデプロイ後スモークテストを実行する。

## 対象環境

- Cloudflare Workers: https://battle-board.shika.workers.dev

## 完了条件

- [x] 全スモークテストシナリオ PASS

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: スモークテスト実行・結果記録
- 次にすべきこと: なし
- 未解決の問題: なし

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 30/35（5件は `test.skip` でスキップ、実行対象外） |
| 所要時間 | 50.8s |
| 失敗テスト | なし |

#### スキップ内訳（ローカル限定テスト、本番では正常スキップ）

| テスト | ファイル |
|---|---|
| 認証UI連結フロー（ローカル限定） | auth-flow.spec.ts |
| 撃破済みBOT表示（ローカル限定）×2件 | bot-display.spec.ts |
| ポーリング検証（ローカル限定）×2件 | polling.spec.ts |

#### デプロイ確認

最新デプロイ: `2026-03-28T16:46:55Z`（UTC） = JST 2026-03-29 01:46
対応コミット: `bfae891` `fix: performDailyReset バッチ化で Vercel Hobby 10秒制限超過を修正`（2026-03-29 01:44 JST）
