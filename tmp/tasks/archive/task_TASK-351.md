---
task_id: TASK-351
sprint_id: Sprint-136
status: completed
assigned_to: bdd-coding
depends_on: [TASK-350]
created_at: 2026-03-28T00:00:00Z
updated_at: 2026-03-28T00:00:00Z
locked_files:
  - "src/lib/services/bot-strategies/strategy-resolver.ts"
  - "src/lib/services/bot-service.ts"
  - "[NEW] src/lib/services/bot-strategies/behavior/thread-creator.ts"
  - "[NEW] src/lib/services/bot-strategies/scheduling/topic-driven.ts"
  - "[NEW] src/lib/services/bot-strategies/content/noop.ts"
  - "[NEW] src/lib/domain/rules/jst-date.ts"
  - "[NEW] src/lib/domain/rules/buzz-score.ts"
  - "[NEW] src/__tests__/lib/services/bot-strategies/scheduling/topic-driven.test.ts"
  - "[NEW] src/__tests__/lib/services/bot-strategies/behavior/thread-creator.test.ts"
  - "[NEW] src/__tests__/lib/domain/rules/jst-date.test.ts"
  - "[NEW] src/__tests__/lib/domain/rules/buzz-score.test.ts"
---

## タスク概要

キュレーションBOT Phase 3 の Strategy 実装を行う。
ThreadCreatorBehaviorStrategy / TopicDrivenSchedulingStrategy / NoOpContentStrategy を新規作成し、
strategy-resolver.ts と bot-service.ts を Phase 3 対応に更新する。

## 対象BDDシナリオ

- `features/curation_bot.feature` — BOT投稿7シナリオ（S6〜S11、S12 BOTスペック含む）

## 必読ドキュメント（優先度順）

1. [必須] `tmp/workers/bdd-architect_TASK-349/design.md` — 全体設計書（特に §4, §5, §6, §7）
2. [必須] `features/curation_bot.feature` — 対象シナリオ
3. [必須] `src/lib/services/bot-strategies/types.ts` — TASK-350 が更新済みの型定義
4. [必須] `src/lib/services/bot-strategies/strategy-resolver.ts` — 更新対象（Phase 3 TODOコメントあり）
5. [必須] `src/lib/services/bot-service.ts` — 更新対象（create_thread/skip 対応）
6. [参考] `src/lib/services/bot-strategies/behavior/random-thread.ts` — BehaviorStrategy 実装例
7. [参考] `src/lib/services/bot-strategies/scheduling/fixed-interval.ts` — SchedulingStrategy 実装例

## 出力（生成すべきファイル）

### 新規作成
- `src/lib/services/bot-strategies/behavior/thread-creator.ts` — ThreadCreatorBehaviorStrategy
- `src/lib/services/bot-strategies/scheduling/topic-driven.ts` — TopicDrivenSchedulingStrategy
- `src/lib/services/bot-strategies/content/noop.ts` — NoOpContentStrategy
- `src/lib/domain/rules/jst-date.ts` — getJstDateString() 純粋関数（collection-job とも共有）
- `src/lib/domain/rules/buzz-score.ts` — calculateBuzzScore() 純粋関数
- 単体テスト4ファイル（上記のlocked_files参照）

### 変更
- `src/lib/services/bot-strategies/strategy-resolver.ts` — Phase 3 分岐を追加
- `src/lib/services/bot-service.ts` — create_thread / skip アクション処理を追加

## 完了条件

- [ ] `ThreadCreatorBehaviorStrategy.decideAction()` が設計書通りのフォールバックロジックを実装している
- [ ] `TopicDrivenSchedulingStrategy.getNextPostDelay()` が 240〜360 の範囲を返す
- [ ] `strategy-resolver.ts` で `behavior_type === 'create_thread'` の分岐が動作する
- [ ] `bot-service.ts` の `executeBotPost()` が `create_thread` / `skip` アクションを処理できる
- [ ] `npx vitest run` 全件PASS（新規テスト含む）

## 実装仕様（設計書 §4, §5, §6, §7 より）

### jst-date.ts（設計書 §4.4）

```typescript
// src/lib/domain/rules/jst-date.ts
export function getJstDateString(date: Date): string {
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
}
```

### buzz-score.ts（設計書 §10.3）

```typescript
// src/lib/domain/rules/buzz-score.ts
export function calculateBuzzScore(
    resCount: number,
    createdUnixTime: number,
    nowMs: number = Date.now(),
): number {
    const elapsedHours = (nowMs / 1000 - createdUnixTime) / 3600;
    return resCount / Math.pow(elapsedHours + 2, 1.5);
}
```

### ThreadCreatorBehaviorStrategy（設計書 §4）

設計書 §4.2, §4.3 参照。重要ポイント:
- `decideAction()` は `markAsPosted()` を呼ばない（createThread成功後に呼ぶのはbot-service側）
- 返す BotAction に `_selectedTopicId` フィールドを含める（設計書 §7.1 の型拡張を参照）
- フォールバック: 当日 → 前日 → skip

### TopicDrivenSchedulingStrategy（設計書 §5）

コンストラクタ引数: `minMinutes = 240`, `maxMinutes = 360`

### NoOpContentStrategy（設計書 §6.3）

`generateContent()` が呼ばれた場合は Error をスローする。

### strategy-resolver.ts 更新（設計書 §6）

1. Phase 3 分岐を追加（behavior_type === 'create_thread'）
2. `ResolveStrategiesOptions` に `collectedTopicRepository?: ICollectedTopicRepository` を追加
3. `BotProfile.scheduling.min_interval_minutes` / `max_interval_minutes` を読み取り、コンストラクタに渡す
4. import 追加

### bot-service.ts 更新（設計書 §7）

#### BotAction 型の拡張（types.ts に反映済み前提）

設計書 §7.1 参照: `create_thread` バリアントに `_selectedTopicId?: string` を追加

**注意**: types.ts の BotAction はTASK-350で変更しないため、本タスクで追加すること。

#### executeBotPost() への追加処理（設計書 §7.2, §7.3）

- `skip` アクション: next_post_at 更新 → null を返す
- `create_thread` アクション:
  - `this.createThreadFn` を呼び出してスレッド作成
  - 成功後に `this.collectedTopicRepository?.markAsPosted(action._selectedTopicId, ...)` 呼び出し
  - bot_posts INSERT → total_posts 更新 → next_post_at 更新
  - BotPostResult を返す

#### コンストラクタへの DI 追加（設計書 §7.4, §7.5）

```typescript
// CreateThreadFn 型定義
export type CreateThreadFn = (
    input: { boardId: string; title: string; firstPostBody: string },
    edgeToken: string | null,
    ipHash: string,
) => Promise<CreateThreadResult>;

// コンストラクタ末尾に追加
private readonly createThreadFn?: CreateThreadFn,
private readonly collectedTopicRepository?: ICollectedTopicRepository,
```

`resolveStrategiesForBot()` 内の options に `collectedTopicRepository` を追加。

#### 現行コードの確認が必要な点

`bot-service.ts` の `executeBotPost()` に現在 `create_thread` アクションで例外をスローしている箇所があるはず。そこを実装に置き換える。
`CreateThreadResult` の型は `post-service.ts` から参照する。

## スコープ外

- BDDステップ定義（TASK-353）
- 収集ジョブ（TASK-352）
- supabase/migrations（TASK-350 で対応済み）

## 補足・制約

- `DEFAULT_BOARD_ID` は `src/lib/domain/constants.ts` から import する
- `createThread()` の呼び出し形式は `bot-service.ts` の既存コードを参考に確認すること
- テストは InMemory の `CollectedTopicRepository` (TASK-350 で作成済み) を使用する
- `BotAction` 型の `_selectedTopicId` 追加は `types.ts` で行うこと

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### escalation_resolution（オーケストレーター追記）
- TASK-350 完了により `types.ts` の更新済み:
  - `ICollectedTopicRepository`, `CollectedItem` 追加済み
  - `BotProfile.collection` / `scheduling.min_interval_minutes` / `max_interval_minutes` 追加済み
  - **`BotAction` の `_selectedTopicId` も TASK-350 側で追加済み**（設計書 §7.1 の変更は不要）
- TASK-352 完了により `src/lib/collection/adapters/subject-txt.ts` に `buzz-score.ts`・`jst-date.ts` のロジックがインライン実装済み
  - `jst-date.ts` と `buzz-score.ts` を作成したら、subject-txt.ts と collection-job.ts の該当インライン実装を import に切り替えること

### チェックポイント
- 状態: 完了
- 完了済み: 全タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/lib/domain/rules/jst-date.ts` 新規作成（getJstDateString 純粋関数）
2. `src/lib/domain/rules/buzz-score.ts` 新規作成（calculateBuzzScore 純粋関数）
3. `src/lib/services/bot-strategies/content/noop.ts` 新規作成（NoOpContentStrategy）
4. `src/lib/services/bot-strategies/scheduling/topic-driven.ts` 新規作成（TopicDrivenSchedulingStrategy）
5. `src/lib/services/bot-strategies/behavior/thread-creator.ts` 新規作成（ThreadCreatorBehaviorStrategy）
6. `src/lib/services/bot-strategies/strategy-resolver.ts` 更新（Phase 3 create_thread 分岐追加、ResolveStrategiesOptions に collectedTopicRepository 追加）
7. `src/lib/services/bot-service.ts` 更新（create_thread / skip アクション処理追加、CreateThreadFn / ICollectedTopicRepository DI追加）
8. `src/lib/collection/adapters/subject-txt.ts` リファクタリング（calculateBuzzScore を buzz-score.ts から import に切り替え、後方互換 re-export 追加）
9. `src/lib/collection/collection-job.ts` リファクタリング（getJstDateString インライン実装を jst-date.ts import に切り替え）
10. 単体テスト4ファイル作成（jst-date.test.ts 6件、buzz-score.test.ts 8件、topic-driven.test.ts 5件、thread-creator.test.ts 10件）

### テスト結果サマリー

新規テスト4ファイル: 29件全PASS
- jst-date.test.ts: 6/6 PASS
- buzz-score.test.ts: 8/8 PASS
- topic-driven.test.ts: 5/5 PASS
- thread-creator.test.ts: 10/10 PASS

全体テスト: 2084 PASS / 13 FAIL（失敗13件は全てDiscord認証系の既存失敗で本タスクと無関係）
変更前も同じ失敗ファイルが失敗しており、今回の変更による回帰はなし
