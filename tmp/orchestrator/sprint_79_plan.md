# Sprint-79 計画書

> 作成日: 2026-03-21

## 目標
撃破済みBOT表示機能を実装する。OpenAPIで定義済みのbotMarkフィールドを実際にバックエンド→フロントエンドで流通させ、PostItem.tsxでの目立たない表示＋トグルUIを実装する。これにより2件のpending BDDシナリオを解消する。

## 背景
- OpenAPI (D-04) に `Post.botMark` が定義済みだが未実装
- BDDシナリオ2件が pending: 撃破済みBOT目立たない表示 + トグル切替
- E2Eテスト2件が test.fixme() で先行作成済み（bot-display.spec.ts）
- PostItem.tsx の Post interface に `botMark` が定義済みだがデータが流入していない

## 対象BDDシナリオ
- `features/bot_system.feature` @撃破済みボットのレスはWebブラウザで目立たない表示になる
- `features/bot_system.feature` @撃破済みボットのレス表示をトグルで切り替えられる

## セキュリティ考慮
- bot_posts テーブルは RLS で anon/authenticated を全拒否（ゲーム根幹の保護）
- 撃破済みBOT（is_active=false）のみ botMark を返す。活動中BOTの情報は一切漏洩させない
- サーバーサイド（service_role）でのみ bot_posts + bots を JOIN する

## タスク分解

| TASK_ID | 担当 | 内容 | 依存 | locked_files |
|---|---|---|---|---|
| TASK-219 | bdd-architect | 撃破済みBOT表示の設計（データフロー・コンポーネント構造・トグル方式） | なし | なし |
| TASK-220 | bdd-coding | 撃破済みBOT表示の実装（バックエンド enrichment + フロントエンド表示 + トグル） | TASK-219 | PostItem.tsx, PostList.tsx, post-repository.ts, post-service.ts, page.tsx (thread), bot-display.spec.ts |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-219 | completed | 設計書 `tmp/workers/bdd-architect_TASK-219/design.md` |
| TASK-220 | completed | 全実装完了、vitest 1535 PASS、E2E 16 PASS |

## テスト結果
- vitest: 72ファイル / 1535テスト / 全PASS（+8件: getPostListWithBotMark）
- tsc: 0エラー
- playwright E2E (--project=e2e): 16 passed, 0 failed（bot-display 2件がfixme→PASS）
- cucumber-js: 次スプリントで確認（BDDステップ定義はサービス層モックのため本タスクでは変動なし）
