# D-07 BattleBoard アーキテクチャ設計書

> ステータス: 運用中
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
               ┌──────────────────────────────────┐
               │   Vercel / Cloudflare (CDN)      │
               │  ┌──────────────────────────┐    │
               │  │   Next.js App Router     │    │
               │  │                          │    │
               │  │  ┌────────────────┐      │    │
               │  │  │ Web UI (SSR)   │      │    │
               │  │  └────────────────┘      │    │
               │  │  ┌────────────────┐      │    │
               │  │  │ Web API Routes │      │    │
               │  │  └────────────────┘      │    │
               │  │  ┌────────────────┐      │    │
               │  │  │ 専ブラ互換 API │      │    │
               │  │  └────────────────┘      │    │
               │  └──────────────────────────┘    │
               └─────────────┬────────────────────┘
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
| **Cloudflare Workers**（メイン） | フロントエンド配信、API実行（Workers）、CDN、専ブラ互換API | Next.js App Router をデプロイ。専ブラ対応可能（HTTP:80直接接続）かつ無料で商用利用可能なため主系 |
| **Vercel**（サブ） | フロントエンド配信、API実行（Serverless Functions）、CDN、BOT cron受付 | 冗長性確保 + BOT定期実行の負荷分散先（TDR-010）。Cloudflare障害時のフォールバック |
| **Supabase PostgreSQL** | データ永続化（スレッド・レス・ユーザー・通貨・ボット等） | RLS でアクセス制御 |
| **Supabase Auth** | 管理者認証（メール+パスワード） | 一般ユーザー認証には使わない |
| **Cloudflare Turnstile** | 一般ユーザーの CAPTCHA 検証 | `/auth-code` 認証コード有効化時のみ |
| **Cloudflare Cron Triggers** | 高頻度BOTの定期実行（5分間隔） | Workers の scheduled イベント。短時間完了BOTを担当（TDR-013） |
| **GitHub Actions** | AI API使用BOTの定期実行、期限切れデータ掃除 | cron スケジュール。長時間実行ジョブを担当（TDR-013） |
| **AI API** | 運営ボットの書き込み文章生成 | GitHub Actions から呼び出し。AiApiClient を通じて Google Gemini / OpenAI / Anthropic を使い分け（v6） |

### 2.3 横断的制約

- AIボットの書き込みは**ユーザーの書き込みと同一APIを通じて行い、直接DBを書き換えない**

### 2.4 環境戦略

> TDR-ENV-001: 2環境構成（ローカル + 本番）を採用する。ステージング環境は設けない。

| 環境 | DB | アプリケーション | 用途 |
|---|---|---|---|
| **ローカル開発** | Supabase Local (Docker) | `npm run dev` (localhost:3000) | 開発・手動確認・専ブラcurlテスト |
| **本番** | Supabase本番プロジェクト | Vercel / Cloudflare（並行稼働） | ユーザー向け・専ブラ実機テスト |

**BDDテスト・単体テスト**はインメモリモック（D-10方式）で実行するため、いずれの環境のDBにも接続しない。

**環境変数の管理:**
- ローカル: `.env.local` に Supabase Local の URL・キーを設定（gitignore済み）
- 本番(Vercel): Vercel ダッシュボードの環境変数に Supabase 本番の URL・キーを設定
- 本番(Cloudflare): Cloudflare ダッシュボードの環境変数（Workers & Pages）に同様に設定
- 本番用 `.env` ファイルはリポジトリに存在しない（各ホスティングサービスがプロセスに直接注入するため不要。秘密鍵漏洩防止）

**マイグレーション運用ルール:**
- スキーマ変更は必ずローカルで `supabase db push` → 動作確認 → 本番に適用の順で行う
- ローカルで検証せずに本番に直接適用することを禁止する

**本番DBへのマイグレーション適用手順:**
```bash
# 1. Supabase CLIにログイン（初回のみ）
npx supabase login

# 2. 本番プロジェクトとリンク（初回のみ）
npx supabase link --project-ref <Reference ID>
# Reference IDはSupabaseダッシュボード Settings > General で確認
# またはSUPABASE_URLの https://<Reference ID>.supabase.co から取得

# 3. マイグレーションを本番に適用
npx supabase db push
```

**ステージング不採用の理由:**
- MVPフェーズではユーザー数が限定的であり、本番で問題が出ても即修正できる
- Supabase無料プランの制約（2プロジェクトまで）と管理コストを考慮し、必要になった時点で再検討する

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
| **AccusationService** | `!tell` 告発処理。判定・BOTマーク付与（コスト消費のみ、報酬なし） | ai_accusation |
| **AttackHandler** | `!attack` 攻撃処理。BOT判定・HP減少・賠償金・撃破報酬（CommandService配下のハンドラ） | bot_system |
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
| **Accusation** | 告発の成功/失敗判定・重複チェック |
| **Incentive** | 各ボーナスイベントの発火条件・金額計算 |

### 3.3 サービス間依存関係

各サービスの依存先一覧。依存方向は Application → Infrastructure（Repository）が基本。サービス間の依存は PostService を起点としたファンアウト構造。

```
PostService
  ├── PostRepository, ThreadRepository, UserRepository
  ├── CommandService, IncentiveService, AuthService

CommandService
  ├── CommandParser, CommandHandlerRegistry
  ├── CurrencyService, AccusationService, BotService
  └── PostRepository（システムメッセージ INSERT）

AccusationService
  ├── PostRepository, BotRepository, AccusationRepository

AttackHandler
  ├── BotService, CurrencyService
  ├── PostRepository, UserRepository

BotService
  ├── BotRepository, BotPostRepository, AttackRepository
  ├── BotStrategyResolver, ContentStrategy, BehaviorStrategy, SchedulingStrategy
  ├── AiApiClient (ContentStrategy 実装が依存。Phase 3以降の将来依存)
  ├── createPostFn（PostService.createPost への関数参照として注入）

CurrencyService
  └── CurrencyRepository

IncentiveService
  ├── CurrencyService, IncentiveLogRepository
  ├── PostRepository, ThreadRepository, UserRepository

AuthService
  ├── AuthCodeRepository, UserRepository
  ├── TurnstileClient, SupabaseAuth

AdminService
  ├── PostRepository, ThreadRepository
  └── AuditLogRepository

専ブラ互換 Adapter
  ├── ShiftJisEncoder, DatFormatter, SubjectFormatter
  ├── BbsCgiParser, BbsCgiResponseBuilder
  └── PostService, ThreadRepository, PostRepository
```

#### Infrastructure Layer（インフラ層）

| コンポーネント | 責務 |
|---|---|
| **Repository** | Supabase PostgreSQL への CRUD。ドメインモデルとDBレコードの変換 |
| **Encoding** | Shift_JIS ↔ UTF-8 変換（iconv-lite）。専ブラ互換 Adapter から利用 |
| **External API Client** | Cloudflare Turnstile 検証 API・AI API（GitHub Actions 経由。AiApiClient アダプターで抽象化）|

### 3.4 2経路の統一処理フロー

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
│ post_count  │     │ display_name │     │ is_verified  │
│ dat_byte_   │     │ daily_id     │     │ is_premium   │
│   size      │     │ body         │     │ username     │
│ created_at  │     │ inline_sys.. │     │ created_at   │
│ last_post_at│     │ is_system_msg│     └──────────────┘
│ created_by  │     │ is_deleted   │            │
│ is_deleted  │     │ created_at   │            │
│ is_dormant  │     └───────┬──────┘            │
│ is_pinned   │             │1                  │
└─────────────┘                                 │
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
│ times_      │     │ result       │     │ context_id   │
│   attacked  │     │ thread_id(FK)│     │ created_at   │
│ bot_profile_│     │ created_at   │     └──────────────┘
│   key       │     └──────────────┘
│ eliminated  │
│   _at       │
│ eliminated  │
│   _by       │
│ created_at  │
└─────────────┘     ┌──────────────┐
RLS: service role   │   attacks    │
のみ参照可能        ├──────────────┤
                    │ id (PK)      │
                    │ attacker_id  │
                    │   (FK->users)│
                    │ bot_id       │
                    │   (FK->bots) │
                    │ attack_date  │
                    │ post_id      │
                    │   (FK->posts)│
                    │ damage       │
                    │ created_at   │
                    └──────────────┘
                    RLS: service role
                    のみ参照可能

                    ┌──────────────┐
                    │  auth_codes  │     ┌──────────────┐
                    ├──────────────┤     │  admin_      │
                    │ id (PK)      │     │  users       │
                    │ code         │     ├──────────────┤
                    │ token_id     │     │ id (PK)      │
                    │ ip_hash      │     │ email        │
                    │ verified     │     │ role         │
                    │ expires_at   │     │ created_at   │
                    │ write_token  │     └──────────────┘
                    │ write_token_ │
                    │   expires_at │
                    │ created_at   │
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
| is_dormant | BOOLEAN DEFAULT false | 休眠フラグ（D-05参照。true: subject.txt非掲載だが閲覧・書き込み可能） |
| is_pinned | BOOLEAN DEFAULT false | 固定スレッドフラグ（休眠化の対象外。50件上限には含まれる） |

#### posts

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 内部識別子 |
| thread_id | UUID (FK) | 所属スレッド |
| post_number | INTEGER | スレッド内レス番号（1始まり、連番） |
| author_id | UUID (FK, NULLABLE) | 書き込みユーザー（人間の場合のみ。ボット・システムメッセージは NULL） |
| display_name | VARCHAR | 表示名（「名無しさん」/ユーザーネーム/「★システム」） |
| daily_id | VARCHAR(8) | 日次リセットID（システムメッセージの場合は "SYSTEM"） |
| body | TEXT | 本文（内部はUTF-8） |
| inline_system_info | TEXT, NULLABLE | レス内マージ型システム情報（方式A）。コマンド結果・書き込み報酬等を格納。表示時に本文末尾に区切り線付きで付加される |
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
| is_verified | BOOLEAN DEFAULT false | edge-token の認証完了状態。`verifyAuthCode` または `verifyWriteToken` 成功時に `true` に更新される（G1対応） |
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
| times_attacked | INTEGER DEFAULT 0 | 被攻撃回数（撃破報酬計算に使用。v5追加） |
| bot_profile_key | VARCHAR | bot_profiles.yaml 内のプロファイルキー（v5追加） |
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
| bonus_amount | INTEGER | 付与ボーナス額（v4以降は常に0。互換性のため残存） |
| created_at | TIMESTAMPTZ | 告発日時 |

> **重複告発防止**: `(accuser_id, target_post_id)` にユニーク制約。

#### attacks

| カラム | 型 | 説明 |
|---|---|---|
| id | UUID (PK) | 内部識別子 |
| attacker_id | UUID (FK → users.id) | 攻撃者 |
| bot_id | UUID (FK → bots.id) | 攻撃対象ボット |
| attack_date | DATE | 攻撃実施日（JST） |
| post_id | UUID (FK → posts.id) | 攻撃が含まれたレス |
| damage | INTEGER | 与ダメージ |
| created_at | TIMESTAMPTZ | 攻撃日時 |

> **1日1回制限**: `(attacker_id, bot_id, attack_date)` にユニーク制約。
>
> **RLS ポリシー**: `anon` / `authenticated` ロールからの全操作を DENY。`service_role` のみアクセス可能。

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
| write_token | TEXT, NULLABLE | 専ブラ向け認証橋渡しトークン（32文字 hex）。`verifyAuthCode` 成功時に生成。ワンタイム消費後 null に更新（G4対応） |
| write_token_expires_at | TIMESTAMPTZ, NULLABLE | write_token の有効期限（認証完了から10分） |
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

> 本セクションは `docs/requirements/decision_log/decision_log_auth_architecture_2026-03-04.md` の決定事項と、Sprint-17 認証フロー是正（G1〜G4対応）を反映する。

### 5.1 一般ユーザー認証

```
┌────────┐     ①書き込みPOST      ┌───────────────┐
│ ユーザー│──────────────────────►│  PostService  │
│        │  (edge-token なし、     │               │
│        │   または is_verified=   │  → 未認証応答  │
│        │   false)               │  → edge-token │
│        │◄─────────────────────│    Cookie発行  │
│        │  ②認証コード案内       │  (is_verified │
│        │    + edge-token発行   │   =false)      │
│        │                       └───────────────┘
│        │
│        │  ③6桁コード + Turnstile応答
│        │──────────────────────►┌───────────────┐
│        │                       │  AuthService  │
│        │◄─────────────────────│  → コード検証  │
│        │  ④is_verified=true    │  → IP整合検証  │
│        │    + write_token発行  │  → Turnstile  │
│        │                       │    API検証     │
│        │  ⑤書き込みPOST        └───────────────┘
│        │──────────────────────►┌───────────────┐
│        │  (is_verified=true    │  PostService  │
│        │   の edge-token)      │  → 書き込み成功│
│        │◄─────────────────────│               │
└────────┘                       └───────────────┘
```

- **edge-token**: Cookie に保持。書き込みAPI呼び出し時に検証
- **is_verified フラグ**: edge-token に紐づく認証完了状態。`false` の場合は書き込みを拒否して認証案内を再表示する（G1対応）
- **認証コード**: 6桁数字。有効期限あり（10分）
- **Turnstile**: `/auth/verify` での認証コード有効化時にのみ検証（毎回の書き込み時には不要）
- **write_token**: 認証完了時に発行される専ブラ向け認証橋渡しトークン（32文字 hex、10分有効、ワンタイム）。Cookie を共有できない専ブラが mail 欄に `#<write_token>` 形式で使用する（G4対応）
- **IP整合**: 認証コード発行時のIPとedge-token使用時のIPの整合性を検証（ソフトチェック）

### 5.2 日次リセットID生成

```
daily_reset_id = truncate(sha256(
    date_jst       +   // YYYY-MM-DD (JST)
    board_id       +   // 板ID
    author_id_seed     // sha512(reduced_ip) ... ユーザー登録時に生成
), 8)
```

- `reduced_ip` の定義: IPv4 はそのまま、IPv6 は先頭48ビット（/48 プレフィックス）に縮約（同一回線判定）
- 同日・同回線で同一IDになりやすい
- Cookie削除・再認証後も同一性が継続しうる（IP依存度: 強め）
- 翌日（JST 0:00）にリセットされる
- IP整合チェック方針: edge-token 使用時に発行時IPと比較し、不一致時は**警告ログ記録のみで通過**させる（モバイル回線等のIP変動を考慮）

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
| **BOTマーク絵文字変換** | `🤖` 等の絵文字は Shift_JIS 変換不可のため、DAT出力時は `[BOT]` テキスト代替に置換。Web UI では絵文字をそのまま表示 |

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
  2b. 休眠管理（D-05 スレッド状態遷移参照）:
      - 対象スレッドが is_dormant = true の場合、is_dormant = false に更新（復活）
      - アクティブスレッド数（is_dormant=false, is_deleted=false, 当該board_id）が上限(50)を超える場合、
        last_post_at が最古の非固定（is_pinned=false）アクティブスレッドを is_dormant = true に更新
  3. コマンド解析（本文中の !command を検出）
  4. コマンドがある場合:
     a. currencies からコスト分を DEDUCT（残高チェック付き）
     b. コマンド固有の処理を実行
        - !tell: accusations INSERT、bots.is_revealed UPDATE
        - !attack: bots.hp DECREMENT、attacks INSERT、撃破判定、賠償金/撃破報酬
     c. システムメッセージを posts に INSERT
  5. インセンティブ判定
     a. 書き込みログインボーナス判定 → currencies UPDATE、incentive_logs INSERT
     b. 返信ボーナス判定 → 被返信者の currencies UPDATE
     c. その他ボーナス判定
COMMIT
```

### 7.2 同時実行制御

| 対象 | 方式 | 備考 |
|---|---|---|
| レス番号採番 | SERIALIZABLE またはアドバイザリロック | `(thread_id, post_number)` UNIQUE制約で最終防衛 |
| 通貨操作 | 楽観的ロック (`WHERE balance >= :cost`) | TDR-003 参照 |
| インセンティブ重複 | `ON CONFLICT DO NOTHING` | incentive_logs のユニーク制約で冪等性担保 |

### 7.3 遅延評価ボーナス

以下のボーナスは、条件が「未来の書き込み」に依存するため、書き込み時点では確定しない。**後続の書き込みトランザクション内で**過去レスをチェックして発火する（メッセージキューやバックグラウンドジョブではない）。インセンティブの判定エラーは書き込み自体を巻き戻さない（ボーナスをスキップしてエラーログに記録、後で手動補填可能）。

| 処理 | 評価タイミング | 理由 |
|---|---|---|
| **ホットレスボーナス** | 後続の返信書き込み時 | 60分以内に3人以上の返信が付くか、書き込み時点では未確定 |
| **スレッド復興ボーナス** | 後続の書き込み時 | 30分以内に別ユーザーのレスが付くか、書き込み時点では未確定 |
| **スレッド成長ボーナス** | 後続の書き込み時 | マイルストーン（10件/100件）到達 + ユニークID数の検証が必要 |

### 7.4 失敗時の方針

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
| **攻撃記録クリーンアップ** | attacks | 前日以前の攻撃記録を DELETE（1日1回制限のリセット） |
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
        attack-rules.ts             # 攻撃・賠償金・撃破報酬計算
        bot-combat.ts               # 攻撃・撃破計算

    services/                       # Application Layer
      post-service.ts
      command-service.ts
      accusation-service.ts
      handlers/
        attack-handler.ts             # !attack コマンドハンドラ
      bot-service.ts                  # Strategy 委譲に変更（v6）
      bot-strategies/                 # BOT行動 Strategy（v6 新規）
        types.ts                      # Strategy インターフェース定義
        strategy-resolver.ts          # resolveStrategies()
        ai-api-client.ts              # AiApiClient インターフェース
        content/                      # ContentStrategy 実装群
        behavior/                     # BehaviorStrategy 実装群
        scheduling/                   # SchedulingStrategy 実装群
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
        attack-repository.ts        # attacks テーブル（RLS保護）
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
        ai-adapters/                # AI API プロバイダーアダプター（v6 新規）
          google-ai-adapter.ts      # Google Gemini
          openai-adapter.ts         # OpenAI
          anthropic-adapter.ts      # Anthropic
      supabase/
        client.ts                   # Supabase クライアント初期化

  types/                            # 型定義
    index.ts

.github/
  workflows/
    bot-scheduler.yml               # 運営ボット定期実行
    daily-maintenance.yml           # 日次メンテナンス（ID/BOTマーク リセット等）

supabase/
  migrations/
    {timestamp}_create_tables.sql   # テーブル作成（threads, posts, users, currencies 等）
    {timestamp}_create_indexes.sql  # インデックス定義（§11.2）
    {timestamp}_rls_policies.sql    # RLSポリシー（§10.1.1）
  config.toml                       # Supabase CLI 設定（自動生成）
```

> **マイグレーション管理方針（TDR-005）**: DBスキーマ変更は必ず `supabase migration new {name}` でファイルを作成し、`supabase db push` で適用する。Supabase ダッシュボードやpsqlでの直接実行は禁止し、全変更をリポジトリで追跡する。

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
| **attacks** | DENY ALL | FULL ACCESS | 攻撃記録の保護 |
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
| subject.txt | Edge Cache（Vercel / Cloudflare）+ `Cache-Control` | 10秒 | 専ブラのポーリング頻度を考慮 |
| .dat ファイル | `Last-Modified` ヘッダ + 304応答 | - | 更新検知はDB の last_post_at |
| SETTING.TXT | 長期キャッシュ | 1時間 | 変更頻度が極めて低い |
| bbsmenu.html | 長期キャッシュ | 1時間 | 同上 |
| スレッド一覧（Web） | ISR または短TTL | 10秒 | |

> 上記 TTL はすべて**初期値**であり、運用データを元に調整する。

### 11.2 DB最適化

| テーブル | インデックス | 用途 |
|---|---|---|
| threads | `(board_id, last_post_at DESC)` | スレッド一覧ソート |
| threads | `(board_id, is_deleted, is_dormant, last_post_at DESC)` | 休眠管理用（アクティブスレッド一覧・末尾スレッド特定。D-05参照） |
| threads | `(thread_key)` UNIQUE | 専ブラからのDAT取得 |
| posts | `(thread_id, post_number)` | スレッド内レス取得 |
| posts | `(thread_id, created_at)` | Range差分応答用 |
| posts | `(author_id, created_at)` | 書き込み履歴 |
| accusations | `(accuser_id, target_post_id)` UNIQUE | 重複告発防止 |
| incentive_logs | `(user_id, event_type, context_date)` | 日次ボーナス重複チェック |
| attacks | `(attacker_id, bot_id, attack_date)` UNIQUE | 1日1回攻撃制限の強制 |
| attacks | `(bot_id, attack_date)` | 被攻撃回数の集計用 |
| bots | `(is_active, daily_id)` | ボット書き込み検索 |

### 11.3 Range差分応答の実装方針

専ブラの差分同期をサポートするため、DAT のバイト数を管理する必要がある。

**方針**: DAT レスポンスは毎回 DB からクエリして動的に構築するが、各スレッドの「Shift_JIS 変換後の累積バイト数」を `threads` テーブルにキャッシュする。Range リクエスト時はこのバイト数と比較して差分レスのみをクエリ・変換・返却する。

---

## 12. 監視・運用

### 12.1 ログ

| ログ種別 | 出力先 | 内容 |
|---|---|---|
| アクセスログ | Vercel / Cloudflare ログ | リクエスト/レスポンス概要 |
| エラーログ | Vercel / Cloudflare ログ | 例外・エラー詳細 |
| 通貨操作ログ | incentive_logs テーブル | 全ボーナス付与記録 |
| 告発ログ | accusations テーブル | 告発履歴 |
| 管理操作ログ | 別途監査テーブル（将来） | レス/スレッド削除記録 |

### 12.2 定期ジョブ

実行基盤をBOTの実行時間特性に応じて使い分ける（TDR-013）。

#### Cloudflare Cron Triggers

| ジョブ | スケジュール | 内容 |
|---|---|---|
| bot-scheduler-fast | 5分間隔（`*/5 * * * *`） | 短時間BOT（テンプレート応答・チュートリアルBOT等）の書き込み実行。`next_post_at` 方式で投稿判定（TDR-010） |

#### GitHub Actions

| ジョブ | スケジュール | 内容 |
|---|---|---|
| bot-scheduler | 毎時 :00, :30（`0,30 * * * *`） | AI API使用BOTの書き込み実行。`next_post_at` 方式で投稿判定（TDR-010） |
| newspaper-scheduler | 毎時 :05, :35（`5,35 * * * *`） | !newspaper pending の非同期処理（AI API使用） |
| daily-maintenance | 毎日 JST 0:00 | 日次リセットID・BOTマークリセット・生存日数加算 |
| cleanup | 毎日 JST 3:00（初期値） | 期限切れ認証コード削除・不要データ掃除 |

#### 非同期処理の実行トポロジ

非同期コマンド・定期ジョブにおいて、**AI API 呼び出しがどこで実行されるか**を定義する。

**原則（TDR-013 準拠）:** AI API 呼び出しを伴う処理は Vercel/CF Workers 内で実行しない。GitHub Actions 内で完結させる（Vercel Hobby 10秒 / CF Workers 30秒のタイムアウトに収まらないため）。Vercel への API 呼び出しは生成済みテキストの DB 書き込み等の軽量処理に限定する。

| 処理 | トリガー | AI API | 実行場所 | API向き先 | 秘密情報の配置 |
|---|---|---|---|---|---|
| テンプレートBOT投稿 | CF Cron (5分) | なし | Vercel API Route 内 | DEPLOY_URL → Vercel | BOT_API_KEY: CF変数 |
| チュートリアルBOT処理 | CF Cron (5分) | なし | Vercel API Route 内 | DEPLOY_URL → Vercel | BOT_API_KEY: CF変数 |
| 煽りBOT処理 (!aori) | GH Actions (30分) | なし | Vercel API Route 内 | DEPLOY_URL → Vercel | BOT_API_KEY: GH Secrets |
| 新聞配達 (!newspaper) | GH Actions (30分) | **あり** (Gemini) | **GH Actions 内** | DEPLOY_URL → Vercel (結果書込のみ) | GEMINI_API_KEYS: **GH Secrets** |
| AI BOT投稿 (将来) | GH Actions (30分) | **あり** | **GH Actions 内** | DEPLOY_URL → Vercel (結果書込のみ) | GEMINI_API_KEYS: GH Secrets |
| daily-maintenance | GH Actions (日次) | なし | Vercel API Route 内 | DEPLOY_URL → Vercel | BOT_API_KEY: GH Secrets |
| cleanup | GH Actions (日次) | なし | Vercel API Route 内 | DEPLOY_URL → Vercel | BOT_API_KEY: GH Secrets |

「実行場所」= AI生成等の重い処理が走る環境。「API向き先」= DB書き込み等の軽量処理を受ける環境。

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

### TDR-005: DBマイグレーション管理に Supabase CLI を採用

- **ステータス**: 決定
- **決定日**: 2026-03-08
- **方針**:
  - `supabase/migrations/{timestamp}_{name}.sql` 形式でマイグレーションファイルをバージョン管理する
  - マイグレーション適用は `supabase db push` コマンドで行う
  - 新規マイグレーションファイルは `supabase migration new {name}` で作成する
  - 生SQL手動実行は禁止（CLI経由のみ）。適用済みSQLはファイルとして必ずリポジトリに残す
- **理由**: マイグレーション履歴をコードとして追跡し、Supabase ダッシュボードでの直接手動実行による管理不能な状態を防ぐ

### TDR-007: write_token 方式による専ブラ認証（G4対応）

- **ステータス**: 決定
- **決定日**: 2026-03-14
- **背景**: 専ブラ（ChMate等）は WebView を持たないため Turnstile ウィジェット表示不可。G1対応（`is_verified` チェック追加）により、専ブラからの書き込みが完全ブロックされる問題が発生した（G4）
- **調査**: 他の匿名掲示板（eddist等）の先行事例を調査し、同一方式を採用
- **決定**: 認証完了時に write_token（32文字 hex）を発行し、専ブラの mail 欄に `#<write_token>` 形式で貼り付けて使用する方式を採用する
- **実装方針**:
  - `verifyAuthCode` 成功時に `crypto.randomBytes(16).toString('hex')` で生成し `auth_codes` テーブルに保存
  - 有効期限10分、ワンタイム消費（使用後 null に更新）
  - bbs.cgi ルートが mail 欄から `#xxx` パターンを検出して `verifyWriteToken` を呼び出し、DAT には漏洩させない
  - Cookie 共有の専ブラ（認証後そのまま書き込める場合）では write_token 不要
- **理由**: Web UI 経由でブラウザ認証を完了させることで Turnstile 要件を満たしつつ、専ブラからの書き込みを可能にする。メール欄方式はプロトコル変更なしで既存専ブラと互換性を保てる

### TDR-008: BOTシステムの Strategy パターン採用

- **ステータス**: 決定
- **決定日**: 2026-03-17
- **背景**: Phase 2（荒らし役）の BotService は固定文ランダム選択・既存スレッドランダム選択・60-120分固定間隔がハードコードされている。Phase 3（ネタ師: AI生成 + スレッド作成）・Phase 4（ユーザー作成ボット: ユーザープロンプト + ガチャスケジュール）では、コンテンツ生成・行動パターン・スケジュールの3軸で根本的に異なる振る舞いが必要となり、if/switch 分岐では組み合わせ爆発が起きる
- **決定**: BOTの行動を `ContentStrategy`（何を書くか）/ `BehaviorStrategy`（どこに書くか）/ `SchedulingStrategy`（いつ書くか）の3軸で Strategy インターフェースとして抽象化する。BotService は Strategy に処理を委譲し、BOT種別固有の振る舞いを知らない
- **代替案**:
  - サブクラス継承（BotService の種別ごとサブクラス）: 3軸の組み合わせを継承で表現すると菱形継承に陥る。TypeScript には多重継承がない
  - if/switch 分岐の追加: Phase 4 でBOT種別が5種以上に増えた時点で保守困難
  - 完全分離（種別ごとに独立 BotService）: HP管理・BOTマーク・撃破報酬・日次リセットなど共通ロジックの重複が大きい
- **影響範囲**: `bot-service.ts`（リファクタ）, `bot-strategies/`（新規ディレクトリ）, `ai-adapters/`（新規ディレクトリ）
- **詳細**: D-08 `docs/architecture/components/bot.md` §2.12

### TDR-006: 認証不要のSSRページでサービス層を直接インポートする

- **ステータス**: 決定
- **決定日**: 2026-03-14
- **背景**: Cloudflare Workers環境ではWorker自身の外部URLへのfetchがerror code 1042（自己参照ループ禁止）でブロックされる。Server ComponentからAPIルート経由でデータを取得する従来方式が動作しない
- **決定**: 認証不要のGET系Server Component（スレッド一覧・スレッド閲覧）では、PostServiceを直接importしてデータを取得する。`export const dynamic = 'force-dynamic'` を設定し、リクエストごとにSSRを実行する
- **補足（2026-03-19）**: Next.js 16 ではキャッシュがopt-in（`use cache` を明示しない限り全ページ動的）に変わったため、`force-dynamic` は本来不要である。ただし意図の明示として残しても害はない
- **影響範囲**: `src/app/(web)/page.tsx`, `src/app/(web)/threads/[threadId]/page.tsx`
- **除外**: POST系操作（書き込み・認証）はClient Componentから引き続きAPIルート経由で行う（Cloudflare制約の影響なし）
- **理由**: Service Bindings による回避策も検討したが、Next.jsの標準`fetch()`からはService Bindingsにアクセスできず（Cloudflare固有の`env.BINDING.fetch()` APIが必要）、フレームワークの制約により採用不可

### TDR-009: Range差分応答は全DAT再構築+sliceで実装する

- **ステータス**: 決定
- **決定日**: 2026-03-18
- **背景**: D-07 §11.3 および senbra-adapter.md §4 では「差分レスのみクエリして差分だけDAT構築」を理想方針として記述している。しかし実装（`(senbra)/[boardId]/dat/[threadKey]/route.ts`）では全レスを取得し、全DATを構築した上で `slice(rangeStart)` する方式を採用している。これが妥当かを eddist の実装と比較して検証した
- **決定**: 現行の「全DAT再構築 + slice」方式を正式な実装方針として維持する。差分SELECTによる最適化は採用しない
- **理由**:
  - 5ch本家・eddist でRange差分が成立する前提は「DATが追記専用ファイルであり、過去行のバイト数が変わらないこと」である
  - BattleBoard では管理者によるレス削除（`is_deleted = true`）が発生すると、DATFormatter の出力が「元の本文」→「このレスは削除されました」に変わり、過去行の Shift_JIS バイト数が変動する。この時点で専ブラが保持するキャッシュのバイトオフセットとサーバー側のDATが乖離する
  - 差分SELECTで新規レスだけを返すと、削除によるバイトずれを吸収できず、専ブラ側であぼーん検知→全DAT再取得が頻発する可能性がある
  - 全DAT再構築 + slice は非効率だが、「現在のDB状態から生成した正しいDAT」からバイトを切り出すため、バイト境界の整合性が常に保証される
- **将来の最適化方針**: DB負荷が問題になった場合は、差分SELECTではなく「生成済み Shift_JIS バッファのキャッシュ（メモリ or Edge Cache）」で対処する。書き込み時にキャッシュを更新し、Range要求時はキャッシュからsliceする。レス削除時はキャッシュを無効化する。eddist の「DATファイル配信」と本質的に同等の効果をファイルシステムなしで得る方式
- **影響範囲**: `src/app/(senbra)/[boardId]/dat/[threadKey]/route.ts`
- **関連**: TDR-002, senbra-adapter.md §4, eddist Fit & Gap レポート（`docs/research/eddist_frontend_fit_gap_2026-03-18.md` §1）

### TDR-010: BOT cron間隔と投稿タイミング制御方式

- **ステータス**: 決定
- **決定日**: 2026-03-18
- **背景**: 運営ボットの定期書き込みを GitHub Actions cron で駆動する際、cron間隔と投稿タイミングのランダム性、GitHub Actions 無料枠（月2,000分）の3つを両立させる必要がある
- **決定**:
  1. **cron間隔**: 毎時 :00, :30 の30分間隔（`0,30 * * * *`）
  2. **投稿タイミング制御**: DB予定時刻方式（`bots.next_post_at` カラム）を採用。投稿完了時に `next_post_at = NOW() + SchedulingStrategy.getNextPostDelay()` を保存し、cron起動時は `WHERE is_active = true AND next_post_at <= NOW()` で投稿対象を判定する
- **制約と受容**:
  - 現行インフラ（Vercel/Cloudflare + GitHub Actions）では投稿時刻の真のランダム化は不可能。サーバー側 sleep はサーバーレスのタイムアウト制限（Vercel 10秒 / Cloudflare 30秒）により不可。GitHub Actions 内 sleep は課金分数を浪費する
  - `next_post_at` 方式が実現するのは「投稿間隔のランダム化」であり、外部から観測される投稿時刻は :00, :30 のいずれかに乗る
  - このグリッド痕跡はゲーム情報として許容する。プレイヤーがBOTの投稿パターンを推理する材料となり、逆に人間がBOTを装う攪乱プレイの余地も生まれる
- **GitHub Actions 無料枠との整合性**:
  - GitHub Actions はジョブ単位で1分に切り上げ課金。実処理が数秒でも1回 = 1分消費
  - 30分間隔: 2回/時 × 24時間 × 30日 = 1,440分/月（無料枠内。他ジョブ + CI/CD の余裕あり）
  - 15分間隔: 2,880分/月（無料枠超過のため不採用）
- **検討した代替案**:
  - GitHub Actions 内 `sleep $((RANDOM % N))`: sleep 中も課金されるため不可
  - API側 `setTimeout` による遅延: サーバーレス実行時間制限により不可
  - 素数間隔（13分, 17分）や不揃い間隔による痕跡緩和: cron構文 `*/N` は毎時固定分に展開されるため効果限定的。かつ無料枠を超過する
  - 常駐プロセス（別インフラ）: 秒単位精度が可能だが、CLAUDE.md 横断的制約によりインフラ追加はエスカレーション必須。Phase 2 では不要
- **撃破との整合性**: 撃破時（`is_active = false`）は cron クエリの `is_active = true` 条件で自動除外される。`next_post_at` の変更は不要。日次リセットでの復活時に `next_post_at` を再設定する
- **DEPLOY_URL の向き先**: Vercel を選択。Cloudflare Workers は通常ユーザー（専ブラ含む）のリクエストに専念させ、BOT cronの負荷を分離する。GitHub Secrets の `DEPLOY_URL` を変更するだけでCloudflareに切り替え可能
- **補足（2026-03-21）**: TDR-013 により、高頻度BOT（5分間隔）は Cloudflare Cron Triggers に移行。本TDRの30分間隔は AI API 使用BOTに限定して維持する
- **議論経緯**: `tmp/archive/discussion_bot_cron_design.md`
- **影響範囲**: `bots` テーブル（`next_post_at` カラム追加）、D-08 bot.md §5（データモデル）、`.github/workflows/bot-scheduler.yml`

### TDR-011: UIコンポーネント基盤に shadcn/ui を採用

- **ステータス**: 決定
- **決定日**: 2026-03-19
- **背景**: 既存の Web UI はスタイルが各ページの TSX に Tailwind ユーティリティクラスとしてハードコードされており、色・余白・フォント等の一括変更が不可能。デザイントークン（CSS変数）も `--background` / `--foreground` の2変数のみで、サイト全体のテーマ管理機構が存在しなかった
- **決定**: shadcn/ui (style: base-nova, base color: neutral) を導入し、以下の3層構造を確立する
  1. **デザイントークン**: `globals.css` の CSS 変数（oklch形式、ライト/ダーク対応）
  2. **共通UIコンポーネント**: `src/components/ui/` に shadcn/ui コンポーネントを配置
  3. **ページレイアウト**: 各ページは共通コンポーネントとデザイントークンを参照
- **移行方針**: 既存ページは一括置換せず画面単位で段階的に移行する。新規コードではハードコードされた色（`text-gray-800` 等）の使用を禁止し、セマンティックトークン（`text-foreground`, `text-muted-foreground` 等）を使用する
- **追加された依存**: `shadcn`, `@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, `lucide-react`
- **影響範囲**: `src/app/globals.css`（テーマ変数追加）, `src/components/ui/`（新規ディレクトリ）, `src/lib/utils.ts`（`cn()` ユーティリティ追加）, `.claude/rules/UI_Components.md`（AIエージェント向けコーディング規約）
- **検討した代替案**:
  - 自前デザインシステム構築: 工数が大きく、デザイン専門知識が必要
  - Material UI / Chakra UI: バンドルサイズが大きく、Tailwind CSS との二重管理になる
  - Tailwind UI（テンプレート集）: コンポーネント抽象化が弱く、コピペ運用になる

### TDR-012: スレッド休眠方式（is_dormant）の採用

- **ステータス**: 決定
- **決定日**: 2026-03-20
- **背景**: subject.txt の返却件数を LIMIT で動的に制御する方式では、専ブラ（ChMate等）のローカル履歴にスレッドが蓄積し続ける問題が発生した。原因は LIMIT 圏外に落ちたスレッドが bump 順変動で subject.txt に不安定に出入りし、専ブラのローカルDBに幽霊として残り続けること
- **決定**: `threads` テーブルに `is_dormant` フラグを導入し、書き込み時の同期処理でアクティブスレッド数を上限（50件）に制御する。subject.txt は `WHERE is_dormant = false` で安定した一覧を返す（LIMIT 不使用）。休眠スレッドは dat/ および bbs.cgi からは引き続きアクセス可能（dat落ちなし）。書き込みがあれば自動復活する
- **要件の充足**:
  - R1（表示件数制御）: subject.txt は常に ≤ 50件
  - R2（dat落ちなし）: 休眠スレッドも閲覧・書き込み可能
  - R3（書き込みで復活）: 休眠スレッドへの書き込み時に is_dormant = false に更新し、末尾スレッドと入れ替え
- **検討した代替案**:
  - LIMIT方式（変更前の方式）: 専ブラ蓄積問題が構造的に発生する
  - eddist方式（不可逆アーカイブ + cron）: R2・R3を満たせない。古いスレッドへの書き込み需要に対応不可
  - cron方式（定期バッチで休眠化）: タイミング不整合が発生しうる。書き込みトリガーの同期処理が整合性に優れる
- **sage 復活**: 書き込みがあれば無条件に復活する（sage による復活抑止なし。本PJにはsage要件がなく、Web版にメール欄が存在しない）
- **同時実行制御**: 明示的なロックは設けない。同時書き込みにより一時的に50件を超える場合があるが許容する（次回書き込み時に自動是正される）
- **詳細**: `docs/research/thread_dormancy_design_2026-03-20.md`, D-05 `docs/specs/thread_state_transitions.yaml`
- **影響範囲**: threads テーブル（`is_dormant` カラム追加）、PostService（休眠⇔復活ロジック追加: D-07 §7.1 step 2b）、ThreadRepository（クエリ条件追加）、subject.txt Route Handler（LIMIT廃止 → is_dormant 条件）

### TDR-013: BOT cron実行基盤の Cloudflare Cron Triggers 併用

- **ステータス**: 決定
- **決定日**: 2026-03-21
- **背景**: TDR-010 で GitHub Actions cron の30分間隔を採用したが、以下の課題が顕在化した
  1. チュートリアルBOT等、5分間隔の高頻度投稿ニーズが大きい。GitHub Actions の30分間隔では対応不可
  2. GitHub Actions 無料枠（月2,000分）を cron ジョブが圧迫し、AI API 使用ジョブや CI/CD の実行余地が縮小する
- **決定**: Cloudflare Cron Triggers を導入し、BOTの実行時間特性に応じて GitHub Actions と使い分ける
  - **Cloudflare Cron Triggers（5分間隔）**: 短時間で完了するBOT（テンプレート応答・チュートリアルBOT等。AI API を使用しないもの）
  - **GitHub Actions（30分間隔、TDR-010維持）**: 実行に長時間かかるBOT（AI API 呼び出しを含むもの）
- **振り分け根拠**: AI API 呼び出しは応答待ち時間が長く（数秒〜十数秒）、Cloudflare Workers の実行時間制限（Free: 10ms CPU / Paid: 30s CPU）に収まるか未検証。GitHub Actions は実行時間制限が緩く（6時間）、AI API の応答待ちを安全に処理できる
- **将来方針**: AI API 呼び出しが Cloudflare Workers の実行時間制限内で完了することが検証できた場合、GitHub Actions cron を廃止し Cloudflare Cron Triggers に一本化する。AI API の処理は I/O バウンド（CPU 時間は短い）であり、Paid プランの wall clock 制限（15分）内に収まる可能性は高い
- **実装方針**: Cloudflare Cron Triggers は Workers の `scheduled` イベントハンドラで受け、既存の BOT 実行ロジック（BotService.executeBotPost）を内部呼び出しする。投稿判定ロジック（`next_post_at` 方式）は GitHub Actions と共通
- **GitHub Actions 無料枠の改善効果**: 高頻度BOTを CF Cron に移行することで、GitHub Actions の cron 消費を削減し、AI API 使用ジョブへの枠配分を確保する
- **影響範囲**: `wrangler.toml`（cron triggers 設定追加）、`bot-scheduler.yml`（対象BOTの絞り込み）、D-07 §12.2（定期ジョブ一覧）、D-08 bot.md
- **関連**: TDR-010（GitHub Actions cron 設計。本TDRにより高頻度BOTは CF Cron に移行）

### TDR-014: 開発連絡板（/dev/）を本番ロジックから完全分離する

- **ステータス**: 決定
- **決定日**: 2026-03-22
- **背景**: dev板は本番と同一の PostService を経由しており、本番のバグ発生時に開発連絡手段として機能しない
- **決定**: dev板専用の Service / Repository / API ルートを新設し、本番コードへの依存を Supabase クライアント初期化のみに限定する。UIはCGI掲示板風のレトロデザインとし、Client Component・Tailwind を使用しない
- **影響範囲**: `src/app/(web)/dev/page.tsx`（全面書き換え）、`src/app/api/dev/posts/route.ts`（新設）、`src/lib/services/dev-post-service.ts`（新設）、`src/lib/infrastructure/repositories/dev-post-repository.ts`（新設）、`dev_posts` テーブル（新設）
- **詳細**: See features/dev_board.feature

### TDR-015: BOTコンテンツ生成の初期モデルに Gemini 3 Flash を採用

- **ステータス**: 決定
- **決定日**: 2026-03-22
- **背景**: コマンドによるAI生成コンテンツ（!newspaper, !hiroyuki 等）の導入により、AI APIによるコンテンツ生成が必要になる。§2.2 で AiApiClient による複数プロバイダ使い分けを想定済み（v6）だが、初期実装でどのプロバイダを採用するかが未決定であった
- **決定**: 初期実装では Google Gemini 3 Flash Preview（`gemini-3-flash-preview`）に統一する。データ構造（`pending_async_commands.model_id` 等）には将来のマルチモデル対応のためプロバイダ識別子を含めるが、実行時のプロバイダ分岐や抽象化レイヤーは構築しない
- **理由**:
  - Google Search Grounding が組み込みツールとして利用可能。!newspaper のWeb検索+生成が1 API callで完結し、別途検索APIの追加が不要
  - 無料枠が十分: 月5,000検索クエリ無料、モデルの入出力も無料枠あり。MVP段階のコスト負担なし
  - 1プロバイダに統一することでAPI統合・エラーハンドリング・認証管理の複雑度を最小化（KISS原則）
- **代替案**:
  - Claude API: Web検索機能がなく、!newspaper に別途検索APIが必要。インフラ追加が発生する
  - OpenAI: Web検索ツールのAPI提供状況が限定的
  - 複数プロバイダ同時導入: 初期からプロバイダ抽象化を構築するのはYAGNI
- **将来の拡張**: ユーザー作成ボット（Phase 4）ではモデル選択をユーザーに開放する構想あり。データ構造はこれを見据えて設計するが、選択UIやプロバイダ切り替えロジックは Phase 4 以降で実装
- **影響範囲**: `ai-adapters/`（Gemini クライアント実装）、`config/` or DB（モデル識別子フィールド追加）、環境変数（`GEMINI_API_KEYS`）
- **関連**: TDR-008（Strategy パターン）、§2.2 AI API 構成要素

### TDR-016: 画面テーマの資源管理方式

- **ステータス**: 決定
- **決定日**: 2026-03-23
- **背景**: 画面テーマ機能（features/theme.feature）の導入にあたり、テーマ定義（CSS変数セット）、テーマカタログ（メタ情報）、フォント資源の管理方式を決定する必要がある
- **決定**:
  1. **CSS変数セット**: `globals.css` に全テーマを集約する。テーマごとのファイル分離は行わない
  2. **テーマカタログ**: TypeScript定数として `src/lib/domain/models/theme.ts` に定義する（テーマID・名前・CSSクラス名・無料/有料フラグ）
  3. **背景パターン**: `globals.css` 内に各テーマのCSS変数としてインラインSVGを埋め込む
  4. **フォント**: システムフォントを使用する（ゴシック=sans-serif、明朝=serif、等幅=monospace）。Webフォントは使用しない
  5. **ユーザー設定**: `users` テーブルに `theme_id TEXT`, `font_id TEXT` を追加。未設定(null)はデフォルトテーマ+ゴシックにフォールバック
- **理由**: テーマ数は当面10種未満。globals.css への集約で150行程度の追加に留まり、ファイル分離やDB管理の管理コストに見合わない。日本語Webフォントは数MB単位のためシステムフォントでパフォーマンスを優先する
- **検討した代替案**:
  - CSS変数をテーマごとにファイル分離: 20種超の段階で検討。現時点では過剰
  - テーマカタログをDBテーブルで管理: UGCスキン対応時に検討。現時点では過剰
  - Google Fonts等のWebフォント: 日本語フォントのサイズが大きく初期段階では不採用
- **既存資産との関係**: `globals.css` の `:root`（デフォルトテーマ）と `.dark`（ダークテーマ）をそのまま活用する。テーマ機能導入で既存ユーザーの見た目は変わらない
- **影響範囲**: `globals.css`（有料テーマのCSS変数追加）、`src/lib/domain/models/theme.ts`（新規）、`users` テーブル（カラム追加）、マイページUI（テーマ設定セクション追加）
- **関連**: TDR-011（shadcn/ui基盤）、features/theme.feature

---

## 14. 今後の拡張ポイント

Phase 3 以降の拡張に備え、以下の拡張ポイントを設計に組み込んでおく。

| 拡張ポイント | 現在の設計 | 将来の拡張 |
|---|---|---|
| コマンド追加 | CommandService にコマンドハンドラを登録する拡張可能な構造 | Phase 4 の 20+ コマンドを個別ハンドラとして追加 |
| ユーザー作成ボット | Strategy パターンによる行動抽象化を導入済み（v6）。`owner_id` カラムと `bot_user_configs` テーブルの設計を D-08 に記載 | Phase 4 で `UserPromptContentStrategy` / `ConfigurableBehaviorStrategy` / `GachaSchedulingStrategy` を実装し、作成・管理UIを構築 |
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
| Attack | 攻撃 | attacks |
| SystemMessage | システムメッセージ | posts (is_system_message=true) |
| BOTMark | BOTマーク | bots.is_revealed |
| Incentive | ボーナスイベント | incentive_logs |
