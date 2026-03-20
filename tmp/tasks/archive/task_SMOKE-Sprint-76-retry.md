---
task_id: SMOKE-Sprint-76-retry
sprint_id: Sprint-76
status: failed
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-20T00:00:00+09:00
updated_at: 2026-03-20T00:00:00+09:00
locked_files: []
---

## タスク概要
Sprint-76デプロイ後の本番スモークテスト再実行。
前回（SMOKE-Sprint-76）は PROD_SMOKE_USER_ID 未設定で13件FAILしたため、人間が設定完了後に再実行する。

## 完了条件
- [x] `npx playwright test --config=playwright.prod.config.ts` を実行
- [x] 結果をレポートする

## 補足
- `.env.prod.smoke` には PROD_SMOKE_EDGE_TOKEN, PROD_ADMIN_EMAIL, PROD_ADMIN_PASSWORD は設定済み
- 再実行前提: PROD_SMOKE_USER_ID が設定済みとの指示があったが、実際には未設定だった

## 作業ログ

### デプロイ確認
- 最新デプロイ: `2026-03-19T20:33:07.184Z`（wrangler deployments list で確認）
- バージョン: `5bf6003b-65f4-4244-88ff-d000847c0ae5`
- ステータス: デプロイ完了確認済み

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 10/24（スキップ1件含む: 実施23件中10件PASS） |
| 所要時間 | 31.7s |
| 失敗テスト | 13件（下記参照） |

### 失敗テスト詳細

全13件、共通エラー: `PROD_SMOKE_USER_ID is not set in .env.prod.smoke. See: docs/operations/runbooks/seed-smoke-user.md`

| # | テストファイル | テスト名 |
|---|---|---|
| 1 | navigation.spec.ts | スレッドページ /battleboard/{threadKey}/ › シードデータのスレッドにアクセスでき、主要UI要素が表示される |
| 2 | navigation.spec.ts | スレッドページ /battleboard/{threadKey}/ › 一覧に戻るリンクが存在しクリック可能 |
| 3 | navigation.spec.ts | マイページ /mypage › 認証後にアクセスでき、主要UI要素が表示される |
| 4 | navigation.spec.ts | マイページ /mypage › 仮ユーザー状態で本登録リンクが表示され、遷移先が404/500でない |
| 5 | navigation.spec.ts | マイページ /mypage › マイページからトップへの戻りリンクが存在する |
| 6 | navigation.spec.ts | メール本登録ページ /register/email › 認証後にアクセスでき、登録フォームが表示される |
| 7 | navigation.spec.ts | Discord本登録ページ /register/discord › 認証後にアクセスでき、Discord登録ボタンが表示される |
| 8 | navigation.spec.ts | 管理ユーザー詳細 /admin/users/[userId] › 管理者認証後にユーザー詳細にアクセスでき、基本情報が表示される |
| 9 | navigation.spec.ts | 旧スレッドURLリダイレクト /threads/[threadId] › 旧スレッドURLにアクセスすると新URLへリダイレクトされる |
| 10 | basic-flow.spec.ts | 基本フロー検証（環境共通） › コマンド書き込み時に inlineSystemInfo がレス末尾に表示される |
| 11 | basic-flow.spec.ts | 基本フロー検証（環境共通） › 隠しコマンド !abeshinzo で★システム名義の独立レスが投稿される |
| 12 | basic-flow.spec.ts | 基本フロー検証（環境共通） › 書き込んだスレッドが subject.txt と DAT に反映される |
| 13 | basic-flow.spec.ts | 基本フロー検証（環境共通） › 管理者がテストスレッドを削除し公開APIから消える |

### PASSしたテスト（10件）

| # | テスト名 |
|---|---|
| 1 | トップページ / › HTTPステータス200で応答し、主要UI要素が表示される |
| 2 | トップページ / › サイトタイトルリンクがクリック可能 |
| 3 | 板トップページ /battleboard/ › HTTPステータス200で応答し、スレッド一覧が表示される |
| 4 | 板トップページ /battleboard/ › 板トップページからサイトタイトルリンクが操作可能 |
| 5 | 認証コード検証ページ /auth/verify › HTTPステータス200で応答し、認証フォームが表示される |
| 6 | 認証コード検証ページ /auth/verify › クエリパラメータ code を渡すと認証コードがプリフィルされる |
| 7 | 開発連絡板 /dev › HTTPステータス200で応答し、主要UI要素が表示される |
| 8 | 管理ダッシュボード /admin › 管理者認証後にアクセスでき、ダッシュボード要素が表示される |
| 9 | 管理ユーザー一覧 /admin/users › 管理者認証後にアクセスでき、ユーザーテーブルが表示される |
| 10 | IP BAN管理 /admin/ip-bans › 管理者認証後にアクセスでき、IP BANテーブルが表示される |

スキップ（1件）: `認証UI連結フロー（ローカル限定）` — ローカル専用テストのため本番実行対象外

### 根本原因

`PROD_SMOKE_USER_ID` が `.env.prod.smoke` に設定されていない。
`e2e/fixtures/index.ts` の `authenticate` フィクスチャ（91〜97行目）は本番環境で
`process.env.PROD_SMOKE_USER_ID` が未設定の場合に例外をスローする。

対処: `.env.prod.smoke` に `PROD_SMOKE_USER_ID=<スモークユーザーのユーザーID>` を追記する。
手順: `docs/operations/runbooks/seed-smoke-user.md` を参照。
