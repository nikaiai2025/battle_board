---
task_id: TASK-122
sprint_id: Sprint-42
status: completed
assigned_to: bdd-coding
depends_on: [TASK-121]
created_at: 2026-03-17T19:30:00+09:00
updated_at: 2026-03-17T19:30:00+09:00
locked_files:
  - src/lib/services/bot-service.ts
  - src/__tests__/lib/services/bot-service.test.ts
  - features/step_definitions/bot_system.steps.ts
---

## タスク概要

Phase 3 BOT定期書き込み基盤の実装。BotServiceの2つのスタブメソッド `executeBotPost` と `selectTargetThread` を実装し、BOTの書き込み間隔を決定する `getNextPostDelay` メソッドを新設する。あわせてBDDステップ定義のpending解除と単体テストを追加する。

## 対象BDDシナリオ

- `features/bot_system.feature` @荒らし役ボットは1〜2時間間隔で書き込む
- `features/bot_system.feature` @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ

## 必読ドキュメント（優先度順）

1. [必須] `features/bot_system.feature` — 対象シナリオ（L129-144）
2. [必須] `docs/architecture/components/bot.md` — §2.1 executeBotPost / §2.11 selectTargetThread の設計
3. [必須] `src/lib/services/bot-service.ts` — 現在のスタブ実装（L526-549）とDIインターフェース
4. [必須] `config/bot_profiles.yaml` — 固定文リスト（executeBotPostが参照）
5. [参考] `src/lib/services/post-service.ts` — createPost関数のシグネチャ（PostInput型, L56-70）
6. [参考] `features/step_definitions/bot_system.steps.ts` — pending箇所（L737-810）
7. [参考] `features/support/in-memory/thread-repository.ts` — findByBoardId（BDDテスト用）
8. [参考] `features/support/in-memory/bot-post-repository.ts` — create（既存）

## 入力（前工程の成果物）

- `src/lib/services/bot-service.ts` — executeBotPost / selectTargetThread のスタブ（throw Error）
- BDDステップ定義 — scenarios C/D が `return "pending"` 状態

## 出力（生成すべきファイル）

- `src/lib/services/bot-service.ts` — 3メソッド実装 + DI拡張
- `src/__tests__/lib/services/bot-service.test.ts` — 新メソッドの単体テスト追加
- `features/step_definitions/bot_system.steps.ts` — scenarios C/D のpending解除

## 実装方針

### 1. DI拡張（BotServiceコンストラクタ）

BotServiceのコンストラクタに以下の依存を追加する:

```typescript
// IBotPostRepository に create メソッドを追加（インターフェース拡張）
export interface IBotPostRepository {
  findByPostId(postId: string): Promise<{ postId: string; botId: string } | null>;
  create(postId: string, botId: string): Promise<void>;  // 追加
}

// スレッド一覧取得用の最小インターフェース
export interface IThreadRepository {
  findByBoardId(boardId: string, options?: { limit?: number }): Promise<Thread[]>;
}

// PostService.createPostの型（関数インジェクション）
type CreatePostFn = (input: PostInput) => Promise<PostResult>;
```

コンストラクタの引数を追加する（後方互換のためオプショナルにする）:
```
constructor(
  botRepository, botPostRepository, attackRepository,
  botProfilesYamlPath?,
  threadRepository?: IThreadRepository,
  createPostFn?: CreatePostFn,
)
```

### 2. selectTargetThread 実装

- `threadRepository.findByBoardId(boardId)` で非削除スレッドを取得
- ランダムに1件選択して thread.id を返す
- boardId はデフォルト値（定数 or config）を使用する

### 3. executeBotPost 実装

bot.md §2.1 に従い:
1. `bot_profiles.yaml` の `fixed_messages` からランダムに1件選択
2. `getDailyId(botId)` で偽装IDを取得
3. `createPostFn({ threadId, body, edgeToken: null, ipHash: "bot-...", displayName: "名無しさん", isBotWrite: true })` を呼び出す
4. 成功したら `botPostRepository.create(postId, botId)` で紐付けINSERT
5. `{ postId, postNumber, dailyId }` を返す

### 4. getNextPostDelay 新設

BDDシナリオ「各ボットの書き込み間隔は1時間以上2時間以下のランダムな値」を満たすために:
- `getNextPostDelay(): number` — 60〜120分の間でランダムな値（分単位）を返す
- GitHub Actions cronジョブから参照される設計（TASK-123で使用）

### 5. BDDステップ定義 pending解除

**Scenario C（L737-749）:**
- `When("ボットの定期実行が行われる")` → `getNextPostDelay()` を呼び出す
- `Then("各ボットの書き込み間隔は...")` → 返値が60以上120以下であることを検証

**Scenario D（L796-810）:**
- `When("荒らし役ボットが書き込み先を決定する")` → `selectTargetThread()` を呼び出す
- `Then("表示中の50件の中からランダムに1件が選択される")` → 返されたthreadIdがGivenで作成した50件のいずれかであることを検証

### 6. 単体テスト

新メソッドごとにテストケースを追加:
- `selectTargetThread`: 正常系（ランダム選択）、異常系（スレッド0件）
- `executeBotPost`: 正常系（PostService成功→bot_posts INSERT）、異常系（PostService失敗）
- `getNextPostDelay`: 返値が60-120の範囲内

## 完了条件

- [ ] `executeBotPost` が PostService.createPost を isBotWrite=true で呼び出すこと
- [ ] `selectTargetThread` がランダムにスレッドIDを返すこと
- [ ] `getNextPostDelay` が60-120分の範囲の値を返すこと
- [ ] `features/bot_system.feature` のシナリオC/Dがpendingではなく passed になること
- [ ] `npx vitest run` 全件PASS
- [ ] `npx cucumber-js` 221 passed / 7 pending / 0 failed（旧219+2件がpassed化）
- [ ] テストコマンド: `npx vitest run && npx cucumber-js`

## スコープ外

- Internal APIルート作成（TASK-123で対応）
- GitHub Actionsワークフロー作成（TASK-123で対応）
- 本番用 createBotService() ファクトリ関数の ThreadRepository/PostService 注入（TASK-123で対応）
- PostService自体の変更（createPostは既存のまま使用する）
- bot_profiles.yaml の変更

## 補足・制約

- PostServiceはモジュール関数（`export async function createPost`）のため、DI時は関数参照を渡す
- InMemoryの bot-post-repository はすでに `create` メソッドを持っている
- InMemoryの thread-repository はすでに `findByBoardId` メソッドを持っている
- BDDテストでは InMemoryリポジトリを使用し、PostService呼び出しはモック化する
- 既存テストを壊さないよう、コンストラクタの新引数はオプショナルにする

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全実装・全テストPASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/lib/services/bot-service.ts` — DI拡張・3メソッド実装
   - `IBotPostRepository` に `create` メソッド追加
   - `IThreadRepository`、`CreatePostFn` 型を新設
   - `BOT_DEFAULT_BOARD_ID` 定数を追加
   - コンストラクタに `threadRepository?`、`createPostFn?` 引数を追加（後方互換オプショナル）
   - `executeBotPost` スタブを完全実装（固定文選択 → PostService呼び出し → bot_posts INSERT）
   - `selectTargetThread` スタブを完全実装（ThreadRepository経由ランダム選択）
   - `getNextPostDelay` 新設（60〜120分のランダム整数）
   - `getFixedMessages` プライベートメソッド追加

2. `src/__tests__/lib/services/bot-service.test.ts` — 新メソッドの単体テスト追加
   - `createMockBotPostRepository` に `create` モック追加
   - `createMockThreadRepository`、`createMockCreatePostFn` ヘルパー追加
   - インポートに `IThreadRepository`、`CreatePostFn` 追加
   - `getNextPostDelay()` テスト3件追加
   - `selectTargetThread()` テスト5件追加
   - `executeBotPost()` テスト6件追加

3. `features/step_definitions/bot_system.steps.ts` — Scenario C/D pending解除
   - `createBotServiceWithThread()` ファクトリ関数追加
   - Scenario C「ボットの定期実行が行われる」→ `getNextPostDelay()` 呼び出し
   - Scenario C「各ボットの書き込み間隔は1時間以上2時間以下」→ 範囲検証
   - Scenario D「荒らし役ボットが書き込み先を決定する」→ `selectTargetThread()` 呼び出し
   - Scenario D「表示中の50件の中からランダムに1件が選択される」→ ID一致検証

### テスト結果サマリー

- **Vitest**: 39 test files passed / 1061 tests passed（+14件）
- **Cucumber**: 228 scenarios / 221 passed / 7 pending / 0 failed
  - 新たにPASSとなったシナリオ: @荒らし役ボットは1〜2時間間隔で書き込む、@荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ（計2件）
  - 残りpending 7件はWeb UIシナリオ（撃破済みレス表示トグル等）で今回のスコープ外
