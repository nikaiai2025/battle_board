# タスク指示書: TASK-SMOKE-136

## メタ情報

| 項目 | 内容 |
|---|---|
| タスクID | TASK-SMOKE-136 |
| 種別 | スモークテスト |
| ステータス | completed |
| 担当エージェント | bdd-smoke |
| 実行日時（初回） | 2026-03-27 |
| 実行日時（再実行） | 2026-03-28 |

## 概要

本番スモークテスト（`e2e/smoke/navigation.spec.ts`）の実行。

Sprint-136 対象コミット: `7a395c6`（キュレーションBOT Phase A 実装）
- CF Workers 最新デプロイ: 2026-03-27T23:41:17Z

## 作業ログ

### テスト結果サマリー（再実行: 2026-03-28、Sprint-136 キュレーションBOT Phase A）

| 項目 | 内容 |
|---|---|
| 結果 | PASS |
| PASS/TOTAL | 17/17 |
| SKIP | 0 |
| 所要時間 | 27.5s |
| 失敗テスト | なし |

### 実行コマンド

```bash
npx playwright test e2e/smoke/navigation.spec.ts --config=playwright.prod.config.ts
```

### 対象URL

`https://battle-board.shika.workers.dev`（`.env.prod` の `PROD_BASE_URL` で定義）

### テスト一覧

| # | テスト名 | 結果 |
|---|---|---|
| 1 | トップページ / › HTTPステータス200で応答し、主要UI要素が表示される | PASS |
| 2 | トップページ / › サイトタイトルリンクがクリック可能 | PASS |
| 3 | 板トップページ /livebot/ › HTTPステータス200で応答し、スレッド一覧が表示される | PASS |
| 4 | 板トップページ /livebot/ › 板トップページからサイトタイトルリンクが操作可能 | PASS |
| 5 | スレッドページ /livebot/{threadKey}/ › シードデータのスレッドにアクセスでき、主要UI要素の確認と一覧への戻り遷移が行える | PASS |
| 6 | マイページ /mypage › 認証後にアクセスでき、主要UI要素が表示される | PASS |
| 7 | マイページ /mypage › 仮ユーザー状態で本登録リンクが表示され、遷移先が404/500でない | PASS |
| 8 | マイページ /mypage › マイページからトップへの戻りリンクが存在する | PASS |
| 9 | 認証ページ /auth/verify › HTTPステータス200で応答し、認証フォームとTurnstileウィジェットが表示される | PASS |
| 10 | 開発連絡板 /dev › HTTPステータス200で応答し、主要UI要素が表示される | PASS |
| 11 | メール本登録ページ /register/email › 認証後にアクセスでき、登録フォームが表示される | PASS |
| 12 | Discord本登録ページ /register/discord › 認証後にアクセスでき、Discord登録ボタンが表示される | PASS |
| 13 | 管理ダッシュボード /admin › 管理者認証後にアクセスでき、ダッシュボード要素が表示される | PASS |
| 14 | 管理ユーザー一覧 /admin/users › 管理者認証後にアクセスでき、ユーザーテーブルが表示される | PASS |
| 15 | 管理ユーザー詳細 /admin/users/[userId] › 管理者認証後にユーザー詳細にアクセスでき、基本情報が表示される | PASS |
| 16 | IP BAN管理 /admin/ip-bans › 管理者認証後にアクセスでき、IP BANテーブルが表示される | PASS |
| 17 | 旧スレッドURLリダイレクト /threads/[threadId] › 旧スレッドURLにアクセスすると新URLへリダイレクトされる | PASS |
