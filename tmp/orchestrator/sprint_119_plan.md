# Sprint-119 計画書

> BOT !w コマンド FK制約違反修正

## 背景

BOTが `!w` コマンドを実行すると、`grass_reactions.giver_id` (FK → users.id) に `botId` (botsテーブルのUUID) が渡り、FK制約違反でサイレント失敗する。
前回の改行分割修正 (cebd451) はパーサー問題を解消したが、その先のFK制約違反は未対処だった。

## 方針（案D: BOT草付与時はgiver記録をスキップ）

BOTが草を付与する場合、`grass_reactions` テーブルへのINSERTをスキップし、草カウント加算 + システムメッセージ生成のみ実行する。
- `giver_id` は重複チェック (`existsForToday`) と記録保持のみに使用
- チュートリアルBOTは1回限りの `!w` デモであり、重複チェック・giver記録は不要
- スキーマ変更なし

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 |
|---|---|---|---|
| TASK-316 | GrassHandler BOT草付与パス実装 | bdd-coding | completed |

## 結果

- TASK-316: completed
  - `CommandContext`/`CommandExecutionInput` に `isBotGiver?: boolean` 追加
  - `GrassHandler`: BOT草付与時は自己草チェック・重複チェック・grass_reactions INSERTをスキップ、草カウント加算+メッセージ生成は実行
  - `post-service.ts`: `isBotWrite=true` 時に `isBotGiver: true` を伝播
  - BOT草付与テスト10件追加、インシデント報告書更新
  - vitest: 1877 tests PASS / cucumber-js: 331 passed, 16 pending
