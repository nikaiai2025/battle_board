---
task_id: TASK-281
sprint_id: Sprint-104
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-23T05:00:00+09:00
updated_at: 2026-03-23T05:00:00+09:00
locked_files:
  - src/lib/infrastructure/repositories/bot-repository.ts
  - src/lib/services/handlers/livingbot-handler.ts
  - features/support/in-memory/bot-repository.ts
  - features/step_definitions/command_livingbot.steps.ts
  - src/__tests__/lib/services/handlers/livingbot-handler.test.ts
---

## タスク概要

!livingbot コマンドにスレッド内カウントを追加する（v2拡張）。設計書 §6 に基づき、掲示板全体のカウントに加えて「このスレッド: N体」を表示する。

## 対象BDDシナリオ
- `features/command_livingbot.feature` — 全16シナリオ（v2更新済み）

## 必読ドキュメント（優先度順）
1. [必須] `features/command_livingbot.feature` — v2シナリオ（16シナリオ）
2. [必須] `tmp/workers/bdd-architect_277/livingbot_design.md` §6 — スレッド内カウント拡張設計
3. [参考] §1〜§5 — 既存の掲示板全体カウント設計

## 実装内容（設計書 §6 準拠）

### 1. BotRepository.countLivingBotsInThread() 追加
- `src/lib/infrastructure/repositories/bot-repository.ts`
- 設計書 §6.3 のSQL/Supabase SDK実装に従う
- 3クエリ: posts → bot_posts → bots(is_active=true カウント)
- **重要**: Sprint-103で学んだ教訓を活かし、PostgRESTのmany-to-one戻り値はArray.isArray()で安全にハンドリングすること
- **重要**: `.in()` に空配列を渡さないこと（早期リターン）

### 2. ILivingBotBotRepository 拡張
- `src/lib/services/handlers/livingbot-handler.ts`
- §6.4: `countLivingBotsInThread(threadId: string): Promise<number>` を追加

### 3. LivingBotHandler.execute() 変更
- §6.5: `ctx.threadId` を使用して両カウントを取得
- 出力フォーマット: `🤖 生存BOT — 掲示板全体: {boardCount}体 / このスレッド: {threadCount}体`

### 4. InMemory実装
- `features/support/in-memory/bot-repository.ts`
- §6.6: `_setLivingBotInThreadCount()`, `countLivingBotsInThread()` 追加
- `reset()` でオーバーライドクリア

### 5. BDDステップ定義の追加
- `features/step_definitions/command_livingbot.steps.ts`
- §6.7: スレッド内カウント用ステップ追加
  - `当該スレッドに{int}体の生存BOTが書き込んでいる`
  - `当該スレッドにはBOTの書き込みがない`
  - `当該スレッドに{int}体のBOTが書き込んでいる`
  - `そのうち{int}体は撃破済みである`
- 既存ステップのフォーマット検証を v2 対応に更新

### 6. 単体テスト更新
- `src/__tests__/lib/services/handlers/livingbot-handler.test.ts` — v2フォーマット検証

## 完了条件
- [ ] BDDテスト: `npx cucumber-js --tags @livingbot` で全16シナリオPASS
- [ ] 単体テスト: `npx vitest run` 全PASS
- [ ] 出力フォーマットが `🤖 生存BOT — 掲示板全体: N体 / このスレッド: M体` であること

## スコープ外
- features/ の変更（v2更新済み）
- countLivingBots()（掲示板全体カウント）の変更
- ラストボットボーナスの変更
- 他のリポジトリメソッドの変更

## 補足・制約
- CF Workers サブリクエスト上限（1000回/invocation）に注意。countLivingBotsInThread は3クエリ以内
- Supabase `.in()` フィルタに空配列を渡さない（PostgRESTエラー回避）
- IBotRepository（bot-service.ts内）への変更は不要（ILivingBotBotRepositoryはlivingbot-handler.ts内で定義）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全6項目
- 未解決の問題: なし

### 進捗ログ

1. InMemory bot-repository に `_setLivingBotInThreadCount()`, `countLivingBotsInThread()` 追加、`reset()` 更新
2. 本番 bot-repository に `countLivingBotsInThread()` 追加（3クエリ構成、空配列早期リターン対応）
3. `ILivingBotBotRepository` に `countLivingBotsInThread` メソッド追加
4. `LivingBotHandler.execute()` を v2 フォーマットに変更（`ctx.threadId` 使用）
5. BDD ステップ定義にスレッド内カウント用4ステップ追加、「両方のレスに同じ掲示板全体の生存BOT数が表示される」ステップを v2 対応に更新
6. 単体テスト新規作成（7テスト: commandName, v2フォーマット, 0体/0体, 10体/0体, 7体/3体, threadId伝播, 大量値）

### テスト結果サマリー

- **BDD (cucumber-js)**: 328 scenarios (312 passed, 16 pending) — livingbot 16シナリオ全PASS、pending は他 feature の未実装ステップ
- **単体テスト (vitest)**: 86 files, 1742 tests — 1741 passed, 1 failed (schema-consistency.test.ts: 既存の daily_events/pending_async_commands テーブル未適用。本タスクとは無関係)
