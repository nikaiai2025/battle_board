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

CLI（リアルタイムのみ。過去ログは永続保存されない）:
```
npx wrangler tail battle-board --format pretty --search "[bbs.cgi]"
```

---

## 検証結果

### 第1回検証（SameSite=Lax — 修正前）

`wrangler tail` で取得したリアルタイムログ:

```
# 手順1: 初回書き込み → 認証要求（期待通り）
POST /test/bbs.cgi?guid=ON @ 2026/3/15 4:27:09
  [bbs.cgi] Cookie header: (absent)
  [bbs.cgi] edgeToken from cookie: null
  [bbs.cgi] write_token detected: false
  [bbs.cgi] resolveAuth result: authenticated=false, reason=313523

# 手順2: write_tokenで書き込み → 成功、Set-Cookie発行（期待通り）
POST /test/bbs.cgi?guid=ON @ 2026/3/15 4:27:42
  [bbs.cgi] Cookie header: (absent)
  [bbs.cgi] edgeToken from cookie: null
  [bbs.cgi] write_token detected: true
  [bbs.cgi] write_token verification: valid
  [bbs.cgi] Setting edge-token cookie: 0e6f10f0...
  [bbs.cgi] resolveAuth result: authenticated=true, reason=N/A

# 手順3: write_tokenなしで再書き込み → Cookieが送信されず再認証（★問題再現）
POST /test/bbs.cgi?guid=ON @ 2026/3/15 4:28:01
  [bbs.cgi] Cookie header: (absent)     ← ★ Set-Cookieしたはずのedge-tokenが送信されていない
  [bbs.cgi] edgeToken from cookie: null
  [bbs.cgi] write_token detected: false
  [bbs.cgi] resolveAuth result: authenticated=false, reason=727354
```

**判定: H1確定** — ChMateがSet-CookieレスポンスからCookieを保存していない。

### 仮説の絞り込み

Set-Cookieヘッダに `SameSite=Lax` を設定していたため、POSTリクエストにCookieが付与されないのではと仮説を立て `SameSite=None; Secure` に変更してデプロイ。

### 第2回検証（SameSite=None; Secure）

```
# 手順1〜3を再実施。結果は第1回と同一。
POST /test/bbs.cgi?guid=ON @ 2026/3/15 4:46:32
  [bbs.cgi] Cookie header: (absent)
POST /test/bbs.cgi?guid=ON @ 2026/3/15 4:46:54
  [bbs.cgi] Cookie header: (absent)
  [bbs.cgi] write_token detected: true / verification: valid
  [bbs.cgi] Setting edge-token cookie: 9a9a73ad...
POST /test/bbs.cgi?guid=ON @ 2026/3/15 4:47:07
  [bbs.cgi] Cookie header: (absent)     ← ★ まだCookieが送信されない
```

**判定:** SameSiteの問題ではない。`Secure`属性自体がChMateのCookie保存を阻害している可能性。

### eddist参考実装の調査

eddist（`github.com/edginer/eddist`）の `eddist-server/src/shiftjis.rs` > `add_set_cookie` を調査:

```rust
pub fn add_set_cookie(self, key: String, value: String, max_age: time::Duration) -> Self {
    let mut cookie = Cookie::new(key, value);
    cookie.set_http_only(true);
    cookie.set_max_age(max_age);
    cookie.set_path("/");
    // Secure, SameSite, Domain は意図的に未設定
}
```

| 属性 | eddist | BattleBoard（修正前） |
|---|---|---|
| HttpOnly | あり | あり |
| Secure | **なし** | あり |
| SameSite | **なし** | Lax → None |
| Path | `/` | `/` |
| Max-Age | 365日 | 30日 |

eddistは `Secure` と `SameSite` を**意図的に設定していない**。
専ブラ（ChMate等）はHTTPレスポンスのSet-Cookieヘッダを処理する際、`Secure`属性が付いたCookieを保存しない挙動を示す。

### 第3回検証（Secure, SameSite 両方削除 — eddist準拠）

Set-Cookieの属性を `HttpOnly; Max-Age=2592000; Path=/` のみに変更してデプロイ。

**結果: ChMateでCookieが正常に保存・送信され、write_token不要で連続書き込みが成功した。**

## 根本原因

**Set-Cookieヘッダの `Secure` 属性。**

ChMate等の5ch専用ブラウザは、内部のHTTPクライアント実装において `Secure` 属性付きCookieを保存しない（または送信しない）。ブラウザ標準の挙動（HTTPS接続時は `Secure` Cookieを送信する）とは異なる。

eddistはこの専ブラの挙動を前提として、Set-Cookieに `Secure` / `SameSite` を設定していない。

## 修正内容（最終）

`src/app/(senbra)/test/bbs.cgi/route.ts` > `setEdgeTokenCookie`:

```typescript
// 修正前
const cookieOptions = [
    `${EDGE_TOKEN_COOKIE}=${edgeToken}`,
    "HttpOnly",
    isProduction ? "Secure" : "",
    "SameSite=Lax",
    "Max-Age=2592000",
    "Path=/",
]

// 修正後（eddist準拠）
const cookieOptions = [
    `${EDGE_TOKEN_COOKIE}=${edgeToken}`,
    "HttpOnly",
    "Max-Age=2592000",
    "Path=/",
]
```

## 教訓

1. **専ブラ向けSet-Cookieには `Secure` / `SameSite` を設定してはならない。** 一般的なWebセキュリティのベストプラクティス（Secure + SameSite=Strict/Lax）は専ブラ互換性と両立しない。
2. **eddistの実装は専ブラ互換性の知識の宝庫** であり、Cookie属性のような「設定しないことが正解」のパターンが存在する。新たなHTTP応答を追加する際はeddistを参照すべき。
3. **診断ログは有効だった。** `Cookie header: (absent)` という1行で、サーバー側ロジック（IF分岐）の問題ではなくクライアント側のCookie送信問題であることを即座に切り分けられた。
