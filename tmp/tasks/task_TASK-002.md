---
task_id: TASK-002
sprint_id: Sprint-2
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-08T20:00:00+09:00
updated_at: 2026-03-08T20:00:00+09:00
locked_files:
  - "[NEW] supabase/migrations/*"
---

## タスク概要
Phase 1 Step 1 — DBスキーマのマイグレーションSQLを作成する。
アーキテクチャ設計書(D-07) §4 のデータモデルに基づき、全テーブル・インデックス・RLSポリシーを定義する。
`supabase db push` による実DB適用は本タスクのスコープ外（ローカルでのSQL作成のみ）。

## 対象BDDシナリオ
- なし（DB定義はBDDシナリオ前提の基盤作業）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/architecture.md` — §4 データモデル（§4.1 ER図、§4.2 テーブル定義）
2. [必須] `docs/architecture/architecture.md` — §10.1.1 RLSポリシー設計
3. [必須] `docs/architecture/architecture.md` — §11.2 DB最適化（インデックス定義）
4. [参考] `docs/requirements/ubiquitous_language.yaml` — 用語・カラム名の確認
5. [参考] `docs/architecture/architecture.md` — §7.2 同時実行制御（ユニーク制約等）

## 入力（前工程の成果物）
- Sprint-1 で `supabase/` ディレクトリ構造は未作成。本タスクで新規作成する。

## 出力（生成すべきファイル）
- `supabase/migrations/00001_create_tables.sql` — 全テーブルのCREATE TABLE文（threads, posts, users, currencies, bots, bot_posts, accusations, incentive_logs, auth_codes, admin_users）
- `supabase/migrations/00002_create_indexes.sql` — §11.2 のインデックス定義
- `supabase/migrations/00003_rls_policies.sql` — §10.1.1 のRLSポリシー

### テーブル定義の要点（architecture.md §4.2 より）
- threads: id(UUID PK), thread_key(VARCHAR UNIQUE), board_id, title(VARCHAR(96)), post_count(INTEGER), dat_byte_size(INTEGER DEFAULT 0), created_by(UUID FK→users), created_at, last_post_at, is_deleted(BOOLEAN)
- posts: id(UUID PK), thread_id(UUID FK), post_number(INTEGER), author_id(UUID FK NULLABLE), display_name, daily_id(VARCHAR(8)), body(TEXT), is_system_message(BOOLEAN), is_deleted(BOOLEAN), created_at
- users: id(UUID PK), auth_token, author_id_seed, is_premium(BOOLEAN), username(VARCHAR(20) NULLABLE), streak_days(INTEGER), last_post_date(DATE), created_at
- currencies: user_id(UUID PK FK→users), balance(INTEGER), updated_at
- bots: id(UUID PK), name, persona(TEXT), hp(INTEGER), max_hp(INTEGER), daily_id(VARCHAR(8)), daily_id_date(DATE), is_active(BOOLEAN), is_revealed(BOOLEAN), revealed_at(NULLABLE), survival_days(INTEGER), total_posts(INTEGER), accused_count(INTEGER), eliminated_at(NULLABLE), eliminated_by(UUID FK NULLABLE), created_at
- bot_posts: post_id(UUID PK FK→posts), bot_id(UUID FK→bots)
- accusations: id(UUID PK), accuser_id(UUID FK), target_post_id(UUID FK), thread_id(UUID FK), result(VARCHAR), bonus_amount(INTEGER), created_at. UNIQUE(accuser_id, target_post_id)
- incentive_logs: id(UUID PK), user_id(UUID FK), event_type(VARCHAR), amount(INTEGER), context_id(UUID NULLABLE), context_date(DATE), created_at. UNIQUE(user_id, event_type, context_date)
- auth_codes: id(UUID PK), code(VARCHAR(6)), token_id, ip_hash, verified(BOOLEAN), expires_at, created_at
- admin_users: id(UUID PK), email, role(VARCHAR), created_at

### インデックス定義の要点（§11.2 より）
- threads: (board_id, last_post_at DESC), (thread_key) UNIQUE
- posts: (thread_id, post_number), (thread_id, created_at), (author_id, created_at)
- accusations: (accuser_id, target_post_id) UNIQUE
- incentive_logs: (user_id, event_type, context_date)
- bots: (is_active, daily_id)

### RLSポリシーの要点（§10.1.1 より）
- bot_posts, bots, auth_codes, admin_users → anon/authenticated: DENY ALL, service_role: FULL ACCESS
- threads → SELECT: is_deleted=false
- posts → SELECT: 所属スレッドが非削除
- users → SELECT: 自分のレコードのみ
- currencies → SELECT: 自分のレコードのみ
- incentive_logs → SELECT: 自分のレコードのみ
- accusations → SELECT: スレッド内の告発結果

## 完了条件
- [ ] 3つのマイグレーションSQLファイルが作成されている
- [ ] SQLの文法が正しい（PostgreSQL 15互換）
- [ ] architecture.md §4.2 の全テーブル・全カラムが網羅されている
- [ ] §11.2 の全インデックスが定義されている
- [ ] §10.1.1 の全RLSポリシーが定義されている
- [ ] `(thread_id, post_number)` UNIQUE制約が含まれている（§7.2 レス番号排他制御）

## スコープ外
- `supabase db push` の実行（実DB適用は手動で行う）
- Supabase CLIの `supabase migration new` コマンド実行（タイムスタンプ付きファイル名は不要。連番ファイル名で作成する）
- ストアドファンクション・トリガーの作成（Step 3以降で必要に応じて追加）

## 補足・制約
- ファイル名は `00001_create_tables.sql`, `00002_create_indexes.sql`, `00003_rls_policies.sql` とする（Supabase CLI形式のタイムスタンプは使わない）
- UUIDのデフォルト値には `gen_random_uuid()` を使用する
- TIMESTAMPTZ のデフォルト値には `now()` を使用する
- `balance` カラムには `CHECK (balance >= 0)` 制約を付与する

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 3つのマイグレーションSQLファイルを作成
- 次にすべきこと: なし（タスク完了）
- 未解決の問題: なし

### 進捗ログ
- [2026-03-08] タスク開始。architecture.md §4, §7.2, §10.1.1, §11.2 を精読
- [2026-03-08] supabase/migrations/ ディレクトリ作成
- [2026-03-08] 00001_create_tables.sql 作成（全10テーブル定義。外部キー参照順序を考慮）
- [2026-03-08] 00002_create_indexes.sql 作成（§11.2 の全インデックス定義）
- [2026-03-08] 00003_rls_policies.sql 作成（§10.1.1 の全RLSポリシー定義）
- [2026-03-08] 完了条件を全項目確認・クリア

### テスト結果サマリー
- 対象BDDシナリオ: なし（DB定義は基盤作業のため）
- 完了条件チェック:
  - [x] 3ファイル作成済み (00001, 00002, 00003)
  - [x] PostgreSQL 15 互換 SQL 文法
  - [x] §4.2 の全10テーブル・全カラム網羅
  - [x] §11.2 の全インデックス定義（UNIQUE制約による自動インデックスを含む）
  - [x] §10.1.1 の全RLSポリシー定義（DENY ALL はポリシー未設定で実現）
  - [x] (thread_id, post_number) UNIQUE制約含む (§7.2)
