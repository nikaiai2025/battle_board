# BattleBoard Phase 1 実装計画

## Context

BattleBoard は5chライクな匿名掲示板にAIボット混在+ゲーミフィケーションを融合したサービス。Phase 1 は「掲示板の土台」として、認証・書き込み・スレッド・通貨・インセンティブ・管理機能・専ブラ互換・マイページを構築する。

現状: Next.js 16 プロジェクトが初期化済み（ボイラープレートのみ）。完全なアーキテクチャ設計書・BDDシナリオが揃っている。外部サービス（Supabase, Cloudflare Turnstile）のセットアップと `.env.local` は完了済み。

---

## 実装ステップ（10段階）

### Step 0: プロジェクト基盤整備
- 依存パッケージ追加: `@supabase/supabase-js`, `iconv-lite`, `vitest`, `@cucumber/cucumber`
- ディレクトリ骨格作成（`src/lib/domain/`, `src/lib/services/`, `src/lib/infrastructure/`, `src/types/`, `features/step_definitions/`, `sql/`）
- Supabase クライアント初期化 (`src/lib/infrastructure/supabase/client.ts`)
- vitest / cucumber-js 設定ファイル
- **完了基準**: `npx vitest run` と `npx cucumber-js --dry-run` がエラーなく実行可能

### Step 1: DBスキーマ（Step 2 と並行可）
- `sql/001_create_tables.sql`: threads, posts, users, currencies, bots, bot_posts, accusations, incentive_logs, auth_codes, admin_users
- `sql/002_create_indexes.sql`: architecture.md §11.2 のインデックス定義
- `sql/003_rls_policies.sql`: architecture.md §10.1.1 のRLSポリシー
- **完了基準**: Supabase で全テーブル作成・RLS有効化

### Step 2: ドメインモデル + 純粋関数（Step 1 と並行可）
- `src/lib/domain/models/`: Thread, Post, User, Currency, Incentive, Auth の型定義
- `src/lib/domain/rules/`: daily-id.ts, incentive-rules.ts, anchor-parser.ts, validation.ts
- `src/types/index.ts`: ApiResponse, ApiError 等
- **テスト**: 各 rules の vitest 単体テスト
- **完了基準**: `npx vitest run` で全テストパス

### Step 3: リポジトリ層
- `src/lib/infrastructure/repositories/`: thread, post, user, currency, auth-code, incentive-log の各リポジトリ
- Supabase クライアント経由の CRUD 実装
- 楽観ロック: `deductBalance` は `WHERE balance >= cost` で実装
- **依存**: Step 0, 1, 2

### Step 4: 認証サービス (AuthService)
- `src/lib/infrastructure/external/turnstile-client.ts`
- `src/lib/services/auth-service.ts`: validateToken, issueNewToken, verifyAuthCode, IP抽出
- `src/app/api/auth/auth-code/route.ts`
- **テスト**: `authentication.feature` の認証コード関連シナリオ
- **依存**: Step 3

### Step 5: 書き込み + スレッド管理（最初の垂直スライス）
- `src/lib/services/currency-service.ts`
- `src/lib/services/post-service.ts`: createPost, createThread（architecture.md §7.1 のTX設計に準拠）
- `src/app/api/posts/route.ts`, `src/app/api/threads/route.ts`
- **テスト**: `posting.feature`, `thread.feature`, `currency.feature`
- **完了基準**: 認証→スレッド作成→書き込み→一覧→閲覧の全フローが動作
- **依存**: Step 3, 4

### Step 6: インセンティブサービス
- `src/lib/services/incentive-service.ts`: 同期判定6種 + 遅延評価2種
- PostService の TX 内に IncentiveService.evaluate() を統合
- **テスト**: `incentive.feature` の全シナリオ
- **依存**: Step 5

### Step 7: Web UI（Step 8, 9 と並行可）
- `src/app/(web)/page.tsx`: スレッド一覧
- `src/app/(web)/threads/[threadId]/page.tsx`: スレッド閲覧 + 書き込みフォーム
- 認証UI: 認証コード入力 + Turnstile ウィジェット
- スレッド作成フォーム
- **依存**: Step 5, 6

### Step 8: 管理機能（Step 7, 9 と並行可）
- `src/lib/services/admin-service.ts`: deletePost, deleteThread
- 管理者認証完成（Supabase Auth + admin_session Cookie）
- `src/app/api/admin/` のルートハンドラ
- `src/app/(web)/admin/`: 管理者ログイン + 管理画面
- **テスト**: `admin.feature`, `authentication.feature` の管理者シナリオ
- **依存**: Step 5

### Step 9: 専ブラ互換 Adapter（Step 7, 8 と並行可）
- `src/lib/infrastructure/encoding/shift-jis.ts`
- `src/lib/infrastructure/adapters/`: dat-formatter, subject-formatter, bbs-cgi-parser, bbs-cgi-response
- `src/app/(senbra)/` の全ルートハンドラ（bbsmenu.html, subject.txt, SETTING.TXT, dat, bbs.cgi）
- Range差分応答 + If-Modified-Since 304応答
- **テスト**: アダプタの vitest 単体テスト + `specialist_browser_compat.feature`
- **依存**: Step 5

### Step 10: マイページ + 仕上げ
- `src/app/(web)/mypage/page.tsx`: 残高、アカウント情報、課金モック、書き込み履歴、通知欄
- 日次リセットIDの残シナリオ
- **テスト**: `mypage.feature`, `authentication.feature` の全シナリオパス
- **依存**: Step 5, 4

---

## 依存関係

```
Step 0 (基盤)
  ├── Step 1 (DB) ──┐
  └── Step 2 (型)  ──┴── Step 3 (リポジトリ)
                            │
                     Step 4 (認証)
                            │
                     Step 5 (書き込み+スレッド) ★垂直スライス
                            │
                     Step 6 (インセンティブ)
                            │
            ┌───────────────┼───────────────┐
     Step 7 (Web UI)   Step 8 (Admin)   Step 9 (専ブラ)
            └───────────────┼───────────────┘
                            │
                     Step 10 (マイページ)
```

## リスクと対策

| リスク | 対策 |
|---|---|
| Supabase のトランザクション制御 | PostgreSQL の rpc (ストアドファンクション) でTXをラップ、または supabase-js チェーンで足りるか Step 3 で検証 |
| レス番号の同時採番競合 | `(thread_id, post_number)` UNIQUE制約 + advisory lock or リトライ |
| iconv-lite の絵文字変換エラー | dat-formatter で絵文字をテキスト代替に置換 |

## 検証方法

- 各ステップの完了時に `npx vitest run` で単体テストパスを確認
- Step 4 以降は対応する `features/*.feature` の BDD シナリオパスを確認（`npx cucumber-js`）
- Step 7 完了後にブラウザで手動操作確認
- Step 9 完了後に ChMate / Siki で手動接続確認
