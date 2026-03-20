---
task_id: SMOKE-Sprint-76-final
sprint_id: Sprint-76
status: failed
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-20T11:05:00+09:00
updated_at: 2026-03-20T11:05:00+09:00
locked_files: []
---

## タスク概要

Sprint-76最終デプロイ後の本番スモークテストを実行する。

## 完了条件

- [x] デプロイ完了確認（最新デプロイ: 2026-03-20T01:59 UTC = 10:59 JST、最新コミット: 10:57 JST）
- [x] `npx playwright test --config=playwright.prod.config.ts` を実行
- [x] 結果をレポートする

## 補足

- `.env.prod.smoke` 設定済み（PROD_SMOKE_EDGE_TOKEN, PROD_ADMIN_EMAIL, PROD_ADMIN_PASSWORD）
- PROD_SMOKE_USER_ID は廃止済み（fd5db38 で除去）
- テスト対象: https://battle-board.shika.workers.dev

## 作業ログ

### チェックポイント

- 状態: failed
- 完了済み: デプロイ確認・スモークテスト実行
- 次にすべきこと: オーケストレーターが auto-debugger の起動を判断
- 未解決の問題: 1件FAIL（下記参照）

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 22/24 |
| 所要時間 | 約1分0秒 |
| スキップ | 1件（認証UI連結フロー ローカル限定） |
| 失敗テスト | 下記参照 |

#### 失敗テスト詳細

| # | テスト名 | エラー内容 |
|---|---|---|
| 1 | `[prod-flows] 基本フロー検証（環境共通） › コマンド書き込み時に inlineSystemInfo がレス末尾に表示される` | `locator('#post-2 [data-testid="post-inline-system-info"]')` の内容が期待値 `"reply"` ではなく `"自分のレスには草を生やせません"` だった。同一ユーザー（スモークテストユーザー）が自分のレスに対して草コマンドを実行したため、自己草禁止制約が発動したと推定される。スクリーンショット: `ゴミ箱\test-results-prod\basic-flow-基本フロー検証（環境共通）-コ-4f350-nlineSystemInfo-がレス末尾に表示される-prod-flows\test-failed-1.png` |

#### 前回（Sprint-75）との比較

- Sprint-75: 18/24 PASS（5件FAIL）
- Sprint-76-final: 22/24 PASS（1件FAIL）
- 改善: React #418 hydrationエラー × 3件・管理ユーザー詳細 × 1件 が解消
- 残存: コマンド書き込み inlineSystemInfo テスト（自己草禁止制約との競合）
