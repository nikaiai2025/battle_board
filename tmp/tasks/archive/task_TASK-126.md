---
task_id: TASK-126
sprint_id: Sprint-43
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-17T23:00:00+09:00
updated_at: 2026-03-17T23:00:00+09:00
locked_files:
  - "[NEW] src/lib/services/bot-strategies/types.ts"
  - "[NEW] src/lib/services/bot-strategies/strategy-resolver.ts"
  - "[NEW] src/lib/services/bot-strategies/content/fixed-message.ts"
  - "[NEW] src/lib/services/bot-strategies/behavior/random-thread.ts"
  - "[NEW] src/lib/services/bot-strategies/scheduling/fixed-interval.ts"
  - "[NEW] src/__tests__/lib/services/bot-strategies/fixed-message.test.ts"
  - "[NEW] src/__tests__/lib/services/bot-strategies/random-thread.test.ts"
  - "[NEW] src/__tests__/lib/services/bot-strategies/fixed-interval.test.ts"
  - "[NEW] src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts"
---

## タスク概要

bot.md v6 §2.12 のStrategy パターン設計に基づき、Strategyインターフェース定義と荒らし役の3つのStrategy実装を新規ファイルとして作成する。
本タスクでは既存の `bot-service.ts` は一切変更しない（Step 2: TASK-127で改修）。

## 対象BDDシナリオ

- 本タスクはBDDシナリオの変更を伴わない（純粋な新規ファイル追加）
- 動作検証として既存テスト全PASSを確認する

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/bot.md` §2.12 — Strategy パターン設計全体
   - §2.12.1: Strategy インターフェース定義（ContentStrategy, BehaviorStrategy, SchedulingStrategy）
   - §2.12.2: resolveStrategies 解決ルール
   - §2.12.3: Strategy 実装一覧（Phase 2 の3つが本タスクの対象）
   - §2.12.8: ファイル配置計画
2. [必須] `src/lib/services/bot-service.ts` — 抽出元の現行ロジック
   - L585-649: executeBotPost（FixedMessage + PostService呼び出し）
   - L667-688: selectTargetThread（RandomThread選択）
   - L705-709: getNextPostDelay（60-120分ランダム）
   - L756-: getFixedMessages（bot_profiles.yamlからの固定文取得）
3. [参考] `config/bot_profiles.yaml` — 荒らし役プロファイル定義

## 出力（生成すべきファイル）

### 1. `src/lib/services/bot-strategies/types.ts`
bot.md §2.12.1 のインターフェース定義をTypeScriptコードとして実装する:
- `ContentStrategy` インターフェース + `ContentGenerationContext`
- `BehaviorStrategy` インターフェース + `BehaviorContext` + `BotAction` 判別共用体
- `SchedulingStrategy` インターフェース + `SchedulingContext`
- `BotStrategies` 型（3つのStrategyをまとめる）

### 2. `src/lib/services/bot-strategies/strategy-resolver.ts`
bot.md §2.12.2 の解決ルールを実装する:
- `resolveStrategies(bot, profile)` 関数
- 現時点ではデフォルト解決のみ実装（荒らし役の3 Strategy を返す）
- Phase 3以降の解決ルール（yaml指定、owner_id判定）はコメントで TODO を記載

### 3. `src/lib/services/bot-strategies/content/fixed-message.ts`
bot-service.ts の `getFixedMessages()` + ランダム選択ロジックを抽出:
- `FixedMessageContentStrategy` クラス（ContentStrategy 実装）
- bot_profiles.yaml からの固定文リスト読み込みを内包
- `generateContent()` で固定文リストからランダムに1件返す

### 4. `src/lib/services/bot-strategies/behavior/random-thread.ts`
bot-service.ts の `selectTargetThread()` ロジックを抽出:
- `RandomThreadBehaviorStrategy` クラス（BehaviorStrategy 実装）
- コンストラクタで `IThreadRepository` を受け取る（DI）
- `decideAction()` で `{ type: 'post_to_existing', threadId }` を返す

### 5. `src/lib/services/bot-strategies/scheduling/fixed-interval.ts`
bot-service.ts の `getNextPostDelay()` ロジックを抽出:
- `FixedIntervalSchedulingStrategy` クラス（SchedulingStrategy 実装）
- `getNextPostDelay()` で 60-120分のランダム整数を返す

### 6. 単体テストファイル（4ファイル）
各Strategy実装 + strategy-resolver の単体テストを作成する:
- `src/__tests__/lib/services/bot-strategies/fixed-message.test.ts`
- `src/__tests__/lib/services/bot-strategies/random-thread.test.ts`
- `src/__tests__/lib/services/bot-strategies/fixed-interval.test.ts`
- `src/__tests__/lib/services/bot-strategies/strategy-resolver.test.ts`

テスト内容は既存の bot-service.test.ts の該当テスト（L574-680）と同等の検証を含むこと。

## 完了条件

- [x] 上記5つのソースファイルが生成されていること
- [x] 上記4つのテストファイルが生成されていること
- [x] Strategy インターフェースが bot.md §2.12.1 と一致していること
- [x] 荒らし役の3 Strategy が bot-service.ts の既存ロジックと同等の振る舞いをすること
- [x] `npx vitest run` 全PASS（新規テスト含む）: 1094 passed
- [x] `npx cucumber-js` 全PASS（変更なしの確認）: 221 passed, 7 pending（変更前と同一）
- [x] bot-service.ts に変更がないこと（git diff 差分なし確認済み）

## スコープ外

- bot-service.ts の変更（TASK-127で実施）
- bot-service.test.ts の変更（TASK-127で実施）
- BDDステップ定義の変更
- Phase 3以降の Strategy 実装（AiTopicContentStrategy 等）
- AiApiClient / ai-adapters の実装

## 補足・制約

- ファイル配置は bot.md §2.12.8 に従う
- `IThreadRepository` は bot-service.ts で既に定義済み。Strategy側からインポートするか、types.tsに再定義するか判断すること（循環依存を避ける方向で）
- bot_profiles.yaml の読み込みは既存の bot-service.ts 内のYAML読み込みロジック（L140-170付近）を参考にすること

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全ソースファイル（5件）・全テストファイル（4件）の作成、全テストPASS確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [完了] 必読ドキュメント読み込み（bot.md §2.12, bot-service.ts, bot_profiles.yaml）
- [完了] ディレクトリ作成（bot-strategies/, content/, behavior/, scheduling/）
- [完了] src/lib/services/bot-strategies/types.ts 作成（Strategy インターフェース定義）
- [完了] src/lib/services/bot-strategies/content/fixed-message.ts 作成（FixedMessageContentStrategy）
- [完了] src/lib/services/bot-strategies/behavior/random-thread.ts 作成（RandomThreadBehaviorStrategy）
- [完了] src/lib/services/bot-strategies/scheduling/fixed-interval.ts 作成（FixedIntervalSchedulingStrategy）
- [完了] src/lib/services/bot-strategies/strategy-resolver.ts 作成（resolveStrategies）
- [完了] テストファイル4件作成・全PASS確認
- [確認] bot-service.ts に変更なし（git diff 差分なし）

### テスト結果サマリー
#### npx vitest run（全体）
- テストファイル: 43 passed（新規4件含む）
- テスト件数: 1094 passed（新規33件含む）

#### 新規テスト内訳
- fixed-message.test.ts: 9 tests passed
- random-thread.test.ts: 7 tests passed
- fixed-interval.test.ts: 8 tests passed
- strategy-resolver.test.ts: 9 tests passed
- 合計: 33 tests passed

#### npx cucumber-js（BDD）
- 228 scenarios（7 pending, 221 passed）
- 1226 steps（7 pending, 18 skipped, 1201 passed）
- 変更前と同一（回帰なし）
