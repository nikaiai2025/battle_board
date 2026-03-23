# D-08 コンポーネント境界設計書: Authentication（認証）

> ステータス: 運用中
> 関連D-07: § 5 認証アーキテクチャ

---

## 1. 分割方針

認証の責務を「一般ユーザー認証（edge-token）」「管理者認証（Supabase Auth）」「ボット認証（APIキー）」の3系統に分け、前者2系統をAuthServiceが統括する。ボット認証はAPIキー検証のみでシンプルなため、Middlewareで処理しAuthServiceには委譲しない。

管理者セッションと一般ユーザーのedge-tokenは**Cookie名・検証ロジック・保存先**をすべて分離し、コードレベルで混在しない設計とする。

---

## 2. 公開インターフェース

### 2.1 一般ユーザー認証

```
verifyEdgeToken(token: string, ipHash: string): VerifyResult
```
```
VerifyResult:
  | { valid: true;  userId: UUID; authorIdSeed: string }
  | { valid: false; reason: "not_found" | "ip_mismatch" | "not_verified" }
```

`reason` の意味:
- `not_found`: edge-token が存在しない（未認証ユーザー）
- `not_verified`: edge-token は存在するが `is_verified=false`（Turnstile未検証）。G1対応。
- `ip_mismatch`: IP不一致（認証済みだが警告ログのみ。呼び出し元が処理継続を判断する）

IP不一致時の挙動：`reason: "ip_mismatch"` を返しつつも、**呼び出し元（PostService）はこの場合も処理を続行**する（警告ログ記録のみ）。拒否するかどうかはPostServiceの判断に委ねる。

`not_verified` 時の挙動：PostServiceの `resolveAuth` が認証ページへの案内を再表示する。
See: features/authentication.feature @edge-token発行後、Turnstile未通過で再書き込みすると認証が再要求される

```
verifyAuth(turnstileToken: string, edgeToken: string, ipHash: string): VerifyAuthResult
```
```
VerifyAuthResult:
  | { success: true;  writeToken: string }  // 専ブラ向け認証橋渡しトークン（32文字 hex）
  | { success: false }
```

Turnstile検証はAuthService内でTurnstileClientを呼び出す。外部から見れば「Turnstileトークンを渡すとedge-tokenが有効化され、write_tokenが返される」インターフェース。
検証成功時に `users.is_verified = true` に更新し、write_tokenを `auth_codes` テーブルに保存する。
See: features/authentication.feature @Turnstile通過で認証に成功する
See: features/specialist_browser_compat.feature @専ブラ認証フロー

```
verifyWriteToken(writeToken: string): VerifyWriteTokenResult
```
```
VerifyWriteTokenResult:
  | { valid: true;  edgeToken: string }
  | { valid: false }
```

専ブラの mail 欄に `#<write_token>` 形式で貼り付けて送信する場合に、bbs.cgi ルートが呼び出す。
ワンタイム消費（検証成功時に `auth_codes.write_token = null` に更新）。
See: features/specialist_browser_compat.feature @認証完了後に write_token をメール欄に貼り付けて書き込みが成功する
See: features/specialist_browser_compat.feature @無効な write_token では書き込みが拒否される

### 2.2 日次リセットID生成

`daily-id` はドメインルール（純粋関数）として独立しており、AuthServiceは生成の入力を組み立てて委譲するだけ。

```
generateDailyId(authorIdSeed: string, boardId: string, dateJst: string): string
```
AuthService経由ではなく、PostServiceが直接domain rulesを呼び出す。AuthServiceはこの関数を所有しない。

### 2.3 管理者認証

```
verifyAdminSession(sessionToken: string): AdminSession | null
```
Supabase Authのセッション検証をラップするだけ。管理者認証の実体はSupabase Auth側。

---

## 3. 依存関係

### 3.1 依存先

| コンポーネント | 依存の性質 |
|---|---|
| AuthCodeRepository | 認証レコードの保存・更新（verified, write_token, write_token_expires_at） |
| UserRepository | edge-tokenとuserレコードの紐付け・is_verified フラグの更新 |
| TurnstileClient | Cloudflare Turnstile API呼び出し（認証時） |
| SupabaseAuth（外部SDK） | 管理者セッション検証 |

### 3.2 被依存

```
PostService     →  AuthService.verifyEdgeToken()
WebAPIRoute     →  AuthService.verifyAuth()
AdminAPIRoute   →  AuthService.verifyAdminSession()
BbsCgiRoute     →  AuthService.verifyWriteToken()
```

---

## 4. 隠蔽する実装詳細

- edge-tokenの生成アルゴリズム（CSPRNG等。実装詳細）
- `author_id_seed` の生成方法（`sha512(reduced_ip)`。AuthService内で完結）
- `reduced_ip` の計算（IPv4はそのまま / IPv6は/48プレフィックスに縮約）
- AuthCodeのDBスキーマ詳細
- write_tokenの生成アルゴリズム（`crypto.randomBytes(16).toString('hex')` で32文字 hex）

---

## 5. 設計上の判断

### edge-tokenはCookieで保持、AuthServiceはCookieを直接操作しない

Cookie の読み書きはHTTPレイヤー（Route Handler / Middleware）が行う。AuthServiceはトークン文字列の検証・発行だけを担い、Cookieへの書き込みを行わない。これにより、AuthServiceはHTTPコンテキストに依存しないため、BotServiceからも同一インターフェースで呼び出せる。

### 2つのCookieは命名で明示的に分離

| Cookie名 | 用途 |
|---|---|
| `edge_token` | 一般ユーザーの認証トークン |
| `admin_session` | 管理者セッション（Supabase Auth発行） |

Middlewareでは `edge_token` と `admin_session` を独立したパスで処理し、コードパスが交差しない。

### is_verified フラグによる認証バイパス防止（G1対応）

`users.is_verified` フラグにより、edge-tokenが存在してもTurnstile検証が完了していない場合は書き込みを拒否する。フラグは `verifyAuth` 成功時または `verifyWriteToken` 成功時に `true` に更新される。

`verifyEdgeToken` での検証順序:
1. edge-token の存在確認（`not_found` チェック）
2. `is_verified` チェック（`not_verified` チェック）— IPチェックより先に実施
3. IPハッシュ整合チェック（ソフトチェック）

### write_token方式（専ブラ認証対応、G4対応）

専ブラは WebView を持たないため Turnstile ウィジェット表示不可であり、Web UIの `/auth/verify` ページで認証を完了した後、Cookie を共有できない場合がある。
この問題を解決するために write_token 方式を採用する。

認証フロー:
1. ユーザーが Web UI の `/auth/verify` で Turnstile を通過する
2. 検証成功時に `verifyAuth` が write_token（32文字 hex）を生成して返却する
3. 専ブラの mail 欄に `#<write_token>` 形式で貼り付けて書き込みを行う
4. bbs.cgi ルートが mail 欄から write_token を検出し、`verifyWriteToken` を呼び出す
5. 検証成功時に edge-token を取得して Cookie に設定し、書き込み処理を継続する

write_token の仕様:
- `crypto.randomBytes(16).toString('hex')` で32文字 hex を生成
- `auth_codes` テーブルに保存（`write_token`, `write_token_expires_at` カラム）
- 有効期限: 認証完了から10分（ワンタイム消費）
- 使用後は `auth_codes.write_token = null` に更新して再利用を防ぐ
- Cookie 共有の専ブラ（認証後そのまま書き込める場合）では write_token は不要

See: features/specialist_browser_compat.feature @専ブラ認証フロー

---

## 6. 統一認証フロー

Web UI と専ブラで異なっていた認証経路をサービス層で統一する。

```
[初回書き込み]
  → edge-token 発行（is_verified=false）
  → 認証案内（Web UI: 画面遷移 / 専ブラ: HTML に認証 URL 表示）

[認証ページ /auth/verify]（Web UI・専ブラ共用）
  → Turnstile 通過
  → 検証成功 → is_verified=true + write_token 発行

[書き込み再開]
  → Web UI: Cookie が既に有効 → そのまま書き込み
  → 専ブラ（Cookie 共有）: そのまま書き込み
  → 専ブラ（Cookie 非共有）: mail 欄に #<write_token> → Cookie 設定 → 書き込み
```
