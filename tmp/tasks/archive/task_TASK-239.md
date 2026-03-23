---
task_id: TASK-239
sprint_id: Sprint-84
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-21T17:00:00+09:00
updated_at: 2026-03-21T17:00:00+09:00
locked_files:
  - src/lib/services/post-service.ts
  - src/lib/services/currency-service.ts
  - src/lib/infrastructure/repositories/post-repository.ts
  - src/lib/domain/models/currency.ts
  - "[NEW] supabase/migrations/00012_welcome_sequence.sql"
  - "[NEW] src/lib/infrastructure/repositories/pending-tutorial-repository.ts"
---

## タスク概要

ウェルカムシーケンスの同期部分（① 初回書き込みボーナス +50、② ウェルカムメッセージ）を PostService に実装する。合わせて Currency v5 変更（初期通貨 50→0）、pending_tutorials DBテーブル作成、PendingTutorialRepository を実装する。

## 対象BDDシナリオ
- `features/welcome.feature` — 初回書き込み判定（4シナリオ）、①ボーナス（1シナリオ）、②メッセージ（1シナリオ）
- `features/currency.feature` — 「新規ユーザー登録時の通貨残高は 0 である」

※ BDD step definitions の実装は後続スプリントで行う。本タスクは実装コード + 単体テストのみ。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-236/design.md` §2 — ウェルカムシーケンス同期部分の全設計
2. [必須] `features/welcome.feature` — 対象シナリオ
3. [必須] `features/currency.feature` — v5変更（初期通貨0）
4. [必須] `src/lib/services/post-service.ts` — 変更対象（Step 6.5追加）
5. [必須] `src/lib/services/currency-service.ts` — INITIAL_BALANCE変更
6. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — countByAuthorId追加
7. [参考] `src/lib/domain/models/currency.ts` — CreditReason型追加

## 実装内容

### 1. PostRepository.countByAuthorId（新規メソッド）

```typescript
async countByAuthorId(authorId: string): Promise<number>
// SELECT count(*) FROM posts WHERE author_id = :authorId
```

### 2. CurrencyService 変更

- `INITIAL_BALANCE = 50` → `INITIAL_BALANCE = 0`
- 既存の `initializeBalance` は残す（通貨レコードの初期作成は必要、残高0で作成）

### 3. CreditReason 追加

`src/lib/domain/models/currency.ts` の `CreditReason` 型に `"welcome_bonus"` を追加。

### 4. PostService: Step 6.5 追加

設計書 §2.1 の通り、`createPost()` 内の Step 6（レス番号採番）と Step 7（IncentiveService）の間に Step 6.5 を追加:

```
条件: !isSystemMessage && !isBotWrite && resolvedAuthorId != null
a) count = PostRepository.countByAuthorId(resolvedAuthorId)
b) if (count === 0):
   ① CurrencyService.credit(resolvedAuthorId, 50, "welcome_bonus")
     welcomeBonusText = "🎉 初回書き込みボーナス！ +50"
     → inlineSystemInfo に追加（レス内マージ）
   ② welcomeMessagePending = true, welcomeTargetPostNumber = postNumber
   ③ pending_tutorials INSERT（PendingTutorialRepository.create）

Step 11.5: ウェルカムメッセージ投稿（welcomeMessagePending の場合）
  createPost({
    threadId,
    body: `>>${welcomeTargetPostNumber} Welcome to Underground...\nここはBOTと人間が入り混じる対戦型掲示板です`,
    displayName: "★システム",
    isBotWrite: true,
    isSystemMessage: true,
  })
```

**注意:** ウェルカムメッセージの `createPost` 再帰呼び出しでは `isSystemMessage=true` なので Step 6.5 の条件 `!isSystemMessage` によりウェルカムシーケンスは発動しない（無限ループ防止）。

### 5. pending_tutorials テーブル（マイグレーション）

設計書 §3.1 の通り、`supabase/migrations/` に新規マイグレーションファイルを作成:

```sql
CREATE TABLE pending_tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  thread_id UUID NOT NULL REFERENCES threads(id),
  trigger_post_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pending_tutorials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON pending_tutorials
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "deny_anon" ON pending_tutorials
  FOR ALL TO anon USING (false);
CREATE POLICY "deny_authenticated" ON pending_tutorials
  FOR ALL TO authenticated USING (false);

CREATE INDEX idx_pending_tutorials_created_at ON pending_tutorials(created_at);
```

マイグレーション番号は既存の最後の番号の次にする。ファイル名の命名規則は既存ファイルに合わせること。

### 6. PendingTutorialRepository（新規ファイル）

```typescript
// src/lib/infrastructure/repositories/pending-tutorial-repository.ts
export class PendingTutorialRepository {
  async create(params: { userId: string; threadId: string; triggerPostNumber: number }): Promise<void>
  async findAll(): Promise<PendingTutorial[]>  // 後続タスクで使用
  async delete(id: string): Promise<void>       // 後続タスクで使用
}
```

本タスクでは `create` のみ実装必須。`findAll` と `delete` も実装しておくと後続タスクで便利。

### 7. 単体テスト

以下のテストを追加:
- `PostRepository.countByAuthorId`: 0件・N件の場合
- `PostService Step 6.5`: 初回書き込み時にボーナス+メッセージ+pending INSERT が呼ばれること
- `PostService Step 6.5`: 2回目以降はスキップされること
- `PostService Step 6.5`: isSystemMessage=true の場合はスキップされること
- `PostService Step 6.5`: isBotWrite=true の場合はスキップされること
- `CurrencyService.INITIAL_BALANCE` が 0 であること
- 既存の CurrencyService テスト: initializeBalance の期待値を 0 に更新

## 出力（生成すべきファイル）
- `src/lib/services/post-service.ts` — Step 6.5 追加
- `src/lib/services/currency-service.ts` — INITIAL_BALANCE = 0
- `src/lib/infrastructure/repositories/post-repository.ts` — countByAuthorId 追加
- `src/lib/domain/models/currency.ts` — CreditReason に welcome_bonus 追加
- `supabase/migrations/{番号}_welcome_sequence.sql` — pending_tutorials テーブル
- `src/lib/infrastructure/repositories/pending-tutorial-repository.ts` — 新規
- テストファイル（新規 or 既存拡張）

## 完了条件
- [ ] PostService に Step 6.5 が実装されている
- [ ] 初回書き込み時に ①ボーナス+50 ②ウェルカムメッセージ ③pending INSERT が実行される
- [ ] 2回目以降・BOT・システムメッセージではスキップされる
- [ ] INITIAL_BALANCE が 0 に変更されている
- [ ] pending_tutorials テーブルのマイグレーションが存在する
- [ ] 単体テスト全PASS（`npx vitest run`）

## スコープ外
- BDD step definitions の実装（後続スプリント）
- チュートリアルBOT Strategy/スポーンロジック（TASK-240, Sprint-85）
- PostInput.botUserId の追加（TASK-240）
- マイページ関連の変更（TASK-241）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全実装 + テスト全PASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/lib/domain/models/currency.ts` — CreditReason に `"welcome_bonus"` 追加
2. `src/lib/services/currency-service.ts` — INITIAL_BALANCE 50→0 変更、コメント更新
3. `src/lib/infrastructure/repositories/post-repository.ts` — `countByAuthorId` メソッド追加
4. `src/lib/infrastructure/repositories/pending-tutorial-repository.ts` — 新規作成（create/findAll/deletePendingTutorial）
5. `supabase/migrations/00021_welcome_sequence.sql` — pending_tutorials テーブル作成マイグレーション
6. `src/lib/services/post-service.ts` — PendingTutorialRepository/CurrencyService import追加、Step 6.5/11.5追加、inlineSystemInfoにウェルカムボーナス統合
7. `src/lib/services/__tests__/currency-service.test.ts` — INITIAL_BALANCE期待値を0に更新、welcome_bonusをreason一覧に追加
8. `src/lib/services/__tests__/post-service.test.ts` — CurrencyService/PendingTutorialRepository/countByAuthorId モック追加
9. `src/__tests__/lib/services/pinned-thread.test.ts` — CurrencyService/PendingTutorialRepository/countByAuthorId モック追加
10. `src/__tests__/lib/infrastructure/repositories/post-repository-count-by-author-id.test.ts` — 新規作成（4テスト）
11. `src/__tests__/lib/services/currency-service.test.ts` — 新規作成（INITIAL_BALANCE=0確認含む9テスト）
12. `src/__tests__/lib/services/post-service-welcome-sequence.test.ts` — 新規作成（Step 6.5の7テスト）
13. supabase migration を `npx supabase db push --local` で適用

### テスト結果サマリー

- 単体テスト: 75ファイル / 1560テスト 全PASS
- 失敗: 0件
- 新規追加テスト: 20件（4 + 9 + 7）
