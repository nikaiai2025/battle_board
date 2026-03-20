---
task_id: TASK-SMOKE-74
sprint_id: Sprint-74
status: failed
assigned_to: bdd-smoke
depends_on: []
created_at: 2026-03-20T11:00:00+09:00
updated_at: 2026-03-20T11:30:00+09:00
locked_files: []
---

## タスク概要
Sprint-74デプロイ後の本番スモークテストを実行する。Vercel/Cloudflare共にデプロイ完了確認済み。

## 完了条件
- [x] `npx playwright test --config=playwright.prod.config.ts` を実行
- [x] 結果をレポートする

## 補足
- Cloudflare Workers Builds経由でデプロイ済み（Dashboard確認済み、`wrangler deployments list` CLIは未対応）
- `.env.prod.smoke` の設定状況を確認すること（前回セッションで未設定の可能性あり）

## 作業ログ

### チェックポイント
- 状態: 完了（FAIL）
- 完了済み: テスト実行・結果レポート
- 次にすべきこと: `.env.prod.smoke` の設定（人間が実施）
- 未解決の問題: `.env.prod.smoke` が存在しないためシークレット要求テストが全滅

### テスト結果サマリー

| 項目 | 内容 |
|---|---|
| 結果 | FAIL |
| PASS/TOTAL | 7/24（prod-smoke: 7/19, prod-flows: 0/4, skip: 1） |
| 所要時間 | 約26s（Phase A） + 約1s（Phase B） |
| 失敗原因（共通） | `.env.prod.smoke` が存在しないため `PROD_SMOKE_EDGE_TOKEN` / `PROD_ADMIN_EMAIL` / `PROD_ADMIN_PASSWORD` が未設定 |

#### 失敗テスト一覧

**Phase A: prod-smoke（12件失敗）**

| テスト名 | 失敗理由 |
|---|---|
| スレッドページ /battleboard/{threadKey}/ › シードデータのスレッドにアクセスでき、主要UI要素が表示される | `PROD_SMOKE_EDGE_TOKEN` 未設定 |
| スレッドページ /battleboard/{threadKey}/ › 一覧に戻るリンクが存在しクリック可能 | `PROD_SMOKE_EDGE_TOKEN` 未設定 |
| マイページ /mypage › 認証後にアクセスでき、主要UI要素が表示される | `PROD_SMOKE_EDGE_TOKEN` 未設定 |
| マイページ /mypage › 仮ユーザー状態で本登録リンクが表示され、遷移先が404/500でない | `PROD_SMOKE_EDGE_TOKEN` 未設定 |
| マイページ /mypage › マイページからトップへの戻りリンクが存在する | `PROD_SMOKE_EDGE_TOKEN` 未設定 |
| メール本登録ページ /register/email › 認証後にアクセスでき、登録フォームが表示される | `PROD_SMOKE_EDGE_TOKEN` 未設定 |
| Discord本登録ページ /register/discord › 認証後にアクセスでき、Discord登録ボタンが表示される | `PROD_SMOKE_EDGE_TOKEN` 未設定 |
| 管理ダッシュボード /admin › 管理者認証後にアクセスでき、ダッシュボード要素が表示される | `PROD_ADMIN_EMAIL` / `PROD_ADMIN_PASSWORD` 未設定 |
| 管理ユーザー一覧 /admin/users › 管理者認証後にアクセスでき、ユーザーテーブルが表示される | `PROD_ADMIN_EMAIL` / `PROD_ADMIN_PASSWORD` 未設定 |
| 管理ユーザー詳細 /admin/users/[userId] › 管理者認証後にユーザー詳細にアクセスでき、基本情報が表示される | `PROD_ADMIN_EMAIL` / `PROD_ADMIN_PASSWORD` 未設定 |
| IP BAN管理 /admin/ip-bans › 管理者認証後にアクセスでき、IP BANテーブルが表示される | `PROD_ADMIN_EMAIL` / `PROD_ADMIN_PASSWORD` 未設定 |
| 旧スレッドURLリダイレクト /threads/[threadId] › 旧スレッドURLにアクセスすると新URLへリダイレクトされる | `PROD_SMOKE_EDGE_TOKEN` 未設定 |

**Phase B: prod-flows（4件失敗、1件スキップ）**

| テスト名 | 失敗理由 |
|---|---|
| 基本フロー検証（環境共通） › コマンド書き込み時に inlineSystemInfo がレス末尾に表示される | `PROD_SMOKE_EDGE_TOKEN` 未設定 |
| 基本フロー検証（環境共通） › 隠しコマンド !abeshinzo で★システム名義の独立レスが投稿される | `PROD_SMOKE_EDGE_TOKEN` 未設定 |
| 基本フロー検証（環境共通） › 書き込んだスレッドが subject.txt と DAT に反映される | `PROD_SMOKE_EDGE_TOKEN` 未設定 |
| 基本フロー検証（環境共通） › 管理者がテストスレッドを削除し公開APIから消える | `PROD_SMOKE_EDGE_TOKEN` 未設定 |
| 認証UI連結フロー（ローカル限定） › 未認証でスレッド作成→AuthModal認証→作成成功→レス書き込みが完結する | スキップ（ローカル限定） |

#### PASSしたテスト（7件）

すべて認証不要のページ到達性テスト（Phase A）:
- トップページ / › HTTPステータス200で応答し、主要UI要素が表示される
- トップページ / › サイトタイトルリンクがクリック可能
- 板トップページ /battleboard/ › HTTPステータス200で応答し、スレッド一覧が表示される
- 板トップページ /battleboard/ › 板トップページからサイトタイトルリンクが操作可能
- 認証コード検証ページ /auth/verify › HTTPステータス200で応答し、認証フォームが表示される
- 認証コード検証ページ /auth/verify › クエリパラメータ code を渡すと認証コードがプリフィルされる
- 開発連絡板 /dev › HTTPステータス200で応答し、主要UI要素が表示される

#### 対処が必要な事前作業

失敗の原因はアプリケーション側の問題ではなく、テスト実行環境の設定不備である。
`docs/operations/runbooks/seed-smoke-user.md` の手順に従い、以下を設定した `.env.prod.smoke` を作成することで全テスト実行が可能になる:

- `PROD_SMOKE_EDGE_TOKEN` — スモークテスト用ユーザーのエッジトークン
- `PROD_ADMIN_EMAIL` — 管理者アカウントのメールアドレス
- `PROD_ADMIN_PASSWORD` — 管理者アカウントのパスワード
