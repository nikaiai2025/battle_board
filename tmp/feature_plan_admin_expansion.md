# 機能計画: 管理機能拡充

> 作成日: 2026-03-16
> 作成者: bdd-architect
> ステータス: オーケストレーターによるタスク発行待ち

## 背景・目的

現在の管理機能はレス削除・スレッド削除のみ（APIのみ、UIなし）。
運営に必要な以下の機能を追加する:

- IP BAN（悪質ユーザーの遮断）
- 通貨付与（運営によるポイント操作）
- ユーザー管理（一覧・個別詳細・書き込み履歴閲覧）
- ダッシュボード（KPI推移の可視化）

## 方針決定（アーキテクト判断）

| 論点 | 決定 | 根拠 |
|---|---|---|
| 実装方式 | 管理者API + 管理画面UI | スレッドコンテキストに依存しない操作。コマンド基盤に載せるのは不自然 |
| featureファイル | `admin.feature` に追記 | アクター同一（管理者）、現在5シナリオと軽量、セクション分割で管理可能 |
| ダッシュボードのデータ | 日次スナップショットテーブル | 時系列推移表示にはGROUP BY集計よりスナップショットが適切 |
| 管理画面のルーティング | `src/app/(web)/admin/` 配下 | 一般ユーザーUIと分離。admin_session Cookieでガード |

## 現状の管理者インフラ

| 項目 | 状態 | 備考 |
|---|---|---|
| 管理者認証 | 実装済み | `admin_session` Cookie、Supabase Auth、`admin_users` テーブル |
| 管理者セッション検証 | 実装済み | `AuthService.verifyAdminSession()` |
| レス削除API | 実装済み | `DELETE /api/admin/posts/{postId}` |
| スレッド削除API | 実装済み | `DELETE /api/admin/threads/{threadId}` |
| 通貨加算 | Service層のみ | `CurrencyService.credit(userId, amount, reason)` — APIなし |
| ユーザー一覧取得 | なし | `UserRepository` にlist関数なし |
| 管理画面UI | なし | `src/app/(web)/admin/` が空 |

---

## 対応事項一覧

### 1. BDDシナリオ更新（人間承認が必要）

`admin.feature` に以下のセクションを追加:

#### 1-a. ユーザーBAN / IP BAN セクション

```gherkin
# ===========================================
# ユーザーBAN
# ===========================================

Scenario: 管理者がユーザーをBANする
  Given 管理者がログイン済みである
  And ユーザー "UserA" が存在する
  When ユーザー "UserA" をBANする
  Then ユーザー "UserA" のステータスがBAN済みになる

Scenario: BANされたユーザーの書き込みが拒否される
  Given ユーザー "UserA" がBANされている
  When ユーザー "UserA" がスレッドへの書き込みを試みる
  Then エラーメッセージが表示される
  And レスは追加されない

Scenario: 管理者がユーザーBANを解除する
  Given ユーザー "UserA" がBANされている
  When 管理者がユーザー "UserA" のBANを解除する
  Then ユーザー "UserA" の書き込みが可能になる

# ===========================================
# IP BAN
# ===========================================

Scenario: 管理者がユーザーのIPをBANする
  Given 管理者がログイン済みである
  And ユーザー "UserA" が存在する
  When ユーザー "UserA" のIPをBANする
  Then IP BANリストに登録される

Scenario: BANされたIPからの書き込みが拒否される
  Given ユーザー "UserA" のIPがBANされている
  When そのIPからスレッドへの書き込みを試みる
  Then エラーメッセージが表示される
  And レスは追加されない

Scenario: BANされたIPからの新規登録が拒否される
  Given ユーザー "UserA" のIPがBANされている
  When そのIPから認証コード発行を試みる
  Then 認証コードは発行されない

Scenario: 管理者がIP BANを解除する
  Given ユーザー "UserA" のIPがBANされている
  When 管理者がそのIP BANを解除する
  Then そのIPからの書き込みが可能になる
```

#### 1-b. 通貨付与セクション

```gherkin
# ===========================================
# 通貨付与
# ===========================================

Scenario: 管理者が指定ユーザーに通貨を付与する
  Given 管理者がログイン済みである
  And ユーザー "UserA" の通貨残高が 50 である
  When ユーザー "UserA" に通貨 100 を付与する
  Then ユーザー "UserA" の通貨残高が 150 になる

Scenario: 管理者でないユーザーが通貨付与を試みると権限エラーになる
  Given 管理者でないユーザーがログイン済みである
  When 通貨付与APIを呼び出す
  Then 権限エラーメッセージが表示される
```

#### 1-c. ユーザー管理セクション

```gherkin
# ===========================================
# ユーザー管理
# ===========================================

Scenario: 管理者がユーザー一覧を閲覧できる
  Given 管理者がログイン済みである
  And ユーザーが5人登録されている
  When ユーザー一覧ページを表示する
  Then ユーザーが一覧表示される
  And 各ユーザーのID、登録日時、ステータス、通貨残高が表示される

Scenario: 管理者が特定ユーザーの詳細を閲覧できる
  Given 管理者がログイン済みである
  And ユーザー "UserA" が過去に3件の書き込みを行っている
  When ユーザー "UserA" の詳細ページを表示する
  Then ユーザーの基本情報（ステータス、通貨残高、ストリーク）が表示される
  And 書き込み一覧が表示される

Scenario: 管理者がユーザーの書き込み履歴を確認できる
  Given 管理者がユーザー "UserA" の詳細ページを表示している
  Then 各書き込みのスレッド名、本文、書き込み日時が含まれる
```

#### 1-d. ダッシュボードセクション

```gherkin
# ===========================================
# ダッシュボード
# ===========================================

Scenario: 管理者がダッシュボードで統計情報を確認できる
  Given 管理者がログイン済みである
  When ダッシュボードを表示する
  Then 総ユーザー数が表示される
  And 本日の書き込み数が表示される
  And アクティブスレッド数が表示される
  And 通貨流通量が表示される

Scenario: 管理者が統計情報の日次推移を確認できる
  Given 管理者がログイン済みである
  And 過去7日分の日次統計が記録されている
  When ダッシュボードの推移グラフを表示する
  Then 日付ごとの統計推移が確認できる
```

### 2. IP BAN

#### 2-0. セキュリティ制約（重要）

**posts テーブルに IP 情報を追加してはならない。**

Supabase の anon key は公開されており、RLS が唯一の防壁となっている。
`posts` テーブルは `anon / authenticated` に SELECT が全公開されているため、
ここに ip_hash を追加すると全ユーザーの IP ハッシュが外部から読み取り可能になる。

```
テーブル別 IP 情報の安全性:
  posts          — SELECT 全公開     → IP情報を絶対に入れない
  users          — authenticated の自分のみ → author_id_seed / last_ip_hash は安全
  auth_codes     — DENY ALL          → ip_hash は安全
  ip_bans（新規）— DENY ALL にする   → ip_hash は安全
```

#### 2-a. BAN の二層構造

| レイヤー | 操作 | 効果 | 動的IP耐性 |
|---|---|---|---|
| **ユーザーBAN** | 管理者が手動で対象ユーザーに実行 | そのアカウントからの書き込みを拒否 | **強い**（Cookie/PATで同一人物と判定） |
| **IP BAN** | 管理者が手動で登録。以後は自動判定 | そのIPからの書き込み・新規登録を自動拒否 | 弱い（IP変動で回避可能。IP BANの本質的限界） |

典型的な運用: 悪質ユーザーに対して「ユーザーBAN + IP BAN」を同時に実行。
ユーザーBANでアカウントを凍結し、IP BANで別アカウント再登録を抑止する。

#### 2-b. DB変更

**users テーブルへのカラム追加（マイグレーション）:**

```sql
-- ユーザーBAN フラグ
ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT false;

-- 最終アクセスIPハッシュ（IP BAN登録時の対象特定に使用）
-- 書き込みのたびに更新される。author_id_seed は登録時固定のため別途必要。
ALTER TABLE users ADD COLUMN last_ip_hash VARCHAR;
```

- `is_banned`: ユーザーBAN用。true のユーザーは書き込み不可
- `last_ip_hash`: 書き込みリクエストのたびに `hashIp(reduceIp(現在のIP))` で更新。管理者が「このIPをBAN」する際の最新IP特定に使用

**ip_bans テーブル（新規）:**

```sql
CREATE TABLE ip_bans (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_hash     VARCHAR      NOT NULL,       -- hashIp(reduceIp(ip)) 済みの値
    reason      TEXT,                          -- BAN理由（管理者メモ）
    banned_by   UUID         NOT NULL REFERENCES admin_users(id),
    banned_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ,                   -- NULL = 無期限
    is_active   BOOLEAN      NOT NULL DEFAULT true,

    CONSTRAINT ip_bans_ip_hash_unique UNIQUE (ip_hash)
);

-- RLS: DENY ALL（service_role のみアクセス可能）
ALTER TABLE ip_bans ENABLE ROW LEVEL SECURITY;
-- ポリシー未設定 = anon/authenticated からの全操作を拒否
```

設計判断:
- **RLS は DENY ALL**（admin_users, auth_codes と同じパターン）。service_role 経由のみアクセス可能
- 生IP（平文）は保存しない。SHA-512 ハッシュ値のみ保存（不可逆）
- `expires_at` で期限付きBANにも対応可能（MVP では無期限のみでも可）

#### 2-c. BAN チェックフロー（書き込み時）

```
書き込みリクエスト到着
  ↓
① IP BAN チェック: hashIp(reduceIp(現在のIP)) → ip_bans に存在？ → 拒否（403）
  ↓
② edge-token 認証 → userId 取得
  ↓
③ ユーザーBAN チェック: users.is_banned = true？ → 拒否（403）
  ↓
④ last_ip_hash を現在のIPハッシュで更新（副作用）
  ↓
⑤ 通常の書き込み処理
```

IP BAN チェック（①）は認証前に行う。BANされたIPからは認証すら不要で拒否する。
新規登録（認証コード発行）でも①を実行し、BAN済みIPからの再登録を防ぐ。

#### 2-d. IP BAN 対象の特定方法

`users.last_ip_hash` を使用する（`author_id_seed` は登録時の古いIPのため不適切）。

管理画面フロー:
```
ユーザー詳細ページ:
  [このユーザーをBAN]  → users.is_banned = true
  [このIPをBAN]        → users.last_ip_hash を ip_bans に登録
  [両方BAN]            → 上記両方を同時実行
```

注意点:
- `last_ip_hash` は最後に書き込んだ時点のIP。それ以降にIPが変わっていれば効かない（IP BANの本質的限界）
- BAN は「IP 単位」であり「ユーザー単位」ではない。同じ IP を使う別ユーザーも影響を受ける
- IPv6 の場合 `reduceIp` が /48 マスクを行うため、巻き添え範囲に注意

#### 2-e. Infrastructure: `IpBanRepository`

```
src/lib/infrastructure/repositories/ip-ban-repository.ts
```

- `isBanned(ipHash)`: is_active=true かつ未期限切れかチェック（書き込み時の高速判定用）
- `create(ipHash, reason, bannedBy)`: BAN 追加
- `deactivate(id)`: BAN 解除（is_active=false）
- `listActive()`: 有効な BAN 一覧（管理画面用）

#### 2-f. Service: BAN チェックの挿入ポイント

```typescript
// AuthService に追加
export async function isIpBanned(ipHash: string): Promise<boolean>
export async function isUserBanned(userId: string): Promise<boolean>
```

| フロー | IP BAN チェック | ユーザーBAN チェック |
|---|---|---|
| 書き込み（Web API） | ○（認証前） | ○（認証後） |
| 書き込み（専ブラ） | ○（認証前） | ○（認証後） |
| 新規登録（認証コード発行） | ○ | N/A（ユーザー未特定） |

#### 2-g. 管理者API

```
POST   /api/admin/users/{userId}/ban    — ユーザーBAN（body: { reason? }）
DELETE /api/admin/users/{userId}/ban    — ユーザーBAN 解除
POST   /api/admin/ip-bans              — IP BAN 追加（body: { userId, reason? }）
                                          ※ userId の last_ip_hash で ip_bans に登録
DELETE /api/admin/ip-bans/{banId}       — IP BAN 解除
GET    /api/admin/ip-bans              — IP BAN 一覧
```

管理者に IP ハッシュを直接扱わせない。UI では「BAN済み / 未BAN」の状態表示のみ。

### 3. 通貨付与

#### 3-a. 管理者API

```
POST /api/admin/users/{userId}/currency — 通貨付与（body: { amount }）
```

実装:
- `admin_session` Cookie 検証（既存の `verifyAdminSession` を流用）
- `CurrencyService.credit(userId, amount, 'admin_grant')` を呼ぶだけ
- `CreditReason` 型に `'admin_grant'` を追加

#### 3-b. Domain: CreditReason 追加

```typescript
// src/lib/domain/models/currency.ts
type CreditReason = ... | 'admin_grant';
```

### 4. ユーザー管理

#### 4-a. Infrastructure: UserRepository 拡張

```typescript
// user-repository.ts に追加

/** ユーザー一覧取得（ページネーション付き） */
export async function findAll(options: {
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'last_post_date';
}): Promise<{ users: User[]; total: number }>

/** ユーザーの書き込み履歴取得 */
// → PostRepository に追加する方が適切:
export async function findByAuthorId(userId: string, options: {
  limit?: number;
  offset?: number;
}): Promise<Post[]>
```

#### 4-b. Service: AdminService 拡張

```typescript
// admin-service.ts に追加
export async function getUserList(options): Promise<{ users; total }>
export async function getUserDetail(userId): Promise<UserDetail>
export async function getUserPosts(userId, options): Promise<Post[]>
```

#### 4-c. 管理者API

```
GET /api/admin/users              — ユーザー一覧
GET /api/admin/users/{userId}     — ユーザー詳細（基本情報 + 通貨残高）
GET /api/admin/users/{userId}/posts — 書き込み履歴
```

### 5. ダッシュボード（日次統計 + 推移表示）

#### 5-a. DB: `daily_stats` テーブル（日次スナップショット）

```sql
CREATE TABLE daily_stats (
    stat_date           DATE         PRIMARY KEY,
    total_users         INTEGER      NOT NULL DEFAULT 0,
    new_users           INTEGER      NOT NULL DEFAULT 0,
    active_users        INTEGER      NOT NULL DEFAULT 0,  -- 当日書き込みしたユーザー数
    total_posts         INTEGER      NOT NULL DEFAULT 0,  -- 当日の書き込み数
    total_threads       INTEGER      NOT NULL DEFAULT 0,  -- 当日の新規スレッド数
    active_threads      INTEGER      NOT NULL DEFAULT 0,  -- 当日書き込みがあったスレッド数
    currency_in_circulation INTEGER  NOT NULL DEFAULT 0,  -- 全ユーザーの残高合計
    currency_granted    INTEGER      NOT NULL DEFAULT 0,  -- 当日の通貨付与総額
    currency_consumed   INTEGER      NOT NULL DEFAULT 0,  -- 当日の通貨消費総額
    total_accusations   INTEGER      NOT NULL DEFAULT 0,  -- 当日の告発件数
    total_attacks       INTEGER      NOT NULL DEFAULT 0,  -- 当日の攻撃件数
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

設計判断:
- **スナップショット方式を採用**: 既存テーブルへの `GROUP BY created_at::date` 集計ではなく、日次バッチで集計結果を保存する
- 理由: 時系列推移の表示にはスナップショットの方がクエリが高速かつシンプル。データ量が増えても O(日数) で固定
- 集計バッチは GitHub Actions の日次 cron（ボット実行と同じインフラ）で実行

#### 5-b. 日次集計スクリプト

新規: `scripts/aggregate-daily-stats.ts`

```typescript
// 処理フロー:
// 1. 対象日（デフォルト: 昨日）の各メトリクスを既存テーブルから集計
// 2. daily_stats に UPSERT（冪等。再実行しても安全）
//
// 集計クエリ例:
//   new_users:    SELECT COUNT(*) FROM users WHERE created_at::date = :date
//   active_users: SELECT COUNT(DISTINCT author_id) FROM posts WHERE created_at::date = :date AND author_id IS NOT NULL
//   total_posts:  SELECT COUNT(*) FROM posts WHERE created_at::date = :date AND is_system_message = false
//   active_threads: SELECT COUNT(DISTINCT thread_id) FROM posts WHERE created_at::date = :date
//   currency_in_circulation: SELECT SUM(balance) FROM currencies
```

#### 5-c. GitHub Actions: 日次集計 cron

```yaml
# .github/workflows/daily-stats.yml
on:
  schedule:
    - cron: '5 15 * * *'  # JST 0:05（日次リセット直後）
```

既存のボット cron と同じパターン。Supabase への接続情報は既に GitHub Secrets に設定済み。

#### 5-d. 管理者API

```
GET /api/admin/dashboard          — 本日のサマリー（リアルタイム集計）
GET /api/admin/dashboard/history  — 日次推移（daily_stats から取得、期間指定可）
```

#### 5-e. リアルタイム値 vs スナップショット値

| メトリクス | 表示箇所 | データ源 |
|---|---|---|
| 本日の書き込み数 | ダッシュボードのヘッダ | リアルタイム集計（`COUNT(*) FROM posts WHERE ...`） |
| 総ユーザー数 | ダッシュボードのヘッダ | リアルタイム集計（`COUNT(*) FROM users`） |
| 通貨流通量 | ダッシュボードのヘッダ | リアルタイム集計（`SUM(balance) FROM currencies`） |
| 過去N日の推移グラフ | ダッシュボードの推移セクション | `daily_stats` テーブル |

本日分はリアルタイム、過去分はスナップショット。これにより「今日の数字」が常に最新でありつつ、推移表示は高速。

### 6. 管理画面UI

#### 6-a. ルーティング構成

```
src/app/(web)/admin/
  page.tsx                    — ダッシュボード（トップ）
  login/page.tsx              — ログインページ
  users/page.tsx              — ユーザー一覧
  users/[userId]/page.tsx     — ユーザー詳細（書き込み履歴含む）
  ip-bans/page.tsx            — IP BAN 管理
  layout.tsx                  — 管理画面共通レイアウト（admin_session ガード）
```

#### 6-b. 管理画面レイアウト

```
┌─────────────────────────────────────────────┐
│  BattleBoard Admin                          │
├──────┬──────────────────────────────────────┤
│      │                                      │
│ Nav  │  コンテンツ領域                       │
│      │                                      │
│ ダッシュ │  ┌─────┬─────┬─────┬─────┐       │
│ ユーザー │  │ 総   │ 本日 │ 通貨 │ スレ │       │
│ IP BAN │  │ ユーザ│ 書込 │ 流通 │ ッド │       │
│      │  └─────┴─────┴─────┴─────┘       │
│      │                                      │
│      │  ┌────────────────────────┐         │
│      │  │  推移グラフ（7日/30日） │         │
│      │  │  📈                     │         │
│      │  └────────────────────────┘         │
│      │                                      │
└──────┴──────────────────────────────────────┘
```

#### 6-c. ダッシュボード表示要素

| カード | メトリクス | データ源 |
|---|---|---|
| 総ユーザー数 | 全ユーザー数（仮+本登録） | リアルタイム |
| 本日の書き込み数 | 当日の非システムメッセージ数 | リアルタイム |
| アクティブスレッド数 | 当日書き込みがあったスレッド数 | リアルタイム |
| 通貨流通量 | 全ユーザー残高合計 | リアルタイム |

推移グラフ:
- X軸: 日付
- Y軸: 各メトリクスの値
- 期間切替: 7日 / 30日 / 全期間
- グラフライブラリ: Recharts（Next.jsと相性が良い軽量ライブラリ）を推奨。ただし新規依存追加のため確認が必要

#### 6-d. ユーザー一覧ページ

| カラム | 内容 |
|---|---|
| 日次リセットID | 当日のID（管理者にのみ表示） |
| 登録日時 | `users.created_at` |
| ステータス | 仮/本登録 × 無料/有料 |
| 通貨残高 | `currencies.balance` |
| 最終書き込み日 | `users.last_post_date` |
| ストリーク | `users.streak_days` |
| 操作 | 詳細 / 通貨付与 / IP BAN |

#### 6-e. ユーザー詳細ページ

マイページと同等の情報 + 管理者専用操作:

| セクション | 内容 |
|---|---|
| 基本情報 | ID、登録日時、ステータス、通貨残高、ストリーク、草カウント |
| 書き込み履歴 | マイページと同じフォーマット（スレッド名、本文、日時） |
| 管理操作 | 通貨付与フォーム（金額入力 + 実行ボタン）、IP BAN ボタン |

---

## 影響範囲

### 新規テーブル

| テーブル | 用途 |
|---|---|
| `ip_bans` | IP BAN 管理 |
| `daily_stats` | 日次統計スナップショット |

### 新規API（全て `/api/admin/` 配下）

| メソッド | パス | 用途 |
|---|---|---|
| POST | `/api/admin/ip-bans` | IP BAN 追加 |
| DELETE | `/api/admin/ip-bans/{ipHash}` | IP BAN 解除 |
| GET | `/api/admin/ip-bans` | IP BAN 一覧 |
| POST | `/api/admin/users/{userId}/currency` | 通貨付与 |
| GET | `/api/admin/users` | ユーザー一覧 |
| GET | `/api/admin/users/{userId}` | ユーザー詳細 |
| GET | `/api/admin/users/{userId}/posts` | 書き込み履歴 |
| GET | `/api/admin/dashboard` | ダッシュボード（リアルタイム） |
| GET | `/api/admin/dashboard/history` | 日次推移 |

### 既存コードへの変更

| 箇所 | 変更内容 |
|---|---|
| `users` テーブル | `is_banned` (BOOLEAN) + `last_ip_hash` (VARCHAR) カラム追加 |
| `User` ドメインモデル | `isBanned`, `lastIpHash` フィールド追加 |
| 書き込みAPI（Web + 専ブラ） | IP BAN チェック（認証前）+ ユーザーBAN チェック（認証後）+ `last_ip_hash` 更新 |
| 認証コード発行処理 | IP BAN チェック挿入 |
| `AuthService` | `isIpBanned()`, `isUserBanned()` 追加 |
| `CreditReason` 型 | `'admin_grant'` 追加 |
| `UserRepository` | `findAll()`, `updateIsBanned()`, `updateLastIpHash()` 追加 |
| `PostRepository` | `findByAuthorId()` 追加 |
| `AdminService` | ユーザー管理・通貨付与・BAN操作関数追加 |

## 実装順序の推奨

```
Phase 1: BDDシナリオ承認（人間）
  ↓
Phase 2: DB マイグレーション（ip_bans + daily_stats）
  ↓
Phase 3: IP BAN（Repository + Service + API + 既存フローへのチェック挿入）
  ↓
Phase 4: 通貨付与（API 1本 + CreditReason追加）
  ↓
Phase 5: ユーザー管理（Repository拡張 + API + UI）
  ↓
Phase 6: ダッシュボード（日次集計スクリプト + cron + API + UI）
  ↓
Phase 7: 管理画面UI統合（レイアウト + ナビゲーション + 全ページ結合）
```

## エスカレーション候補

1. ~~**IP BAN のためのIPハッシュ保存方針**~~ → 解決済み。`users.author_id_seed` = `hashIp(reduceIp(ip))` を利用。posts テーブルへの ip_hash 追加は RLS 上危険なため却下
2. **グラフライブラリの追加**: Recharts 等の新規 npm 依存を追加してよいか（アーキテクチャ制約「新たにインフラを追加する場合はエスカレーション必須」に該当する可能性）
3. **daily_stats の集計タイミング**: ボット cron と同じ GitHub Actions で良いか、別 workflow にすべきか

## リスク・注意点

- IP BAN は IPv4/IPv6 で挙動が異なる。`reduceIp()` が IPv6 を /64 にマスクしている場合、巻き添えBANの範囲に注意
- ダッシュボードの推移グラフは daily_stats テーブルへの初期データ投入（過去分のバックフィル）が必要。既存テーブルから過去分を一括集計するスクリプトも用意すること
- 管理画面UIは admin_session Cookie の有効性をページアクセス時にサーバーサイドで検証する必要がある（layout.tsx で実装）
