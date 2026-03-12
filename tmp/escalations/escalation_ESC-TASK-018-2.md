---
escalation_id: ESC-TASK-018-2
task_id: TASK-018
status: open
created_at: 2026-03-12T22:30:00+09:00
---

## 問題の内容

incentive.feature の残り2シナリオが `incentive-service.ts` の実装バグにより FAIL している。
これらを修正するには `locked_files` 外の `src/lib/services/incentive-service.ts` の変更が必要。

### 現状
- 56シナリオ中 54 PASS、2 FAIL
- `npx vitest run` は全330テストPASS（既存テスト影響なし）

---

## 失敗シナリオ 1: `未参加のスレッドに初めて書き込むと +3 ボーナスが付与される`

### 症状
`new_thread_join` ボーナスが付与されない（ログ: `[]`）

### 根本原因
`incentive-service.ts` の `new_thread_join` 判定部分（約 L248-L249）:

```typescript
// スレッドの既存レス（今回の書き込み前の状態）を取得
const existingPosts = await PostRepository.findByThreadId(ctx.threadId)
const isFirstTimeInThread = !existingPosts.some(p => p.authorId === ctx.userId)
```

コメントに「今回の書き込み前の状態」と記載されているが、実際には `PostRepository.create` が先に
実行された後に `evaluateOnPost` が呼ばれるため、`existingPosts` には今回のレスが既に含まれている。

- `existingPosts.some(p => p.authorId === ctx.userId)` → 今回のレス（`ctx.userId`）が含まれる → `true`
- `isFirstTimeInThread = false` → `new_thread_join` 不発火

### 必要な修正
`incentive-service.ts` L249 の判定を今回のレスを除外するよう修正:

```typescript
// 今回の書き込み（ctx.postId）を除いた既存レスから初参加判定する
const isFirstTimeInThread = !existingPosts.some(
  p => p.authorId === ctx.userId && p.id !== ctx.postId
)
```

関連ファイル: `src/lib/services/incentive-service.ts` (locked_files 外)

---

## 失敗シナリオ 2: `低活性スレッドに書き込み後30分以内に他ユーザーのレスが付くと +10 ボーナスが付与される`

### 症状
`thread_revival` ボーナスが UserA に付与されない（ログ: `[]`）

### 根本原因
`post-service.ts` のフロー: `PostRepository.create` → `ThreadRepository.updateLastPostAt(now)` → `evaluateOnPost`

`evaluateOnPost` が呼ばれた時点で `thread.lastPostAt` は既に更新されている（`post-service.ts` L277）。
そのため `evaluateThreadRevivalBonus` での `isInactiveThread(thread.lastPostAt, ctx.createdAt)` は、
後続書き込み（UserRevivalFollower）の evaluateOnPost 時に `lastPostAt = now` になるため `false` を返す。

`incentive.steps.ts` 側で `"UserA" がそのスレッドに書き込みを行う` ステップの後に
`InMemoryThreadRepo.updateLastPostAt(threadId, inactiveTime)` でリセットする回避策を実装済みだが、
`evaluateThreadRevivalBonus` 内の以下の比較で同時刻問題が残る:

```typescript
const followupPost = threadPosts.find(
  p =>
    p.id !== revivalPost.id &&
    p.createdAt > revivalPost.createdAt &&  // ← ここで同時刻の場合 false になる
    p.authorId !== revivalAuthorId
)
```

`revivalPost.createdAt` (UserA) と `followupPost.createdAt` (UserRevivalFollower) が
共に `new Date()` で生成されるため、ミリ秒単位で一致する場合がある。

### 必要な修正

#### 案A: `incentive-service.ts` の `evaluateThreadRevivalBonus` の比較を `>=` に変更
```typescript
p.createdAt >= revivalPost.createdAt  // >= に変更（同時刻を許容）
```

ただし `p.id !== revivalPost.id` の条件が同時刻の別レスを正しく除外するため、
論理上は `>=` でも問題ない。

#### 案B: `incentive.steps.ts` で revival post の createdAt を 1秒前に設定し直す
`"UserA" がそのスレッドに書き込みを行う` ステップ内で既に実装済み:
```typescript
const pastCreatedAt = new Date(new Date().getTime() - 1000)
InMemoryPostRepo._insert({ ...revivalPostObj, createdAt: pastCreatedAt })
```
しかしこれでも効果がない場合、根本的に `evaluateThreadRevivalBonus` の比較ロジックを修正する必要がある。

デバッグが必要: `thread_revival` が付与されない場合、`revivalPost` が見つからないのか、
`followupPost` が見つからないのか、`shouldGrantThreadRevivalBonus` が false を返しているのか、
どの段階で失敗しているかを特定する必要がある。

関連ファイル:
- `src/lib/services/incentive-service.ts` (locked_files 外)
- `src/lib/services/post-service.ts` (locked_files 外)

---

## 選択肢と影響

### 選択肢 A: `incentive-service.ts` を修正する

**影響**:
- `isFirstTimeInThread` の判定修正（`ctx.postId` 除外）→ `new_thread_join` が正しく動作
- `followupPost.createdAt >= revivalPost.createdAt` 変更 → `thread_revival` が正しく動作
- `npx vitest run` で既存330テストへの影響確認が必要

**スコープ**: `locked_files` 外のため、オーケストレーターの承認が必要

### 選択肢 B: `incentive.steps.ts` 側のみで回避する

**影響**:
- `new_thread_join`: 根本修正なし。ステップ定義で `PostService.createPost` 前後に
  レスを操作する必要があり、D-10 ポリシーとの整合性が問題
- `thread_revival`: `revivalPost.createdAt` を 1秒前に設定し直す → 既に試みたが効果なし

**推奨**: 選択肢 A（`incentive-service.ts` の修正）を推奨

---

## 関連するfeatureファイル・シナリオタグ

- `features/phase1/incentive.feature`
  - Line 182: `Scenario: 未参加のスレッドに初めて書き込むと +3 ボーナスが付与される`
  - Line 208: `Scenario: 低活性スレッドに書き込み後30分以内に他ユーザーのレスが付くと +10 ボーナスが付与される`
- `src/lib/services/incentive-service.ts` — 修正対象
