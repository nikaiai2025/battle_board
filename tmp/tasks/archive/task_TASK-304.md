---
task_id: TASK-304
sprint_id: Sprint-112
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-24T15:00:00+09:00
updated_at: 2026-03-24T15:00:00+09:00
locked_files:
  - "src/app/(admin)/admin/threads/page.tsx"
---

## タスク概要

管理画面のスレッド詳細（レス一覧）で、各レスの書き込みユーザーの詳細ページ（`/admin/users/[userId]`）に遷移できるリンクを追加する。
Post modelには `authorId` が既にあるので、UIにリンクを追加するだけの作業。

## 必読ドキュメント

1. [必須] `src/app/(admin)/admin/threads/page.tsx` — 変更対象（L553付近のレス一覧テーブル）
2. [参考] `src/lib/domain/models/post.ts` — Post型（`authorId: string | null`）

## 出力

- `src/app/(admin)/admin/threads/page.tsx` への変更 — レス一覧テーブルにユーザー詳細リンクを追加

## 実装ヒント

- レス一覧テーブル（スレッド詳細モード、L480以降）の各行に、ユーザー詳細へのリンクを追加する
- `post.authorId` が存在する場合のみリンクを表示（null の場合はシステム投稿等なのでリンク不要）
- 「名前」列をリンクにするか、操作列にボタンを追加するかはUI的に自然な方を選んでよい
- リンク先: `/admin/users/${post.authorId}`
- `next/link` の `Link` コンポーネントを使用する（既存のimportに追加が必要）

## 完了条件

- [x] スレッド詳細のレス一覧から、各レスの書き込みユーザーの詳細ページに遷移できる
- [x] authorId が null のレス（システム投稿等）にはリンクが表示されない
- [x] `npx vitest run` でリグレッションなし
- [ ] テストコマンド: `npx vitest run`

## スコープ外

- API変更
- スレッド一覧モード（レス一覧=スレッド詳細モードのみ対象）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

1. `src/app/(admin)/admin/threads/page.tsx` に `import Link from "next/link"` を追加
2. レス一覧テーブルの「名前」列を変更
   - `post.authorId` が存在する場合: `<Link href="/admin/users/${post.authorId}">` でラップ
   - `post.authorId` が null の場合: プレーンテキスト表示

### テスト結果サマリー

- `npx vitest run`: 91 ファイル / 1769 テスト、全て PASS
- リグレッションなし
