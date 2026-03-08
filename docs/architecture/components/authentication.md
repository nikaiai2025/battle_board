# D-08 コンポーネント境界設計書: Authentication（認証）

> ステータス: ドラフト / 2026-03-08
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
  | { valid: false; reason: "not_found" | "ip_mismatch" }
```

IP不一致時の挙動：`reason: "ip_mismatch"` を返しつつも、**呼び出し元（PostService）はこの場合も処理を続行**する（警告ログ記録のみ）。拒否するかどうかはPostServiceの判断に委ねる。

```
issueAuthCode(ipHash: string, edgeToken: string): AuthCodeResult
```
```
AuthCodeResult {
  code:      string   // 6桁数字
  expiresAt: Date
}
```

```
verifyAuthCode(code: string, turnstileToken: string, ipHash: string): boolean
```
Turnstile検証はAuthService内でTurnstileClientを呼び出す。外部から見れば「コードとTurnstileトークンを渡すと有効化される」インターフェース。

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
| AuthCodeRepository | 認証コードの保存・検索・更新 |
| UserRepository | edge-tokenとuserレコードの紐付け |
| TurnstileClient | Cloudflare Turnstile API呼び出し（認証コード有効化時のみ） |
| SupabaseAuth（外部SDK） | 管理者セッション検証 |

### 3.2 被依存

```
PostService     →  AuthService.verifyEdgeToken()
WebAPIRoute     →  AuthService.issueAuthCode()
                →  AuthService.verifyAuthCode()
AdminAPIRoute   →  AuthService.verifyAdminSession()
```

---

## 4. 隠蔽する実装詳細

- edge-tokenの生成アルゴリズム（CSPRNG等。実装詳細）
- `author_id_seed` の生成方法（`sha512(reduced_ip)`。AuthService内で完結）
- `reduced_ip` の計算（IPv4はそのまま / IPv6は/48プレフィックスに縮約）
- AuthCodeのDBスキーマ詳細

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

### AuthCodeのIP整合はソフトチェック

認証コード発行時のIPと有効化時のIPを比較するが、不一致でも有効化は成功させる（モバイル回線のIP変動を考慮）。ログに記録するのみ。
