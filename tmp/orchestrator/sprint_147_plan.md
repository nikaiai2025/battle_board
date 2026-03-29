# Sprint-147: 管理画面BOT一覧に次回投稿予定時刻を表示

> 開始: 2026-03-29

## スコープ

管理画面のBOT一覧（活動中タブ）に `nextPostAt`（次回投稿予定時刻）列を追加する。
DB・Repository は対応済みのため、API レスポンスと UI の2箇所のみ変更。

## 目的

- 「速報＋速報」キュレーションBOTの動作確認を管理画面から行えるようにする
- BOTの投稿スケジュールを可視化し運用を支援する

## 変更対象ファイル

| ファイル | 変更内容 |
|---|---|
| `src/app/api/admin/bots/route.ts` | active レスポンスに `nextPostAt` フィールド追加 |
| `src/app/(admin)/admin/bots/page.tsx` | `ActiveBot` 型に `nextPostAt` 追加、テーブル列追加 |

## タスク分解

| TASK_ID | 内容 | 担当 | 依存 |
|---|---|---|---|
| TASK-374 | API + UI に nextPostAt 追加 | bdd-coding | - |

### ファイルロック表

| TASK_ID | locked_files |
|---|---|
| TASK-374 | `src/app/api/admin/bots/route.ts`, `src/app/(admin)/admin/bots/page.tsx` |

## 結果

| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-374 | completed | API+UI変更。vitest 2218 PASS |
