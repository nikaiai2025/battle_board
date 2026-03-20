---
task_id: TASK-163
sprint_id: Sprint-60
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-19T20:00:00+09:00
updated_at: 2026-03-19T20:00:00+09:00
locked_files:
  - "[NEW] src/lib/domain/rules/pagination-parser.ts"
  - "[NEW] src/__tests__/lib/domain/rules/pagination-parser.test.ts"
  - src/lib/services/post-service.ts
  - src/lib/infrastructure/repositories/post-repository.ts
---

## タスク概要

ページネーションとURL構造変更の基盤となる2つの改修を行う。(A) ページネーション範囲パーサー（純粋関数）の新設。(B) PostServiceとPostRepositoryの範囲指定付きレス取得対応。

## 対象BDDシナリオ
- `features/thread.feature` @pagination（基盤となるデータ層。UI実装は後続タスク）

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-162/design.md` §2 — ページネーション設計（§2.3 パーサー, §2.4 PostService改修）
2. [必須] `src/lib/services/post-service.ts` — 現行 getPostList, getThread
3. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — 現行 findByThreadId
4. [参考] `src/lib/infrastructure/repositories/thread-repository.ts` — findByThreadKey（既存。getThreadByThreadKey新設の参考）
5. [参考] `features/thread.feature` @pagination — ページネーションBDDシナリオ

## 出力（生成すべきファイル）

### A. pagination-parser（純粋関数）

`[NEW] src/lib/domain/rules/pagination-parser.ts`

設計書 §2.3 に従い以下を実装:
```typescript
interface PaginationRange {
  type: 'default' | 'range' | 'latest';
  start?: number;   // range時: 開始レス番号
  end?: number;     // range時: 終了レス番号
  count?: number;   // latest時: 最新N件
}

function parsePaginationRange(segment?: string): PaginationRange;
```

パースルール:
- `undefined` → `{ type: 'default' }`（最新50件）
- `"1-100"` → `{ type: 'range', start: 1, end: 100 }`
- `"l100"` → `{ type: 'latest', count: 100 }`
- 不正な値 → `{ type: 'default' }` にフォールバック

`[NEW] src/__tests__/lib/domain/rules/pagination-parser.test.ts`
- 上記全パターン + エッジケース（0, 負数, 範囲逆転, 文字列不正等）のテスト

### B. PostService + PostRepository改修

`src/lib/services/post-service.ts` に追加:
1. `getThreadByThreadKey(threadKey: string): Promise<Thread | null>` — threadKeyでスレッド取得（設計書 §1.3.4）
2. `getPostList()` のオプション拡張（設計書 §2.4）:
```typescript
interface PostListOptions {
  fromPostNumber?: number;  // 既存: ポーリング用差分取得
  range?: { start: number; end: number };  // NEW: 範囲指定
  latestCount?: number;  // NEW: 最新N件
}
```

`src/lib/infrastructure/repositories/post-repository.ts` の `findByThreadId()` に対応するクエリオプション追加:
- `range` 指定時: `.gte("post_number", start).lte("post_number", end)`
- `latestCount` 指定時: `.order("post_number", { ascending: false }).limit(count)` してから反転

## 完了条件
- [ ] `pagination-parser.ts` が全パースパターンを正しく処理する
- [ ] `pagination-parser.test.ts` が全パターン + エッジケースをカバーしPASS
- [ ] `PostService.getThreadByThreadKey()` が threadKey でスレッドを返す
- [ ] `PostService.getPostList()` が range / latestCount オプションに対応している
- [ ] `PostRepository.findByThreadId()` が range / latestCount クエリに対応している
- [ ] 既存テスト全件PASS（`npx vitest run`）
- [ ] テストコマンド: `npx vitest run`

## スコープ外
- UIコンポーネント（PaginationNav等）の実装（後続タスク T5）
- ルーティング変更（後続タスク T2）
- BDDステップ定義（後続タスク T9）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. **A. pagination-parser.ts 新設**
   - テスト先行（TDD RED）: `src/__tests__/lib/domain/rules/pagination-parser.test.ts` を32件のテストで作成
   - 実装（GREEN）: `src/lib/domain/rules/pagination-parser.ts` を作成
   - 全32件PASS確認

2. **B. PostRepository.findByThreadId 改修**
   - `options` に `range` / `latestCount` フィールドを追加
   - `latestCount` 指定時: DESC order + limit で取得後に reverse
   - `range` 指定時: `.gte("post_number", start).lte("post_number", end)`

3. **B. PostService 改修**
   - `PostListOptions` インターフェース追加（`fromPostNumber` / `range` / `latestCount`）
   - `getPostList(threadId, options?)` シグネチャ変更（第2引数を `PostListOptions` オブジェクトに統一）
   - `getThreadByThreadKey(threadKey)` 新設

4. **既存コード互換対応**
   - `src/lib/services/__tests__/post-service.test.ts`: 旧シグネチャ `getPostList("thread-001", 5)` → `{ fromPostNumber: 5 }` に修正
   - `src/app/api/threads/[threadId]/posts/route.ts`: 同様に修正

### テスト結果サマリー

- `npx vitest run` 実行結果
  - 新規テスト: pagination-parser.test.ts — **32件 PASS**
  - 既存テスト合計: **1313件 PASS / 5件 FAIL**
  - 失敗5件はすべて今回の変更前から存在していた既存問題（schema-consistency: bot-repository next_post_at不整合、PostFormInsertText: 後続タスクの実装待ち）
  - 今回の変更による新規失敗: **ゼロ**
