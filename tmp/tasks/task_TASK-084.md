---
task_id: TASK-084
sprint_id: Sprint-30
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-16T12:00:00+09:00
updated_at: 2026-03-16T12:00:00+09:00
locked_files:
  - "[NEW] supabase/migrations/00006_user_registration.sql"
  - "[NEW] src/lib/infrastructure/repositories/edge-token-repository.ts"
  - "[NEW] src/__tests__/lib/infrastructure/repositories/edge-token-repository.test.ts"
  - "src/lib/infrastructure/repositories/user-repository.ts"
  - "src/lib/domain/models/user.ts"
---

## タスク概要

本登録・ログイン・PAT機能の実装基盤として、DBマイグレーション（edge_tokensテーブル新設 + usersカラム追加）、EdgeTokenRepository新規作成、UserRepository拡張（PAT関連メソッド追加）、Userドメインモデル拡張を行う。

## 対象BDDシナリオ
- `features/未実装/user_registration.feature`（直接のBDDテストは後続スプリント。本タスクは基盤準備）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/user-registration.md` — §3 データモデル変更、§10 依存関係
2. [必須] `docs/specs/user_registration_state_transitions.yaml` — edge_token_lifecycle セクション
3. [参考] `supabase/migrations/00001_create_tables.sql` — 既存テーブル定義
4. [参考] `supabase/migrations/00003_rls_policies.sql` — 既存RLSポリシー
5. [参考] `src/lib/infrastructure/repositories/user-repository.ts` — 既存UserRepository実装パターン

## 入力（前工程の成果物）
- `docs/architecture/components/user-registration.md` §3 — データモデル設計

## 出力（生成すべきファイル）
- `supabase/migrations/00006_user_registration.sql` — マイグレーションSQL
- `src/lib/infrastructure/repositories/edge-token-repository.ts` — EdgeTokenRepository
- `src/__tests__/lib/infrastructure/repositories/edge-token-repository.test.ts` — 単体テスト
- `src/lib/infrastructure/repositories/user-repository.ts` — 拡張（PAT関連メソッド追加）
- `src/lib/domain/models/user.ts` — 新カラム対応の型追加

## 完了条件
- [ ] マイグレーションSQLが設計書 §3 の定義と一致する
- [ ] edge_tokensテーブル: id, user_id, token(UNIQUE), created_at, last_used_at
- [ ] usersテーブル追加カラム: supabase_auth_id(UUID UNIQUE NULL), registration_type(VARCHAR NULL), registered_at(TIMESTAMPTZ NULL), pat_token(VARCHAR(64) UNIQUE NULL), pat_last_used_at(TIMESTAMPTZ NULL)
- [ ] edge_tokensのRLSポリシー: anon/authenticatedからの全操作を拒否、service_roleのみアクセス可能
- [ ] 既存auth_tokenからedge_tokensへのデータ移行SQL含む
- [ ] EdgeTokenRepository: create, findByToken, findByUserId, deleteByToken, updateLastUsedAt
- [ ] UserRepository拡張: findBySupabaseAuthId, updateSupabaseAuthId, updatePatToken, findByPatToken, updatePatLastUsedAt
- [ ] Userモデル拡張: supabaseAuthId, registrationType, registeredAt, patToken, patLastUsedAt
- [ ] 単体テスト: `npx vitest run` で既存テスト含め全PASS
- [ ] UserRowインターフェースの拡張（新カラム対応）

## スコープ外
- AuthService改修（TASK-085で実施）
- APIルート作成（Sprint-31）
- BDDステップ定義（Sprint-32）
- マイグレーション実行（ローカルSupabaseでの実行確認は任意）
- users.auth_tokenカラム削除（段階的廃止。本タスクでは削除しない）

## 補足・制約
- EdgeTokenRepositoryは既存UserRepositoryと同じパターン（supabaseAdmin使用、rowToModel変換）で実装すること
- PAT平文保存は設計上の決定事項（§3.1 PAT平文保存の根拠 参照）。ハッシュ化不要
- UserRow / User 型に新フィールドを追加する際、既存のrowToUser変換関数も更新すること（新カラムはNULL許容なのでオプショナル扱い）
- マイグレーションにはデータ移行SQL（既存auth_token→edge_tokens）を含めるが、`ALTER TABLE users DROP COLUMN auth_token` は含めない（段階的廃止）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. 必読ドキュメント読み込み完了（user-registration.md §3、state_transitions.yaml、既存マイグレーション、既存UserRepository）
2. `supabase/migrations/00006_user_registration.sql` 作成
   - edge_tokens テーブル作成 + インデックス2本
   - users テーブル拡張（5カラム追加）
   - 既存 auth_token → edge_tokens データ移行 SQL
   - RLS 有効化（ポリシー未設定 = 全拒否）
3. `src/lib/domain/models/user.ts` 拡張
   - supabaseAuthId、registrationType、registeredAt、patToken、patLastUsedAt フィールド追加
4. `src/lib/infrastructure/repositories/user-repository.ts` 拡張
   - UserRow に Phase 3 カラム追加
   - rowToUser 変換関数を拡張
   - create() の Omit 型を更新（新フィールドを除外）
   - findBySupabaseAuthId、updateSupabaseAuthId、updatePatToken、findByPatToken、updatePatLastUsedAt 追加
5. `src/lib/infrastructure/repositories/edge-token-repository.ts` 新規作成
   - EdgeToken 型定義、EdgeTokenRow 型定義
   - create、findByToken、findByUserId、deleteByToken、updateLastUsedAt の5メソッド実装
6. `src/__tests__/lib/infrastructure/repositories/edge-token-repository.test.ts` 新規作成
   - supabaseAdmin モック化
   - 19テストケース（正常系・異常系・エッジケース）

### テスト結果サマリー

`npx vitest run` 実行結果:
- テストファイル: 23本 / 23本 PASS
- テスト件数: 765件 / 765件 PASS
- 新規 EdgeTokenRepository テスト: 19件 PASS
- 既存テストの回帰: 746件全PASS（デグレなし）
