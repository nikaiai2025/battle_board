---
task_id: TASK-240
sprint_id: Sprint-84
status: completed
assigned_to: bdd-coding
depends_on: [TASK-239]
created_at: 2026-03-21T17:00:00+09:00
updated_at: 2026-03-21T17:00:00+09:00
locked_files:
  - config/bot_profiles.yaml
  - src/lib/services/bot-strategies/types.ts
  - src/lib/services/bot-strategies/strategy-resolver.ts
  - "[NEW] src/lib/services/bot-strategies/content/tutorial.ts"
  - "[NEW] src/lib/services/bot-strategies/behavior/tutorial.ts"
  - "[NEW] src/lib/services/bot-strategies/scheduling/immediate.ts"
  - src/lib/services/bot-service.ts
  - src/lib/services/post-service.ts
  - src/lib/infrastructure/repositories/bot-repository.ts
---

## タスク概要

チュートリアルBOTの Strategy 実装（BotStrategy インターフェース準拠）、bot_profiles.yaml への tutorial プロファイル追加、PostInput.botUserId の追加、日次リセットでの復活除外条件、撃破済みチュートリアルBOTのクリーンアップを実装する。

## 必読ドキュメント（優先度順）
1. [必須] `tmp/workers/bdd-architect_TASK-236/design.md` §3 — チュートリアルBOT設計の全詳細
2. [必須] `src/lib/services/bot-strategies/types.ts` — 既存Strategy インターフェース
3. [必須] `src/lib/services/bot-strategies/strategy-resolver.ts` — 既存resolveStrategies
4. [必須] `config/bot_profiles.yaml` — 既存プロファイル
5. [必須] `src/lib/services/bot-service.ts` — executeBotPost, performDailyReset
6. [必須] `src/lib/services/post-service.ts` — PostInput型（botUserId追加）

## 実装内容

### 1. bot_profiles.yaml に tutorial プロファイル追加

```yaml
tutorial:
  hp: 10
  max_hp: 10
  reward:
    base_reward: 20
    daily_bonus: 0
    attack_bonus: 0
  fixed_messages: []
```

撃破報酬 +20 は `base_reward=20, daily_bonus=0, attack_bonus=0` で実現。`elimination-reward.ts` 修正不要。

### 2. Strategy 実装（3ファイル新規作成）

設計書 §3.3 の通り:
- `TutorialContentStrategy`: `>>N !w  新参おるやん🤣` を生成（context.tutorialTargetPostNumber を使用）
- `TutorialBehaviorStrategy`: `{ type: "post_to_existing", threadId: context.tutorialThreadId }` を返す
- `ImmediateSchedulingStrategy`: delay = 0（即時投稿）

### 3. ContentGenerationContext / BehaviorContext 拡張

`types.ts` に以下を追加:
```typescript
// ContentGenerationContext に追加
tutorialTargetPostNumber?: number;

// BehaviorContext に追加
tutorialThreadId?: string;
```

### 4. resolveStrategies の拡張

`bot.botProfileKey === "tutorial"` の場合にチュートリアル Strategy を返す分岐を追加。

### 5. PostInput.botUserId 追加

```typescript
// PostInput に追加
botUserId?: string;  // BOT書き込み時のコマンド実行用ユーザーID
```

PostService 内の resolvedAuthorId 解決ロジック修正:
```typescript
if (input.isBotWrite && input.botUserId) {
  resolvedAuthorId = input.botUserId;
}
```

### 6. BotService.executeBotPost から botUserId を渡す

`executeBotPost` 内の `createPost` 呼び出しに `botUserId: bot.id` を追加。

### 7. 日次リセット復活除外

`BotRepository.bulkReviveEliminated()` のクエリに条件追加:
```sql
AND (bot_profile_key IS NULL OR bot_profile_key != 'tutorial')
```

### 8. 撃破済みチュートリアルBOT クリーンアップ

`BotRepository` に新規メソッド:
```typescript
async deleteEliminatedTutorialBots(): Promise<number>
// DELETE FROM bots WHERE bot_profile_key = 'tutorial' AND is_active = false
// + 7日経過の未撃破も削除
```

`BotService.performDailyReset()` の末尾でこのメソッドを呼び出す。

### 9. 単体テスト

- TutorialContentStrategy: 正しい本文を生成すること
- TutorialBehaviorStrategy: 正しい threadId を返すこと
- ImmediateSchedulingStrategy: delay = 0 を返すこと
- resolveStrategies: tutorial プロファイル時にチュートリアル Strategy を返すこと
- PostInput.botUserId: BOT書き込み時に resolvedAuthorId が設定されること
- bulkReviveEliminated: tutorial BOT が復活しないこと
- deleteEliminatedTutorialBots: 撃破済みが削除されること

## 完了条件
- [ ] チュートリアルBOT用 3 Strategy が実装されている
- [ ] bot_profiles.yaml に tutorial プロファイルが追加されている
- [ ] PostInput.botUserId が追加され、BOT書き込み時に resolvedAuthorId に設定される
- [ ] 日次リセットでチュートリアルBOTが復活しない
- [ ] 撃破済みチュートリアルBOTのクリーンアップメソッドが実装されている
- [ ] 単体テスト全PASS（`npx vitest run`）

## スコープ外
- チュートリアルBOTのスポーン処理（processPendingTutorials）— Sprint-85
- BDD step definitions — Sprint-85
- CF Cron 関連（TASK-238で完了済み）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全実装タスク完了
- 次にすべきこと: なし
- 未解決の問題: なし（mypage-service.test.ts の失敗は他タスクの問題）

### 進捗ログ

- [x] bot_profiles.yaml に tutorial プロファイル追加
- [x] config/bot-profiles.ts に tutorial プロファイル追加（YAML と同期）
- [x] TutorialContentStrategy 新規作成（src/lib/services/bot-strategies/content/tutorial.ts）
- [x] TutorialBehaviorStrategy 新規作成（src/lib/services/bot-strategies/behavior/tutorial.ts）
- [x] ImmediateSchedulingStrategy 新規作成（src/lib/services/bot-strategies/scheduling/immediate.ts）
- [x] types.ts に tutorialTargetPostNumber / tutorialThreadId フィールド追加
- [x] strategy-resolver.ts に tutorial 分岐追加（bot.botProfileKey === "tutorial"）
- [x] PostInput に botUserId フィールド追加
- [x] PostService の resolvedAuthorId 解決ロジック修正（isBotWrite && botUserId）
- [x] BotService.CreatePostFn 型に botUserId フィールド追加
- [x] BotService.executeBotPost に botUserId: botId を渡すよう修正
- [x] IBotRepository に deleteEliminatedTutorialBots メソッド追加
- [x] BotRepository.bulkReviveEliminated に tutorial 除外条件追加（.or()）
- [x] BotRepository.deleteEliminatedTutorialBots 新規実装
- [x] BotService.performDailyReset の末尾に Step 6 追加（deleteEliminatedTutorialBots 呼び出し）
- [x] 単体テスト全実装（tutorial-strategies.test.ts 新規作成、bot-repository.test.ts 更新、bot-service.test.ts / bot-service-scheduling.test.ts モック更新、post-service-welcome-sequence.test.ts に botUserId テスト追加）

### テスト結果サマリー

TASK-240 関連テスト: 168 PASS / 0 FAIL
- src/__tests__/lib/services/bot-strategies/tutorial-strategies.test.ts: 新規 18 テスト全 PASS
- src/__tests__/lib/infrastructure/repositories/bot-repository.test.ts: bulkReviveEliminated 修正 + deleteEliminatedTutorialBots 新規テスト全 PASS
- src/__tests__/lib/services/bot-service.test.ts: performDailyReset の deleteEliminatedTutorialBots テスト追加 PASS
- src/__tests__/lib/services/bot-service-scheduling.test.ts: モック修正後 PASS
- src/__tests__/lib/services/post-service-welcome-sequence.test.ts: botUserId テスト追加 PASS

全テスト実行: 1575 PASS / 9 FAIL
- 失敗 9 件はすべて src/lib/services/__tests__/mypage-service.test.ts に集中
- この失敗は他タスク（TASK-237/TASK-239 等）による post-repository.ts への searchByAuthorId 追加 + mypage-service.ts の変更が原因
- TASK-240 の locked_files に mypage-service.test.ts / post-repository.ts は含まれないため、このタスクのスコープ外
