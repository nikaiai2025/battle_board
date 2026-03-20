# Sprint-73 計画書

> 作成日: 2026-03-20
> ステータス: in_progress

## 目的

マイページにログアウトボタンを追加する（D-06 mypage.yaml 更新に対応）。

## 背景

- D-06 mypage.yaml に `logout-btn` 要素が追加された
- バックエンド（POST /api/auth/logout）は実装済み
- BDDシナリオ（user_registration.feature @ログアウト）も存在
- UIのみ未実装

## タスク一覧

| TASK_ID | 内容 | 担当 | 状態 | locked_files |
|---|---|---|---|---|
| TASK-196 | マイページにログアウトボタン追加 | bdd-coding | in_progress | src/app/(web)/mypage/page.tsx |
| TASK-197 | accused_count インクリメント漏れ修正 + LL-010追記 | bdd-coding | assigned | src/lib/services/bot-service.ts, accusation-service.ts, bot-service.test.ts, in-memory/bot-repository.ts |

## 結果

- TASK-196: completed — ログアウトボタン追加（+5テスト）
- TASK-197: completed — accused_count修正 + LL-010追記（+2テスト）
- vitest: 65ファイル / 1395テスト全PASS
- cucumber-js: 240 passed, 16 pending, 0 failed
- 補足: ai_accusation.steps.ts の botRepository 注入が旧引数順序のまま（次スプリントで対応推奨）
