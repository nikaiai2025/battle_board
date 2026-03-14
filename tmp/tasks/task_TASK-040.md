---
task_id: TASK-040
sprint_id: Sprint-17
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-14T12:00:00+09:00
updated_at: 2026-03-14T12:00:00+09:00
locked_files:
  - "[NEW] supabase/migrations/00005_auth_verification.sql"
  - "src/lib/domain/models/user.ts"
  - "src/lib/infrastructure/repositories/user-repository.ts"
  - "src/lib/infrastructure/repositories/auth-code-repository.ts"
---

## タスク概要

認証フロー是正（G1〜G4）の基盤となるDB・ドメイン・リポジトリ層の変更を行う。
usersテーブルに `is_verified` カラム、auth_codesテーブルに `write_token` / `write_token_expires_at` カラムを追加し、
対応するドメインモデル・リポジトリ関数を更新する。

## 対象BDDシナリオ

- `features/phase1/authentication.feature` — 全シナリオ（基盤変更）
- `features/constraints/specialist_browser_compat.feature` — 専ブラ認証フローセクション

## 必読ドキュメント（優先度順）

1. [必須] `tmp/auth_spec_review_report.md` — 設計レビュー報告書（§3.3 DBスキーマ変更）
2. [必須] `supabase/migrations/00001_create_tables.sql` — 現行テーブル定義
3. [必須] `src/lib/domain/models/user.ts` — 現行Userモデル
4. [必須] `src/lib/infrastructure/repositories/user-repository.ts` — 現行UserRepository
5. [必須] `src/lib/infrastructure/repositories/auth-code-repository.ts` — 現行AuthCodeRepository

## 入力（前工程の成果物）

- `tmp/auth_spec_review_report.md` — 設計方針・DBスキーマ変更仕様

## 出力（生成すべきファイル）

- `supabase/migrations/00005_auth_verification.sql` — マイグレーションSQL（ALTER TABLE）
- `src/lib/domain/models/user.ts` — `isVerified: boolean` フィールド追加
- `src/lib/infrastructure/repositories/user-repository.ts` — `isVerified` 対応（UserRow, rowToUser, create, updateIsVerified新規）
- `src/lib/infrastructure/repositories/auth-code-repository.ts` — `writeToken`, `writeTokenExpiresAt` 対応（AuthCode型, AuthCodeRow, rowToAuthCode, create, updateWriteToken新規）

## 完了条件

- [ ] マイグレーションSQLが正しいALTER TABLE文で構成されている
- [ ] User型に `isVerified: boolean` が追加されている
- [ ] UserRepository.create が `is_verified` を含む
- [ ] UserRepository.updateIsVerified 関数が新規追加されている
- [ ] AuthCode型に `writeToken: string | null` と `writeTokenExpiresAt: Date | null` が追加されている
- [ ] AuthCodeRepository の行変換・create・新規関数（updateWriteToken）が追加されている
- [ ] `npx vitest run` で既存テスト全PASS（回帰テスト）
- [ ] テストコマンド: `npx vitest run`

## スコープ外

- AuthService / PostService の変更（TASK-041）
- ルートハンドラの変更（TASK-042, TASK-043）
- BDDステップ定義の変更（TASK-044）

## 補足・制約

- マイグレーションは ALTER TABLE のみ。既存データには `is_verified = false` をデフォルト適用する
- `write_token` と `write_token_expires_at` は nullable（認証完了前は NULL）
- UserRepository.create の引数型は既存パターンに従い、`isVerified` はオプション（デフォルト false）
- 既存の単体テストが壊れないこと（特に user-repository のモック利用箇所）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `supabase/migrations/00005_auth_verification.sql` 新規作成
   - `users` テーブルに `is_verified BOOLEAN NOT NULL DEFAULT false` を追加
   - `auth_codes` テーブルに `write_token TEXT`（nullable）を追加
   - `auth_codes` テーブルに `write_token_expires_at TIMESTAMPTZ`（nullable）を追加

2. `src/lib/domain/models/user.ts` 更新
   - `User` インターフェースに `isVerified: boolean` フィールドを追加
   - BDDシナリオ参照コメントを付与

3. `src/lib/infrastructure/repositories/user-repository.ts` 更新
   - `UserRow` に `is_verified: boolean` フィールドを追加
   - `rowToUser` に `isVerified: row.is_verified` マッピングを追加
   - `create` 関数の引数型に `isVerified?: boolean`（オプション）を追加
   - `updateIsVerified(userId, isVerified)` 関数を新規追加

4. `src/lib/infrastructure/repositories/auth-code-repository.ts` 更新
   - `AuthCode` インターフェースに `writeToken: string | null` と `writeTokenExpiresAt: Date | null` を追加
   - `AuthCodeRow` に `write_token: string | null` と `write_token_expires_at: string | null` を追加
   - `rowToAuthCode` に `writeToken` / `writeTokenExpiresAt` の null チェック付きマッピングを追加
   - `create` 関数に `write_token` / `write_token_expires_at` の INSERT 対応を追加
   - `updateWriteToken(id, writeToken, writeTokenExpiresAt)` 関数を新規追加

### テスト結果サマリー

- テスト実行コマンド: `npx vitest run`
- 実行前（ベースライン）: 15 ファイル / 476 テスト PASS
- 実行後（変更後）: 15 ファイル / 476 テスト PASS
- 失敗: 0
- 既存テストへの影響: なし（全 PASS を確認）
