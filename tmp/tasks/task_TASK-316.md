---
task_id: TASK-316
sprint_id: Sprint-119
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-25T13:00:00+09:00
updated_at: 2026-03-25T13:00:00+09:00
locked_files:
  - src/lib/services/command-service.ts
  - src/lib/services/handlers/grass-handler.ts
  - src/lib/services/post-service.ts
  - src/__tests__/lib/services/command-service.test.ts
  - src/__tests__/lib/services/grass-handler.test.ts
  - features/support/in-memory/grass-repository.ts
  - docs/operations/incidents/2026-03-24_welcome_bot_w_command_silent_failure.md
---

## タスク概要

BOTが `!w` コマンドを実行すると `grass_reactions.giver_id` のFK制約違反(botIdはusersに存在しない)でサイレント失敗する。BOT草付与時は `grass_reactions` INSERTをスキップし、草カウント加算+システムメッセージ生成のみ実行するよう修正する。

## 対象BDDシナリオ
- `features/reactions.feature` — !w コマンド関連シナリオ（既存テストの回帰確認）
- `features/welcome.feature` — チュートリアルBOT関連（既存テストの回帰確認）

## 必読ドキュメント（優先度順）
1. [必須] `tmp/reports/debug_TASK-DEBUG-119.md` — 調査結果（実行パスの追跡・FK制約違反の特定）
2. [必須] `src/lib/services/handlers/grass-handler.ts` — GrassHandler実装
3. [必須] `src/lib/services/command-service.ts` — CommandContext型定義 (L168-188)
4. [必須] `src/lib/services/post-service.ts` L460-477 — コマンド実行呼び出し箇所
5. [参考] `docs/operations/incidents/2026-03-24_welcome_bot_w_command_silent_failure.md` — 前回のインシデント報告

## 入力（前工程の成果物）
- `tmp/reports/debug_TASK-DEBUG-119.md` — 根本原因分析

## 出力（生成すべきファイル）
- `src/lib/services/command-service.ts` — CommandContext に `isBotGiver` フラグ追加
- `src/lib/services/handlers/grass-handler.ts` — BOT草付与パス実装
- `src/lib/services/post-service.ts` — isBotGiver フラグをコマンドパイプラインに渡す
- テストファイル — 新規テスト追加
- `docs/operations/incidents/2026-03-24_welcome_bot_w_command_silent_failure.md` — 真因と修正内容を追記

## 完了条件
- [ ] BOT草付与パス: `ctx.isBotGiver === true` の場合、以下の動作
  - 自己草チェック (Step 4): スキップ（BOTのauthorIdはnullなので元々通過するが、明示的にスキップ）
  - 重複チェック (Step 6): スキップ（チュートリアルBOTは1回限り）
  - grass_reactions INSERT (Step 7): **スキップ**（FK制約違反の回避）
  - 草カウント加算 (Step 8): **実行する**（草は実際に生える）
  - システムメッセージ生成 (Step 9): **実行する**（ユーザーに見える）
- [ ] `CommandContext` に `isBotGiver?: boolean` を追加
- [ ] `post-service.ts` で `isBotWrite === true` の場合に `isBotGiver: true` を設定
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 既存シナリオ全PASS（pendingは既存のまま）
- [ ] インシデント報告書に真因と修正内容を追記

## スコープ外
- DBスキーマ変更（grass_reactions テーブルの変更なし）
- 他のコマンドハンドラのBOT対応
- BDDシナリオの追加・変更

## 補足・制約
- `isBotGiver` は GrassHandler のみで参照。他のコマンドハンドラには影響しない
- BOTの草付与は「誰が草を生やしたか」の記録不要（そのような要件なし）
- `grass_reactions` に記録されないため、同一BOTが同日に同一ユーザーへの重複草付与をした場合も通る。ただしチュートリアルBOTは1回限りの `!w` デモであり、実質的に問題にならない

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全ファイル修正、テスト全PASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. ソースコード調査完了（grass-handler.ts, command-service.ts, post-service.ts）
2. 既存テスト28件PASSを確認
3. BOT草付与パスの単体テスト10件を追加（RED確認後、実装してGREEN）
4. CommandContext, CommandExecutionInput に isBotGiver フラグ追加
5. GrassHandler に BOT草付与パス（ステップ4,6,7スキップ）を実装
6. post-service.ts で isBotWrite=true 時に isBotGiver=true を伝播
7. 全単体テスト1877件PASS、BDDシナリオ331件PASS（16 pending は既存）
8. インシデント報告書に真因と修正内容を追記

### テスト結果サマリー

**単体テスト (vitest)**
- テストファイル: 97 passed / 97 total
- テスト: 1877 passed / 1877 total
- 新規追加: grass-handler.test.ts に BOT草付与パスのテスト10件

**BDDテスト (cucumber-js)**
- シナリオ: 331 passed, 16 pending / 347 total
- ステップ: 1779 passed, 16 pending, 37 skipped / 1832 total
