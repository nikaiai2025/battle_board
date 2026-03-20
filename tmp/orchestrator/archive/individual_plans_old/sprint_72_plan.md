# Sprint-72 計画書

> 作成日: 2026-03-20
> ステータス: completed

## 目的

BOT投稿時の `total_posts` インクリメント漏れバグの修正。撃破時の戦歴表示が常に0件となる問題を解消する。

## 背景

- BOTヘルスチェック（C8）で `bots.total_posts = 0` のまま、`bot_posts` テーブルに実レコード4件が存在することを検出
- 根本原因: `BotService.executeBotPost()` で `incrementTotalPosts` の呼び出しが欠落（実装忘れ）
- インフラ層（`bot-repository.ts` の `incrementTotalPosts` 関数、RPC `increment_bot_column`）は準備済み
- `IBotRepository` インターフェースへのメソッド追加 + `executeBotPost` 内での呼び出し追加が必要

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 | locked_files |
|---|---|---|---|---|
| TASK-195 | incrementTotalPosts 呼び出し追加 + 単体テスト | bdd-coding | assigned | src/lib/services/bot-service.ts, src/__tests__/lib/services/bot-service.test.ts, features/support/in-memory/bot-repository.ts |

## 本番データ補正（デプロイ後に手動実行）

```sql
UPDATE bots b
SET total_posts = sub.actual_count
FROM (
    SELECT bot_id, COUNT(*) AS actual_count
    FROM bot_posts
    GROUP BY bot_id
) sub
WHERE b.id = sub.bot_id
  AND b.total_posts <> sub.actual_count;
```

## 結果

- TASK-195: completed
  - IBotRepository に incrementTotalPosts 追加
  - executeBotPost の bot_posts INSERT 成功直後に呼び出し追加
  - InMemory版にも実装追加
  - 単体テスト2件追加（成功時呼ばれる / create失敗時呼ばれない）
  - vitest: 65ファイル / 1388テスト全PASS
  - cucumber-js: 240 passed, 16 pending, 0 failed
- 残: bot-service-scheduling.test.ts のモック未更新（テストPASS、次スプリントで修正推奨）
- 残: 本番データ補正SQL（DB復旧後に手動実行）
