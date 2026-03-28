---
task_id: TASK-357
sprint_id: Sprint-139
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T21:00:00+09:00
updated_at: 2026-03-29T21:00:00+09:00
locked_files:
  - "[NEW] src/lib/infrastructure/repositories/user-copipe-repository.ts"
  - "[NEW] src/lib/services/user-copipe-service.ts"
  - "[NEW] src/app/api/mypage/copipe/route.ts"
  - "[NEW] src/app/api/mypage/copipe/[id]/route.ts"
  - "[NEW] src/__tests__/lib/services/user-copipe-service.test.ts"
  - "[NEW] src/__tests__/lib/infrastructure/repositories/user-copipe-repository.test.ts"
  - "[NEW] features/support/in-memory/user-copipe-repository.ts"
  - "supabase/migrations/00036_user_copipe_entries.sql"
---

## タスク概要

ユーザーコピペ管理のバックエンドCRUD一式を実装する。
UserCopipeRepository（Supabase実装 + InMemory実装）、UserCopipeService（認可チェック + バリデーション）、APIルート4本を新規作成する。

## 対象BDDシナリオ
- `features/user_copipe.feature`（CRUD・バリデーション関連の13シナリオが本タスクの守備範囲）

## 必読ドキュメント（優先度順）
1. [必須] `features/user_copipe.feature` — 全シナリオ（特に CRUD + バリデーションの13本）
2. [必須] `docs/architecture/components/user-copipe.md` — コンポーネント設計（§2 公開インターフェース）
3. [必須] `docs/specs/openapi.yaml` — L263-L350 (UserCopipeEntry/Request スキーマ) + L1233-L1350 (エンドポイント4本)
4. [必須] `supabase/migrations/00036_user_copipe_entries.sql` — テーブル定義
5. [参考] `src/lib/infrastructure/repositories/copipe-repository.ts` — 既存コピペリポジトリ（型定義・パターン参考）
6. [参考] `src/app/api/mypage/` — 既存マイページAPIルート（認証パターン参考）

## 出力（生成すべきファイル）

### リポジトリ層
- `src/lib/infrastructure/repositories/user-copipe-repository.ts` — Supabase実装
  - `IUserCopipeRepository` インターフェース定義（DI用）
  - 関数: `findByUserId`, `findById`, `insert`, `update`, `deleteById`
  - 型: `UserCopipeEntry`（ドメインモデル）

### サービス層
- `src/lib/services/user-copipe-service.ts` — ビジネスロジック
  - 関数: `list(userId)`, `create(userId, input)`, `update(userId, entryId, input)`, `delete(userId, entryId)`
  - バリデーション: name 必須/50文字以内、content 必須/5000文字以内
  - 認可: update/delete は `entry.userId === userId` でなければ 403

### APIルート
- `src/app/api/mypage/copipe/route.ts` — GET（一覧）+ POST（登録）
- `src/app/api/mypage/copipe/[id]/route.ts` — PUT（編集）+ DELETE（削除）
- 認証: 既存マイページAPIと同じ edge-token 検証パターンを踏襲

### InMemory実装（BDDテスト用）
- `features/support/in-memory/user-copipe-repository.ts`
  - `IUserCopipeRepository` をインメモリで実装
  - `reset()`, `_insert()` ヘルパー提供

### 単体テスト
- `src/__tests__/lib/services/user-copipe-service.test.ts`
  - CRUD正常系、バリデーションエラー、認可エラー（他人の編集・削除拒否）
- `src/__tests__/lib/infrastructure/repositories/user-copipe-repository.test.ts`（InMemory実装のテスト、任意）

### マイグレーション適用
- `supabase/migrations/00036_user_copipe_entries.sql` をローカルSupabaseに適用確認

## 完了条件
- [x] 上記すべてのファイルが作成されている
- [x] `npx vitest run` で新規テスト全PASS、既存テスト回帰なし
- [x] ローカルSupabaseにマイグレーション適用成功
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- CopipeRepository のマージ検索変更（TASK-358）
- CopipeHandler の変更（TASK-358）
- BDDステップ定義（TASK-359）
- フロントエンドUI実装

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全ファイル実装、テスト全PASS、マイグレーション適用
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- 必読ドキュメント読み込み完了（feature/openapi/migration/既存リポジトリ/マイページAPI）
- `src/lib/infrastructure/repositories/user-copipe-repository.ts` 作成（IUserCopipeRepository インターフェース + Supabase実装）
- `src/lib/services/user-copipe-service.ts` 作成（list/create/update/deleteEntry + バリデーション + 認可チェック + _setRepository DI）
- `src/app/api/mypage/copipe/route.ts` 作成（GET/POST）
- `src/app/api/mypage/copipe/[id]/route.ts` 作成（PUT/DELETE）
- `features/support/in-memory/user-copipe-repository.ts` 作成（assertUUID適用済み）
- `features/support/mock-installer.ts` 更新（InMemoryUserCopipeRepo追加）
- `features/support/register-mocks.js` 更新（user-copipe-repository.ts のキャッシュ差し替え追加）
- `src/__tests__/lib/services/user-copipe-service.test.ts` 作成（25テスト）
- `src/__tests__/lib/infrastructure/repositories/user-copipe-repository.test.ts` 作成（12テスト）
- `supabase/migrations/00036_user_copipe_entries.sql` ローカルSupabaseに適用（`npx supabase db push --local`）

### テスト結果サマリー

新規テスト:
- `user-copipe-service.test.ts`: 25 PASS
- `user-copipe-repository.test.ts`: 12 PASS
- 合計新規: 37 PASS / 0 FAIL

全体テスト結果:
- 4 test files failed（全て既存のDiscord OAuth関連テスト、今回の変更と無関係）
- 107 test files passed
- 2131 tests passed / 13 failed（既存のDiscord OAuth失敗）
- `schema-consistency.test.ts`: マイグレーション適用後 3 PASS（user_copipe_entries テーブル検証含む）
