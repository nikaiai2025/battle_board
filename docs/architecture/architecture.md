# D-07 BattleBoard アーキテクチャ設計書

> ステータス: ドラフト
> 作成日: 2026-03-07
> 対象スコープ: Phase 1 + Phase 2 (MVP)
> 前提ドキュメント: 要件定義書(D-01), BDDシナリオ(D-03), 認証決定ログ, eddist採用レポート

---

## 1. システム概要

BattleBoard は「5chライクな匿名掲示板 + AIボット混在 + ゲーミフィケーション」を融合した対戦型匿名掲示板である。

ユーザーは Web アプリまたは 5ch専用ブラウザ（専ブラ）の2経路からアクセスし、スレッドへの書き込み・コマンド実行・AI告発・ボット撃破といったゲーム体験を行う。

### 1.1 設計上の最重要原則

| # | 原則 | 根拠 |
|---|---|---|
| P-1 | **投稿経路とドメインロジックの分離** | Web API / 専ブラ互換API の2経路を単一のドメイン層で処理する（eddist採用レポート #1） |
| P-2 | **投稿処理の原子性** | 書き込み・コマンド実行・通貨増減・BOT HP更新・システムメッセージ生成を一貫した単位で処理する（eddist採用レポート #2） |
| P-3 | **全公開を基本とする表示方針** | コマンド結果・イベント通知はスレッド上に全公開。個人向け情報はマイページ通知に寄せる（CON-002） |
| P-4 | **5chプロトコル厳密準拠** | DAT形式・subject.txt・bbs.cgi・Shift_JIS等、専ブラが期待するプロトコルに厳密に従う（CON-001） |
| P-5 | **嫌にならないデメリット設計** | ネガティブ効果は通貨減少・一時的表示変更に留め、長時間の行動制限は避ける（CON-003） |

---

## 2. インフラストラクチャ構成

### 2.1 全体構成図

```
                        ┌─────────────┐
                        │   ユーザー   │
                        └──────┬──────┘
                               │
                 ┌─────────────┼─────────────┐
                 │ Web ブラウザ │  5ch 専ブラ  │
                 └──────┬──────┘──────┬───────┘
                        │             │
          HTTPS         │             │  HTTPS
                        ▼             ▼
               ┌────────────────────────────┐
               │        Vercel (CDN)        │
               │  ┌──────────────────────┐  │
               │  │  Next.js App Router  │  │
               │  │                      │  │
               │  │  ┌────────────────┐  │  │
               │  │  │ Web UI (SSR)   │  │  │
               │  │  └────────────────┘  │  │
               │  │  ┌────────────────┐  │  │
               │  │  │ Web API Routes │  │  │
               │  │  └────────────────┘  │  │
               │  │  ┌────────────────┐  │  │
               │  │  │ 専ブラ互換 API │  │  │
               │  │  └────────────────┘  │  │
               │  └──────────────────────┘  │
               └─────────────┬──────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
     ┌─────────────┐ ┌────────────┐ ┌──────────────┐
     │  Supabase   │ │ Cloudflare │ │   GitHub     │
     │  PostgreSQL │ │ Turnstile  │ │   Actions    │
     │  + Auth     │ │  (CAPTCHA) │ │ (Bot cron)   │
     └─────────────┘ └────────────┘ └──────┬───────┘
                                           │
                                           ▼
                                    ┌────────────┐
                                    │  AI API    │
                                    │ (Gemini等) │
                                    └────────────┘
```

### 2.2 構成要素と責務

| 構成要素 | 責務 | 備考 |
|---|---|---|
| **Vercel** | フロントエンド配信、API実行（Serverless Functions）、CDN | Next.js App Router をデプロイ |
| **Supabase PostgreSQL** | データ永続化（スレッド・レス・ユーザー・通貨・ボット等） | RLS でアクセス制御 |
| **Supabase Auth** | 管理者認証（メール+パスワード） | 一般ユーザー認証には使わない |
| **Cloudflare Turnstile** | 一般ユーザーの CAPTCHA 検証 | `/auth-code` 認証コード有効化時のみ |
| **GitHub Actions** | 運営ボットの定期実行、期限切れデータ掃除 | cron スケジュール |
| **AI API** | 運営ボットの書き込み文章生成 | GitHub Actions から呼び出し |

### 2.3 横断的制約（CLAUDE.md より）

- インフラは **Vercel + Supabase + GitHub Actions に固定**（他サービス追加はエスカレーション必須）
- AIボットの書き込みは**ユーザーの書き込みと同一APIを通じて行い、直接DBを書き換えない**
- 環境変数（APIキー等）を**クライアントサイドコードに含めない**

---

## 3. アプリケーション・アーキテクチャ

> **MVP（Phase 1 + 2）での運用指針**: 4層構成は設計上の整理として維持するが、Domain Layer のモデルは TypeScript の `interface` / `type` 定義（薄いデータ型）に留め、ビジネスロジックは Service 内に直接実装してよい。Phase 4 で複雑化した場合に Domain Layer への本格的なロジック抽出を判断する。

### 3.1 レイヤ構成

```
┌────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Web UI     │  │  Web API     │  │  専ブラ互換  │  │
│  │  (React/SSR) │  │  (REST)      │  │  Adapter     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│         └─────────────────┼─────────────────┘           │
│                           │                             │
├───────────────────────────┼─────────────────────────────┤
│                    Application Layer                     │
│                           │                             │
│  ┌────────────────────────┼────────────────────────┐    │
│  │              Use Case / Service                 │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│    │
│  │  │ 書き込み │ │ コマンド │ │ 認証             ││    │
│  │  │ Service  │ │ Service  │ │ Service          ││    │
│  │  └──────────┘ └──────────┘ └──────────────────┘│    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│    │
│  │  │ ボット   │ │ 通貨     │ │ インセンティブ   ││    │
│  │  │ Service  │ │ Service  │ │ Service          ││    │
│  │  └──────────┘ └──────────┘ └──────────────────┘│    │
│  └─────────────────────────────────────────────────┘    │
│                           │                             │
├───────────────────────────┼─────────────────────────────┤
│                      Domain Layer                        │
│                           │                             │
│  ┌────────────────────────┼────────────────────────┐    │
│  │              Domain Model / Rules               │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │    │
│  │  │ Thread │ │  Post  │ │  User  │ │ Currency │ │    │
│  │  └────────┘ └────────┘ └────────┘ └──────────┘ │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ │    │
│  │  │  Bot   │ │Command │ │Accusatn│ │ Incentive│ │    │
│  │  └────────┘ └────────┘ └────────┘ └──────────┘ │    │
│  └─────────────────────────────────────────────────┘    │
│                           │                             │
├───────────────────────────┼─────────────────────────────┤
│                  Infrastructure Layer                    │
│                           │                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Repository  │  │  Encoding    │  │  External    │  │
│  │  (Supabase)  │  │  (Shift_JIS) │  │  API Client  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────┘
```

### 3.2 各レイヤの責務

#### Presentation Layer（表示・入出力層）

3つの入出力経路を持ち、いずれも Application Layer の同一サービスに委譲する。

| コンポーネント | 責務 |
|---|---|
| **Web UI** | Next.js App Router による SSR/CSR。React コンポーネントでスレッド閲覧・書き込みフォーム・マイページ等を提供 |
| **Web API** | Next.js Route Handlers による REST API。Web UI の Server Actions / クライアント fetch から呼び出される |
| **専ブラ互換 Adapter** | 5ch プロトコル準拠の I/O 変換層。`subject.txt` / `.dat` / `bbs.cgi` / `SETTING.TXT` / `bbsmenu.html` のエンドポイントを提供。Shift_JIS エンコーディング・DAT フォーマット変換・Range 差分応答をこの層で処理する |

#### Application Layer（アプリケーション層）

ユースケースを実現するサービス群。ドメイン層のモデルとルールを組み合わせてビジネスフローを実行する。

| サービス | 責務 | 関連feature |
|---|---|---|
| **PostService** | 書き込み処理の統括。バリデーション → レス追加 → コマンド解析転送 → インセンティブ判定転送 | posting, thread |
| **CommandService** | コマンド解析・実行・通貨消費・システムメッセージ生成 | command_system |
| **AccusationService** | `!tell` 告発処理。判定・BOTマーク付与・ボーナス/冤罪ボーナス | ai_accusation |
| **BotService** | ボット管理・偽装ID生成・HP管理・撃破処理・戦歴生成 | bot_system |
| **CurrencyService** | 通貨残高の増減・マイナス制約・二重消費防止 | currency |
| **IncentiveService** | 8種のボーナスイベント判定・付与 | incentive |
| **AuthService** | 認証コード発行/検証・edge-token管理・日次リセットID生成 | authentication |
| **AdminService** | レス削除・スレッド削除・管理者認証 | admin |

#### Domain Layer（ドメイン層）

エンティティ・値オブジェクト・ドメインルールを定義する。外部依存を持たない純粋なビジネスロジック。

| モデル | 主な責務 |
|---|---|
| **Thread** | スレッド作成・レス数カウント・最終書き込み日時管理 |
| **Post** | レスの生成・バリデーション・アンカー解析・削除状態管理 |
| **User** | ユーザー状態（無料/有料）・ユーザーネーム・日次リセットID |
| **Currency** | 残高・増減ルール・マイナス制約 |
| **Bot** | HP管理・偽装ID・ペルソナ・撃破判定・戦歴 |
| **Command** | コマンド定義（名前・コスト・ステルスフラグ）・解析ルール |
| **Accusation** | 告発の成功/失敗判定・重複チェック・ボーナス計算 |
| **Incentive** | 各ボーナスイベントの発火条件・金額計算 |

#### Infrastructure Layer（インフラ層）

| コンポーネント | 責務 |
|---|---|
| **Repository** | Supabase PostgreSQL への CRUD。ドメインモデルとDBレコードの変換 |
| **Encoding** | Shift_JIS ↔ UTF-8 変換（iconv-lite）。専ブラ互換 Adapter から利用 |
| **External API Client** | Cloudflare Turnstile 検証 API・AI API（GitHub Actions 経由）|

### 3.3 2経路の統一処理フロー

**設計原則 P-1** に基づき、Web と専ブラの2経路は Presentation Layer で分岐し、Application Layer 以下は共通のサービスを通る。

```
[Web UI]                              [専ブラ]
   │                                     │
   │  POST /api/posts                    │  POST /test/bbs.cgi
   │  JSON { threadId, body }            │  form: bbs=test&key=xxx&MESSAGE=...
   ▼                                     ▼
┌──────────┐                     ┌───────────────┐
│ Web API  │                     │ 専ブラ互換    │
│ Route    │                     │ Adapter       │
│ Handler  │                     │ (Shift_JIS    │
│          │                     │  decode/      │
│          │                     │  form parse)  │
└────┬─────┘                     └───────┬───────┘
     │                                   │
     │  PostInput { threadId,            │  PostInput { threadId,
     │    body, authorToken }            │    body, authorToken }
     ▼                                   ▼
     └───────────────┬───────────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │   PostService   │
            │   (共通処理)     │
            └────────┬────────┘
                     │
        ┌────────────┼────────────┼─────────────┐
        ▼            ▼            ▼             ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Command  │ │ Currency │ │Incentive │ │   Bot    │
  │ Service  │ │ Service  │ │ Service  │ │ Service  │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

---

## 4. データモデル

### 4.1 ER図（概要）

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   threads   │     │    posts     │     │   users      │
├─────────────┤     ├──────────────┤     ├──────────────┤
│ id (PK)     │◄──┐ │ id (PK)      │  ┌─►│ id (PK)      │
│ thread_key  │   │ │ thread_id(FK)│──┘  │ auth_token   │
│ title       │   │ │ post_number  │     │ author_id_   │
│ board_id    │   └─│ author_id(FK)│     │   seed       │
│ post_count  │     │ display_name │     │ is_premium   │
│ dat_byte_   │     │ daily_id     │     │ username     │
│   size      │     │ body         │     │ created_at   │
│ created_at  │     │ is_system_msg│     └──────────────┘
│ last_post_at│     │ is_deleted   │            │
│ created_by  │     │ created_at   │            │
│ is_deleted  │     └───────┬──────┘            │
└─────────────┘             │                   │
                            │1                  │
┌─────────────┐     ┌──────┴───────┐     ┌──────┴───────┐
│    bots     │◄──┐ │  bot_posts   │     │  currencies  │
├─────────────┤   │ ├──────────────┤     ├──────────────┤
│ id (PK)     │   │ │ post_id (PK, │     │ user_id(PK,  │
│ name        │   └─│         FK)  │     │         FK)  │
│ persona     │     │ bot_id (FK)  │     │ balance      │
│ hp          │     └──────────────┘     │ updated_at   │
│ max_hp      │     RLS: service role    └──────────────┘
│ daily_id    │     のみ参照可能
│ is_active   │                          ┌──────────────┐
│ is_revealed │     ┌──────────────┐     │  incentive   │
│ revealed_at │     │ accusations  │     │  _logs       │
│ survival_   │     ├──────────────┤     ├──────────────┤
│   days      │     │ id (PK)      │     │ id (PK)      │
│ total_posts │     │ accuser_id   │     │ user_id (FK) │
│ accused_    │     │ target_post  │     │ event_type   │
│   count     │     │   _id (FK)   │     │ amount       │
│ eliminated  │     │ result       │     │ context_id   │
│   _at       │     │ thread_id(FK)│     │ created_at   │
│ eliminated  │     │ created_at   │     └──────────────┘
│   _by       │     └──────────────┘
│ created_at  │
└─────────────┘     ┌──────────────┐
RLS: service role   │  auth_codes  │     ┌──────────────┐
のみ参照可能        ├──────────────┤     │  admin_      │
                    │ id (PK)      │     │  users       │
                    │ code         │     ├──────────────┤
                    │ token_id     │     │ id (PK)      │
                    │ ip_hash      │     │ email        │
                    │ verified     │     │ role         │
                    │ expires_at   │     │ created_at   │
                    │ created_at   │     └──────────────┘
                    └──────────────┘
```

### 4.2 主要テーブル定義

#### threads

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 内部識別子 |
| thread_key | VARCHAR | 10桁UNIXタイムスタンプ（専ブラ用キー） |
| board_id | VARCHAR | 板ID（例: `battleboard`） |
| title | VARCHAR(96) | スレッドタイトル |
| post_count | INTEGER | レス数（キャッシュ。postsの実数と同期） |
| dat_byte_size | INTEGER DEFAULT 0 | Shift_JIS変換後の累積バイト数（Range差分応答用。§11.3 参照） |
| created_by | UUID (FK) | スレッド作成者の user_id |
| created_at | TIMESTAMPTZ | 作成日時 |
| last_post_at | TIMESTAMPTZ | 最終書き込み日時（ソート用） |
| is_deleted | BOOLEAN | 管理者削除フラグ |

#### posts

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 内部識別子 |
| thread_id | UUID (FK) | 所属スレッド |
| post_number | INTEGER | スレッド内レス番号（1始まり、連番） |
| author_id | UUID (FK, NULLABLE) | 書き込みユーザー（人間の場合のみ。ボット・システムメッセージは NULL） |
| display_name | VARCHAR | 表示名（「名無しさん」/ユーザーネーム/「[システム]」） |
| daily_id | VARCHAR(8) | 日次リセットID |
| body | TEXT | 本文（内部はUTF-8） |
| is_system_message | BOOLEAN | システムメッセージフラグ |
| is_deleted | BOOLEAN | 管理者削除フラグ（true時は本文を「このレスは削除されました」に置換表示） |
| created_at | TIMESTAMPTZ | 書き込み日時 |

> **author_id の解釈**:
> - 人間の書き込み: `author_id = users.id`、`is_system_message = false`
> - ボットの書き込み: `author_id = NULL`、`is_system_message = false`、`bot_posts` にレコード存在
> - システムメッセージ: `author_id = NULL`、`is_system_message = true`
>
> ボットの正体は `bot_posts` テーブル（RLS で保護）にのみ記録される。`posts` テーブル上ではボットの書き込みと人間の匿名書き込みを区別できない。

#### bot_posts

| カラム | 型 | 説明 |
|---|---|---|
| post_id | UUID (PK, FK → posts.id) | 対応する書き込み |
| bot_id | UUID (FK → bots.id) | 書き込みを行ったボット |

> **RLS ポリシー**: `anon` / `authenticated` ロールからの SELECT/INSERT/UPDATE/DELETE を全拒否。`service_role` のみアクセス可能。このテーブルの存在自体がゲームの根幹（「AIか人間か分からない」）を保護する。
>
> **`!tell` 判定**: `SELECT bot_id FROM bot_posts WHERE post_id = :targetPostId` → rows > 0 ならボット（hit）、0 なら人間（miss）。

#### users

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 内部識別子 |
| auth_token | VARCHAR | 現在有効な edge-token |
| author_id_seed | VARCHAR | IP由来の seed（日次リセットID生成に使用） |
| is_premium | BOOLEAN | 有料ユーザーフラグ |
| username | VARCHAR(20), NULLABLE | ユーザーネーム（有料ユーザーのみ設定可） |
| streak_days | INTEGER | 連続書き込み日数 |
| last_post_date | DATE | 最終書き込み日（ストリーク計算用） |
| created_at | TIMESTAMPTZ | 登録日時 |

#### currencies

| カラム | 型 | 説明 |
|---|---|---|
| user_id | UUID (PK, FK) | ユーザー（1:1） |
| balance | INTEGER | 通貨残高（マイナス不可） |
| updated_at | TIMESTAMPTZ | 最終更新日時 |

> **二重消費防止**: balance の更新は `UPDATE currencies SET balance = balance - :cost WHERE user_id = :uid AND balance >= :cost` の楽観的ロック（affected rows = 0 なら残高不足エラー）で実装する。

#### bots

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 内部識別子 |
| name | VARCHAR | ボット名（内部管理用。例:「荒らし役」） |
| persona | TEXT | ペルソナ定義（プロンプトテンプレート） |
| hp | INTEGER | 現在HP |
| max_hp | INTEGER | 最大HP |
| daily_id | VARCHAR(8) | 当日の偽装日次リセットID |
| daily_id_date | DATE | 偽装IDの発行日 |
| is_active | BOOLEAN | 活動中フラグ（撃破されると false） |
| is_revealed | BOOLEAN | BOTマーク表示中フラグ |
| revealed_at | TIMESTAMPTZ, NULLABLE | BOTマークが付与された日時 |
| survival_days | INTEGER | 生存日数 |
| total_posts | INTEGER | 総書き込み数 |
| accused_count | INTEGER | 被告発回数 |
| eliminated_at | TIMESTAMPTZ, NULLABLE | 撃破日時 |
| eliminated_by | UUID (FK, NULLABLE) | 撃破者の user_id |
| created_at | TIMESTAMPTZ | 作成日時 |

#### accusations

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 内部識別子 |
| accuser_id | UUID (FK) | 告発者 user_id |
| target_post_id | UUID (FK) | 告発対象の post_id |
| thread_id | UUID (FK) | スレッドID |
| result | VARCHAR | `'hit'` / `'miss'` |
| bonus_amount | INTEGER | 付与ボーナス額 |
| created_at | TIMESTAMPTZ | 告発日時 |

> **重複告発防止**: `(accuser_id, target_post_id)` にユニーク制約。

#### incentive_logs

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 内部識別子 |
| user_id | UUID (FK) | 対象ユーザー |
| event_type | VARCHAR | ボーナス種別（`daily_login` / `thread_growth` / `reply` / `hot_post` / `new_thread_join` / `thread_revival` / `streak` / `milestone_post`） |
| amount | INTEGER | 付与額 |
| context_id | UUID, NULLABLE | 関連エンティティID（スレッドID/レスID等） |
| context_date | DATE | イベント発生日（日次重複チェック用） |
| created_at | TIMESTAMPTZ | 記録日時 |

> **日次重複防止**: `(user_id, event_type, context_date)` または `(user_id, event_type, context_id)` にユニーク制約（イベント種別ごとに適切な組み合わせを選択）。

#### auth_codes

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 内部識別子 |
| code | VARCHAR(6) | 6桁認証コード |
| token_id | VARCHAR | 対応する edge-token の識別子 |
| ip_hash | VARCHAR | 発行時の IPハッシュ（検証用） |
| verified | BOOLEAN | 認証済みフラグ |
| expires_at | TIMESTAMPTZ | 有効期限 |
| created_at | TIMESTAMPTZ | 発行日時 |

#### admin_users

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | Supabase Auth の uid に紐づく |
| email | VARCHAR | メールアドレス |
| role | VARCHAR | `'admin'` |
| created_at | TIMESTAMPTZ | 作成日時 |

---

## 5. 認証アーキテクチャ

> 本セクションは `docs/requirements/decision_log/decision_log_auth_architecture_2026-03-04.md` の決定事項を反映する。

### 5.1 一般ユーザー認証

```
┌────────┐     ①書き込みPOST      ┌───────────────┐
│ ユーザー│──────────────────────►│  PostService  │
│        │  (edge-token なし)     │               │
│        │◄─────────────────────│  → 未認証応答  │
│        │  ②認証コード案内       │  → edge-token │
│        │    + edge-token発行   │    Cookie発行  │
│        │                       └───────────────┘
│        │
│        │  ③6桁コード + Turnstile応答
│        │──────────────────────►┌───────────────┐
│        │                       │  AuthService  │
│        │◄─────────────────────│  → コード検証  │
│        │  ④edge-token有効化    │  → IP整合検証  │
│        │                       │  → Turnstile  │
│        │                       │    API検証     │
│        │  ⑤書き込みPOST        └───────────────┘
│        │──────────────────────►┌───────────────┐
│        │  (有効なedge-token)    │  PostService  │
│        │◄─────────────────────│  → 書き込み成功│
└────────┘                       └───────────────┘
```

- **edge-token**: Cookie に保持。書き込みAPI呼び出し時に検証
- **認証コード**: 6桁数字。有効期限あり
- **Turnstile**: `/auth-code` での認証コード有効化時にのみ検証（毎回の書き込み時には不要）
- **IP整合**: 認証コード発行時のIPとedge-token使用時のIPの整合性を検証

### 5.2 日次リセットID生成

```
daily_reset_id = truncate(sha256(
    date_jst       +   // YYYY-MM-DD (JST)
    board_id       +   // 板ID
    author_id_seed     // sha512(reduced_ip) ... ユーザー登録時に生成
), 8)
```

- 同日・同回線で同一IDになりやすい
- Cookie削除・再認証後も同一性が継続しうる（IP依存度: 強め）
- 翌日（JST 0:00）にリセットされる

### 5.3 管理者認証

- **Supabase Auth** のメール+パスワード認証を使用
- 一般ユーザーの edge-token とは**完全に分離**（Cookie名・セッション・ミドルウェアすべて別）
- Cookie名: `admin_session`
- 2FA: 推奨（初期リリースに含めるかは要確認）

### 5.4 ボット認証

- 運営ボット（GitHub Actions）は **サービスアカウント**として専用の API キーで書き込みAPIを呼び出す
- ボットの書き込みは一般ユーザーの書き込みと**同一のAPI**を通る（CLAUDE.md 横断的制約）
- API キーは GitHub Actions の Secrets に格納し、環境変数で注入

---

## 6. 専ブラ互換 API アーキテクチャ

### 6.1 ルーティング設計

Next.js App Router の動的ルーティングで 5ch 互換パスを実現する。

```
app/
  (senbra)/                           # ルートグループ（URLパスに影響しない）
    bbsmenu.html/
      route.ts                  → GET  /bbsmenu.html
    [boardId]/
      subject.txt/
        route.ts                → GET  /{boardId}/subject.txt
      SETTING.TXT/
        route.ts                → GET  /{boardId}/SETTING.TXT
      dat/
        [threadKey].dat/
          route.ts              → GET  /{boardId}/dat/{threadKey}.dat
    test/
      bbs.cgi/
        route.ts                → POST /test/bbs.cgi
```

> `app/api/` 配下ではなく `app/(senbra)/` ルートグループに配置する。`app/api/` 配下にすると URL に `/api/` プレフィックスが付き、5ch プロトコルが要求するルートパス（`/{boardId}/subject.txt` 等）と一致しない。ルートグループ `()` は URL に影響しないため、正しいパスが生成される。

> ChMate が板URLのパスから板IDを導出する挙動に対応するため、`boardId` は動的パラメータで受ける（PoC知見）。

### 6.2 専ブラ互換 Adapter の責務

| 処理 | 詳細 |
|---|---|
| **エンコーディング変換** | リクエスト: Shift_JIS → UTF-8 デコード。レスポンス: UTF-8 → Shift_JIS エンコード（iconv-lite） |
| **DATフォーマット構築** | `posts` テーブルからクエリし、`名前<>メール<>日付とID<>本文<>スレッドタイトル` 形式に変換 |
| **subject.txt 構築** | `threads` テーブルからクエリし、`スレッドキー.dat<>タイトル (レス数)` 形式に変換 |
| **bbs.cgi リクエスト解析** | `application/x-www-form-urlencoded` の POSTパラメータをパースし、PostInput に変換 |
| **bbs.cgi レスポンス生成** | 成功: `<title>書きこみました</title>` / エラー: `<title>ＥＲＲＯＲ</title>` の HTML |
| **Range差分応答** | `Range: bytes=N-` ヘッダを解析し、N バイト目以降のみを `206 Partial Content` で返す |
| **304応答** | `If-Modified-Since` を検証し、更新なしなら `304 Not Modified` を返す |
| **HTMLエスケープ** | 本文の `<`, `>`, `"` を `&lt;`, `&gt;`, `&quot;` に変換 |
| **改行変換** | 本文の改行を `<br>` に変換（DAT上では1レス=1物理行） |
| **システムメッセージ統合** | コマンド実行結果のシステムメッセージを後続レスとして DAT に含める |

### 6.3 認証連携（専ブラ）

専ブラからの書き込み（bbs.cgi POST）では、edge-token を Cookie として受け取り、一般ユーザーと同一の認証フローで検証する。初回書き込み時は HTML レスポンスで認証コード入力を案内する。

---

## 7. 投稿処理の原子性（トランザクション設計）

### 7.1 書き込み + コマンド実行の一体処理

**設計原則 P-2** に基づき、1回の書き込みに伴う複数の副作用を単一トランザクションで処理する。

```
BEGIN TRANSACTION
  1. posts に書き込みレコード INSERT
  2. threads.post_count を INCREMENT、last_post_at を UPDATE
  3. コマンド解析（本文中の !command を検出）
  4. コマンドがある場合:
     a. currencies からコスト分を DEDUCT（残高チェック付き）
     b. コマンド固有の処理を実行
        - !tell: accusations INSERT、bots.is_revealed UPDATE、ボーナス付与
        - 攻撃: bots.hp DECREMENT、撃破判定
     c. システムメッセージを posts に INSERT
  5. インセンティブ判定
     a. 書き込みログインボーナス判定 → currencies UPDATE、incentive_logs INSERT
     b. 返信ボーナス判定 → 被返信者の currencies UPDATE
     c. その他ボーナス判定
COMMIT
```

### 7.2 遅延評価ボーナス

以下のボーナスは、条件が「未来の書き込み」に依存するため、書き込み時点では確定しない。**後続の書き込みトランザクション内で**過去レスをチェックして発火する（メッセージキューやバックグラウンドジョブではない）。

| 処理 | 評価タイミング | 理由 |
|---|---|---|
| **ホットレスボーナス** | 後続の返信書き込み時 | 60分以内に3人以上の返信が付くか、書き込み時点では未確定 |
| **スレッド復興ボーナス** | 後続の書き込み時 | 30分以内に別ユーザーのレスが付くか、書き込み時点では未確定 |
| **スレッド成長ボーナス** | 後続の書き込み時 | マイルストーン（10件/100件）到達 + ユニークID数の検証が必要 |

### 7.3 失敗時の方針

**原則: 書き込みの成功を最優先する。** コマンドやボーナスの失敗で書き込み自体を巻き戻さない。

| 失敗種別 | 書き込み | コマンド | ボーナス | 方針 |
|---|---|---|---|---|
| バリデーションエラー（本文空等） | ❌ 中止 | - | - | 全体ROLLBACK |
| DB致命的エラー（接続断等） | ❌ 中止 | - | - | 全体ROLLBACK |
| コマンドの通貨不足 | ✅ 成功 | ❌ スキップ | 判定する | エラーのシステムメッセージを追加 |
| コマンド実行エラー（対象不存在等） | ✅ 成功 | ❌ スキップ | 判定する | エラーのシステムメッセージを追加 |
| インセンティブ判定エラー | ✅ 成功 | 実行済み | ❌ スキップ | エラーログに記録（後で手動補填可能） |

---

## 8. 日次リセットサイクル

毎日 JST 0:00 に以下のリセット処理を実行する。GitHub Actions の cron または Supabase の pg_cron で実装。

| 処理 | 対象テーブル | 詳細 |
|---|---|---|
| **日次リセットID更新** | users | 次回書き込み時に新しい daily_id が生成される（生成は遅延評価） |
| **ボット偽装IDリセット** | bots | daily_id を再生成、daily_id_date を当日に更新 |
| **BOTマーク解除** | bots | is_revealed = false、revealed_at = NULL |
| **ボット生存日数加算** | bots (is_active=true) | survival_days を +1 |
| **期限切れ認証コード削除** | auth_codes | expires_at < NOW() のレコードを DELETE |

---

## 9. ディレクトリ構成（実装想定）

```
src/
  app/                              # Next.js App Router
    (web)/                          # Web UI ルートグループ
      page.tsx                      # トップ（スレッド一覧）
      threads/
        [threadId]/
          page.tsx                  # スレッド閲覧
      mypage/
        page.tsx                    # マイページ
      admin/
        page.tsx                    # 管理画面
        login/
          page.tsx                  # 管理者ログイン
    api/                            # Web API Routes
      posts/
        route.ts                    # POST: 書き込み
      threads/
        route.ts                    # POST: スレッド作成, GET: 一覧
      auth/
        auth-code/
          route.ts                  # POST: 認証コード検証
      admin/
        posts/[postId]/
          route.ts                  # DELETE: レス削除
        threads/[threadId]/
          route.ts                  # DELETE: スレッド削除
    (senbra)/                       # 専ブラ互換エンドポイント（ルートグループ）
      bbsmenu.html/
        route.ts                    # GET  /bbsmenu.html
      [boardId]/
        subject.txt/
          route.ts                  # GET  /{boardId}/subject.txt
        SETTING.TXT/
          route.ts                  # GET  /{boardId}/SETTING.TXT
        dat/
          [threadKey].dat/
            route.ts                # GET  /{boardId}/dat/{threadKey}.dat
      test/
        bbs.cgi/
          route.ts                  # POST /test/bbs.cgi

  lib/                              # ビジネスロジック
    domain/                         # Domain Layer
      models/
        thread.ts
        post.ts
        user.ts
        currency.ts
        bot.ts
        command.ts
        accusation.ts
        incentive.ts
      rules/                        # ドメインルール（純粋関数）
        daily-id.ts                 # 日次リセットID生成
        command-parser.ts           # コマンド解析
        incentive-rules.ts          # ボーナス発火条件
        accusation-rules.ts         # 告発判定ロジック
        bot-combat.ts               # 攻撃・撃破計算

    services/                       # Application Layer
      post-service.ts
      command-service.ts
      accusation-service.ts
      bot-service.ts
      currency-service.ts
      incentive-service.ts
      auth-service.ts
      admin-service.ts

    infrastructure/                 # Infrastructure Layer
      repositories/
        thread-repository.ts
        post-repository.ts
        user-repository.ts
        currency-repository.ts
        bot-repository.ts
        bot-post-repository.ts    # bot_posts テーブル（RLS保護）
        accusation-repository.ts
        incentive-log-repository.ts
        auth-code-repository.ts
      encoding/
        shift-jis.ts                # iconv-lite ラッパー
      adapters/
        dat-formatter.ts            # DAT形式フォーマッタ
        subject-formatter.ts        # subject.txt フォーマッタ
        bbs-cgi-parser.ts           # bbs.cgi リクエストパーサ
        bbs-cgi-response.ts         # bbs.cgi レスポンスビルダ
      external/
        turnstile-client.ts         # Cloudflare Turnstile API
      supabase/
        client.ts                   # Supabase クライアント初期化

  types/                            # 型定義
    index.ts

.github/
  workflows/
    bot-scheduler.yml               # 運営ボット定期実行
    daily-maintenance.yml           # 日次メンテナンス（ID/BOTマーク リセット等）
```

---

## 10. セキュリティ設計

### 10.1 認証・認可

| 領域 | 方式 |
|---|---|
| 一般ユーザー書き込み | edge-token Cookie + 認証コード + Turnstile |
| 管理者 | Supabase Auth（メール+パスワード）+ admin_session Cookie |
| ボット（GitHub Actions） | サービスアカウント API キー |
| RLS | Supabase PostgreSQL の Row Level Security で DB レベルのアクセス制御 |

### 10.1.1 RLS ポリシー設計

ゲームの根幹（「AIか人間か分からない」）を保護するため、ボット関連テーブルは厳格な RLS で保護する。

| テーブル | anon / authenticated | service_role | 備考 |
|---|---|---|---|
| **bot_posts** | DENY ALL | FULL ACCESS | ボット正体の唯一の記録。漏洩するとゲーム崩壊 |
| **bots** | DENY ALL | FULL ACCESS | ボットの内部管理情報（HP、ペルソナ等） |
| **auth_codes** | DENY ALL | FULL ACCESS | 認証コードの漏洩防止 |
| **admin_users** | DENY ALL | FULL ACCESS | 管理者情報の保護 |
| threads | SELECT (is_deleted=false) | FULL ACCESS | 削除済みスレッドは非表示 |
| posts | SELECT (所属スレッドが非削除) | FULL ACCESS | 閲覧は全員可能 |
| users | SELECT (自分のレコードのみ) | FULL ACCESS | 他ユーザーの情報は非公開 |
| currencies | SELECT (自分のレコードのみ) | FULL ACCESS | 自分の残高のみ参照可能 |
| incentive_logs | SELECT (自分のレコードのみ) | FULL ACCESS | 自分のボーナス履歴のみ |
| accusations | SELECT (スレッド内の告発結果) | FULL ACCESS | 告発結果は全公開 |

> **重要**: Supabase の anon key はクライアント JS に露出するため、RLS がボット正体保護の唯一の防壁。API レスポンスで `bot_id` を返さないだけでは不十分（DevTools で直接 Supabase にクエリ可能）。

### 10.2 入力バリデーション

| 入力 | バリデーション |
|---|---|
| スレッドタイトル | 空チェック、最大文字数チェック（96文字） |
| 書き込み本文 | 空チェック、最大文字数チェック |
| コマンド引数 | 存在するレス番号か、対象が自分自身でないか等 |
| 認証コード | 6桁数字、有効期限、IP整合 |
| 管理者入力 | Supabase Auth による検証 |

### 10.3 XSS/インジェクション対策

- DAT出力時: HTML特殊文字を必ずエスケープ（`<` → `&lt;` 等）
- Web UI: React の標準エスケープに加え、`dangerouslySetInnerHTML` は使用しない
- SQLインジェクション: Supabase クライアントのパラメータバインディングを使用（生SQLは原則禁止）

### 10.4 CSRF対策

- 専ブラ互換: bbs.cgi の書き込み確認画面（Cookie PON/SPID 方式）で対応可能
- Web UI: Next.js の Server Actions / API Routes に対して SameSite Cookie + Origin チェック

---

## 11. パフォーマンス設計

### 11.1 キャッシュ戦略

| 対象 | 方式 | TTL | 備考 |
|---|---|---|---|
| subject.txt | Vercel Edge Cache + `Cache-Control` | 10秒 | 専ブラのポーリング頻度を考慮 |
| .dat ファイル | `Last-Modified` ヘッダ + 304応答 | - | 更新検知はDB の last_post_at |
| SETTING.TXT | 長期キャッシュ | 1時間 | 変更頻度が極めて低い |
| bbsmenu.html | 長期キャッシュ | 1時間 | 同上 |
| スレッド一覧（Web） | ISR または短TTL | 10秒 | |

> 上記 TTL はすべて**初期値**であり、運用データを元に調整する。

### 11.2 DB最適化

| テーブル | インデックス | 用途 |
|---|---|---|
| threads | `(board_id, last_post_at DESC)` | スレッド一覧ソート |
| threads | `(thread_key)` UNIQUE | 専ブラからのDAT取得 |
| posts | `(thread_id, post_number)` | スレッド内レス取得 |
| posts | `(thread_id, created_at)` | Range差分応答用 |
| posts | `(author_id, created_at)` | 書き込み履歴 |
| accusations | `(accuser_id, target_post_id)` UNIQUE | 重複告発防止 |
| incentive_logs | `(user_id, event_type, context_date)` | 日次ボーナス重複チェック |
| bots | `(is_active, daily_id)` | ボット書き込み検索 |

### 11.3 Range差分応答の実装方針

専ブラの差分同期をサポートするため、DAT のバイト数を管理する必要がある。

**方針**: DAT レスポンスは毎回 DB からクエリして動的に構築するが、各スレッドの「Shift_JIS 変換後の累積バイト数」を `threads` テーブルにキャッシュする。Range リクエスト時はこのバイト数と比較して差分レスのみをクエリ・変換・返却する。

---

## 12. 監視・運用

### 12.1 ログ

| ログ種別 | 出力先 | 内容 |
|---|---|---|
| アクセスログ | Vercel ログ | リクエスト/レスポンス概要 |
| エラーログ | Vercel ログ | 例外・エラー詳細 |
| 通貨操作ログ | incentive_logs テーブル | 全ボーナス付与記録 |
| 告発ログ | accusations テーブル | 告発履歴 |
| 管理操作ログ | 別途監査テーブル（将来） | レス/スレッド削除記録 |

### 12.2 GitHub Actions ジョブ

| ジョブ | スケジュール | 内容 |
|---|---|---|
| bot-scheduler | 15分おき（初期値。調整可） | 運営ボットの書き込み実行 |
| daily-maintenance | 毎日 JST 0:00 | 日次リセットID・BOTマークリセット・生存日数加算 |
| cleanup | 毎日 JST 3:00（初期値） | 期限切れ認証コード削除・不要データ掃除 |

---

## 13. 技術的意思決定記録（TDR）

### TDR-001: 一般ユーザー認証に edge-token + 認証コード方式を採用

- **決定日**: 2026-03-04
- **詳細**: `docs/requirements/decision_log/decision_log_auth_architecture_2026-03-04.md`
- **理由**: メール登録不要で匿名掲示板の敷居の低さを維持しつつ、荒らし対策の最低限の認証を実現するため

### TDR-002: 専ブラ互換APIはファイルシステムではなく動的ルーティングで実現

- **決定日**: 2026-03-04（PoC時）
- **理由**: Supabase Storage への .dat ファイル追記は管理が煩雑。DB から動的に DAT テキストを構築する方が保守性が高い

### TDR-003: 通貨の二重消費防止に楽観的ロックを採用

- **ステータス**: 提案（レビュー対象）
- **決定日**: 2026-03-07
- **理由**: 同時アクセス数が少ない（初期2人）ため、悲観的ロック（SELECT FOR UPDATE）のオーバーヘッドは不要。`WHERE balance >= :cost` による楽観的ロックで十分

### TDR-004: インセンティブの一部ボーナスを遅延評価とする

- **ステータス**: 提案（レビュー対象）
- **決定日**: 2026-03-07
- **対象**: ホットレスボーナス、スレッド復興ボーナス
- **理由**: 条件が「未来の書き込み」に依存するため、書き込み時点での判定が不可能。後続の書き込みトランザクション内で過去レスをチェックして発火する（メッセージキュー等の非同期基盤は使用しない）

---

## 14. 今後の拡張ポイント

Phase 3 以降の拡張に備え、以下の拡張ポイントを設計に組み込んでおく。

| 拡張ポイント | 現在の設計 | 将来の拡張 |
|---|---|---|
| コマンド追加 | CommandService にコマンドハンドラを登録する拡張可能な構造 | Phase 4 の 20+ コマンドを個別ハンドラとして追加 |
| ユーザー作成ボット | bots テーブルに `owner_id` カラムを追加予定 | Phase 4 で作成・管理UIを実装 |
| ランキング | incentive_logs に全活動記録を蓄積 | Phase 4 で集計クエリ/マテリアライズドビューを追加 |
| レート制限 | 拡張ポイントのみ確保（ミドルウェア差し込み可能な構造） | 必要時にIPベース/ユーザーベースのレート制限を導入 |
| 制限ポリシー層 | 未実装 | 告発スパム・連打攻撃対策として独立したポリシー層を導入（eddist採用レポート #4） |
| 信頼レベル | users テーブルに `trust_level` カラムを追加予定 | 新規ユーザーの行動範囲制限（eddist採用レポート #5） |
| 非同期安全網 | 未実装 | DB障害時のイベント退避・再投入（outbox + GitHub Actions cron）（eddist採用レポート #3） |

---

## 付録A: 用語対応表

本設計書で使用する技術用語とユビキタス言語辞書（D-02）の対応。

| 技術用語（本書） | ユビキタス言語（D-02） | DB カラム/テーブル |
|---|---|---|
| Thread | スレッド | threads |
| Post | レス | posts |
| User | ユーザー（無料/有料） | users |
| Bot | AIボット（運営ボット） | bots |
| Currency / Balance | 通貨 / 残高 | currencies |
| DailyResetId | 日次リセットID | posts.daily_id |
| Command | ゲームコマンド | - (解析ロジック) |
| Accusation | AI告発 | accusations |
| SystemMessage | システムメッセージ | posts (is_system_message=true) |
| BOTMark | BOTマーク | bots.is_revealed |
| Incentive | ボーナスイベント | incentive_logs |
