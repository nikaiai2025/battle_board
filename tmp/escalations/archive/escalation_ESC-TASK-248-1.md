---
escalation_id: ESC-TASK-248-1
task_id: TASK-248
status: open
created_at: 2026-03-21T23:00:00+09:00
---

## 問題

TASK-248 の BDD テストリグレッション修正において、InMemory リポジトリに不足しているメソッドが原因で修正を完了できない。以下の2つのメソッドが InMemory リポジトリに未実装であり、対応ファイルが `locked_files` に含まれていない。

### 不足メソッド 1: `PostRepository.countByAuthorId`

- **ファイル**: `features/support/in-memory/post-repository.ts`
- **呼び出し元**: `src/lib/services/post-service.ts` line 488 (Step 6.5 ウェルカムシーケンス)
- **影響**: PostService の try-catch で silent fail するため直接の failure は発生しないが、seedDummyPost によるウェルカムシーケンス抑止が正しく機能しない
- **本番リポジトリ実装**: `src/lib/infrastructure/repositories/post-repository.ts` line 437

### 不足メソッド 2: `BotRepository.deleteEliminatedTutorialBots`

- **ファイル**: `features/support/in-memory/bot-repository.ts`
- **呼び出し元**: `src/lib/services/bot-service.ts` line 646 (performDailyReset Step 6)
- **影響**: 6 シナリオが failure（bot_system の日付変更シナリオ全て）
- **エラー**: `TypeError: this.botRepository.deleteEliminatedTutorialBots is not a function`

## 選択肢と影響

### 選択肢 A: locked_files に InMemory リポジトリファイルを追加

- `features/support/in-memory/post-repository.ts` を locked_files に追加
- `features/support/in-memory/bot-repository.ts` を locked_files に追加
- **影響**: TASK-248 で不足メソッドを追加実装でき、6 failures を解消可能

### 選択肢 B: 別タスクとして InMemory リポジトリ更新を起票

- InMemory リポジトリへのメソッド追加を別タスクとして起票する
- TASK-248 は現在の 249 passed で完了とする（6 failures は別タスクで対応）
- **影響**: TASK-248 の完了条件「274 passed」は未達

### 選択肢 C: bot_system.steps.ts 側で回避策を実装

- `日付が変更される（JST 0:00）` ステップ内で、`performDailyReset` 呼び出し前に `deleteEliminatedTutorialBots` メソッドを InMemoryBotRepo に動的に追加する（monkey-patch）
- **影響**: 6 failures を解消可能だが、InMemory リポジトリの設計方針（bdd_test_strategy.md §2）に反する可能性がある

## 関連ファイル

- `features/bot_system.feature` -- 日付変更シナリオ (line 328-373)
- `features/welcome.feature` -- ウェルカムシーケンスシナリオ
- `src/lib/services/post-service.ts` -- Step 6.5 countByAuthorId 呼び出し
- `src/lib/services/bot-service.ts` -- Step 6 deleteEliminatedTutorialBots 呼び出し
- `features/support/in-memory/post-repository.ts` -- countByAuthorId 未実装
- `features/support/in-memory/bot-repository.ts` -- deleteEliminatedTutorialBots 未実装

## 現在のテスト結果

- 279 scenarios, 6 failed, 8 undefined, 16 pending, 249 passed
- 修正前（作業開始時点）の正確な数値は不明（タスク指示書では「43リグレッション」と記載）
