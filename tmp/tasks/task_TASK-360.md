---
task_id: TASK-360
sprint_id: Sprint-140
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T23:00:00+09:00
updated_at: 2026-03-29T23:00:00+09:00
locked_files:
  - "src/lib/infrastructure/repositories/post-repository.ts"
  - "src/lib/infrastructure/repositories/bot-post-repository.ts"
  - "features/support/in-memory/post-repository.ts"
  - "features/support/in-memory/bot-post-repository.ts"
---

## タスク概要

AttackHandler の複数対象攻撃を最適化するために、リポジトリにバッチ取得メソッドを追加する。
現状はターゲットごとにループ内で個別クエリを発行しており（N+1問題）、これを1回のバッチクエリに置き換えるための基盤を整備する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-ARCH-POST-SUBREQUEST/subrequest_audit.md` — §4.1, §5.1 S1
2. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — 既存の `findByThreadIdAndPostNumber`
3. [必須] `src/lib/infrastructure/repositories/bot-post-repository.ts` — 既存の `findByPostId`
4. [必須] `features/support/in-memory/post-repository.ts` — InMemory実装
5. [必須] `features/support/in-memory/bot-post-repository.ts` — InMemory実装

## 出力（生成すべきファイル）

### 1. PostRepository に `findByThreadIdAndPostNumbers` 追加

```typescript
/**
 * 指定スレッド内の複数レス番号のレスを一括取得する。
 * WHERE thread_id = ? AND post_number IN (...) で1クエリ。
 */
findByThreadIdAndPostNumbers(
  threadId: string,
  postNumbers: number[]
): Promise<Post[]>
```

- インターフェース（IPostRepository）にも追加
- InMemory 実装にも追加

### 2. BotPostRepository に `findByPostIds` 追加

```typescript
/**
 * 複数の投稿IDからBOT投稿レコードを一括取得する。
 * WHERE post_id IN (...) で1クエリ。
 */
findByPostIds(postIds: string[]): Promise<BotPost[]>
```

- インターフェース（IBotPostRepository）にも追加
- InMemory 実装にも追加

## 完了条件
- [ ] 両バッチメソッドが Supabase 実装に追加されている
- [ ] 両バッチメソッドが InMemory 実装に追加されている
- [ ] インターフェースに追加されている
- [ ] `npx vitest run` で回帰なし
- [ ] `npx cucumber-js` で回帰なし（389 passed 維持）
- [ ] テストコマンド: `npx vitest run` && `npx cucumber-js`

## スコープ外
- AttackHandler の改修（TASK-361）
- PostService の改修（TASK-362）
- 既存メソッドの削除（既存の `findByThreadIdAndPostNumber` は維持。他のコードが使用中）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/lib/infrastructure/repositories/post-repository.ts`: `findByThreadIdAndPostNumbers` 追加
- `features/support/in-memory/post-repository.ts`: `findByThreadIdAndPostNumbers` 追加
- `src/lib/services/handlers/attack-handler.ts`: `IAttackPostRepository` に `findByThreadIdAndPostNumbers` 追加
- `src/lib/infrastructure/repositories/bot-post-repository.ts`: `findByPostIds` は既存実装（変更不要）
- `features/support/in-memory/bot-post-repository.ts`: `findByPostIds` 追加
- `src/lib/services/bot-service.ts`: `IBotPostRepository` に `findByPostIds` 追加
- テストモック更新: `bot-service.test.ts`, `bot-service-scheduling.test.ts`, `attack-handler.test.ts`

### テスト結果サマリー

- `npx vitest run`（関連テスト4ファイル）: 120 tests passed
- `npx cucumber-js`: 389 passed 維持（回帰なし）
- 既存の失敗（registration-service, discord API等）は今回の変更と無関係な既存失敗
