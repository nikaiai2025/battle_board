---
task_id: TASK-354
sprint_id: Sprint-137
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-28T00:00:00Z
updated_at: 2026-03-28T00:00:00Z
locked_files:
  - "src/lib/services/bot-service.ts"
---

## タスク概要

`createBotService()` ファクトリ関数に `createThreadFn` と `collectedTopicRepository` が未注入のため、
CF Workers cron 実行時にキュレーションBOT（curation_newsplus）が毎回エラーを起こしている。
`createBotService()` に 2 つの依存を追加注入して本番エラーを解消する。

## 問題の詳細

`src/lib/services/bot-service.ts` の末尾にある `createBotService()` ファクトリ関数は、
`BotService` コンストラクタの第10引数（`createThreadFn`）と第11引数（`collectedTopicRepository`）を渡していない。

コンストラクタの引数順（0-indexed）:
- 0: botRepository
- 1: botPostRepository
- 2: attackRepository
- 3: botProfilesData (undefined)
- 4: threadRepository
- 5: createPostFn
- 6: resolveStrategiesFn (undefined)
- 7: pendingTutorialRepository
- 8: pendingAsyncCommandRepository
- **9: dailyEventRepository** ← 現在 undefined（省略済み）、本タスクでも `undefined` で可（機能ガード済み）
- **10: createThreadFn** ← 未注入が原因 → 要修正
- **11: collectedTopicRepository** ← 未注入が原因 → 要修正

エラー連鎖:
1. `executeBotPost()` → `resolveStrategies()` → `collectedTopicRepository` が undefined
2. `resolveStrategies()` が `"behavior_type='create_thread' には collectedTopicRepository が必要です"` をthrow
3. エラーが per-bot try-catch で捕捉 → `next_post_at` 未更新
4. 次の cron でも同じBOTが due リストに入り、毎回エラーが繰り返される

## 必読ドキュメント

1. [必須] `src/lib/services/bot-service.ts` — `createBotService()` 関数（末尾約50行）とコンストラクタシグネチャ
2. [必須] `src/lib/infrastructure/repositories/collected-topic-repository.ts` — `collectedTopicRepository` エクスポート名の確認
3. [必須] `src/lib/services/post-service.ts` — `createThread` 関数のエクスポート名確認

## 修正内容

`createBotService()` 内で以下を追加:

```typescript
// 既存の require に追加
const { createThread } = require("./post-service");
// 注意: createPost は既に同ファイルから require されている
```

```typescript
const { collectedTopicRepository } = require("../infrastructure/repositories/collected-topic-repository");
```

そして `new BotService(...)` の呼び出しに追加（位置9〜11）:

```typescript
return new BotService(
    BotRepository,
    BotPostRepository,
    AttackRepository,
    undefined,
    threadRepository,
    createPost,
    undefined,
    pendingTutorialRepository,
    pendingAsyncCommandRepository,
    undefined,                  // dailyEventRepository (位置9) — ガード済みのため undefined で可
    createThread,               // createThreadFn (位置10) — 要追加
    collectedTopicRepository,   // collectedTopicRepository (位置11) — 要追加
);
```

## 完了条件

- [ ] `npx vitest run` で既存テスト全件 PASS（回帰なし）
- [ ] `npx cucumber-js` で既存 PASS 数が維持される（回帰なし）
- [ ] `src/lib/services/bot-service.ts` の `createBotService()` に `createThread` と `collectedTopicRepository` が注入されている

## スコープ外

- BDDシナリオの変更（禁止）
- `createBotService()` 以外のファイル変更（必要な場合はエスカレーション）
- `dailyEventRepository` の注入（本タスクのスコープ外。機能ガード済みで動作に問題なし）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: bot-service.ts の createBotService() に createThread と collectedTopicRepository を注入
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- `src/lib/services/bot-service.ts` の `createBotService()` を修正
  - `post-service` から `createThread` を追加 require
  - `collected-topic-repository` から `collectedTopicRepository` を追加 require
  - `new BotService(...)` の引数に `undefined`（dailyEventRepository）、`createThread`、`collectedTopicRepository` を追加

### テスト結果サマリー

#### 単体テスト (Vitest)
- Tests: 2084 passed, 13 failed（本タスク変更前から同数の失敗であり、回帰なし）
- 失敗ファイル: registration-service.test.ts、auth/callback/route.test.ts、auth/login/discord/route.test.ts、auth/register/discord/route.test.ts（本タスクとは無関係）

#### BDD テスト (Cucumber)
- 394 scenarios: 373 passed, 18 pending, 3 undefined（変更前と同数、回帰なし）
