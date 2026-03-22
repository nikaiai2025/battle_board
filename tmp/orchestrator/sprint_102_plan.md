# Sprint-102 計画書

> 開始: 2026-03-23

## 目標

CF Workers サブリクエスト上限エラー修正。`countLivingBots()` N+1クエリ最適化。

## 背景

Sprint-101 デプロイ後、CF Workers 環境で !livingbot を含む書き込みが 500 エラー。
原因: `countLivingBots()` がスレッド固定BOT1体ごとに3クエリ（bot_posts→posts→threads）を発行するN+1パターン。
CF Workers のサブリクエスト上限（1000回/リクエスト）に到達し、後続の `PostRepository.getNextPostNumber` で `Too many subrequests` エラー。

## タスク一覧

| TASK_ID | 担当 | 内容 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-279 | bdd-coding | countLivingBots N+1クエリ最適化 | なし | assigned |

### TASK-279 locked_files
- src/lib/infrastructure/repositories/bot-repository.ts
- features/support/in-memory/bot-repository.ts

## 結果

（実行後に記載）
