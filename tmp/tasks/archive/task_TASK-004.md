---
task_id: TASK-004
sprint_id: Sprint-3
status: completed
assigned_to: bdd-coding
depends_on: [TASK-002, TASK-003]
created_at: 2026-03-08T21:00:00+09:00
updated_at: 2026-03-08T21:00:00+09:00
locked_files:
  - "[NEW] src/lib/infrastructure/repositories/thread-repository.ts"
  - "[NEW] src/lib/infrastructure/repositories/post-repository.ts"
  - "[NEW] src/lib/infrastructure/repositories/user-repository.ts"
  - "[NEW] src/lib/infrastructure/repositories/currency-repository.ts"
---

## タスク概要
Phase 1 Step 3 (前半) — 掲示板の基本CRUDを担うリポジトリ4つを実装する。
Supabaseクライアント経由でDBにアクセスし、ドメインモデル型（Step 2で定義済み）との変換を行う。
リポジトリはサービス層から呼び出される薄いデータアクセス層であり、ビジネスロジックを含まない。

## 対象BDDシナリオ
- なし（リポジトリ単体はBDDシナリオの直接対象外。Step 4以降のサービス層テストで間接検証）

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/architecture.md` — §3.2 Infrastructure Layer の責務
2. [必須] `docs/architecture/architecture.md` — §4.2 主要テーブル定義（threads, posts, users, currencies）
3. [必須] `docs/architecture/architecture.md` — §7.2 同時実行制御（楽観ロック）
4. [必須] `docs/architecture/components/posting.md` — PostService からの利用パターン（getThreadList, getPostList）
5. [必須] `docs/architecture/components/currency.md` — 楽観ロック（`WHERE balance >= :cost`）
6. [必須] `supabase/migrations/00001_create_tables.sql` — 実テーブル定義（カラム名・型の参照）
7. [必須] `src/lib/domain/models/thread.ts` — Thread型
8. [必須] `src/lib/domain/models/post.ts` — Post型
9. [必須] `src/lib/domain/models/user.ts` — User型
10. [必須] `src/lib/domain/models/currency.ts` — Currency型、DeductResult型
11. [必須] `src/lib/infrastructure/supabase/client.ts` — supabaseAdmin の利用方法

## 入力（前工程の成果物）
- `supabase/migrations/00001_create_tables.sql` — テーブル定義（TASK-002）
- `src/lib/domain/models/*.ts` — ドメインモデル型定義（TASK-003）
- `src/lib/infrastructure/supabase/client.ts` — Supabaseクライアント（Sprint-1）

## 出力（生成すべきファイル）

### `src/lib/infrastructure/repositories/thread-repository.ts`
- `findById(id: string): Promise<Thread | null>`
- `findByThreadKey(threadKey: string): Promise<Thread | null>`
- `findByBoardId(boardId: string, options?: { limit?: number; cursor?: string }): Promise<Thread[]>` — last_post_at DESC ソート
- `create(thread: Omit<Thread, 'id' | 'createdAt' | 'lastPostAt' | 'postCount' | 'datByteSize' | 'isDeleted'>): Promise<Thread>`
- `incrementPostCount(threadId: string): Promise<void>`
- `updateLastPostAt(threadId: string, lastPostAt: Date): Promise<void>`
- `updateDatByteSize(threadId: string, datByteSize: number): Promise<void>`
- `softDelete(threadId: string): Promise<void>` — is_deleted = true

### `src/lib/infrastructure/repositories/post-repository.ts`
- `findById(id: string): Promise<Post | null>`
- `findByThreadId(threadId: string, options?: { fromPostNumber?: number }): Promise<Post[]>` — post_number ASC ソート
- `findByAuthorId(authorId: string, options?: { limit?: number }): Promise<Post[]>` — created_at DESC
- `getNextPostNumber(threadId: string): Promise<number>` — 現在の最大post_number + 1
- `create(post: Omit<Post, 'id' | 'createdAt' | 'isDeleted'>): Promise<Post>`
- `softDelete(postId: string): Promise<void>` — is_deleted = true

### `src/lib/infrastructure/repositories/user-repository.ts`
- `findById(id: string): Promise<User | null>`
- `findByAuthToken(authToken: string): Promise<User | null>`
- `create(user: Omit<User, 'id' | 'createdAt' | 'streakDays' | 'lastPostDate'>): Promise<User>`
- `updateAuthToken(userId: string, authToken: string): Promise<void>`
- `updateStreak(userId: string, streakDays: number, lastPostDate: string): Promise<void>`
- `updateUsername(userId: string, username: string | null): Promise<void>`

### `src/lib/infrastructure/repositories/currency-repository.ts`
- `findByUserId(userId: string): Promise<Currency | null>`
- `create(userId: string, initialBalance?: number): Promise<Currency>`
- `credit(userId: string, amount: number): Promise<void>` — balance += amount
- `deduct(userId: string, amount: number): Promise<DeductResult>` — 楽観ロック: `UPDATE currencies SET balance = balance - :amount, updated_at = now() WHERE user_id = :uid AND balance >= :amount`。affected rows = 0 なら `{ success: false, reason: 'insufficient_balance' }`
- `getBalance(userId: string): Promise<number>`

## 完了条件
- [ ] 4つのリポジトリファイルが作成されている
- [ ] 各リポジトリが上記のメソッドを公開している
- [ ] `supabaseAdmin` を使用している（service_role経由。RLSバイパス）
- [ ] currency-repository の `deduct` メソッドが楽観ロックで実装されている
- [ ] DBカラム名（snake_case）とドメインモデル（camelCase）の変換が正しい
- [ ] テストコマンド: `npx vitest run` で既存テスト（164件）が壊れていないこと

## スコープ外
- サービス層の実装（PostService, CurrencyService等）
- BDDシナリオのステップ定義
- リポジトリの単体テスト（DB接続が必要なためインテグレーションテストに分類。本スプリントではスキップ）
- TASK-005 の対象リポジトリ（bot, bot-post, accusation, incentive-log, auth-code）

## 補足・制約
- Supabase クライアントは `src/lib/infrastructure/supabase/client.ts` の `supabaseAdmin` を使用する
- DB操作はサーバーサイドのみで行うため、全リポジトリで `supabaseAdmin`（service_role）を使用する
- カラム名変換: DB側 `snake_case` ↔ アプリ側 `camelCase`（例: `thread_key` ↔ `threadKey`）。変換ヘルパー関数を各リポジトリに用意するか、共通ユーティリティを作成してよい
- 戻り値のDate変換: Supabaseのレスポンスは文字列の場合があるため、`new Date()` で変換すること
- エラーハンドリング: Supabase のエラーは例外としてスローする（サービス層でcatch）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 全4リポジトリファイル実装完了、既存テスト164件PASS確認
- 次にすべきこと: なし（完了）
- 未解決の問題: なし

### 進捗ログ

- [開始] 必読ドキュメント読込完了（architecture.md, migration SQL, domain models, component設計書）
- [確認] 既存テスト164件 PASS 確認済み
- [実装] `src/lib/infrastructure/repositories/thread-repository.ts` 作成完了
  - findById, findByThreadKey, findByBoardId, create, incrementPostCount, updateLastPostAt, updateDatByteSize, softDelete を実装
  - incrementPostCount は PostgreSQL RPC（`increment_thread_post_count`）で atomic インクリメントを実現
- [実装] `src/lib/infrastructure/repositories/post-repository.ts` 作成完了
  - findById, findByThreadId, findByAuthorId, getNextPostNumber, create, softDelete を実装
  - getNextPostNumber は最大 post_number + 1 で次番号を算出
- [実装] `src/lib/infrastructure/repositories/user-repository.ts` 作成完了
  - findById, findByAuthToken, create, updateAuthToken, updateStreak, updateUsername を実装
- [実装] `src/lib/infrastructure/repositories/currency-repository.ts` 作成完了
  - findByUserId, create, credit, deduct, getBalance を実装
  - deduct は楽観的ロック（WHERE balance >= :amount + RPC `deduct_currency`）で実装
- [確認] TypeScript 型チェック（今回実装ファイル）: エラーなし
- [確認] 既存テスト 164件 PASS（npx vitest run）

### テスト結果サマリー

- 実行コマンド: `npx vitest run`
- テストファイル数: 4 passed
- テスト件数: 164 passed / 0 failed
- 注: リポジトリ層の DB 接続を要する統合テストは本スプリントではスキップ（タスク指示書のスコープ外）
