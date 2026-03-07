# D-08 コンポーネント設計書: AuthService

> 作成日: 2026-03-07
> 対象: Phase 1 (MVP)

## 1. 概要

一般ユーザーの書き込み認証（edge-token + 認証コード + Turnstile）と管理者認証（Supabase Auth）を提供するコンポーネント。2つの認証方式は完全に分離されている。

## 2. 責務

- edge-token の発行・検証・有効化
- 6桁認証コードの発行・検証
- Cloudflare Turnstile の検証
- 日次リセットID（author_id_seed）の生成
- 管理者ログインの処理（Supabase Auth への委譲）
- ボット API キーの検証

## 3. 依存関係

```
AuthService
  ├── AuthCodeRepository      (認証コードの読み書き)
  ├── UserRepository          (ユーザーの読み書き)
  ├── TurnstileClient         (Cloudflare Turnstile API)
  ├── SupabaseAuth            (管理者認証)
  └── IpExtractor             (クライアントIP抽出)
```

## 4. 一般ユーザー認証

### 4.1 edge-token 発行

```typescript
interface EdgeToken {
  tokenId: string;       // UUID
  ipHash: string;        // sha512(reduced_ip) の先頭N文字
  isVerified: boolean;   // 認証コード検証済みか
  expiresAt: Date;       // 有効期限
}
```

- Cookie 名: `edge-token`
- HttpOnly, Secure, SameSite=Lax
- 有効期限: TBD（数日〜数週間）

### 4.2 認証コード発行

```typescript
interface AuthCode {
  id: string;            // UUID
  code: string;          // 6桁数字（ランダム生成）
  tokenId: string;       // 対応する edge-token
  ipHash: string;        // 発行時の IP ハッシュ
  verified: boolean;     // 検証済みフラグ
  expiresAt: Date;       // 有効期限（数分）
}
```

### 4.3 認証フロー

```
validateToken(edgeToken: string | undefined)
│
├── edgeToken が undefined / 空
│   └── issueNewToken()
│       ├── reduced_ip を抽出
│       ├── edge-token を生成（未検証状態）
│       ├── 6桁認証コードを生成
│       ├── auth_codes テーブルに INSERT
│       └── return { status: 'unauthenticated', token, authCodeUrl }
│
├── edgeToken が存在
│   ├── DB から token レコードを取得
│   │   → 不存在 or 期限切れ: issueNewToken() と同じフロー
│   ├── isVerified = false
│   │   └── return { status: 'pending_verification' }
│   └── isVerified = true
│       ├── IP整合チェック（現在のIPと登録時IPの比較）
│       │   → 不一致時の方針: 警告ログ記録、ただし通過させる（IP変動を考慮）
│       └── return { status: 'authenticated', userId, dailyId, displayName }
```

### 4.4 認証コード検証

```
verifyAuthCode(code: string, turnstileToken: string, edgeToken: string)
│
├── 1. edge-token から tokenId を取得
├── 2. auth_codes から該当レコードを検索
│   └── WHERE token_id = :tokenId AND code = :code
│       → 不存在: エラー
│       → 期限切れ: エラー
│       → 検証済み: エラー
├── 3. Turnstile 検証
│   └── TurnstileClient.verify(turnstileToken)
│       → 失敗: エラー
├── 4. IP 整合チェック
│   └── 発行時の ipHash と現在の ipHash を比較
│       → 不一致: エラー（別環境からの利用を防止）
├── 5. auth_codes.verified = true に UPDATE
├── 6. ユーザーレコードの作成/更新
│   ├── users テーブルに該当の author_id_seed が存在するか？
│   │   → 不在: INSERT（初期通貨50を付与）
│   │   → 存在: auth_token を更新
│   └── author_id_seed = sha512(reduced_ip)
└── 7. return { status: 'verified', userId }
```

## 5. 日次リセットID

```typescript
function generateDailyId(
  authorIdSeed: string,
  boardId: string,
  dateJst: string        // "YYYY-MM-DD"
): string {
  const hash = sha256(dateJst + boardId + authorIdSeed);
  return hash.substring(0, 8);  // 8文字に切り詰め
}
```

- `authorIdSeed` は `sha512(reduced_ip)` — ユーザー登録時に生成し users テーブルに保存
- 同日・同板・同seed → 同一ID
- `reduced_ip` の定義: IPv4はそのまま、IPv6は /48 プレフィックスに縮約（同一回線判定）

## 6. 管理者認証

```
adminLogin(email: string, password: string)
│
├── 1. SupabaseAuth.signInWithPassword(email, password)
│   → 失敗: 401 エラー
├── 2. admin_users テーブルで role = 'admin' を確認
│   → 不在 or role ≠ admin: 403 エラー
├── 3. admin_session Cookie を発行
│   └── HttpOnly, Secure, SameSite=Strict
└── 4. return { status: 'authenticated' }
```

- Cookie 名: `admin_session`（edge-token とは別名・別ミドルウェア）
- 管理者セッションの有効期限: Supabase Auth のデフォルト

## 7. ボット認証

```
validateBotApiKey(apiKey: string)
│
├── 環境変数 BOT_API_KEY と一致するか確認
│   → 一致: return { status: 'bot', botId: ... }
│   → 不一致: 401 エラー
```

- API キーは GitHub Actions Secrets に格納
- リクエストヘッダ `X-Bot-API-Key` で送信

## 8. IP 抽出

```typescript
interface IpExtractor {
  extract(request: Request): string;
}
```

- Vercel 環境: `x-forwarded-for` ヘッダの先頭IPを採用
- 将来 Cloudflare 前段化時: `cf-connecting-ip` 優先に切替可能な構造
- `reduced_ip`: IPv4 はそのまま、IPv6 は先頭48ビットに縮約

## 9. セキュリティ考慮事項

| 脅威 | 対策 |
|---|---|
| 認証コード総当り | 6桁 × 短い有効期限（数分）で現実的な攻撃を困難に |
| edge-token 窃取 | HttpOnly Cookie。IP整合チェック（警告レベル） |
| Turnstile バイパス | サーバーサイドで Turnstile API を検証 |
| 管理者セッション窃取 | SameSite=Strict。2FA推奨（初期リリースでの導入は要確認） |
| ヘッダ偽装によるIP詐称 | Vercel の信頼プロキシ前提。直接公開エンドポイントでは偽装不可 |
