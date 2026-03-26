# Sprint-122: レス番号TOCTOU競合修正（原子採番RPC）

> 作成日: 2026-03-26
> ステータス: in_progress

## 背景

敵対的コードレビュー（posting.feature）で検出されたCRITICAL問題。
`getNextPostNumber`（SELECT MAX+1）から`PostRepository.create`（INSERT）までの間に
5-6回のSupabase API呼び出しが挟まり、同一スレッドへの同時書き込みで
UNIQUE制約違反→500エラー→書き込みDROPが発生する。

アーキテクト判定: **対応必須**
人間承認: 済（振る舞い変更なし）

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 | 依存 |
|---------|------|------|------|------|
| TASK-323 | 原子採番RPC + post-service リファクタ | bdd-coding (Opus) | assigned | なし |

## TASK-323: 原子採番RPC

### 変更概要
1. **新規マイグレーション** `supabase/migrations/00031_insert_post_with_next_number.sql`
   - `insert_post_with_next_number` RPC関数を作成
   - `threads` テーブルの `FOR UPDATE` 行ロックで同一スレッドの同時採番を直列化
   - 採番 + INSERT を1トランザクションで原子的に実行

2. **post-repository.ts** リファクタ
   - `getNextPostNumber` を廃止
   - `create` を RPC呼び出し（`createWithAtomicNumber`）に置換

3. **post-service.ts** リファクタ
   - Step 6（採番）と Step 9（INSERT）を統合
   - Step 6.5/7/8 の結果を先に算出してからRPC一発で採番+INSERT

4. **InMemory post-repository** 更新
   - 新しいインターフェースに合わせて更新

5. **テスト更新**
   - 既存テストの採番→INSERT分離パターンを統合パターンに更新

### locked_files
- `[NEW] supabase/migrations/00031_insert_post_with_next_number.sql`
- `src/lib/infrastructure/repositories/post-repository.ts`
- `src/lib/services/post-service.ts`
- `features/support/in-memory/post-repository.ts`
- `src/__tests__/lib/services/post-service.test.ts`
- `src/__tests__/lib/services/post-service-welcome-sequence.test.ts`
- `src/__tests__/lib/services/post-service-system-message-daily-id.test.ts`

## 結果
<!-- Sprint完了後に記載 -->
