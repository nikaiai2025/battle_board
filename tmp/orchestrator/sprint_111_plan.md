# Sprint-111: 管理画面スレッド・レス削除UI

> 開始日: 2026-03-24
> ステータス: in_progress

## 背景

管理者がスレッドやレスを削除するAPIは実装済み（`DELETE /api/admin/threads/{threadId}`, `DELETE /api/admin/posts/{postId}`）だが、管理画面にスレッド管理UIが存在しない。
現状ではDevToolsからAPIを直接叩く必要があり、E2Eテスト残存スレッドの削除等の運用が不便。

## 変更の概要

管理画面に `/admin/threads` ページを新設し、スレッド一覧表示・スレッド削除・レス一覧表示・レス削除の操作UIを提供する。

- 新規API: `GET /api/admin/threads` — スレッド一覧取得（削除済み含む）
- 新規API: `GET /api/admin/threads/{threadId}/posts` — スレッド内レス一覧取得
- 新規UI: `/admin/threads` — スレッド管理ページ
- 変更: admin layout のサイドナビに「スレッド管理」リンクを追加

## 設計方針

- **シンプルさ優先**: 既存の管理画面パターン（ユーザー一覧・IP BAN）に倣う
- **確認ダイアログ**: 削除前に対象の情報を表示し、確認を求める
- **既存BDDシナリオの範囲内**: 削除のビジネスロジックは実装済み。UIの追加のみ
- **BDDシナリオ変更なし**: admin.featureの削除シナリオはService層の振る舞いを検証済み

## タスク分解

| TASK_ID | 担当 | 概要 | depends_on | model |
|---|---|---|---|---|
| TASK-298 | bdd-coding | Admin threads管理ページ（API + UI + ナビ更新） | - | sonnet |

### locked_files

- TASK-298:
  - `[NEW] src/app/api/admin/threads/route.ts`
  - `src/app/api/admin/threads/[threadId]/route.ts` (既存DELETEにGET追加)
  - `[NEW] src/app/(web)/admin/threads/page.tsx`
  - `src/app/(web)/admin/layout.tsx`
  - `src/lib/infrastructure/repositories/thread-repository.ts`

## 結果

| TASK_ID | ステータス | 結果サマリー |
|---|---|---|
| TASK-298 | assigned | - |
