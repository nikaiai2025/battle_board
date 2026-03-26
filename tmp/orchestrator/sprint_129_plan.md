# Sprint-129 計画書

## 目的
管理ダッシュボード統計カードを人間/BOT分離表示に改修

## 背景
現在のダッシュボードは人間とBOTを区別せず集計している。管理運用上、人間/BOTの内訳を把握する必要がある。

## 変更要件

### 1. ユーザー数カード → 人間/BOT分離
- 人間ユーザー数: `users` テーブルの件数
- BOT数: `bots` テーブルの件数

### 2. 書き込み数カード → 人間/BOT分離
- 人間: 書き込み件数 + ユニークID数（`posts.author_id IS NOT NULL`）
- BOT: 書き込み件数 + ユニークID数（`posts.author_id IS NULL AND is_system_message = false` → `bot_posts` で bot_id 取得）
- システムメッセージ（`is_system_message = true`）は除外

### 3. 通貨流通量 → BANユーザー除外
- `currencies` JOIN `users` WHERE `users.is_banned = false`
- BOTは `currencies` テーブルに存在しないため実質人間のみ

### 4. アクティブスレッド数 → 変更なし

## タスク

| TASK_ID | 内容 | 担当 | 状態 |
|---|---|---|---|
| TASK-333 | getDashboard + Repository + UI + テスト修正 | bdd-coding | assigned |

## 結果
<!-- ワーカー完了後に記入 -->
