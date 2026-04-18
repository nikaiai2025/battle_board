# Sprint-149: BOT実行エラー修正（createThread UUID + 固定スレッド除外）

> 開始: 2026-03-29

## スコープ

Sprint-148デプロイ後のbot-scheduler実行で判明した2件のエラーを修正する。

### エラー1: `ThreadRepository.create failed: invalid input syntax for type uuid: "system"`
- `createThread` で `isBotWrite=true` → `resolveAuth` がスキップされ `userId: null` → `createdBy = "system"` にフォールバック
- `threads.created_by` は `UUID NOT NULL REFERENCES users(id)` のため "system" は不正
- 対比: `createPost` は `posts.author_id` が NULLABLE なので NULL でOK

### エラー2: `固定スレッドには書き込みできません`
- `RandomThreadBehaviorStrategy` が `findByBoardId()` で固定スレッドを含む全スレッドを取得
- ランダム選択で固定スレッドが当たり、`createPost` のガードで拒否される

## 修正方針

### 修正A: threads.created_by を NULLABLE化
- DBマイグレーション: `ALTER TABLE threads ALTER COLUMN created_by DROP NOT NULL`
- FK制約は維持（NULLは許容、非NULL値はusers.idへの参照を保つ）
- `createThread` の `isBotWrite=true` パスで `createdBy = null` を渡す
- createPost の author_id と同じパターン（BOT書き込み時はNULL）

### 修正B: RandomThreadBehaviorStrategy で固定スレッド除外
- `decideAction()` 内の `findByBoardId()` 結果から `isPinned === true` を除外するフィルタを追加

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `supabase/migrations/00040_threads_created_by_nullable.sql` | [NEW] created_by NULLABLE化 |
| `src/lib/services/post-service.ts` | createThread の createdBy を isBotWrite 時に null |
| `src/lib/services/bot-strategies/behavior/random-thread.ts` | isPinned 除外フィルタ追加 |

## タスク分解

| TASK_ID | 内容 | 担当 | 依存 |
|---|---|---|---|
| TASK-377 | createThread UUID修正 + 固定スレッド除外 | bdd-coding (opus) | - |

### ファイルロック表

| TASK_ID | locked_files |
|---|---|
| TASK-377 | `src/lib/services/post-service.ts`, `src/lib/services/bot-strategies/behavior/random-thread.ts`, `[NEW] supabase/migrations/00040_threads_created_by_nullable.sql` |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-377 | completed | vitest 2234 PASS / cucumber 411 PASS (1 failed は既存のwelcome文言差異) |

### TASK-377 変更ファイル
- `[NEW] supabase/migrations/00040_threads_created_by_nullable.sql` — created_by NULLABLE化
- `src/lib/domain/models/thread.ts` — createdBy: string → string | null
- `src/lib/infrastructure/repositories/thread-repository.ts` — ThreadRow.created_by: string → string | null
- `src/lib/services/post-service.ts` — createThread の createdBy を isBotWrite時 null に修正
- `src/lib/services/bot-strategies/types.ts` — IThreadRepository.findByBoardId 返り値に isPinned 追加
- `src/lib/services/bot-strategies/behavior/random-thread.ts` — isPinned フィルタ追加
- `src/__tests__/lib/services/bot-strategies/random-thread.test.ts` — 固定スレッド除外テスト追加
- `src/__tests__/lib/services/post-service.test.ts` — createdBy=null テスト追加
