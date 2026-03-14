# Sprint-20 本番テストレポート

> 作成: 2026-03-15
> テスト対象環境: https://battle-board.shika.workers.dev/

## テストの目的

ChMateで「毎回認証が要求される」問題の根本原因を特定する。
これまで応答HTML側（title変更等）を修正したが効果がなく、人間の仮説「サーバーのIF分岐がおかしいのでは」を検証するため、診断ログを本番に投入した。

## 今回の変更内容

### 1. 診断ログ追加（TASK-056）

`src/app/(senbra)/test/bbs.cgi/route.ts` に6箇所のログを追加。

| # | ログ出力箇所 | 出力例 | 判定できること |
|---|---|---|---|
| 1 | Cookie header受信時 | `[bbs.cgi] Cookie header: edge-token=xxx; ...` or `(absent)` | ChMateがCookieを送信しているか |
| 2 | extractEdgeToken結果 | `[bbs.cgi] edgeToken from cookie: a1b2c3d4...` or `null` | Cookieからトークンが正しくパースできたか |
| 3 | write_token検出 | `[bbs.cgi] write_token detected: true/false` | mail欄にwrite_tokenがあるか |
| 4 | write_token検証結果 | `[bbs.cgi] write_token verification: valid/invalid` | write_tokenが有効か |
| 5 | resolveAuth結果 | `[bbs.cgi] resolveAuth result: authenticated=true/false` | 認証判定の最終結果 |
| 6 | Set-Cookie設定時 | `[bbs.cgi] Setting edge-token cookie: a1b2c3d4...` | レスポンスにCookieが付与されたか |

### 2. 成功レスポンスへのSet-Cookie追加（eddist整合）

**変更前:** 認証要求時とwrite_token使用時のみSet-Cookie設定
**変更後:** 通常の成功レスポンス（Cookie認証済みの書き込み成功）にもSet-Cookie設定

eddist（参考実装）は全ての成功レスポンスでSet-Cookie: edge-tokenを設定している。これに合わせた。

### 3. 手動デプロイ防止hook追加

`.claude/hooks/block-manual-deploy.sh` を新規作成。
AI が `build:cf` / `wrangler deploy` / `vercel deploy` を実行しようとした場合にブロックする。
ローカル環境変数（`wrangler.toml` の `NEXT_PUBLIC_BASE_URL=localhost`）が本番ビルドに混入する事故を防止する。

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/app/(senbra)/test/bbs.cgi/route.ts` | 診断ログ6箇所追加 + 成功レスポンスにsetEdgeTokenCookie追加 |
| `.claude/hooks/block-manual-deploy.sh` | 新規作成。手動デプロイ・本番ビルドのブロックhook |
| `.claude/settings.local.json` | PreToolUseフック設定追加 |

## テスト手順

### 前提
- Cloudflare自動デプロイが完了していること（`npx wrangler deployments list --name battle-board` で最新デプロイを確認）

### 手順1: ChMateで初回書き込み（認証フロー起動）
1. ChMateで https://battle-board.shika.workers.dev/ のスレッドに書き込む
2. 認証画面が表示される → **認証URLがlocalhostでないことを確認**（localhost問題の修復確認）
3. Cloudflareダッシュボード > Workers > battle-board > Logs でログを確認

**期待ログ:**
```
[bbs.cgi] Cookie header: (absent)  ← 初回なのでCookieなし
[bbs.cgi] edgeToken from cookie: null
[bbs.cgi] write_token detected: false
[bbs.cgi] resolveAuth result: authenticated=false, reason=...
```

### 手順2: 認証完了 → write_tokenで書き込み
1. ブラウザで認証ページにアクセスし、認証コード入力 + Turnstile完了
2. 表示されたwrite_tokenをコピー
3. ChMateのmail欄に `sage#<write_token>` を入力して書き込み

**期待ログ:**
```
[bbs.cgi] Cookie header: ... ← Cookieの有無を確認
[bbs.cgi] edgeToken from cookie: ... ← Cookieが解析できたか
[bbs.cgi] write_token detected: true
[bbs.cgi] write_token verification: valid
[bbs.cgi] resolveAuth result: authenticated=true, reason=N/A
[bbs.cgi] Setting edge-token cookie: xxxxxxxx...
```

### 手順3: write_tokenなしで再書き込み（核心テスト）
1. ChMateのmail欄から write_token を除去し `sage` のみにする
2. そのまま書き込む

**このステップのログが根本原因を特定する。**

| ログパターン | 意味 | 原因 |
|---|---|---|
| `Cookie header: (absent)` + `edgeToken: null` | ChMateがCookieを送信していない | ChMateのCookie保存に問題（H1） |
| `Cookie header: edge-token=...` + `edgeToken: null` | Cookieはあるがパース失敗 | extractEdgeTokenのバグ（H2） |
| `edgeToken: xxxxxxxx...` + `authenticated=false` | トークンはあるがDB検証失敗 | is_verifiedリセットまたはトークン不一致（H3/H4） |
| `edgeToken: xxxxxxxx...` + `authenticated=true` | 正常動作 | 問題解消（Set-Cookie追加が効いた） |

## ログの確認方法

Cloudflareダッシュボード:
1. https://dash.cloudflare.com/ にログイン
2. Workers & Pages > battle-board > Logs > Real-time Logs
3. ChMateから書き込みを実行し、ログストリームを確認
