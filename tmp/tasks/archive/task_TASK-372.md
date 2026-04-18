---
task_id: TASK-372
sprint_id: Sprint-145
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-29T14:40:00+09:00
updated_at: 2026-03-29T14:40:00+09:00
locked_files:
  - src/lib/services/bot-service.ts
  - "[NEW] supabase/migrations/00039_pending_tutorials_unique.sql"
---

## タスク概要

ウェルカムBOT（チュートリアルBOT）が同一ユーザーに対して2体スポーンするバグを修正する。原因は `processPendingTutorials` 内の処理順序により、pending削除が副次的処理のエラーでスキップされること。

## 修正内容

### 1. `src/lib/services/bot-service.ts` — pending削除の順序変更

`processPendingTutorials` メソッド内で、pending削除を `updateNextPostAt` の前に移動する。

**現状（問題あり）:**
```typescript
// Step 2b: 書き込み実行
const postResult = await this.executeBotPost(...);
// Step 2b-post: next_post_at をリセット
await this.botRepository.updateNextPostAt(newBot.id, null);  // ← ここでエラー時
// Step 2c: pending 削除
await this.pendingTutorialRepository.deletePendingTutorial(pending.id);  // ← 到達しない
```

**修正後:**
```typescript
// Step 2b: 書き込み実行
const postResult = await this.executeBotPost(...);
// Step 2c: pending 削除（投稿成功したら即削除、以降の処理失敗で重複しないように）
await this.pendingTutorialRepository.deletePendingTutorial(pending.id);
// Step 2d: next_post_at をリセット（失敗しても重複スポーンは起きない）
await this.botRepository.updateNextPostAt(newBot.id, null);
```

### 2. マイグレーション追加 — `pending_tutorials` にUNIQUE制約

`supabase/migrations/00039_pending_tutorials_unique.sql` を新規作成:

```sql
-- 同一ユーザーに対する重複pendingを防止する安全装置
ALTER TABLE pending_tutorials
ADD CONSTRAINT unique_pending_per_user UNIQUE (user_id);
```

この制約により、アプリケーション層のバグがあっても同一ユーザーの重複pendingはDB側で防止される。
既存のINSERT側（post-service.ts）はpending_tutorials INSERT失敗を `catch → console.error` で握り潰す設計のため、UNIQUE制約違反が発生しても書き込み処理に影響しない。

## 完了条件

- [ ] `processPendingTutorials` のpending削除が `updateNextPostAt` の前に移動されていること
- [ ] マイグレーション `00039_pending_tutorials_unique.sql` が作成されていること
- [ ] `npx supabase migration up` でマイグレーション適用成功
- [ ] `npx vitest run` で全テストPASS（回帰なし）
- [ ] テストコマンド: `npx vitest run`

## スコープ外

- locked_files以外のファイル変更
- PostServiceの初回書き込み判定ロジック変更（TOCTOU問題は低頻度のため今回は対象外）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/lib/services/bot-service.ts` の `processPendingTutorials` メソッドを修正
   - `deletePendingTutorial` を `updateNextPostAt` の前に移動（Step 2c→Step 2d の順序変更）
   - コメントも整合性を保つよう更新（Step 2b-post/2c → 2c/2d）
2. `supabase/migrations/00039_pending_tutorials_unique.sql` を新規作成
   - `pending_tutorials` テーブルに `UNIQUE(user_id)` 制約を追加
3. `src/__tests__/lib/services/bot-service.test.ts` にテスト追加・更新
   - 既存コメント: 順序を明示するコメントに更新
   - 新規テスト: `updateNextPostAt がエラーをスローしても pending は削除済みのため重複スポーンしない`（バグ修正の核心部分を検証）
4. `npx supabase migration up` でマイグレーション適用確認
5. `npx vitest run` で全テストPASS確認

### テスト結果サマリー

- 単体テスト: 116 test files, **2225 tests — 全件 PASS**
- BDDテスト: 実行なし（bot-service のロジック修正のみのためスコープ外）
