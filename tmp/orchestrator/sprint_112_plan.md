# Sprint-112 計画: 管理者課金ステータス変更 + 管理画面修正 + 開発環境整備

> 作成日: 2026-03-24

## 目的

1. 管理者がユーザーの有料/無料ステータスをUI上で切り替えられるようにする（課金トラブル対応）
2. 管理画面のテーマ漏れ・Header重複を解消する
3. 管理画面UX改善（ユーザーリンク追加、ダークテーマbody背景修正）
4. ローカル開発用シードデータ整備

## タスク一覧

| TASK_ID | 内容 | 担当 | ステータス |
|---|---|---|---|
| TASK-301 | Backend: 課金ステータス API + Service + BDDステップ + 単体テスト | bdd-coding | completed |
| TASK-302 | Frontend: 課金ステータス切り替えUI | bdd-coding | completed |
| TASK-303 | 管理画面を(admin)ルートグループに分離（テーマ漏れ・Header除去） | bdd-coding | completed |
| TASK-304 | 管理スレッド詳細からユーザー詳細へのリンク追加 | bdd-coding | completed |
| TASK-305 | ダークテーマbody背景色修正（:root:has(.dark)） | bdd-coding | completed |
| TASK-306 | ローカル開発用seed.sql作成（管理者アカウント） | bdd-coding | completed |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-301 | completed | BDD 325 passed / vitest 1769 PASS |
| TASK-302 | completed | vitest 1769 PASS / 確認ダイアログ付き切り替えボタン実装 |
| TASK-303 | completed | vitest 1769 / cucumber-js 325 passed, 16 pending / 本番スモーク 29/34 PASS |
| TASK-304 | completed | vitest 1769 PASS / 名前列をLink化（authorId存在時のみ） |
| TASK-305 | completed | vitest 1769 PASS / globals.css :root:has(.dark)追加 |
| TASK-306 | completed | npx supabase db reset 正常完了 / admin@local.test シード確認 |

## コミット履歴

- 51f665a: feat: 管理者課金ステータス変更機能 + テーマ反映バグ修正
- 2c0f8cb: fix: 管理画面をルートグループ分離（テーマ漏れ・Header重複解消）
- 08732f1: feat: 管理スレッド詳細からユーザー詳細へのリンク追加
- 2cce3ee: fix: ダークテーマ時のbody背景色修正
- 3fd0b9b: refactor: E2Eベーシックフロー共有スレッド方式に変更

## デプロイ・検証

- 本番スモーク（TASK-303後）: 29/34 PASS（5件は設計上のスキップ）
