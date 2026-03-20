---
task_id: TASK-127
sprint_id: Sprint-43
status: completed
assigned_to: bdd-coding
depends_on: [TASK-126]
created_at: 2026-03-17T23:00:00+09:00
updated_at: 2026-03-17T23:00:00+09:00
locked_files:
  - src/lib/services/bot-service.ts
  - src/__tests__/lib/services/bot-service.test.ts
  - features/step_definitions/bot_system.steps.ts
---

## タスク概要

BotService の `executeBotPost` / `selectTargetThread` / `getNextPostDelay` を、TASK-126 で作成した Strategy インターフェースへの委譲に書き換える。
外部振る舞いは変更せず、既存テスト全PASSがゴール。

## 対象BDDシナリオ

- `features/bot_system.feature` — 既存シナリオの動作が維持されることを確認
  - @荒らし役ボットは1〜2時間間隔で書き込む（Scenario C）
  - @荒らし役ボットは表示中のスレッドからランダムに書き込み先を選ぶ（Scenario D）

## 必読ドキュメント（優先度順）

1. [必須] `docs/architecture/components/bot.md` §2.1 — Strategy委譲版 executeBotPost フロー
2. [必須] `docs/architecture/components/bot.md` §2.12.2 — resolveStrategies 解決ルール
3. [必須] `src/lib/services/bot-service.ts` — 現行の実装（改修対象）
4. [必須] `src/lib/services/bot-strategies/types.ts` — TASK-126で作成されたStrategy インターフェース
5. [必須] `src/lib/services/bot-strategies/strategy-resolver.ts` — TASK-126で作成されたresolver
6. [参考] `src/__tests__/lib/services/bot-service.test.ts` — 既存テスト（更新対象）
7. [参考] `features/step_definitions/bot_system.steps.ts` — BDDステップ定義（必要に応じて更新）

## 入力（前工程の成果物）

- TASK-126 の全出力ファイル（bot-strategies/ ディレクトリ）

## 改修内容

### 1. `bot-service.ts` の改修

**executeBotPost(botId, threadId):**
- 現行: 固定文リストからランダム選択 → PostService呼び出し（L585-649 インライン実装）
- 改修後: `resolveStrategies()` で Strategy 組を取得 → `behavior.decideAction()` → `content.generateContent()` → PostService呼び出し
- bot.md §2.1 の「Strategy 委譲版フロー」に従う
- シグネチャ変更: `executeBotPost(botId)` に簡略化可（threadId は BehaviorStrategy が決定）。ただし既存の呼び出し元との互換性に注意

**selectTargetThread(botId):**
- 現行: threadRepository.findByBoardId → ランダム選択（L667-688）
- 改修後: この公開メソッドを残すか、executeBotPost内部のStrategy委譲に統合するか判断すること
- BDDシナリオDのステップ定義が `selectTargetThread` を直接呼んでいる点に留意

**getNextPostDelay():**
- 現行: 60 + Math.floor(Math.random() * 61)（L705-709）
- 改修後: SchedulingStrategy.getNextPostDelay() に委譲
- BDDシナリオCのステップ定義が `getNextPostDelay` を直接呼んでいる点に留意

**getFixedMessages(botProfileKey):**
- Strategy側に移動済みの場合、bot-service.ts側のメソッドを削除 or private化

### 2. DI（依存注入）の更新

BotServiceのコンストラクタに Strategy 解決のための依存を追加する:
- `resolveStrategies` 関数、または Strategy ファクトリ
- 既存のコンストラクタパラメータ（botRepository, botPostRepository, attackRepository, botProfilesYamlPath, threadRepository, createPostFn）は維持
- テスト時に Strategy をモック注入できる設計にする

### 3. テスト更新

**bot-service.test.ts:**
- executeBotPost / selectTargetThread / getNextPostDelay のテストを Strategy 委譲に対応するよう更新
- Strategy のモック注入パターンを使用
- テストの検証内容（振る舞い）は変更しない

**bot_system.steps.ts:**
- BDDステップ定義が `selectTargetThread` / `getNextPostDelay` を直接呼んでいる場合、Strategy委譲後も同じ振る舞いが検証できるよう調整

## 完了条件

- [ ] executeBotPost が Strategy 委譲で動作すること
- [ ] selectTargetThread / getNextPostDelay が Strategy 経由に切り替わっていること
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS（221 passed, 7 pending 維持）
- [ ] bot-service.ts 内に荒らし役固有のハードコードが残っていないこと（getFixedMessages のインライン呼び出し等）

## スコープ外

- Phase 3以降の Strategy 実装
- bot_profiles.yaml のスキーマ変更
- BDDシナリオ (.feature ファイル) の変更
- API ルート / GitHub Actions の変更

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: bot-service.ts の Strategy 委譲書き換え・全テスト PASS 確認
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] ベースライン確認完了: vitest 1094 PASS / cucumber 221 passed, 7 pending
- [実装] bot-service.ts の executeBotPost/selectTargetThread/getNextPostDelay を Strategy 委譲に書き換え
  - `resolveStrategies as defaultResolveStrategies` をファイルトップでインポートする方式に変更（require → import）
  - `ResolveStrategiesFn` 型をコンストラクタに追加（テスト時のモック注入用・省略可）
  - `getNextPostDelay()` を `FixedIntervalSchedulingStrategy.getNextPostDelay()` に委譲
  - `selectTargetThread()` を `RandomThreadBehaviorStrategy.decideAction()` に委譲（後方互換ラッパー）
  - `executeBotPost(botId, threadId?)` の threadId を省略可能化（後方互換維持）
  - `getFixedMessages()` private メソッドを削除（FixedMessageContentStrategy に移動済み）
- [完了] vitest: 1094 PASS / cucumber: 221 passed, 7 pending

### テスト結果サマリー
- vitest: 1094 tests PASSED (43 test files)
- cucumber-js: 228 scenarios (7 pending, 221 passed) / 1226 steps (7 pending, 18 skipped, 1201 passed)
- ベースラインから変化なし（全テスト維持）
