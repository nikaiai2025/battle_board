# D-08 コンポーネント境界設計書: UserRegistration（本登録・ログイン）

> ステータス: 運用中
> 関連D-07: § 5 認証アーキテクチャ
> 関連D-08: authentication.md（既存の認証コンポーネント。本書は拡張）
> 関連BDD: features/user_registration.feature

---

## 1. 概要

Phase 1-2 の「仮ユーザー」（edge-token + Turnstile認証のみ）に加え、メールアドレスまたは Discord アカウントによる「本登録」を導入する。本登録により Cookie 喪失・端末変更時にログインで同一ユーザーに復帰でき、アイデンティティの永続化を実現する。

**本登録と有料・無料は直交する別概念:**

|          | 無料         | 有料         |
|----------|-------------|-------------|
| 仮ユーザー | ✅ 存在する   | ❌ ポリシー上不可 |
| 本登録    | ✅ 存在する   | ✅ 存在する   |

課金（有料ステータス切り替え）には本登録が前提条件となる。

---

## 2. 用語定義

| 用語 | 定義 | DB上の判定 |
|---|---|---|
| **仮ユーザー** | edge-token + Turnstile で認証済み、Supabase Auth 未連携 | `users.supabase_auth_id IS NULL` |
| **本登録ユーザー** | Supabase Auth アカウント連携済み | `users.supabase_auth_id IS NOT NULL` |
| **本登録** | 仮ユーザーが自分の users レコードに Supabase Auth アカウントを紐付ける行為 | |
| **PAT** | パーソナルアクセストークン。本登録完了時に自動発行される専ブラ連携用の長期トークン | `users.pat_token` |

---

## 3. データモデル変更

### 3.1 `users` テーブル拡張

```sql
ALTER TABLE users
  ADD COLUMN supabase_auth_id   UUID UNIQUE NULL,       -- Supabase Auth user.id
  ADD COLUMN registration_type  VARCHAR NULL,            -- 'email' | 'discord'
  ADD COLUMN registered_at      TIMESTAMPTZ NULL,        -- 本登録完了日時
  ADD COLUMN pat_token          VARCHAR(64) UNIQUE NULL, -- PAT（平文。常時表示のため）
  ADD COLUMN pat_last_used_at   TIMESTAMPTZ NULL;        -- PAT 最終使用日時
```

**PAT 平文保存の根拠:**
- マイページに常時表示する要件があり、ハッシュ（不可逆）では実現不可
- `users.auth_token`（edge-token）が既に平文保存されており、PAT のみハッシュ化しても全体のセキュリティは向上しない
- ChMate は bbsmenu の https:// 指定を無視して常に HTTP:80 で通信する（senbra_protocol_diagnosis_2026-03-16.md で確定）ため、この経路では edge-token・write_token・PAT が同条件で平文送信される。Siki および Web UI は HTTPS
- 可逆暗号化（AES 等）は暗号鍵が同一サーバー上に置かれるため、DB 漏洩時の追加防御にならない
- Supabase RLS により `users` テーブルは「自分のレコードのみ」参照可能であり、他ユーザーの PAT は読めない

### 3.2 新テーブル: `edge_tokens`

本登録ユーザーが複数デバイスで同一ユーザーとして書き込むために、edge-token を複数保持できる構造にする。

```sql
CREATE TABLE edge_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  token        VARCHAR NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_edge_tokens_token ON edge_tokens(token);
CREATE INDEX idx_edge_tokens_user_id ON edge_tokens(user_id);
```

**`users.auth_token` からの移行:**

```sql
-- 既存データの移行
INSERT INTO edge_tokens (user_id, token, created_at, last_used_at)
SELECT id, auth_token, created_at, NOW()
FROM users
WHERE auth_token IS NOT NULL;

-- 移行完了後、users.auth_token は廃止（カラム削除は段階的に実施）
```

移行後、`verifyEdgeToken` は `edge_tokens` テーブルを参照する。

### 3.3 RLS ポリシー追加

```sql
ALTER TABLE edge_tokens ENABLE ROW LEVEL SECURITY;
-- edge_tokens: anon / authenticated からの全操作を拒否
-- service_role のみアクセス可能（認証トークンの漏洩防止）
```

### 3.4 ER 図（変更部分）

```
┌──────────────┐
│    users     │
├──────────────┤
│ id (PK)      │◄──────┐
│ auth_token   │ ← 廃止│  ┌──────────────┐
│ supabase_    │       ├──│ edge_tokens  │
│   auth_id    │       │  ├──────────────┤
│ registration │       │  │ id (PK)      │
│   _type      │       │  │ user_id (FK) │──► users.id
│ registered_at│       │  │ token (UQ)   │
│ pat_token(UQ)│       │  │ created_at   │
│ pat_last_    │       │  │ last_used_at │
│   used_at    │       │  └──────────────┘
│ ...既存カラム │       │
└──────────────┘       │
                       │
      ※ 既存の currencies, posts,
        incentive_logs 等は user_id で
        紐付いており変更なし
```

---

## 4. 状態遷移（user_state_transitions.yaml の拡張）

### 4.1 登録状態（新設）

```
                     ┌──────────┐
                     │ 仮ユーザー │ ← 初期状態（Phase 1-2 の全ユーザー）
                     └────┬─────┘
                          │ 本登録（メール確認完了 or Discord 認可完了）
                          │ action: supabase_auth_id 紐付け, PAT 自動発行
                          ▼
                     ┌───────────┐
                     │本登録ユーザー│
                     └───────────┘
```

- 本登録ユーザーから仮ユーザーへの遷移はない（不可逆）
- 本登録ユーザーは認証方法（email / discord）を変更できない（MVP スコープ外）

### 4.2 認証状態（既存の拡張）

```
  ┌──────────────┐
  │  未認証       │ ← Cookie なし
  └──────┬───────┘
         │ 書き込みリクエスト
         ▼
  ┌──────────────┐
  │ edge-token   │ ← edge-token 発行済み, is_verified=false
  │ 発行済み      │
  └──────┬───────┘
         │ Turnstile 検証成功
         ▼
  ┌──────────────┐
  │  認証済み     │ ← edge-token 有効, is_verified=true
  │ （仮ユーザー） │
  └──────┬───────┘
         │ 本登録完了
         ▼
  ┌──────────────┐     Cookie 喪失
  │  認証済み     │ ──────────────► 未認証
  │（本登録ユーザー）│              │
  └──────┬───────┘              │ ログイン or PAT
         │                      │  → 新 edge-token 発行
         │ ◄────────────────────┘  → 同一ユーザーに復帰
         │
         │ ログアウト
         ▼
  ┌──────────────┐
  │  未認証       │ ← Cookie 削除, edge_tokens 行削除
  └──────────────┘
```

### 4.3 課金制約（既存の変更）

```
account_transitions:
  - from: free_user
    to: premium_user
    trigger: 課金ボタン押下
    guard:
      - supabase_auth_id IS NOT NULL  # ← 新設ガード: 本登録必須
    action:
      - is_premium = true に更新
    feature_ref: user_registration.feature#本登録済みの無料ユーザーは課金できる
```

---

## 5. 公開インターフェース

### 5.1 本登録（AuthService 拡張）

```
registerWithEmail(
  userId: UUID,           -- 現在の仮ユーザーの user_id
  email: string,
  password: string
): RegisterResult
```
```
RegisterResult:
  | { success: true }                    -- 確認メール送信済み
  | { success: false; reason: "already_registered" | "email_taken" }
```

Supabase Auth `signUp()` を呼び出す。メール確認完了は Supabase Auth のコールバックで処理。

```
registerWithDiscord(userId: UUID): { redirectUrl: string }
```

Supabase Auth `signInWithOAuth({ provider: 'discord' })` の認可 URL を返す。

```
completeRegistration(
  userId: UUID,
  supabaseAuthId: UUID,
  registrationType: 'email' | 'discord'
): void
```

OAuth コールバックまたはメール確認完了時に呼び出される内部関数。
- `users.supabase_auth_id` を設定
- `users.registration_type` を設定
- `users.registered_at` を設定
- PAT を自動生成して `users.pat_token` に保存

### 5.2 ログイン（AuthService 拡張）

```
loginWithEmail(email: string, password: string): LoginResult
```
```
LoginResult:
  | { success: true; userId: UUID; edgeToken: string }
  | { success: false; reason: "invalid_credentials" | "not_registered" }
```

処理:
1. Supabase Auth `signInWithPassword()` で認証
2. `supabase_auth_id` で `users` レコードを検索
3. 新しい edge-token を生成し `edge_tokens` に INSERT
4. edge-token を返却（呼び出し元が Cookie に設定）

```
loginWithDiscord(): { redirectUrl: string }
```

Discord OAuth フロー開始。コールバックで `handleOAuthCallback` を呼ぶ。

```
handleOAuthCallback(code: string): LoginResult
```

Supabase Auth `exchangeCodeForSession()` でセッション取得。以降は `loginWithEmail` と同様の流れ。

### 5.3 ログアウト（AuthService 拡張）

```
logout(edgeToken: string): void
```

処理:
1. `edge_tokens` から該当トークンの行を DELETE
2. 呼び出し元が Cookie を削除

### 5.4 PAT 管理（AuthService 拡張）

```
regeneratePat(userId: UUID): { patToken: string }
```

処理:
1. `crypto.randomBytes(16).toString('hex')` で 32 文字の新 PAT を生成
2. `users.pat_token` を上書き（旧 PAT は即時無効化）
3. 新 PAT を返却

```
verifyPat(patToken: string): VerifyPatResult
```
```
VerifyPatResult:
  | { valid: true; userId: UUID }
  | { valid: false }
```

処理:
1. `users` テーブルで `pat_token = :patToken` を検索
2. 見つかれば `pat_last_used_at` を更新して返却
3. 見つからなければ `{ valid: false }`

### 5.5 edge-token 検証（既存の改修）

```
verifyEdgeToken(token: string, ipHash: string): VerifyResult
```

変更点: `users.auth_token` ではなく `edge_tokens.token` で検索する。

```sql
SELECT et.user_id, u.author_id_seed, u.is_verified
FROM edge_tokens et
JOIN users u ON u.id = et.user_id
WHERE et.token = :token
```

---

## 6. 認証判定フロー（改訂版）

bbs.cgi ルートおよび Web API での認証判定フロー。上から順に判定し、最初に成功した方式で認証する。

```
書き込みリクエスト到着
    │
    ├─① edge-token Cookie あり？
    │     YES → edge_tokens テーブルで検索
    │             → 見つかった + is_verified=true → user_id 取得 → 認証OK
    │             → 見つかった + is_verified=false → 認証案内
    │             → 見つからない → ②へ
    │     NO → ②へ
    │
    ├─② mail 欄に #pat_ プレフィクスあり？（専ブラのみ）
    │     YES → verifyPat() で照合
    │             → 有効 → user_id 特定, 新 edge-token 発行
    │                     → Cookie 設定 → 認証OK
    │             → 無効 → エラー応答
    │     NO → ③へ
    │
    ├─③ mail 欄に #<32文字hex> あり？（既存 write_token）
    │     YES → verifyWriteToken()（既存フロー）
    │     NO → ④へ
    │
    └─④ 未認証 → 認証案内（既存フロー）

※ ①で Cookie 認証に成功した場合でも、mail 欄に #pat_ や #<hex> が
   含まれていれば除去してから PostService に渡す（DAT 漏洩防止）
```

### mail 欄パース正規表現

```typescript
// PAT パターン: #pat_ に続く 32 文字の hex
const PAT_PATTERN = /#pat_([0-9a-f]{32})/i;

// write_token パターン（既存）: # に続く 32 文字の hex
const WRITE_TOKEN_PATTERN = /#([0-9a-f]{32})/i;

// 判定順序: PAT → write_token（PAT は _ を含むため write_token 正規表現にマッチしない）
```

衝突しない根拠: `#pat_a1b2...` の `_` は hex 文字ではないため、`/#([0-9a-f]{32})/i` にマッチしない。

---

## 7. 本登録フロー詳細

### 7.1 メール認証

```
仮ユーザー（edge-token 認証済み）
    │
    │  マイページ → 「本登録」
    │  メールアドレス + パスワード入力
    ▼
┌─────────────────────────────────┐
│  POST /api/auth/register         │
│  ① edge-token Cookie で仮ユーザー│
│     を特定                       │
│  ② Supabase Auth signUp()        │
│     → 確認メール送信              │
│  ③ クライアントに「確認待ち」応答  │
└─────────────────────────────────┘
    │
    │  ユーザーがメール内リンクをクリック
    ▼
┌─────────────────────────────────┐
│  GET /api/auth/callback          │
│  ① Supabase Auth セッション確立  │
│  ② completeRegistration()        │
│     → supabase_auth_id 紐付け    │
│     → registration_type = 'email'│
│     → registered_at = NOW()      │
│     → PAT 自動生成               │
│  ③ マイページにリダイレクト       │
└─────────────────────────────────┘
```

### 7.2 Discord 連携

```
仮ユーザー（edge-token 認証済み）
    │
    │  マイページ → 「Discord で本登録」
    ▼
┌─────────────────────────────────┐
│  POST /api/auth/register/discord │
│  ① Supabase Auth OAuth URL 生成  │
│  ② Discord 認可画面にリダイレクト │
└─────────────────────────────────┘
    │
    │  ユーザーが Discord で「許可」
    ▼
┌─────────────────────────────────┐
│  GET /api/auth/callback          │
│  ① Supabase Auth コード交換      │
│  ② completeRegistration()        │
│     → supabase_auth_id 紐付け    │
│     → registration_type='discord'│
│     → PAT 自動生成               │
│  ③ マイページにリダイレクト       │
└─────────────────────────────────┘
```

### 7.3 ログイン（新デバイス）

```
新デバイス（edge-token なし）
    │
    │  ログインページ → メール + パスワード or Discord
    ▼
┌─────────────────────────────────┐
│  POST /api/auth/login            │
│  ① Supabase Auth 認証            │
│  ② supabase_auth_id で users     │
│     レコード検索                  │
│  ③ 新 edge-token 生成            │
│  ④ edge_tokens に INSERT          │
│  ⑤ edge-token Cookie 設定        │
└─────────────────────────────────┘
    │
    ▼
  書き込み可能（本登録ユーザーのデータに紐づく）
  旧デバイスの edge-token も引き続き有効
```

---

## 8. PAT 方式の詳細

### 8.1 自動発行

本登録完了時（`completeRegistration` 内）に自動生成。ユーザーの操作は不要。

```typescript
const patToken = crypto.randomBytes(16).toString('hex'); // 32文字
await UserRepository.updatePatToken(userId, patToken);
```

### 8.2 マイページ表示

PAT はマイページに常時表示する。

```
┌─────────────────────────────────────────┐
│  専ブラ連携トークン                       │
│                                          │
│  pat_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4   │
│  [コピー]                                │
│                                          │
│  専ブラのメール欄に以下を設定：            │
│  #pat_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4  │
│                                          │
│  最終使用: 2026-03-15 14:23              │
│                                          │
│  [再発行（現在のトークンは無効になります）]│
└─────────────────────────────────────────┘
```

### 8.3 専ブラでの使われ方

PAT は mail 欄に設定して使用する。入れっぱなしにしておけば Cookie 喪失時の自動復帰保険になるが、一度 Cookie が発行されれば PAT を除去しても書き込みに支障はない。

| Cookie 状態 | mail 欄 | 動作 |
|---|---|---|
| 有効 | `sage#pat_xxx` | Cookie で認証。PAT は strip のみ（認証には使われない） |
| 失効/なし | `sage#pat_xxx` | PAT で認証。新 Cookie 発行。自動復帰 |
| 有効 | `sage` | Cookie で認証。通常動作 |
| 失効/なし | `sage` | 未認証。認証案内（本登録ユーザーでもログインが必要） |

### 8.4 再発行

マイページの「再発行」ボタンで新しい PAT を生成し、`users.pat_token` を上書きする。旧 PAT は UNIQUE 制約により即時無効化（`verifyPat` で見つからなくなる）。

---

## 9. Supabase Auth 設定

### 9.1 メール認証

Supabase ダッシュボードで設定済み（管理者認証で使用中）。一般ユーザー向けの設定追加:

- **Confirm email**: ON（メール確認必須）
- **Email template**: 本登録確認用のテンプレートをカスタマイズ
- **Redirect URL**: `/api/auth/callback` を許可リストに追加

### 9.2 Discord OAuth

Supabase ダッシュボード > Authentication > Providers > Discord:

- **Client ID**: Discord Developer Portal で作成した Application の Client ID
- **Client Secret**: 同 Client Secret
- **Redirect URL**: Supabase が自動生成（`https://<project-ref>.supabase.co/auth/v1/callback`）

Discord Developer Portal 側:
- **Redirects**: Supabase の Redirect URL を登録
- **Scopes**: `identify`, `email`

---

## 10. 依存関係

### 10.1 依存先（既存 + 追加）

| コンポーネント | 依存の性質 | 新規/既存 |
|---|---|---|
| UserRepository | users テーブルの読み書き（supabase_auth_id, pat_token 等） | 拡張 |
| EdgeTokenRepository | edge_tokens テーブルの CRUD | **新規** |
| AuthCodeRepository | 認証レコード管理（既存） | 既存 |
| TurnstileClient | Turnstile 検証（既存） | 既存 |
| SupabaseAuth（外部 SDK） | signUp, signInWithPassword, signInWithOAuth, exchangeCodeForSession | 拡張 |

### 10.2 被依存（既存 + 追加）

```
PostService        →  AuthService.verifyEdgeToken()     （既存、実装変更）
WebAPIRoute        →  AuthService.registerWithEmail()   （新規）
                   →  AuthService.loginWithEmail()      （新規）
                   →  AuthService.logout()              （新規）
                   →  AuthService.regeneratePat()       （新規）
BbsCgiRoute        →  AuthService.verifyPat()           （新規）
                   →  AuthService.verifyWriteToken()    （既存）
OAuthCallbackRoute →  AuthService.handleOAuthCallback() （新規）
                   →  AuthService.completeRegistration()（新規）
MypageRoute        →  UserRepository（PAT 表示用）      （拡張）
```

---

## 11. 既存機能への影響

| 既存機能 | 影響 | 対応 |
|---|---|---|
| **verifyEdgeToken** | lookup 先が `users.auth_token` → `edge_tokens.token` に変更 | JOIN クエリに書き換え |
| **issueEdgeToken** | `users.auth_token` への書き込み → `edge_tokens` への INSERT に変更 | Repository 差し替え |
| **bbs.cgi ルート** | mail 欄パースに `#pat_` パターン追加 | PAT 検出を write_token 検出の前に挿入 |
| **マイページ** | 本登録セクション・PAT セクション追加、課金ボタンにガード追加 | UI 拡張 |
| **課金（upgrade）** | 仮ユーザーは課金不可の制約追加 | `supabase_auth_id IS NOT NULL` チェック |
| **日次リセット ID** | 変更なし（`author_id_seed` は users テーブルに残る） | — |
| **通貨・インセンティブ** | 変更なし（`user_id` で紐づいている） | — |
| **管理者認証** | 変更なし（完全分離を維持） | — |
| **write_token** | 共存。仮ユーザーの専ブラ初回認証用に残す | — |

### 11.1 mypage.feature への影響

`mypage.feature` の以下のシナリオは本機能により制約が追加される:

- **「無料ユーザーが課金ボタンで有料ステータスに切り替わる」** → 本登録済みの無料ユーザーのみ課金可能に変更
- **「マイページに基本情報が表示される」** → アカウント種別（仮/本登録）の表示が追加

`mypage.feature` の改訂が必要。本 feature の制約シナリオが優先する。

---

## 12. 新規 API ルート

| メソッド | パス | 用途 |
|---|---|---|
| POST | `/api/auth/register` | メールアドレス + パスワードでの本登録申請 |
| POST | `/api/auth/register/discord` | Discord OAuth 開始（リダイレクト URL 返却） |
| GET | `/api/auth/callback` | OAuth / メール確認コールバック |
| POST | `/api/auth/login` | メールアドレス + パスワードでのログイン |
| POST | `/api/auth/login/discord` | Discord OAuth ログイン開始 |
| POST | `/api/auth/logout` | ログアウト |
| POST | `/api/mypage/pat/regenerate` | PAT 再発行 |

---

## 13. 設計上の判断

### edge-token の多重化に `edge_tokens` テーブルを採用

`users.auth_token`（単一トークン）では、新デバイスでログインすると旧デバイスの edge-token を上書きし、旧デバイスが使えなくなる。本登録ユーザーが複数デバイスで同時に書き込める要件を満たすため、edge-token をユーザーから分離した別テーブルで管理する。

仮ユーザーも同じテーブルを使用する（行数が 1 になるだけ）。仕組みを分けると判定ロジックが二重化するため統一する。

### PAT は 1 ユーザー 1 個（`users` テーブルに直接保持）

複数 PAT を管理する需要がないため、別テーブルを切らず `users.pat_token` に直接保持する。再発行は旧値を上書きするだけで済み、無効化・発行の原子性が自然に担保される。

### ログイン時に追加の Cookie は設けない

edge-token Cookie だけでユーザーを識別する既存方式を維持する。本登録かどうかは `users.supabase_auth_id` の有無で判定でき、別途ログインセッション Cookie を導入する必要がない。Cookie の種類が増えると管理が煩雑になり、専ブラとの互換性問題が拡大するリスクもある。

### 管理者認証との分離を維持

本登録で使う Supabase Auth アカウントと管理者の Supabase Auth アカウントは別物。`admin_users` テーブルに登録されているかどうかで区別する既存の方式をそのまま維持する。一般ユーザーの Supabase Auth アカウントが `admin_users` に登録されることはない（手動登録制）。

### 本登録前の edge-token は本登録後もそのまま使える

本登録は既存の `users` レコードに `supabase_auth_id` を紐付けるだけで、edge-token の再発行・無効化は行わない。ユーザーが意識せずにシームレスに移行できる。

---

## 14. マイグレーション戦略

### フェーズ 1: テーブル追加・データ移行

```sql
-- 1. edge_tokens テーブル作成
CREATE TABLE edge_tokens (...);

-- 2. users テーブルにカラム追加
ALTER TABLE users ADD COLUMN supabase_auth_id ...;
ALTER TABLE users ADD COLUMN registration_type ...;
ALTER TABLE users ADD COLUMN registered_at ...;
ALTER TABLE users ADD COLUMN pat_token ...;
ALTER TABLE users ADD COLUMN pat_last_used_at ...;

-- 3. 既存 edge-token の移行
INSERT INTO edge_tokens (user_id, token, created_at, last_used_at)
SELECT id, auth_token, created_at, NOW()
FROM users WHERE auth_token IS NOT NULL;

-- 4. RLS ポリシー追加
ALTER TABLE edge_tokens ENABLE ROW LEVEL SECURITY;
```

### フェーズ 2: アプリケーション切り替え

1. `verifyEdgeToken` を `edge_tokens` テーブル参照に変更
2. `issueEdgeToken` を `edge_tokens` テーブル INSERT に変更
3. bbs.cgi ルートに PAT パース追加
4. 新規 API ルート追加（register, login, logout, PAT regenerate）
5. マイページ UI 拡張

### フェーズ 3: 旧カラム廃止

```sql
-- 十分な期間を置いて安定稼働を確認後
ALTER TABLE users DROP COLUMN auth_token;
```
