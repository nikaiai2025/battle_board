# BattleBoard 人間対応チェックリスト

> 作成日: 2026-03-07
> 対象: Phase 1 開始前に完了すべきセットアップ作業

---

## 1. 外部サービスのセットアップ

### 1.1 Supabase

- [ ] プロジェクト作成
  - Enable Data API: ON
  - Enable automatic RLS: OFF（手動でRLSポリシーを定義する）
  - Postgres Type: Postgres (DEFAULT)
- [ ] 以下の値をメモ（Settings → API で確認）
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

### 1.2 Cloudflare Turnstile

- [ ] ウィジェット作成
  - Widget Mode: Managed (Recommended)
  - Pre-clearance: No
- [ ] 以下の値をメモ
  - `TURNSTILE_SITE_KEY`（= Site Key）
  - `TURNSTILE_SECRET_KEY`（= Secret Key）

### 1.3 自分で生成する値

- [ ] BOT_API_KEY を生成してメモ
  ```bash
  openssl rand -hex 32
  ```

---

## 2. 各サービスへの値の登録

### 2.1 Vercel 環境変数（ダッシュボード → Settings → Environment Variables）

| 変数名 | 値の出所 | 備考 |
|---|---|---|
| `SUPABASE_URL` | Supabase | |
| `SUPABASE_ANON_KEY` | Supabase | |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare | `NEXT_PUBLIC_` 必須（クライアント側で使用） |
| `TURNSTILE_SECRET_KEY` | Cloudflare | `NEXT_PUBLIC_` 付けないこと |
| `BOT_API_KEY` | 自分で生成 | |

### 2.2 GitHub Secrets（リポジトリ → Settings → Secrets and variables → Actions）

**Phase 1 で必要:**

| Secret名 | 値の出所 | 使用ワークフロー |
|---|---|---|
| `SUPABASE_URL` | Supabase | daily-maintenance, cleanup |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | daily-maintenance, cleanup |

**Phase 2 で追加:**

| Secret名 | 値の出所 | 使用ワークフロー |
|---|---|---|
| `BOT_API_KEY` | 自分で生成（Vercelと同じ値） | bot-scheduler |
| `BATTLEBOARD_URL` | Vercel初回デプロイ後に確定 | bot-scheduler |
| AI APIキー（名称未定） | AI API選定後 | bot-scheduler |

### 2.3 ローカル開発用 `.env.local`

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...
TURNSTILE_SECRET_KEY=0x...
BOT_API_KEY=a1b2c3...
```

---

## 3. リポジトリの設定

- [ ] `.gitignore` に以下を含めること
  ```
  .env.local
  .env*.local
  ```
- [ ] `.env.example` をコミット（値は空欄のテンプレート）
  ```
  SUPABASE_URL=
  SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=
  NEXT_PUBLIC_TURNSTILE_SITE_KEY=
  TURNSTILE_SECRET_KEY=
  BOT_API_KEY=
  ```

---

## 4. 注意事項

- `NEXT_PUBLIC_` プレフィックスを付けていいのは `TURNSTILE_SITE_KEY` のみ。他の値（特に `SERVICE_ROLE_KEY`）に付けると秘密鍵がクライアントに露出する
- `BOT_API_KEY` は Vercel と GitHub Secrets の両方に同じ値を登録する
- `BATTLEBOARD_URL` は Vercel 初回デプロイ後にドメインが確定してから GitHub Secrets に登録する（Phase 2 開始時でOK）
