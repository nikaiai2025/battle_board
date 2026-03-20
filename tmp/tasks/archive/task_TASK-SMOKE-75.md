---
task_id: TASK-SMOKE-75
sprint_id: Sprint-75
status: failed
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-20T15:00:00+09:00
updated_at: 2026-03-20T15:00:00+09:00
locked_files: []
---

## タスク概要
Sprint-75デプロイ後の本番スモークテストを実行する。Vercelデプロイ完了確認済み。
前回（TASK-SMOKE-74）は `.env.prod.smoke` 未設定で17件FAILだったが、今回は人間が設定完了済み。

## 完了条件
- [ ] `npx playwright test --config=playwright.prod.config.ts` を実行
- [ ] 結果をレポートする

## 補足
- `.env.prod.smoke` は設定済み（PROD_SMOKE_EDGE_TOKEN, PROD_ADMIN_EMAIL, PROD_ADMIN_PASSWORD）
- 前回PASSした7件（認証不要ページ）+ 今回PASSが期待される17件（認証必須ページ + フロー）= 全24件

## 作業ログ

### チェックポイント
- 状態: failed
- 完了済み: スモークテスト実行
- 次にすべきこと: オーケストレーターが auto-debugger の起動を判断
- 未解決の問題: 5件FAIL（下記参照）

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 18/24 |
| 所要時間 | 約1分18秒 |
| スキップ | 1件（認証UI連結フロー ローカル限定） |
| 失敗テスト | 下記参照 |

#### 失敗テスト詳細

| # | テスト名 | エラー内容 |
|---|---|---|
| 1 | `[prod-smoke] スレッドページ /battleboard/{threadKey}/ › シードデータのスレッドにアクセスでき、主要UI要素が表示される` | `Minified React error #418` (text hydration mismatch) がJSエラーとして検出された。スクリーンショット: `ゴミ箱\test-results-prod\navigation-スレッドページ-battleb-25925-ータのスレッドにアクセスでき、主要UI要素が表示される-prod-smoke\test-failed-1.png` |
| 2 | `[prod-smoke] スレッドページ /battleboard/{threadKey}/ › 一覧に戻るリンクが存在しクリック可能` | テスト1と同根（seedThread fixture が同じReactエラーを検出）。スクリーンショット: `ゴミ箱\test-results-prod\navigation-スレッドページ-battleboard-threadKey-一覧に戻るリンクが存在しクリック可能-prod-smoke\test-failed-1.png` |
| 3 | `[prod-smoke] 管理ユーザー詳細 /admin/users/[userId] › 管理者認証後にユーザー詳細にアクセスでき、基本情報が表示される` | `locator('#user-basic-info')` が15秒タイムアウト（element not found）。スクリーンショット: `ゴミ箱\test-results-prod\navigation-管理ユーザー詳細-admin--25d0d-証後にユーザー詳細にアクセスでき、基本情報が表示される-prod-smoke\test-failed-1.png` |
| 4 | `[prod-smoke] 旧スレッドURLリダイレクト /threads/[threadId] › 旧スレッドURLにアクセスすると新URLへリダイレクトされる` | `Minified React error #418` (text hydration mismatch) がJSエラーとして検出された。スクリーンショット: `ゴミ箱\test-results-prod\navigation-旧スレッドURLリダイレクト--80dfa-ッドURLにアクセスすると新URLへリダイレクトされる-prod-smoke\test-failed-1.png` |
| 5 | `[prod-flows] 基本フロー検証（環境共通） › コマンド書き込み時に inlineSystemInfo がレス末尾に表示される` | `post-inline-system-info` の内容が期待値 `"reply"` ではなく `"自分のレスには草を生やせません"` だった（同一ユーザーが自分のレスに草を生やせない制約が発動している可能性）。スクリーンショット: `ゴミ箱\test-results-prod\basic-flow-基本フロー検証（環境共通）-コ-4f350-nlineSystemInfo-がレス末尾に表示される-prod-flows\test-failed-1.png` |
